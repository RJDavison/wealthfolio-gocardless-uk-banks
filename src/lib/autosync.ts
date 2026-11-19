import { AUTO_SYNC_OPTIONS } from './constants';
import type { AddonSettings, AutoSyncHours, ConnectionState } from '../types';

const HOUR_MS = 60 * 60 * 1000;

export function autoSyncHoursLabel(hours: AutoSyncHours): string {
  return AUTO_SYNC_OPTIONS.find((option) => option.hours === hours)?.label ?? 'Off';
}

/** A connection can only be auto-synced once its accounts are mapped and linked. */
function eligibleAccounts(connections: ConnectionState[]) {
  return connections
    .filter((connection) => connection.status === 'LN')
    .flatMap((connection) =>
      connection.accounts
        .filter((account) => Boolean(account.wealthfolioAccountId))
        .map((account) => ({ connection, account })),
    );
}

function parseTimestamp(value?: string): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Decides whether the "sync on open" option should run.
 *
 * The oldest successful account sync wins, so a newly added or never-synced
 * account makes the whole set due. A failed automatic attempt is recorded in
 * settings and throttles retries for the same interval, which protects the
 * bank's daily request allowance.
 */
export function autoSyncIsDue(params: {
  settings: AddonSettings;
  connections: ConnectionState[];
  now?: Date;
}): boolean {
  const { settings, connections, now = new Date() } = params;
  if (!settings.autoSyncHours) return false;

  const eligible = eligibleAccounts(connections);
  if (!eligible.length) return false;

  const timestamps = eligible
    .map(({ account }) => parseTimestamp(account.lastSyncAt))
    .filter((timestamp) => timestamp > 0);
  const neverSynced = timestamps.length < eligible.length;
  const oldestSuccess = neverSynced ? 0 : Math.min(...timestamps);
  const lastAttempt = parseTimestamp(settings.lastAutoSyncAttemptAt);
  const reference = Math.max(oldestSuccess, lastAttempt);

  return now.getTime() - reference >= settings.autoSyncHours * HOUR_MS;
}
