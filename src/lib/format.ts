/** Currency, date and decimal helpers. Kept dependency-free. */

const moneyFormatters = new Map<string, Intl.NumberFormat>();

export function formatMoney(
  value: number | string | null | undefined,
  currency: string,
): string {
  if (value === null || value === undefined || value === '') return '—';
  const amount = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(amount)) return '—';

  let formatter = moneyFormatters.get(currency);
  if (!formatter) {
    try {
      formatter = new Intl.NumberFormat('en-GB', {
        style: 'currency',
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    } catch {
      formatter = new Intl.NumberFormat('en-GB', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    }
    moneyFormatters.set(currency, formatter);
  }
  return formatter.format(amount);
}

export function formatDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/** YYYY-MM-DD in UTC. */
export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function parseIsoDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

/** Exact cents, avoiding float drift when summing money strings. */
export function toCents(value: number | string): number {
  const amount = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100);
}

export function formatCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function maskIban(iban?: string): string {
  if (!iban) return '';
  const clean = iban.replace(/\s+/g, '');
  if (clean.length <= 8) return clean;
  return `${clean.slice(0, 4)} •••• ${clean.slice(-4)}`;
}

export function daysUntil(value?: string): number | null {
  if (!value) return null;
  const target = new Date(value).getTime();
  if (Number.isNaN(target)) return null;
  return Math.ceil((target - Date.now()) / 86_400_000);
}

/** Stable, cheap hash for transactions that arrive without an id. */
export function stableHash(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}
