import type { AddonContext, NetworkResponse } from '@wealthfolio/addon-sdk';
import { GC_API_BASE, SECRETS } from './constants';
import { loadCredentials } from './store';
import type {
  GoCardlessAccountDetails,
  GoCardlessAgreement,
  GoCardlessBalance,
  GoCardlessInstitution,
  GoCardlessRequisition,
  GoCardlessTransaction,
  RequisitionStatus,
} from '../types';

export class GoCardlessError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly detail?: string;

  constructor(message: string, status: number, code?: string, detail?: string) {
    super(message);
    this.name = 'GoCardlessError';
    this.status = status;
    this.code = code;
    this.detail = detail;
  }

  get isRateLimit(): boolean {
    return this.status === 429 || this.code === 'ASPSP_RATE_LIMIT_EXCEEDED';
  }

  get isAuthError(): boolean {
    return this.status === 401 || this.status === 403;
  }

  static fromResponse(status: number, body: string): GoCardlessError {
    let summary = `GoCardless request failed (HTTP ${status})`;
    let code: string | undefined;
    let detail: string | undefined;
    try {
      const parsed = JSON.parse(body) as Record<string, unknown>;
      if (typeof parsed.summary === 'string' && parsed.summary.trim()) summary = parsed.summary;
      if (typeof parsed.detail === 'string') detail = parsed.detail;
      if (typeof parsed.error === 'string') code = parsed.error;
      if (typeof parsed.code === 'string') code = parsed.code;
    } catch {
      if (body.trim()) detail = body.slice(0, 500);
    }
    if (code) summary = `${summary} (${code})`;
    return new GoCardlessError(summary, status, code, detail);
  }
}

export class MissingCredentialsError extends Error {
  constructor() {
    super('GoCardless credentials are not configured');
    this.name = 'MissingCredentialsError';
  }
}

/**
 * Wealthfolio only forwards a request to a declared host once the user has
 * ticked it in the add-on's permission dialog. Reinstalling an add-on (for
 * example an updated zip) resets that approval, and the broker then rejects
 * every request locally with a bare 400 before any traffic leaves the app.
 */
const NETWORK_APPROVAL_PATTERN = /not approved|not declared|not allowed to use network auth/i;

export class NetworkAccessNotApprovedError extends Error {
  constructor(cause: unknown) {
    super(
      'Wealthfolio has not approved this add-on’s network access to ' +
        'bankaccountdata.gocardless.com. Open Settings → Add-ons → GoCardless UK Banks → ' +
        'View permissions, tick bankaccountdata.gocardless.com under Network hosts, click Save, ' +
        `then run the sync again. (Broker message: ${String(cause)})`,
    );
    this.name = 'NetworkAccessNotApprovedError';
  }
}

interface TokenResponse {
  access?: string;
  access_expires?: number;
  refresh?: string;
  refresh_expires?: number;
}

interface SendOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
  authed?: boolean;
  timeoutSecs?: number;
}

const ACCESS_TOKEN_SAFETY_MS = 120_000;

/**
 * Thin client over the GoCardless Bank Account Data API.
 *
 * Access tokens are short-lived (24h) and are stored in the host keyring so the
 * network broker can inject the `Authorization` header — addons cannot set it
 * themselves.
 */
export class GoCardlessClient {
  private accessToken: string | null = null;
  private accessExpiresAt = 0;
  private inFlightAuth: Promise<string> | null = null;

  constructor(private readonly ctx: AddonContext) {}

  /** Validates a credential pair without persisting anything. */
  async testCredentials(secretId: string, secretKey: string): Promise<void> {
    await this.tokenNew({ secretId, secretKey });
  }

  async listInstitutions(country = 'gb'): Promise<GoCardlessInstitution[]> {
    return this.send<GoCardlessInstitution[]>(
      `institutions/?country=${encodeURIComponent(country)}`,
    );
  }

  async createAgreement(params: {
    institutionId: string;
    maxHistoricalDays: number;
    accessValidForDays: number;
  }): Promise<GoCardlessAgreement> {
    return this.send<GoCardlessAgreement>('agreements/enduser/', {
      method: 'POST',
      body: {
        institution_id: params.institutionId,
        max_historical_days: params.maxHistoricalDays,
        access_valid_for_days: params.accessValidForDays,
        access_scope: ['details', 'balances', 'transactions'],
      },
    });
  }

  async createRequisition(params: {
    institutionId: string;
    redirectUrl: string;
    reference: string;
    agreementId?: string;
  }): Promise<GoCardlessRequisition> {
    return this.send<GoCardlessRequisition>('requisitions/', {
      method: 'POST',
      body: {
        redirect: params.redirectUrl,
        institution_id: params.institutionId,
        reference: params.reference,
        user_language: 'EN',
        ...(params.agreementId ? { agreement: params.agreementId } : {}),
      },
    });
  }

  async getRequisition(id: string): Promise<GoCardlessRequisition> {
    return this.send<GoCardlessRequisition>(`requisitions/${id}/`);
  }

