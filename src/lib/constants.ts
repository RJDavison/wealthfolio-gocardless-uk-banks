import type { AutoSyncHours } from '../types';

export const GC_API_BASE = 'https://bankaccountdata.gocardless.com/api/v2';

export const GC_HOST = 'bankaccountdata.gocardless.com';

/** Keyring keys. Values never leave the host's secret store. */
export const SECRETS = {
  secretId: 'gc-uk-secret-id',
  secretKey: 'gc-uk-secret-key',
  accessToken: 'gc-uk-access-token',
  refreshToken: 'gc-uk-refresh-token',
} as const;

/** Durable per-addon key/value keys. Tokens stay in the keyring. */
export const STORAGE = {
  settings: 'settings',
  connections: 'connections',
  pendingBankData: 'pending-bank-data',
} as const;

/** How much history a first sync pulls by default. */
export const DEFAULT_SYNC_DAYS = 90;

/** GoCardless institutions advertise their own limit; this is our ceiling. */
export const MAX_HISTORY_DAYS = 730;

/** Max days per transactions request (banks commonly cap at 90). */
export const CHUNK_DAYS = 89;

/** Re-read a few days on every sync so late-booked transactions are caught. */
export const OVERLAP_DAYS = 7;

/**
 * GoCardless requires a redirect URL registered in the portal. Any reachable
 * URL works; after consent the browser lands there with `?code=...`, which the
 * addon does not need.
 */
export const DEFAULT_REDIRECT_URL = 'https://localhost:8443/gocardless-callback';

/** Maximum rows per import call, to keep payloads small. */
export const IMPORT_BATCH_SIZE = 250;

/** How long fetched-but-not-imported bank data may be reused. */
export const PENDING_BANK_DATA_TTL_MS = 12 * 60 * 60 * 1000;

/**
 * UK banks allow only a handful of GoCardless reads per account per day, so
 * automatic sync is deliberately conservative. `0` means manual only.
 */
export const AUTO_SYNC_OPTIONS = [
  { hours: 0, label: 'Off — sync manually' },
  { hours: 6, label: 'Every 6 hours' },
  { hours: 12, label: 'Every 12 hours' },
  { hours: 24, label: 'Once a day' },
  { hours: 48, label: 'Every 2 days' },
] as const satisfies ReadonlyArray<{
  hours: AutoSyncHours;
  label: string;
}>;

export const DEFAULT_AUTO_SYNC_HOURS: AutoSyncHours = 0;

/** Consent window requested from the bank, in days. */
export const ACCESS_VALID_FOR_DAYS = 90;
