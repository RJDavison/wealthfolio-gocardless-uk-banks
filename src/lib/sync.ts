import type {
  AddonContext,
  ActivityImport,
  ImportActivitiesResult,
  ImportActivitiesSummary,
} from '@wealthfolio/addon-sdk';
import { CHUNK_DAYS, IMPORT_BATCH_SIZE, OVERLAP_DAYS } from './constants';
import { addDays, parseIsoDate, startOfTodayUtc, toCents, toIsoDate } from './format';
import { GoCardlessClient, GoCardlessError } from './gocardless';
import {
  buildOpeningBalanceRow,
  buildTransactionRows,
  pickBookedBalance,
} from './mapping';
import type {
  AccountSyncOutcome,
  BankAccountLink,
  ConnectionState,
  GoCardlessBalance,
  GoCardlessTransaction,
  SyncRunResult,
} from '../types';
import {
  clearPendingBankData,
  loadPendingBankData,
  pendingKey,
  savePendingBankData,
} from './store';

export interface SyncOptions {
  /** Only used on the first sync for an account. */
  historyDays: number;
  /** Restrict to these bank connections; omit for all. */
  connectionIds?: string[];
  /** Restrict to these bank account identities; omit for all. */
  identities?: string[];
  onProgress?: (message: string) => void;
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function dateRanges(from: Date, to: Date): Array<{ from: string; to: string }> {
  const ranges: Array<{ from: string; to: string }> = [];
  let cursor = new Date(from.getTime());
  while (cursor.getTime() <= to.getTime()) {
    const end = addDays(cursor, CHUNK_DAYS - 1);
    const bounded = end.getTime() > to.getTime() ? to : end;
    ranges.push({ from: toIsoDate(cursor), to: toIsoDate(bounded) });
    cursor = addDays(bounded, 1);
  }
  return ranges;
}

/** Turns one validator result into `field: message` lines. */
function rowIssues(row: ActivityImport): string[] {
  const issues: string[] = [];
  for (const [field, messages] of Object.entries(row.errors ?? {})) {
    const text = (messages ?? []).join('; ').trim();
    if (text) issues.push(`${field}: ${text}`);
  }
  return issues;
}

async function importRows(
  ctx: AddonContext,
  rows: ActivityImport[],
): Promise<{
  imported: number;
  duplicates: number;
  skipped: number;
  invalid: number;
  issues: string[];
}> {
  let imported = 0;
  let duplicates = 0;
  let skipped = 0;
  let invalid = 0;
  const issues = new Set<string>();

  for (let index = 0; index < rows.length; index += IMPORT_BATCH_SIZE) {
    const batch = rows.slice(index, index + IMPORT_BATCH_SIZE);

    let checked: ActivityImport[];
    try {
      checked = await ctx.api.activities.checkImport(batch);
    } catch (error) {
      const detail = errorText(error);
      ctx.api.logger.error(
        `Wealthfolio rejected the import check for ${batch.length} row(s): ${detail}`,
      );
      ctx.api.logger.error(`First row sent: ${JSON.stringify(batch[0] ?? null)}`);
      throw new Error(`Wealthfolio rejected the import check: ${detail}`);
    }

    const valid = checked.filter((row) => row.isValid !== false);
    invalid += checked.length - valid.length;
    for (const row of checked) {
      if (row.isValid === false) {
        for (const issue of rowIssues(row)) issues.add(issue);
      }
    }

    if (!valid.length) continue;

    let result: ImportActivitiesResult;
    try {
      result = await ctx.api.activities.import(valid);
    } catch (error) {
      const detail = errorText(error);
      ctx.api.logger.error(
        `Wealthfolio rejected the import of ${valid.length} row(s): ${detail}`,
      );
      ctx.api.logger.error(`First row sent: ${JSON.stringify(valid[0] ?? null)}`);
      throw new Error(`Wealthfolio rejected the import: ${detail}`);
    }

    const summary: ImportActivitiesSummary = result.summary;
    imported += summary.imported;
    duplicates += summary.duplicates;
    skipped += summary.skipped;
  }

  // Keep the log useful without flooding it when every row fails the same way.
  for (const issue of [...issues].slice(0, 20)) {
    ctx.api.logger.error(`Import row rejected — ${issue}`);
  }

  return { imported, duplicates, skipped, invalid, issues: [...issues] };
}

async function syncOneAccount(
  ctx: AddonContext,
  client: GoCardlessClient,
  connection: ConnectionState,
  link: BankAccountLink,
  options: SyncOptions,
): Promise<AccountSyncOutcome> {
  const outcome: AccountSyncOutcome = {
    connectionId: connection.id,
    institutionName: connection.institutionName,
    identity: link.identity,
    bankAccountName: link.name,
    fetched: 0,
    imported: 0,
    duplicates: 0,
    skipped: 0,
  };

  if (!link.wealthfolioAccountId) {
    return { ...outcome, error: 'No Wealthfolio account linked yet' };
  }

  const today = startOfTodayUtc();
  const isFirstSync = !link.lastSyncAt;
  const from = isFirstSync
    ? addDays(today, -(Math.max(options.historyDays, 1) - 1))
    : addDays(parseIsoDate(link.lastSyncDate ?? toIsoDate(today)), -OVERLAP_DAYS);
  const to = today;
  const fromIso = toIsoDate(from);
  const toIso = toIsoDate(to);

  const ranges = dateRanges(from, to);
  const cacheKey = pendingKey(connection.id, link.identity);
  const cached = await loadPendingBankData(ctx, cacheKey, fromIso, toIso);

  let transactions: GoCardlessTransaction[];
  let balance: GoCardlessBalance;

  if (cached) {
    options.onProgress?.(
      `Reusing bank data saved from the previous attempt for ${connection.institutionName} / ${link.name}…`,
    );
    transactions = cached.transactions;
    balance = cached.balance;
  } else {
    transactions = [];
    for (const [index, range] of ranges.entries()) {
      options.onProgress?.(
        `Fetching ${connection.institutionName} / ${link.name}: ${range.from} → ${range.to} (${index + 1}/${ranges.length})`,
      );
      try {
        const page = await client.getTransactions(link.bankAccountId, range.from, range.to);
        transactions.push(...(page.transactions?.booked ?? []));
      } catch (error) {
        // Some banks reject windows that reach further back than their available
        // history; on the first sync just keep the newer chunks.
        const isPeriodError =
          error instanceof GoCardlessError &&
          error.status === 400 &&
          /period|date|history/i.test(`${error.message} ${error.detail ?? ''}`);
        if (isPeriodError && isFirstSync && index < ranges.length - 1) {
          ctx.api.logger.warn(
            `Skipping unavailable history for ${connection.institutionName} / ${link.name}: ${range.from} → ${range.to}`,
          );
          continue;
        }
        throw error;
      }
    }

    options.onProgress?.(`Reading ${connection.institutionName} / ${link.name} balance…`);
    const { balances } = await client.getBalances(link.bankAccountId);
    const picked = pickBookedBalance(balances ?? []);

    if (!picked) {
      throw new GoCardlessError(
        `${connection.institutionName} / ${link.name}: the bank returned no balance`,
        422,
      );
    }

    const balanceCurrency = picked.balanceAmount.currency;
    if (balanceCurrency && balanceCurrency !== link.currency) {
      throw new GoCardlessError(
        `${connection.institutionName} / ${link.name}: balance is in ${balanceCurrency} but the account is ${link.currency}`,
        422,
      );
    }

    balance = picked;
  }

  // Keep the payload so a failed import can be retried without another bank
  // request; UK banks allow only a few per account per day.
  await savePendingBankData(ctx, {
    key: cacheKey,
    identity: link.identity,
    from: fromIso,
    to: toIso,
    transactions,
    balance,
  });

  const rows = buildTransactionRows(transactions, link, link.currency);
  outcome.fetched = transactions.length;
  link.lastBankBalance = balance.balanceAmount.amount;

  let openingRow: ActivityImport | null = null;

  if (isFirstSync) {
    const balanceCents = toCents(balance.balanceAmount.amount);
    // Derive the movement from the rows that will actually be imported, so the
    // opening balance reconciles even if a transaction was skipped.
    const movedCents = rows.reduce(
      (total, row) =>
        total +
        (row.activityType === 'WITHDRAWAL' ? -1 : 1) * toCents(row.amount ?? '0'),
      0,
    );
    const openingCents = balanceCents - movedCents;

    const earliest = transactions
      .map((transaction) => transaction.bookingDate ?? transaction.valueDate)
      .filter((date): date is string => Boolean(date))
      .sort()[0];

    openingRow = buildOpeningBalanceRow({
      link,
      openingCents,
      firstTransactionDate: earliest ?? toIsoDate(from),
    });

    outcome.openingBalance = (openingCents / 100).toFixed(2);
  }

  const allRows = openingRow ? [openingRow, ...rows] : rows;
  if (allRows.length) {
    options.onProgress?.(`Importing ${allRows.length} activities into ${link.name}…`);
    const result = await importRows(
      ctx,
      allRows.map((row) => ({ ...row, accountId: link.wealthfolioAccountId as string })),
    );
    outcome.imported = result.imported;
    outcome.duplicates = result.duplicates;
    outcome.skipped = result.skipped + result.invalid;
    if (result.issues.length) outcome.importIssues = result.issues.slice(0, 5);
  }

  // The import went through, so the saved payload is no longer needed.
  await clearPendingBankData(ctx, cacheKey);

  // Only record the opening balance once the import actually went through.
  if (openingRow) link.openingBalanceApplied = true;

  return outcome;
}

export async function runSync(
  ctx: AddonContext,
  client: GoCardlessClient,
  connections: ConnectionState[],
  options: SyncOptions,
): Promise<{ connections: ConnectionState[]; result: SyncRunResult }> {
  const startedAt = new Date().toISOString();
  const outcomes: AccountSyncOutcome[] = [];
  const next: ConnectionState[] = connections.map((connection) => ({
    ...connection,
    accounts: connection.accounts.map((link) => ({ ...link })),
  }));

  for (const source of connections) {
    if (options.connectionIds?.length && !options.connectionIds.includes(source.id)) continue;

    const connection = next.find((candidate) => candidate.id === source.id);
    if (!connection) continue;

    for (const link of source.accounts) {
      if (options.identities?.length && !options.identities.includes(link.identity)) continue;

      const target = connection.accounts.find((candidate) => candidate.identity === link.identity);
      if (!target) continue;

      try {
        const outcome = await syncOneAccount(ctx, client, connection, target, options);
        outcomes.push(outcome);
        if (!outcome.error) {
          target.lastSyncAt = new Date().toISOString();
          target.lastSyncDate = toIsoDate(startOfTodayUtc());
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.api.logger.error(
          `Sync failed for ${connection.institutionName} / ${link.name}: ${message}`,
        );
        outcomes.push({
          connectionId: connection.id,
          institutionName: connection.institutionName,
          identity: link.identity,
          bankAccountName: link.name,
          fetched: 0,
          imported: 0,
          duplicates: 0,
          skipped: 0,
          error: message,
        });
      }
    }
  }

  const result: SyncRunResult = {
    startedAt,
    finishedAt: new Date().toISOString(),
    outcomes,
    ok: outcomes.length > 0 && outcomes.every((outcome) => !outcome.error),
  };

  return { connections: next, result };
}

/** Creates a Wealthfolio cash account mirroring the bank account. */
export async function createWealthfolioAccount(
  ctx: AddonContext,
  params: { name: string; currency: string; creditCard?: boolean },
) {
  return ctx.api.accounts.create({
    name: params.name,
    accountType: params.creditCard ? 'CREDIT_CARD' : 'CASH',
    currency: params.currency,
    isDefault: false,
    isActive: true,
    trackingMode: 'TRANSACTIONS',
  });
}
