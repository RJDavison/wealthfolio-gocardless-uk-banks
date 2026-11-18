import type { AddonContext } from '@wealthfolio/addon-sdk';
import {
  DEFAULT_REDIRECT_URL,
  PENDING_BANK_DATA_TTL_MS,
  SECRETS,
  STORAGE,
} from './constants';
import type {
  AddonSettings,
  ConnectionState,
  PendingBankData,
} from '../types';

async function readJson<T>(ctx: AddonContext, key: string): Promise<T | null> {
  try {
    const raw = await ctx.api.storage.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch (error) {
    ctx.api.logger.warn(`Could not read "${key}" from storage: ${String(error)}`);
    return null;
  }
}

async function writeJson(ctx: AddonContext, key: string, value: unknown): Promise<void> {
  await ctx.api.storage.set(key, JSON.stringify(value));
}

export async function loadSettings(ctx: AddonContext): Promise<AddonSettings> {
  const stored = await readJson<Partial<AddonSettings>>(ctx, STORAGE.settings);
  return { redirectUrl: stored?.redirectUrl?.trim() || DEFAULT_REDIRECT_URL };
}

export async function saveSettings(ctx: AddonContext, settings: AddonSettings): Promise<void> {
  await writeJson(ctx, STORAGE.settings, settings);
}

/* ------------------------------------------------------------------ */
/* Connections                                                        */
/* ------------------------------------------------------------------ */

function isConnection(value: unknown): value is ConnectionState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ConnectionState>;
  if (candidate.version !== 1 || !candidate.requisitionId) return false;
  // Old single-connection records had no `id`; accept them with a derived one.
  return Array.isArray(candidate.accounts);
}

export async function loadConnections(ctx: AddonContext): Promise<ConnectionState[]> {
  const stored = await readJson<unknown>(ctx, STORAGE.connections);
  const list = Array.isArray(stored) ? stored : [];
  return list.filter(isConnection).map((connection) => ({
    ...connection,
    id: connection.id || connection.requisitionId,
  }));
}

export async function saveConnections(
  ctx: AddonContext,
  connections: ConnectionState[],
): Promise<void> {
  await writeJson(ctx, STORAGE.connections, connections);
}

export async function upsertConnection(
  ctx: AddonContext,
  connection: ConnectionState,
): Promise<ConnectionState[]> {
  const current = await loadConnections(ctx);
  const index = current.findIndex((candidate) => candidate.id === connection.id);
  const next = [...current];
  if (index >= 0) next[index] = connection;
  else next.push(connection);
  await saveConnections(ctx, next);
  return next;
}

export async function removeConnection(
  ctx: AddonContext,
  connectionId: string,
): Promise<ConnectionState[]> {
  const next = (await loadConnections(ctx)).filter(
    (connection) => connection.id !== connectionId,
  );
  await saveConnections(ctx, next);
  await clearPendingBankDataForConnection(ctx, connectionId);
  return next;
}

/* ------------------------------------------------------------------ */
/* Credentials                                                        */
/* ------------------------------------------------------------------ */

export interface Credentials {
  secretId: string;
  secretKey: string;
}

export async function loadCredentials(ctx: AddonContext): Promise<Credentials | null> {
  const [secretId, secretKey] = await Promise.all([
    ctx.api.secrets.get(SECRETS.secretId),
    ctx.api.secrets.get(SECRETS.secretKey),
  ]);
  if (!secretId || !secretKey) return null;
  return { secretId, secretKey };
}

export async function saveCredentials(
  ctx: AddonContext,
  credentials: Credentials,
): Promise<void> {
  await ctx.api.secrets.set(SECRETS.secretId, credentials.secretId.trim());
  await ctx.api.secrets.set(SECRETS.secretKey, credentials.secretKey.trim());
}

export async function clearCredentials(ctx: AddonContext): Promise<void> {
  await Promise.all([
    ctx.api.secrets.delete(SECRETS.secretId),
    ctx.api.secrets.delete(SECRETS.secretKey),
    ctx.api.secrets.delete(SECRETS.accessToken),
    ctx.api.secrets.delete(SECRETS.refreshToken),
  ]);
}

/* ------------------------------------------------------------------ */
/* Pending bank data                                                  */
/* ------------------------------------------------------------------ */

type PendingBankDataMap = Record<string, PendingBankData>;

export function pendingKey(connectionId: string, identity: string): string {
  return `${connectionId}:${identity}`;
}

function pendingBankDataIsFresh(entry: PendingBankData): boolean {
  const createdAt = Date.parse(entry.createdAt);
  return Number.isFinite(createdAt) && Date.now() - createdAt < PENDING_BANK_DATA_TTL_MS;
}

/**
 * Returns bank data fetched by an earlier attempt that never reached a
 * successful import, when it covers the same date range and is still fresh.
 * UK banks allow only a handful of requests per account per day, so retrying
 * a failed import must not re-read the account.
 */
export async function loadPendingBankData(
  ctx: AddonContext,
  key: string,
  from: string,
  to: string,
): Promise<PendingBankData | null> {
  const stored = await readJson<PendingBankDataMap>(ctx, STORAGE.pendingBankData);
  const entry = stored?.[key];
  if (!entry || entry.from !== from || entry.to !== to) return null;
  if (!pendingBankDataIsFresh(entry)) {
    await clearPendingBankData(ctx, key);
    return null;
  }
  return entry;
}

export async function savePendingBankData(
  ctx: AddonContext,
  entry: Omit<PendingBankData, 'createdAt'>,
): Promise<void> {
  const stored = (await readJson<PendingBankDataMap>(ctx, STORAGE.pendingBankData)) ?? {};
  const next: PendingBankDataMap = {};
  for (const [key, candidate] of Object.entries(stored)) {
    if (key !== entry.key && pendingBankDataIsFresh(candidate)) next[key] = candidate;
  }
  next[entry.key] = { ...entry, createdAt: new Date().toISOString() };
  await writeJson(ctx, STORAGE.pendingBankData, next);
}

export async function clearPendingBankData(
  ctx: AddonContext,
  key: string,
): Promise<void> {
  const stored = await readJson<PendingBankDataMap>(ctx, STORAGE.pendingBankData);
  if (!stored || !(key in stored)) return;
  const next = { ...stored };
  delete next[key];
  if (Object.keys(next).length === 0) {
    await ctx.api.storage.delete(STORAGE.pendingBankData);
  } else {
    await writeJson(ctx, STORAGE.pendingBankData, next);
  }
}

async function clearPendingBankDataForConnection(
  ctx: AddonContext,
  connectionId: string,
): Promise<void> {
  const stored = await readJson<PendingBankDataMap>(ctx, STORAGE.pendingBankData);
  if (!stored) return;
  const prefix = `${connectionId}:`;
  const next = Object.fromEntries(
    Object.entries(stored).filter(([key]) => !key.startsWith(prefix)),
  );
  if (Object.keys(next).length === 0) {
    await ctx.api.storage.delete(STORAGE.pendingBankData);
  } else {
    await writeJson(ctx, STORAGE.pendingBankData, next);
  }
}
