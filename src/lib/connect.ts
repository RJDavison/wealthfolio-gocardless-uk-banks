import { ACCESS_VALID_FOR_DAYS, MAX_HISTORY_DAYS } from './constants';
import { GoCardlessClient, isRequisitionLive, isRequisitionPending } from './gocardless';
import type {
  AddonSettings,
  BankAccountLink,
  ConnectionState,
  GoCardlessInstitution,
  RequisitionStatus,
} from '../types';

function asPositiveInt(value: string | number | undefined | null): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

/** How far back this institution says it can supply transactions. */
export function institutionHistoryDays(institution: GoCardlessInstitution): number {
  return Math.min(
    asPositiveInt(institution.transaction_total_days) ?? MAX_HISTORY_DAYS,
    MAX_HISTORY_DAYS,
  );
}

/** Consent length capped by what the institution allows. */
export function institutionAccessDays(institution: GoCardlessInstitution): number {
  const maximum = asPositiveInt(institution.max_access_valid_for_days);
  return maximum ? Math.min(ACCESS_VALID_FOR_DAYS, maximum) : ACCESS_VALID_FOR_DAYS;
}

function normaliseIban(iban?: string): string | undefined {
  return iban ? iban.replace(/\s+/g, '').toUpperCase() : undefined;
}

/**
 * Reuse the Wealthfolio account mapping when a bank is re-consented: the IBAN
 * survives a new requisition even though the bank account id does not.
 */
export function carryOverAccounts(
  connections: ConnectionState[],
  institutionId: string,
  excludeConnectionId?: string,
): BankAccountLink[] {
  const carried = new Map<string, BankAccountLink>();
  for (const connection of connections) {
    if (connection.institutionId !== institutionId) continue;
    if (excludeConnectionId && connection.id === excludeConnectionId) continue;
    for (const link of connection.accounts) {
      if (!carried.has(link.identity)) carried.set(link.identity, { ...link });
    }
  }
  return [...carried.values()];
}

export async function createBankConnection(params: {
  client: GoCardlessClient;
  settings: AddonSettings;
  institution: GoCardlessInstitution;
  carriedAccounts: BankAccountLink[];
}): Promise<ConnectionState> {
  const { client, settings, institution, carriedAccounts } = params;
  const maxHistoricalDays = institutionHistoryDays(institution);
  const accessValidForDays = institutionAccessDays(institution);

  const agreement = await client.createAgreement({
    institutionId: institution.id,
    maxHistoricalDays,
    accessValidForDays,
  });

  const requisition = await client.createRequisition({
    institutionId: institution.id,
    redirectUrl: settings.redirectUrl,
    reference: `wealthfolio-uk-${Date.now()}`,
    agreementId: agreement.id,
  });

  const windowDays =
    asPositiveInt(agreement.access_valid_for_days) ?? accessValidForDays;

  return {
    version: 1,
    id: requisition.id,
    requisitionId: requisition.id,
    institutionId: institution.id,
    institutionName: institution.name,
    redirectUrl: settings.redirectUrl,
    link: requisition.link,
    status: requisition.status,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + windowDays * 86_400_000).toISOString(),
    accessValidForDays: windowDays,
    accounts: carriedAccounts.map((link) => ({ ...link })),
  };
}

export type RequisitionCheckKind = 'live' | 'pending' | 'rejected' | 'expired' | 'other';

export function describeCheck(kind: RequisitionCheckKind, institutionName: string): string {
  switch (kind) {
    case 'pending':
      return `${institutionName} has not finished the consent yet. Complete it in your browser, then check again.`;
    case 'rejected':
      return `${institutionName} rejected the consent. Start a new connection and try again.`;
    case 'expired':
      return 'The consent request expired before it was approved. Start a new connection.';
    case 'other':
      return 'Unexpected connection status. Start a new connection if it does not progress.';
    default:
      return `Connected to ${institutionName}.`;
  }
}

/**
 * Checks a requisition and, once linked, refreshes the bank account list.
 * Existing mapping and sync history are matched by IBAN / account identity.
 */
export async function refreshBankConnection(params: {
  client: GoCardlessClient;
  connection: ConnectionState;
  carriedAccounts?: BankAccountLink[];
}): Promise<{
  connection: ConnectionState;
  kind: RequisitionCheckKind;
  status: RequisitionStatus;
}> {
  const { client, connection, carriedAccounts = connection.accounts } = params;
  const requisition = await client.getRequisition(connection.requisitionId);

  if (!isRequisitionLive(requisition.status)) {
    const kind: RequisitionCheckKind = isRequisitionPending(requisition.status)
      ? 'pending'
      : requisition.status === 'RJ'
        ? 'rejected'
        : requisition.status === 'EX'
          ? 'expired'
          : 'other';
    return {
      connection: {
        ...connection,
        status: requisition.status,
        link: requisition.link ?? connection.link,
      },
      kind,
      status: requisition.status,
    };
  }

  const carried = new Map(carriedAccounts.map((link) => [link.identity, link]));
  const links: BankAccountLink[] = [];

  for (const accountId of requisition.accounts ?? []) {
    const { account } = await client.getAccountDetails(accountId);
    const iban = normaliseIban(account.iban);
    const identity = iban ?? account.resourceId ?? accountId;
    const existing = carried.get(identity);

    links.push({
      identity,
      bankAccountId: accountId,
      name: account.name?.trim() || account.product?.trim() || `${connection.institutionName} account`,
      iban,
      currency: account.currency || 'GBP',
      product: account.product,
      ownerName: account.ownerName,
      wealthfolioAccountId: existing?.wealthfolioAccountId,
      openingBalanceApplied: existing?.openingBalanceApplied ?? false,
      lastBankBalance: existing?.lastBankBalance,
      lastSyncDate: existing?.lastSyncDate,
      lastSyncAt: existing?.lastSyncAt,
    });
  }

  const windowDays = connection.accessValidForDays ?? ACCESS_VALID_FOR_DAYS;

  return {
    connection: {
      ...connection,
      status: requisition.status,
      link: requisition.link ?? connection.link,
      // The consent clock starts when the bank approves it, not when the
      // requisition was created, so refresh the estimate now.
      expiresAt: new Date(Date.now() + windowDays * 86_400_000).toISOString(),
      accounts: links,
    },
    kind: 'live',
    status: requisition.status,
  };
}
