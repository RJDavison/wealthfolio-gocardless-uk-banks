import type { ActivityImport } from '@wealthfolio/addon-sdk';
import type {
  BankAccountLink,
  GoCardlessBalance,
  GoCardlessTransaction,
} from '../types';
import { formatCents, stableHash, toCents } from './format';

/**
 * Balance types ordered by how closely they reflect settled cash. `interimBooked`
 * is the live booked balance most UK banks return; `closingBooked` is the last
 * statement close.
 */
const BALANCE_PRIORITY = [
  'interimBooked',
  'closingBooked',
  'expected',
  'interimAvailable',
  'closingAvailable',
  'available',
  'forwardAvailable',
  'information',
];

export function pickBookedBalance(balances: GoCardlessBalance[]): GoCardlessBalance | null {
  if (!balances.length) return null;
  for (const type of BALANCE_PRIORITY) {
    const match = balances.find((balance) => balance.balanceType === type);
    if (match) return match;
  }
  return balances[0];
}

export function transactionDescription(transaction: GoCardlessTransaction): string {
  const unstructured = transaction.remittanceInformationUnstructured?.trim();
  if (unstructured) return unstructured;
  const array = transaction.remittanceInformationUnstructuredArray
    ?.map((part) => part.trim())
    .filter(Boolean)
    .join(' ');
  if (array) return array;
  if (transaction.additionalInformation?.trim()) return transaction.additionalInformation.trim();
  return transaction.creditorName ?? transaction.debtorName ?? 'Bank transaction';
}

export function transactionIdentity(transaction: GoCardlessTransaction): string {
  const provided =
    transaction.internalTransactionId ??
    transaction.transactionId ??
    transaction.entryReference;
  if (provided) return provided;
  return stableHash(
    [
      transaction.bookingDate ?? transaction.valueDate ?? '',
      transaction.transactionAmount?.amount ?? '',
      transaction.transactionAmount?.currency ?? '',
      transactionDescription(transaction),
    ].join('|'),
  );
}

/**
 * Converts booked bank transactions into Wealthfolio import rows.
 *
 * Money leaving the account becomes a WITHDRAWAL, money arriving a DEPOSIT.
 * `sourceRecordId` is stable per bank transaction, so re-syncing an overlapping
 * range never duplicates activities.
 */
export function buildTransactionRows(
  transactions: GoCardlessTransaction[],
  link: BankAccountLink,
  fallbackCurrency: string,
): ActivityImport[] {
  const rows: ActivityImport[] = [];
  const seen = new Map<string, number>();

  for (const transaction of transactions) {
    const date = transaction.bookingDate ?? transaction.valueDate;
    if (!date) continue;

    const rawAmount = transaction.transactionAmount?.amount ?? '0';
    const amountCents = toCents(rawAmount);
    if (amountCents === 0) continue;

    const currency = transaction.transactionAmount?.currency ?? fallbackCurrency;
    const description = transactionDescription(transaction);
    const counterparty = transaction.creditorName ?? transaction.debtorName ?? undefined;

    const baseId = transactionIdentity(transaction);
    const seenCount = seen.get(baseId) ?? 0;
    seen.set(baseId, seenCount + 1);
    const recordId =
      seenCount === 0
        ? `${link.identity}:${baseId}`
        : `${link.identity}:${baseId}:${seenCount}`;

    rows.push({
      accountId: '', // filled in by the caller
      activityType: amountCents < 0 ? 'WITHDRAWAL' : 'DEPOSIT',
      date,
      // Wealthfolio's ActivityImport requires `symbol` even for cash rows; the
      // host clears it during validation for DEPOSIT / WITHDRAWAL. Omitting it
      // fails request deserialisation with a bare 422.
      symbol: '',
      amount: formatCents(Math.abs(amountCents)),
      currency,
      comment: description.slice(0, 500),
      sourceRecordId: recordId,
      isValid: true,
      isDraft: false,
      metadata: {
        source: 'gocardless-uk-banks',
        bankAccount: link.iban ?? link.bankAccountId,
        counterparty,
        valueDate: transaction.valueDate,
        bankTransactionCode: transaction.bankTransactionCode,
        merchantCategoryCode: transaction.merchantCategoryCode,
      },
    });
  }

  return rows;
}

/**
 * The first sync imports a window of history, which does not reproduce the
 * current balance on its own. Book the difference as an opening DEPOSIT or
 * WITHDRAWAL dated the day before the first imported transaction.
 */
export function buildOpeningBalanceRow(params: {
  link: BankAccountLink;
  openingCents: number;
  firstTransactionDate: string;
}): ActivityImport | null {
  const { link, openingCents, firstTransactionDate } = params;
  if (openingCents === 0) return null;

  const date = new Date(`${firstTransactionDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);

  return {
    accountId: '',
    activityType: openingCents > 0 ? 'DEPOSIT' : 'WITHDRAWAL',
    date: date.toISOString().slice(0, 10),
    symbol: '',
    amount: formatCents(Math.abs(openingCents)),
    currency: link.currency,
    comment: 'Opening balance carried over from bank',
    sourceRecordId: `${link.identity}:opening-balance`,
    isValid: true,
    isDraft: false,
    metadata: {
      source: 'gocardless-uk-banks',
      kind: 'opening-balance',
      bankAccount: link.iban ?? link.bankAccountId,
    },
  };
}
