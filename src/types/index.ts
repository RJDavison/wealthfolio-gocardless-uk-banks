/**
 * Types for the GoCardless UK Banks addon.
 *
 * The addon talks to GoCardless Bank Account Data (the former Nordigen API),
 * which is an FCA-authorised AISP. Wealthfolio addons cannot hold a TPP licence
 * themselves, so all bank access is brokered through GoCardless.
 *
 * One GoCardless credential pair is shared by every connection. Each bank
 * consent (requisition) is stored as a separate `ConnectionState`, so several
 * UK banks — or several accounts at one bank — can be connected at once.
 */

export type RequisitionStatus =
  | 'CR' // Created
  | 'GC' // Giving consent
  | 'UA' // Undergoing authentication
  | 'RJ' // Rejected
  | 'SA' // Selecting accounts
  | 'GA' // Granting access
  | 'LN' // Linked
  | 'EX' // Expired
  | 'SU'; // Suspended

export const REQUISITION_STATUS_LABELS: Record<RequisitionStatus, string> = {
  CR: 'Created — waiting for bank consent',
  GC: 'Waiting for bank consent',
  UA: 'Authenticating with the bank',
  RJ: 'Rejected by the bank',
  SA: 'Selecting accounts',
  GA: 'Granting access',
  LN: 'Connected',
  EX: 'Consent expired',
  SU: 'Suspended',
};

/** Settings the user can edit without reconnecting. */
export interface AddonSettings {
  /** Redirect URL registered in the GoCardless portal. */
  redirectUrl: string;
}

/** One bank account mirrored into Wealthfolio. */
export interface BankAccountLink {
  /** Stable identity across re-consent: IBAN when available, else the provider id. */
  identity: string;
  /** Requisition-scoped account id (changes when consent is renewed). */
  bankAccountId: string;
  name: string;
  iban?: string;
  currency: string;
  product?: string;
  ownerName?: string;
  /** Wealthfolio account that receives the imported activities. */
  wealthfolioAccountId?: string;
  /** Whether the opening balance has been booked into Wealthfolio. */
  openingBalanceApplied: boolean;
  /** Latest booked balance seen at the bank, in the account currency. */
  lastBankBalance?: string;
  /** Last date (YYYY-MM-DD) successfully imported, inclusive. */
  lastSyncDate?: string;
  /** Timestamp of the last successful sync. */
  lastSyncAt?: string;
}

/** One GoCardless requisition — i.e. one bank consent. */
export interface ConnectionState {
  version: 1;
  /** Stable local id, equal to the requisition id. */
  id: string;
  requisitionId: string;
  institutionId: string;
  institutionName: string;
  redirectUrl: string;
  link?: string;
  status: RequisitionStatus;
  createdAt: string;
  /** Best-effort consent expiry, derived from the agreement access window. */
  expiresAt?: string;
  /** Consent window requested for this requisition, in days. */
  accessValidForDays?: number;
  accounts: BankAccountLink[];
}

/* ------------------------------------------------------------------ */
/* GoCardless Bank Account Data payloads                               */
/* ------------------------------------------------------------------ */

export interface GoCardlessInstitution {
  id: string;
  name: string;
  bic?: string;
  transaction_total_days?: string;
  countries: string[];
  logo?: string;
  max_access_valid_for_days?: string;
}

export interface GoCardlessAccountDetails {
  resourceId: string;
  iban?: string;
  bban?: string;
  currency: string;
  ownerName?: string;
  name?: string;
  product?: string;
  bic?: string;
  cashAccountType?: string;
}

export interface GoCardlessBalance {
  balanceAmount: { amount: string; currency: string };
  balanceType: string;
  referenceDate?: string;
  lastChangeDateTime?: string;
}

export interface GoCardlessTransaction {
  transactionId?: string;
  internalTransactionId?: string;
  entryReference?: string;
  bookingDate?: string;
  valueDate?: string;
  transactionAmount: { amount: string; currency: string };
  creditorName?: string;
  debtorName?: string;
  creditorAccount?: { iban?: string };
  debtorAccount?: { iban?: string };
  remittanceInformationUnstructured?: string;
  remittanceInformationUnstructuredArray?: string[];
  additionalInformation?: string;
  bankTransactionCode?: string;
  proprietaryBankTransactionCode?: string;
  merchantCategoryCode?: string;
  status?: string;
}

export interface GoCardlessRequisition {
  id: string;
  status: RequisitionStatus;
  redirect?: string;
  institution_id?: string;
  agreement?: string;
  reference?: string;
  accounts: string[];
  link?: string;
  created?: string;
}

export interface GoCardlessAgreement {
  id: string;
  created?: string;
  max_historical_days?: number;
  access_valid_for_days?: number;
  access_scope?: string[];
  institution_id?: string;
}

/* ------------------------------------------------------------------ */
/* Sync reporting                                                      */
/* ------------------------------------------------------------------ */

export interface AccountSyncOutcome {
  connectionId: string;
  institutionName: string;
  identity: string;
  bankAccountName: string;
  fetched: number;
  imported: number;
  duplicates: number;
  skipped: number;
  openingBalance?: string;
  /** Row-level messages returned by Wealthfolio's import validator. */
  importIssues?: string[];
  error?: string;
}

/**
 * Bank data fetched for an account but not yet imported. Kept so a failed
 * import can be retried without spending more of the bank's daily request
 * allowance. `key` is `connectionId:identity`, so the same IBAN connected at
 * two different banks can never share a cache entry.
 */
export interface PendingBankData {
  key: string;
  identity: string;
  /** Inclusive range the transactions were fetched for. */
  from: string;
  to: string;
  createdAt: string;
  transactions: GoCardlessTransaction[];
  balance: GoCardlessBalance;
}

export interface SyncRunResult {
  startedAt: string;
  finishedAt: string;
  outcomes: AccountSyncOutcome[];
  ok: boolean;
}