  async deleteRequisition(id: string): Promise<void> {
    await this.send<unknown>(`requisitions/${id}/`, { method: 'DELETE' });
  }

  async getAccountDetails(accountId: string): Promise<{ account: GoCardlessAccountDetails }> {
    return this.send<{ account: GoCardlessAccountDetails }>(
      `accounts/${accountId}/details/`,
    );
  }

  async getBalances(accountId: string): Promise<{ balances: GoCardlessBalance[] }> {
    return this.send<{ balances: GoCardlessBalance[] }>(`accounts/${accountId}/balances/`);
  }

  async getTransactions(
    accountId: string,
    dateFrom: string,
    dateTo: string,
  ): Promise<{ transactions: { booked: GoCardlessTransaction[]; pending: GoCardlessTransaction[] } }> {
    const query = new URLSearchParams({ date_from: dateFrom, date_to: dateTo }).toString();
    return this.send<{
      transactions: { booked: GoCardlessTransaction[]; pending: GoCardlessTransaction[] };
    }>(`accounts/${accountId}/transactions/?${query}`, { timeoutSecs: 90 });
  }

  /* ------------------------------------------------------------------ */

  private async send<T>(path: string, options: SendOptions = {}): Promise<T> {
    const { method = 'GET', body, authed = true, timeoutSecs = 45 } = options;
    const token = authed ? await this.authorize() : null;

    let response: NetworkResponse;
    try {
      response = await this.ctx.api.network.request({
        url: `${GC_API_BASE}/${path}`,
        method,
        headers: {
          accept: 'application/json',
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        auth: token
          ? { type: 'bearer', secretKey: SECRETS.accessToken }
          : undefined,
        timeoutSecs,
      });
    } catch (error) {
      if (NETWORK_APPROVAL_PATTERN.test(String(error))) {
        throw new NetworkAccessNotApprovedError(error);
      }
      throw error;
    }

    if (response.status < 200 || response.status >= 300) {
      throw GoCardlessError.fromResponse(response.status, response.body);
    }
    if (!response.body) return {} as T;
    return JSON.parse(response.body) as T;
  }

  private async authorize(force = false): Promise<string> {
    if (!force && this.accessToken && Date.now() < this.accessExpiresAt - ACCESS_TOKEN_SAFETY_MS) {
      return this.accessToken;
    }
    if (this.inFlightAuth) return this.inFlightAuth;

    this.inFlightAuth = this.refreshOrCreateToken().finally(() => {
      this.inFlightAuth = null;
    });
    return this.inFlightAuth;
  }

  private async refreshOrCreateToken(): Promise<string> {
    const refreshToken = await this.ctx.api.secrets.get(SECRETS.refreshToken);

    if (refreshToken) {
      try {
        const refreshed = await this.tokenRefresh(refreshToken);
        if (refreshed.access) {
          return this.rememberAccess(refreshed.access, refreshed.access_expires);
        }
      } catch (error) {
        // A stale or revoked refresh token is expected after 30 days; fall
        // through and mint a new one from the user secret.
        this.ctx.api.logger.debug(
          `GoCardless refresh failed, creating a new token: ${String(error)}`,
        );
      }
    }

    const credentials = await loadCredentials(this.ctx);
    if (!credentials) throw new MissingCredentialsError();

    const created = await this.tokenNew(credentials);
    if (created.refresh) {
      await this.ctx.api.secrets.set(SECRETS.refreshToken, created.refresh);
    }
    if (created.access) {
      return this.rememberAccess(created.access, created.access_expires);
    }
    if (created.refresh) {
      const refreshed = await this.tokenRefresh(created.refresh);
      if (refreshed.access) {
        return this.rememberAccess(refreshed.access, refreshed.access_expires);
      }
    }
    throw new GoCardlessError('GoCardless did not return an access token', 500);
  }

  private async rememberAccess(access: string, expiresInSeconds?: number): Promise<string> {
    this.accessToken = access;
    this.accessExpiresAt = Date.now() + (expiresInSeconds ?? 86_400) * 1000;
    await this.ctx.api.secrets.set(SECRETS.accessToken, access);
    return access;
  }

  private async tokenNew(credentials: {
    secretId: string;
    secretKey: string;
  }): Promise<TokenResponse> {
    return this.send<TokenResponse>('token/new/', {
      method: 'POST',
      authed: false,
      body: { secret_id: credentials.secretId, secret_key: credentials.secretKey },
      timeoutSecs: 20,
    });
  }

  private async tokenRefresh(refresh: string): Promise<TokenResponse> {
    return this.send<TokenResponse>('token/refresh/', {
      method: 'POST',
      authed: false,
      body: { refresh },
      timeoutSecs: 20,
    });
  }
}

export function isRequisitionLive(status: RequisitionStatus): boolean {
  return status === 'LN';
}

export function isRequisitionPending(status: RequisitionStatus): boolean {
  return ['CR', 'GC', 'UA', 'SA', 'GA'].includes(status);
}
