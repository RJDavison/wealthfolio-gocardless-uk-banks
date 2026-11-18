import { jsxs as r, jsx as s, Fragment as ie } from "react/jsx-runtime";
import { useQuery as Q, useQueryClient as Ge, QueryClientProvider as Ke } from "@tanstack/react-query";
import { useState as I, useMemo as xe, useEffect as je } from "react";
import { Badge as Me, Button as D, Card as K, CardHeader as j, CardTitle as M, CardDescription as H, CardContent as W, Input as V, Separator as fe, Skeleton as re } from "@wealthfolio/ui";
const We = "https://bankaccountdata.gocardless.com/api/v2", F = {
  secretId: "gc-uk-secret-id",
  secretKey: "gc-uk-secret-key",
  accessToken: "gc-uk-access-token",
  refreshToken: "gc-uk-refresh-token"
}, _ = {
  settings: "settings",
  connections: "connections",
  pendingBankData: "pending-bank-data"
}, He = 90, oe = 730, ze = 89, ce = "https://localhost:8443/gocardless-callback", ve = 250, Qe = 720 * 60 * 1e3, de = 90;
async function z(e, t) {
  try {
    const n = await e.api.storage.get(t);
    return n ? JSON.parse(n) : null;
  } catch (n) {
    return e.api.logger.warn(`Could not read "${t}" from storage: ${String(n)}`), null;
  }
}
async function Z(e, t, n) {
  await e.api.storage.set(t, JSON.stringify(n));
}
async function Ve(e) {
  return { redirectUrl: (await z(e, _.settings))?.redirectUrl?.trim() || ce };
}
async function Ye(e, t) {
  await Z(e, _.settings, t);
}
function Je(e) {
  if (!e || typeof e != "object") return !1;
  const t = e;
  return t.version !== 1 || !t.requisitionId ? !1 : Array.isArray(t.accounts);
}
async function pe(e) {
  const t = await z(e, _.connections);
  return (Array.isArray(t) ? t : []).filter(Je).map((a) => ({
    ...a,
    id: a.id || a.requisitionId
  }));
}
async function ge(e, t) {
  await Z(e, _.connections, t);
}
async function Ce(e, t) {
  const n = await pe(e), a = n.findIndex((o) => o.id === t.id), i = [...n];
  return a >= 0 ? i[a] = t : i.push(t), await ge(e, i), i;
}
async function Ze(e, t) {
  const n = (await pe(e)).filter(
    (a) => a.id !== t
  );
  return await ge(e, n), await at(e, t), n;
}
async function De(e) {
  const [t, n] = await Promise.all([
    e.api.secrets.get(F.secretId),
    e.api.secrets.get(F.secretKey)
  ]);
  return !t || !n ? null : { secretId: t, secretKey: n };
}
async function Xe(e, t) {
  await e.api.secrets.set(F.secretId, t.secretId.trim()), await e.api.secrets.set(F.secretKey, t.secretKey.trim());
}
async function et(e) {
  await Promise.all([
    e.api.secrets.delete(F.secretId),
    e.api.secrets.delete(F.secretKey),
    e.api.secrets.delete(F.accessToken),
    e.api.secrets.delete(F.refreshToken)
  ]);
}
function tt(e, t) {
  return `${e}:${t}`;
}
function Ie(e) {
  const t = Date.parse(e.createdAt);
  return Number.isFinite(t) && Date.now() - t < Qe;
}
async function nt(e, t, n, a) {
  const o = (await z(e, _.pendingBankData))?.[t];
  return !o || o.from !== n || o.to !== a ? null : Ie(o) ? o : (await Te(e, t), null);
}
async function st(e, t) {
  const n = await z(e, _.pendingBankData) ?? {}, a = {};
  for (const [i, o] of Object.entries(n))
    i !== t.key && Ie(o) && (a[i] = o);
  a[t.key] = { ...t, createdAt: (/* @__PURE__ */ new Date()).toISOString() }, await Z(e, _.pendingBankData, a);
}
async function Te(e, t) {
  const n = await z(e, _.pendingBankData);
  if (!n || !(t in n)) return;
  const a = { ...n };
  delete a[t], Object.keys(a).length === 0 ? await e.api.storage.delete(_.pendingBankData) : await Z(e, _.pendingBankData, a);
}
async function at(e, t) {
  const n = await z(e, _.pendingBankData);
  if (!n) return;
  const a = `${t}:`, i = Object.fromEntries(
    Object.entries(n).filter(([o]) => !o.startsWith(a))
  );
  Object.keys(i).length === 0 ? await e.api.storage.delete(_.pendingBankData) : await Z(e, _.pendingBankData, i);
}
class P extends Error {
  constructor(t, n, a, i) {
    super(t), this.name = "GoCardlessError", this.status = n, this.code = a, this.detail = i;
  }
  get isRateLimit() {
    return this.status === 429 || this.code === "ASPSP_RATE_LIMIT_EXCEEDED";
  }
  get isAuthError() {
    return this.status === 401 || this.status === 403;
  }
  static fromResponse(t, n) {
    let a = `GoCardless request failed (HTTP ${t})`, i, o;
    try {
      const m = JSON.parse(n);
      typeof m.summary == "string" && m.summary.trim() && (a = m.summary), typeof m.detail == "string" && (o = m.detail), typeof m.error == "string" && (i = m.error), typeof m.code == "string" && (i = m.code);
    } catch {
      n.trim() && (o = n.slice(0, 500));
    }
    return i && (a = `${a} (${i})`), new P(a, t, i, o);
  }
}
class it extends Error {
  constructor() {
    super("GoCardless credentials are not configured"), this.name = "MissingCredentialsError";
  }
}
const rt = /not approved|not declared|not allowed to use network auth/i;
class ot extends Error {
  constructor(t) {
    super(
      `Wealthfolio has not approved this add-on’s network access to bankaccountdata.gocardless.com. Open Settings → Add-ons → GoCardless UK Banks → View permissions, tick bankaccountdata.gocardless.com under Network hosts, click Save, then run the sync again. (Broker message: ${String(t)})`
    ), this.name = "NetworkAccessNotApprovedError";
  }
}
const ct = 12e4;
class $e {
  constructor(t) {
    this.ctx = t, this.accessToken = null, this.accessExpiresAt = 0, this.inFlightAuth = null;
  }
  /** Validates a credential pair without persisting anything. */
  async testCredentials(t, n) {
    await this.tokenNew({ secretId: t, secretKey: n });
  }
  async listInstitutions(t = "gb") {
    return this.send(
      `institutions/?country=${encodeURIComponent(t)}`
    );
  }
  async createAgreement(t) {
    return this.send("agreements/enduser/", {
      method: "POST",
      body: {
        institution_id: t.institutionId,
        max_historical_days: t.maxHistoricalDays,
        access_valid_for_days: t.accessValidForDays,
        access_scope: ["details", "balances", "transactions"]
      }
    });
  }
  async createRequisition(t) {
    return this.send("requisitions/", {
      method: "POST",
      body: {
        redirect: t.redirectUrl,
        institution_id: t.institutionId,
        reference: t.reference,
        user_language: "EN",
        ...t.agreementId ? { agreement: t.agreementId } : {}
      }
    });
  }
  async getRequisition(t) {
    return this.send(`requisitions/${t}/`);
  }
  async deleteRequisition(t) {
    await this.send(`requisitions/${t}/`, { method: "DELETE" });
  }
  async getAccountDetails(t) {
    return this.send(
      `accounts/${t}/details/`
    );
  }
  async getBalances(t) {
    return this.send(`accounts/${t}/balances/`);
  }
  async getTransactions(t, n, a) {
    const i = new URLSearchParams({ date_from: n, date_to: a }).toString();
    return this.send(`accounts/${t}/transactions/?${i}`, { timeoutSecs: 90 });
  }
  /* ------------------------------------------------------------------ */
  async send(t, n = {}) {
    const { method: a = "GET", body: i, authed: o = !0, timeoutSecs: m = 45 } = n, y = o ? await this.authorize() : null;
    let l;
    try {
      l = await this.ctx.api.network.request({
        url: `${We}/${t}`,
        method: a,
        headers: {
          accept: "application/json",
          ...i === void 0 ? {} : { "content-type": "application/json" }
        },
        body: i === void 0 ? void 0 : JSON.stringify(i),
        auth: y ? { type: "bearer", secretKey: F.accessToken } : void 0,
        timeoutSecs: m
      });
    } catch (u) {
      throw rt.test(String(u)) ? new ot(u) : u;
    }
    if (l.status < 200 || l.status >= 300)
      throw P.fromResponse(l.status, l.body);
    return l.body ? JSON.parse(l.body) : {};
  }
  async authorize(t = !1) {
    return !t && this.accessToken && Date.now() < this.accessExpiresAt - ct ? this.accessToken : this.inFlightAuth ? this.inFlightAuth : (this.inFlightAuth = this.refreshOrCreateToken().finally(() => {
      this.inFlightAuth = null;
    }), this.inFlightAuth);
  }
  async refreshOrCreateToken() {
    const t = await this.ctx.api.secrets.get(F.refreshToken);
    if (t)
      try {
        const i = await this.tokenRefresh(t);
        if (i.access)
          return this.rememberAccess(i.access, i.access_expires);
      } catch (i) {
        this.ctx.api.logger.debug(
          `GoCardless refresh failed, creating a new token: ${String(i)}`
        );
      }
    const n = await De(this.ctx);
    if (!n) throw new it();
    const a = await this.tokenNew(n);
    if (a.refresh && await this.ctx.api.secrets.set(F.refreshToken, a.refresh), a.access)
      return this.rememberAccess(a.access, a.access_expires);
    if (a.refresh) {
      const i = await this.tokenRefresh(a.refresh);
      if (i.access)
        return this.rememberAccess(i.access, i.access_expires);
    }
    throw new P("GoCardless did not return an access token", 500);
  }
  async rememberAccess(t, n) {
    return this.accessToken = t, this.accessExpiresAt = Date.now() + (n ?? 86400) * 1e3, await this.ctx.api.secrets.set(F.accessToken, t), t;
  }
  async tokenNew(t) {
    return this.send("token/new/", {
      method: "POST",
      authed: !1,
      body: { secret_id: t.secretId, secret_key: t.secretKey },
      timeoutSecs: 20
    });
  }
  async tokenRefresh(t) {
    return this.send("token/refresh/", {
      method: "POST",
      authed: !1,
      body: { refresh: t },
      timeoutSecs: 20
    });
  }
}
function ye(e) {
  return e === "LN";
}
function Re(e) {
  return ["CR", "GC", "UA", "SA", "GA"].includes(e);
}
function we(e) {
  const t = Number(e);
  return Number.isFinite(t) && t > 0 ? Math.floor(t) : null;
}
function dt(e) {
  return Math.min(
    we(e.transaction_total_days) ?? oe,
    oe
  );
}
function lt(e) {
  const t = we(e.max_access_valid_for_days);
  return t ? Math.min(de, t) : de;
}
function ut(e) {
  return e ? e.replace(/\s+/g, "").toUpperCase() : void 0;
}
function le(e, t, n) {
  const a = /* @__PURE__ */ new Map();
  for (const i of e)
    if (i.institutionId === t)
      for (const o of i.accounts)
        a.has(o.identity) || a.set(o.identity, { ...o });
  return [...a.values()];
}
async function ht(e) {
  const { client: t, settings: n, institution: a, carriedAccounts: i } = e, o = dt(a), m = lt(a), y = await t.createAgreement({
    institutionId: a.id,
    maxHistoricalDays: o,
    accessValidForDays: m
  }), l = await t.createRequisition({
    institutionId: a.id,
    redirectUrl: n.redirectUrl,
    reference: `wealthfolio-uk-${Date.now()}`,
    agreementId: y.id
  }), u = we(y.access_valid_for_days) ?? m;
  return {
    version: 1,
    id: l.id,
    requisitionId: l.id,
    institutionId: a.id,
    institutionName: a.name,
    redirectUrl: n.redirectUrl,
    link: l.link,
    status: l.status,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    expiresAt: new Date(Date.now() + u * 864e5).toISOString(),
    accessValidForDays: u,
    accounts: i.map((g) => ({ ...g }))
  };
}
function Be(e, t) {
  switch (e) {
    case "pending":
      return `${t} has not finished the consent yet. Complete it in your browser, then check again.`;
    case "rejected":
      return `${t} rejected the consent. Start a new connection and try again.`;
    case "expired":
      return "The consent request expired before it was approved. Start a new connection.";
    case "other":
      return "Unexpected connection status. Start a new connection if it does not progress.";
    default:
      return `Connected to ${t}.`;
  }
}
async function Ee(e) {
  const { client: t, connection: n, carriedAccounts: a = n.accounts } = e, i = await t.getRequisition(n.requisitionId);
  if (!ye(i.status)) {
    const l = Re(i.status) ? "pending" : i.status === "RJ" ? "rejected" : i.status === "EX" ? "expired" : "other";
    return {
      connection: {
        ...n,
        status: i.status,
        link: i.link ?? n.link
      },
      kind: l,
      status: i.status
    };
  }
  const o = new Map(a.map((l) => [l.identity, l])), m = [];
  for (const l of i.accounts ?? []) {
    const { account: u } = await t.getAccountDetails(l), g = ut(u.iban), v = g ?? u.resourceId ?? l, f = o.get(v);
    m.push({
      identity: v,
      bankAccountId: l,
      name: u.name?.trim() || u.product?.trim() || `${n.institutionName} account`,
      iban: g,
      currency: u.currency || "GBP",
      product: u.product,
      ownerName: u.ownerName,
      wealthfolioAccountId: f?.wealthfolioAccountId,
      openingBalanceApplied: f?.openingBalanceApplied ?? !1,
      lastBankBalance: f?.lastBankBalance,
      lastSyncDate: f?.lastSyncDate,
      lastSyncAt: f?.lastSyncAt
    });
  }
  const y = n.accessValidForDays ?? de;
  return {
    connection: {
      ...n,
      status: i.status,
      link: i.link ?? n.link,
      // The consent clock starts when the bank approves it, not when the
      // requisition was created, so refresh the estimate now.
      expiresAt: new Date(Date.now() + y * 864e5).toISOString(),
      accounts: m
    },
    kind: "live",
    status: i.status
  };
}
const Ne = /* @__PURE__ */ new Map();
function mt(e, t) {
  if (e == null || e === "") return "—";
  const n = typeof e == "string" ? Number(e) : e;
  if (!Number.isFinite(n)) return "—";
  let a = Ne.get(t);
  if (!a) {
    try {
      a = new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: t,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    } catch {
      a = new Intl.NumberFormat("en-GB", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    }
    Ne.set(t, a);
  }
  return a.format(n);
}
function ue(e) {
  if (!e) return "—";
  const t = new Date(e.length === 10 ? `${e}T00:00:00Z` : e);
  return Number.isNaN(t.getTime()) ? e : new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  }).format(t);
}
function G(e) {
  return e.toISOString().slice(0, 10);
}
function ft(e) {
  return /* @__PURE__ */ new Date(`${e}T00:00:00Z`);
}
function ee(e, t) {
  const n = new Date(e.getTime());
  return n.setUTCDate(n.getUTCDate() + t), n;
}
function _e() {
  const e = /* @__PURE__ */ new Date();
  return new Date(
    Date.UTC(e.getUTCFullYear(), e.getUTCMonth(), e.getUTCDate())
  );
}
function he(e) {
  const t = typeof e == "string" ? Number(e) : e;
  return Number.isFinite(t) ? Math.round(t * 100) : 0;
}
function Fe(e) {
  return (e / 100).toFixed(2);
}
function pt(e) {
  if (!e) return "";
  const t = e.replace(/\s+/g, "");
  return t.length <= 8 ? t : `${t.slice(0, 4)} •••• ${t.slice(-4)}`;
}
function gt(e) {
  if (!e) return null;
  const t = new Date(e).getTime();
  return Number.isNaN(t) ? null : Math.ceil((t - Date.now()) / 864e5);
}
function yt(e) {
  let t = 5381;
  for (let n = 0; n < e.length; n += 1)
    t = (t << 5) + t + e.charCodeAt(n) | 0;
  return (t >>> 0).toString(36);
}
const wt = [
  "interimBooked",
  "closingBooked",
  "expected",
  "interimAvailable",
  "closingAvailable",
  "available",
  "forwardAvailable",
  "information"
];
function bt(e) {
  if (!e.length) return null;
  for (const t of wt) {
    const n = e.find((a) => a.balanceType === t);
    if (n) return n;
  }
  return e[0];
}
function Oe(e) {
  const t = e.remittanceInformationUnstructured?.trim();
  if (t) return t;
  const n = e.remittanceInformationUnstructuredArray?.map((a) => a.trim()).filter(Boolean).join(" ");
  return n || (e.additionalInformation?.trim() ? e.additionalInformation.trim() : e.creditorName ?? e.debtorName ?? "Bank transaction");
}
function kt(e) {
  const t = e.internalTransactionId ?? e.transactionId ?? e.entryReference;
  return t || yt(
    [
      e.bookingDate ?? e.valueDate ?? "",
      e.transactionAmount?.amount ?? "",
      e.transactionAmount?.currency ?? "",
      Oe(e)
    ].join("|")
  );
}
function vt(e, t, n) {
  const a = [], i = /* @__PURE__ */ new Map();
  for (const o of e) {
    const m = o.bookingDate ?? o.valueDate;
    if (!m) continue;
    const y = o.transactionAmount?.amount ?? "0", l = he(y);
    if (l === 0) continue;
    const u = o.transactionAmount?.currency ?? n, g = Oe(o), v = o.creditorName ?? o.debtorName ?? void 0, f = kt(o), h = i.get(f) ?? 0;
    i.set(f, h + 1);
    const C = h === 0 ? `${t.identity}:${f}` : `${t.identity}:${f}:${h}`;
    a.push({
      accountId: "",
      // filled in by the caller
      activityType: l < 0 ? "WITHDRAWAL" : "DEPOSIT",
      date: m,
      // Wealthfolio's ActivityImport requires `symbol` even for cash rows; the
      // host clears it during validation for DEPOSIT / WITHDRAWAL. Omitting it
      // fails request deserialisation with a bare 422.
      symbol: "",
      amount: Fe(Math.abs(l)),
      currency: u,
      comment: g.slice(0, 500),
      sourceRecordId: C,
      isValid: !0,
      isDraft: !1,
      metadata: {
        source: "gocardless-uk-banks",
        bankAccount: t.iban ?? t.bankAccountId,
        counterparty: v,
        valueDate: o.valueDate,
        bankTransactionCode: o.bankTransactionCode,
        merchantCategoryCode: o.merchantCategoryCode
      }
    });
  }
  return a;
}
function Ct(e) {
  const { link: t, openingCents: n, firstTransactionDate: a } = e;
  if (n === 0) return null;
  const i = /* @__PURE__ */ new Date(`${a}T00:00:00Z`);
  return i.setUTCDate(i.getUTCDate() - 1), {
    accountId: "",
    activityType: n > 0 ? "DEPOSIT" : "WITHDRAWAL",
    date: i.toISOString().slice(0, 10),
    symbol: "",
    amount: Fe(Math.abs(n)),
    currency: t.currency,
    comment: "Opening balance carried over from bank",
    sourceRecordId: `${t.identity}:opening-balance`,
    isValid: !0,
    isDraft: !1,
    metadata: {
      source: "gocardless-uk-banks",
      kind: "opening-balance",
      bankAccount: t.iban ?? t.bankAccountId
    }
  };
}
function Ae(e) {
  if (e instanceof Error) return e.message;
  if (typeof e == "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}
function Nt(e, t) {
  const n = [];
  let a = new Date(e.getTime());
  for (; a.getTime() <= t.getTime(); ) {
    const i = ee(a, ze - 1), o = i.getTime() > t.getTime() ? t : i;
    n.push({ from: G(a), to: G(o) }), a = ee(o, 1);
  }
  return n;
}
function At(e) {
  const t = [];
  for (const [n, a] of Object.entries(e.errors ?? {})) {
    const i = (a ?? []).join("; ").trim();
    i && t.push(`${n}: ${i}`);
  }
  return t;
}
async function St(e, t) {
  let n = 0, a = 0, i = 0, o = 0;
  const m = /* @__PURE__ */ new Set();
  for (let y = 0; y < t.length; y += ve) {
    const l = t.slice(y, y + ve);
    let u;
    try {
      u = await e.api.activities.checkImport(l);
    } catch (h) {
      const C = Ae(h);
      throw e.api.logger.error(
        `Wealthfolio rejected the import check for ${l.length} row(s): ${C}`
      ), e.api.logger.error(`First row sent: ${JSON.stringify(l[0] ?? null)}`), new Error(`Wealthfolio rejected the import check: ${C}`);
    }
    const g = u.filter((h) => h.isValid !== !1);
    o += u.length - g.length;
    for (const h of u)
      if (h.isValid === !1)
        for (const C of At(h)) m.add(C);
    if (!g.length) continue;
    let v;
    try {
      v = await e.api.activities.import(g);
    } catch (h) {
      const C = Ae(h);
      throw e.api.logger.error(
        `Wealthfolio rejected the import of ${g.length} row(s): ${C}`
      ), e.api.logger.error(`First row sent: ${JSON.stringify(g[0] ?? null)}`), new Error(`Wealthfolio rejected the import: ${C}`);
    }
    const f = v.summary;
    n += f.imported, a += f.duplicates, i += f.skipped;
  }
  for (const y of [...m].slice(0, 20))
    e.api.logger.error(`Import row rejected — ${y}`);
  return { imported: n, duplicates: a, skipped: i, invalid: o, issues: [...m] };
}
async function xt(e, t, n, a, i) {
  const o = {
    connectionId: n.id,
    institutionName: n.institutionName,
    identity: a.identity,
    bankAccountName: a.name,
    fetched: 0,
    imported: 0,
    duplicates: 0,
    skipped: 0
  };
  if (!a.wealthfolioAccountId)
    return { ...o, error: "No Wealthfolio account linked yet" };
  const m = _e(), y = !a.lastSyncAt, l = y ? ee(m, -(Math.max(i.historyDays, 1) - 1)) : ee(ft(a.lastSyncDate ?? G(m)), -7), u = m, g = G(l), v = G(u), f = Nt(l, u), h = tt(n.id, a.identity), C = await nt(e, h, g, v);
  let c, A;
  if (C)
    i.onProgress?.(
      `Reusing bank data saved from the previous attempt for ${n.institutionName} / ${a.name}…`
    ), c = C.transactions, A = C.balance;
  else {
    c = [];
    for (const [k, d] of f.entries()) {
      i.onProgress?.(
        `Fetching ${n.institutionName} / ${a.name}: ${d.from} → ${d.to} (${k + 1}/${f.length})`
      );
      try {
        const T = await t.getTransactions(a.bankAccountId, d.from, d.to);
        c.push(...T.transactions?.booked ?? []);
      } catch (T) {
        if (T instanceof P && T.status === 400 && /period|date|history/i.test(`${T.message} ${T.detail ?? ""}`) && y && k < f.length - 1) {
          e.api.logger.warn(
            `Skipping unavailable history for ${n.institutionName} / ${a.name}: ${d.from} → ${d.to}`
          );
          continue;
        }
        throw T;
      }
    }
    i.onProgress?.(`Reading ${n.institutionName} / ${a.name} balance…`);
    const { balances: w } = await t.getBalances(a.bankAccountId), p = bt(w ?? []);
    if (!p)
      throw new P(
        `${n.institutionName} / ${a.name}: the bank returned no balance`,
        422
      );
    const N = p.balanceAmount.currency;
    if (N && N !== a.currency)
      throw new P(
        `${n.institutionName} / ${a.name}: balance is in ${N} but the account is ${a.currency}`,
        422
      );
    A = p;
  }
  await st(e, {
    key: h,
    identity: a.identity,
    from: g,
    to: v,
    transactions: c,
    balance: A
  });
  const x = vt(c, a, a.currency);
  o.fetched = c.length, a.lastBankBalance = A.balanceAmount.amount;
  let S = null;
  if (y) {
    const w = he(A.balanceAmount.amount), p = x.reduce(
      (d, T) => d + (T.activityType === "WITHDRAWAL" ? -1 : 1) * he(T.amount ?? "0"),
      0
    ), N = w - p, k = c.map((d) => d.bookingDate ?? d.valueDate).filter((d) => !!d).sort()[0];
    S = Ct({
      link: a,
      openingCents: N,
      firstTransactionDate: k ?? G(l)
    }), o.openingBalance = (N / 100).toFixed(2);
  }
  const R = S ? [S, ...x] : x;
  if (R.length) {
    i.onProgress?.(`Importing ${R.length} activities into ${a.name}…`);
    const w = await St(
      e,
      R.map((p) => ({ ...p, accountId: a.wealthfolioAccountId }))
    );
    o.imported = w.imported, o.duplicates = w.duplicates, o.skipped = w.skipped + w.invalid, w.issues.length && (o.importIssues = w.issues.slice(0, 5));
  }
  return await Te(e, h), S && (a.openingBalanceApplied = !0), o;
}
async function Dt(e, t, n, a) {
  const i = (/* @__PURE__ */ new Date()).toISOString(), o = [], m = n.map((l) => ({
    ...l,
    accounts: l.accounts.map((u) => ({ ...u }))
  }));
  for (const l of n) {
    if (a.connectionIds?.length && !a.connectionIds.includes(l.id)) continue;
    const u = m.find((g) => g.id === l.id);
    if (u)
      for (const g of l.accounts) {
        if (a.identities?.length && !a.identities.includes(g.identity)) continue;
        const v = u.accounts.find((f) => f.identity === g.identity);
        if (v)
          try {
            const f = await xt(e, t, u, v, a);
            o.push(f), f.error || (v.lastSyncAt = (/* @__PURE__ */ new Date()).toISOString(), v.lastSyncDate = G(_e()));
          } catch (f) {
            const h = f instanceof Error ? f.message : String(f);
            e.api.logger.error(
              `Sync failed for ${u.institutionName} / ${g.name}: ${h}`
            ), o.push({
              connectionId: u.id,
              institutionName: u.institutionName,
              identity: g.identity,
              bankAccountName: g.name,
              fetched: 0,
              imported: 0,
              duplicates: 0,
              skipped: 0,
              error: h
            });
          }
      }
  }
  const y = {
    startedAt: i,
    finishedAt: (/* @__PURE__ */ new Date()).toISOString(),
    outcomes: o,
    ok: o.length > 0 && o.every((l) => !l.error)
  };
  return { connections: m, result: y };
}
async function It(e, t) {
  return e.api.accounts.create({
    name: t.name,
    accountType: t.creditCard ? "CREDIT_CARD" : "CASH",
    currency: t.currency,
    isDefault: !1,
    isActive: !0,
    trackingMode: "TRANSACTIONS"
  });
}
const Tt = {
  neutral: "secondary",
  success: "success",
  warning: "warning",
  danger: "destructive",
  info: "info"
};
function J({ tone: e, children: t }) {
  return /* @__PURE__ */ s(Me, { variant: Tt[e], children: t });
}
function q({
  label: e,
  hint: t,
  htmlFor: n,
  children: a
}) {
  return /* @__PURE__ */ r("div", { className: "space-y-1.5", children: [
    /* @__PURE__ */ s("label", { htmlFor: n, className: "text-sm font-medium leading-none", children: e }),
    a,
    t ? /* @__PURE__ */ s("p", { className: "text-xs text-muted-foreground", children: t }) : null
  ] });
}
function Y({ label: e, children: t }) {
  return /* @__PURE__ */ r("div", { className: "flex items-start justify-between gap-4 py-1.5 text-sm", children: [
    /* @__PURE__ */ s("span", { className: "text-muted-foreground", children: e }),
    /* @__PURE__ */ s("span", { className: "text-right font-medium", children: t })
  ] });
}
function E({
  tone: e = "neutral",
  title: t,
  children: n
}) {
  return /* @__PURE__ */ r("div", { className: `rounded-lg border p-3 text-sm ${{
    neutral: "border-border bg-muted/40",
    success: "border-border bg-muted/40",
    warning: "border-border bg-muted/40",
    danger: "border-destructive/40 bg-destructive/10",
    info: "border-border bg-muted/30"
  }[e]}`, children: [
    t ? /* @__PURE__ */ s("div", { className: "mb-1 font-medium", children: t }) : null,
    /* @__PURE__ */ s("div", { className: "space-y-1 text-muted-foreground", children: n })
  ] });
}
function $t({ children: e }) {
  return /* @__PURE__ */ s("span", { className: "break-all font-mono text-xs text-muted-foreground", children: e });
}
async function Rt(e) {
  try {
    if (navigator.clipboard?.writeText)
      return await navigator.clipboard.writeText(e), !0;
  } catch {
  }
  try {
    const t = document.createElement("textarea");
    t.value = e, t.setAttribute("readonly", ""), t.style.position = "fixed", t.style.top = "-1000px", t.style.opacity = "0", document.body.appendChild(t), t.select();
    const n = document.execCommand("copy");
    return document.body.removeChild(t), n;
  } catch {
    return !1;
  }
}
function Pe({
  value: e,
  label: t,
  onCopied: n,
  onFailed: a
}) {
  return /* @__PURE__ */ r("div", { className: "space-y-1.5", children: [
    t ? /* @__PURE__ */ s("div", { className: "text-sm font-medium", children: t }) : null,
    /* @__PURE__ */ r("div", { className: "flex items-start gap-2", children: [
      /* @__PURE__ */ s(
        "input",
        {
          readOnly: !0,
          value: e,
          onFocus: (i) => i.currentTarget.select(),
          className: "h-9 w-full min-w-0 rounded-md border bg-muted/40 px-3 font-mono text-xs"
        }
      ),
      /* @__PURE__ */ s(
        D,
        {
          variant: "outline",
          size: "sm",
          className: "shrink-0",
          onClick: async () => {
            await Rt(e) ? n?.() : a?.();
          },
          children: "Copy"
        }
      )
    ] })
  ] });
}
function Bt(e) {
  const t = e.transaction_total_days;
  return [e.bic, t ? `up to ${t} days history` : null].filter(Boolean).join(" · ");
}
function Et({
  ctx: e,
  client: t,
  settings: n,
  connections: a,
  preselectedInstitutionId: i,
  onCreated: o,
  onUpdated: m,
  onCancel: y,
  onDismissMessage: l
}) {
  const [u, g] = I(""), [v, f] = I(i ?? ""), [h, C] = I(null), [c, A] = I(null), x = Q({
    queryKey: ["gocardless-uk", "institutions", "gb"],
    queryFn: () => t.listInstitutions("gb"),
    staleTime: 1440 * 60 * 1e3
  }), S = x.data ?? [], R = xe(() => {
    const d = u.trim().toLowerCase();
    return [...d ? S.filter(
      (O) => O.name.toLowerCase().includes(d) || O.bic?.toLowerCase().includes(d) || O.id.toLowerCase().includes(d)
    ) : S].sort((O, te) => O.name.localeCompare(te.name));
  }, [S, u]), w = S.find((d) => d.id === v) ?? null;
  je(() => {
    !i || S.length === 0 || S.some((d) => d.id === i) && f(i);
  }, [i, S]);
  async function p() {
    if (!w) {
      A("Choose a bank from the GoCardless institution list.");
      return;
    }
    A(null), l();
    try {
      const d = await ht({
        client: t,
        settings: n,
        institution: w,
        carriedAccounts: le(a, w.id)
      });
      C(d), o(d), e.api.toast.info(
        `Consent request created at ${w.name}. Approve it in your browser, then check the status.`
      );
    } catch (d) {
      A(d instanceof Error ? d.message : String(d));
    }
  }
  async function N() {
    if (h) {
      A(null), l();
      try {
        const { connection: d, kind: T } = await Ee({
          client: t,
          connection: h,
          carriedAccounts: le(a, h.institutionId)
        });
        C(d), m(d), e.api.toast[T === "live" ? "success" : T === "pending" ? "info" : "warning"](
          Be(T, d.institutionName)
        );
      } catch (d) {
        const T = d instanceof P ? `${d.message}${d.detail ? ` — ${d.detail}` : ""}` : d instanceof Error ? d.message : String(d);
        A(T);
      }
    }
  }
  const k = h ? ye(h.status) : !1;
  return /* @__PURE__ */ r(K, { children: [
    /* @__PURE__ */ r(j, { children: [
      /* @__PURE__ */ s(M, { children: "Add a bank connection" }),
      /* @__PURE__ */ s(H, { children: "Pick any UK bank GoCardless supports. You can add as many connections as you need — each one gets its own consent and account mapping." })
    ] }),
    /* @__PURE__ */ r(W, { className: "space-y-4", children: [
      x.isPending ? /* @__PURE__ */ s("p", { className: "text-sm text-muted-foreground", children: "Loading UK banks from GoCardless…" }) : null,
      x.error ? /* @__PURE__ */ s(E, { tone: "danger", title: "Could not load the bank list", children: x.error instanceof Error ? x.error.message : String(x.error) }) : null,
      h ? /* @__PURE__ */ r("div", { className: "space-y-1", children: [
        /* @__PURE__ */ s(Y, { label: "Bank", children: h.institutionName }),
        /* @__PURE__ */ s(Y, { label: "Status", children: /* @__PURE__ */ s(J, { tone: k ? "success" : "warning", children: h.status }) }),
        h.expiresAt ? /* @__PURE__ */ s(Y, { label: "Consent valid until", children: new Date(h.expiresAt).toLocaleDateString("en-GB") }) : null
      ] }) : /* @__PURE__ */ r(ie, { children: [
        /* @__PURE__ */ s(
          q,
          {
            label: "Search banks",
            hint: "Names, BICs and GoCardless institution IDs are searchable. The list comes live from GoCardless.",
            children: /* @__PURE__ */ s(
              V,
              {
                value: u,
                placeholder: "e.g. Barclays, HSBC, Monzo",
                onChange: (d) => g(d.target.value)
              }
            )
          }
        ),
        /* @__PURE__ */ s(q, { label: "Bank", children: /* @__PURE__ */ r(
          "select",
          {
            className: "h-9 w-full rounded-md border bg-background px-3 text-sm",
            value: v,
            onChange: (d) => f(d.target.value),
            disabled: x.isPending,
            children: [
              /* @__PURE__ */ s("option", { value: "", children: "Select a bank…" }),
              R.map((d) => /* @__PURE__ */ s("option", { value: d.id, children: d.name }, d.id))
            ]
          }
        ) }),
        w ? /* @__PURE__ */ r("div", { className: "rounded-md border bg-muted/30 p-3 text-sm", children: [
          /* @__PURE__ */ s("div", { className: "font-medium", children: w.name }),
          /* @__PURE__ */ s("div", { className: "text-xs text-muted-foreground", children: Bt(w) })
        ] }) : null
      ] }),
      h?.link ? /* @__PURE__ */ r(ie, { children: [
        /* @__PURE__ */ s(fe, {}),
        /* @__PURE__ */ r("div", { className: "space-y-2", children: [
          /* @__PURE__ */ s(
            Pe,
            {
              label: "Consent link",
              value: h.link,
              onCopied: () => e.api.toast.success("Link copied — paste it into your browser"),
              onFailed: () => e.api.toast.warning("Copy failed — select the link and copy it")
            }
          ),
          /* @__PURE__ */ s("p", { className: "text-xs text-muted-foreground", children: "Add-ons run in a sandbox that cannot open pop-ups. Paste this link into a normal browser window, approve read-only access, then come back and press “Check status”." })
        ] })
      ] }) : null,
      h ? null : /* @__PURE__ */ s(E, { tone: "info", title: "What happens next", children: /* @__PURE__ */ r("ol", { className: "list-decimal space-y-1 pl-4", children: [
        /* @__PURE__ */ s("li", { children: "GoCardless creates a consent request for the bank you chose." }),
        /* @__PURE__ */ s("li", { children: "You approve read-only access in your browser." }),
        /* @__PURE__ */ s("li", { children: "You press “Check status” and map the accounts that were shared." })
      ] }) }),
      c ? /* @__PURE__ */ s(E, { tone: "danger", title: "Connection problem", children: c }) : null,
      /* @__PURE__ */ s("div", { className: "flex flex-wrap gap-2", children: h ? /* @__PURE__ */ r(ie, { children: [
        /* @__PURE__ */ s(D, { variant: "outline", onClick: N, disabled: k, children: k ? "Connected" : "Check status" }),
        /* @__PURE__ */ s(D, { variant: "ghost", onClick: y, children: k ? "Back to connections" : "Cancel" })
      ] }) : /* @__PURE__ */ s(D, { onClick: p, disabled: !w || x.isPending, children: "Create consent request" }) })
    ] })
  ] });
}
const Se = "__create__";
function _t({
  ctx: e,
  connection: t,
  wealthfolioAccounts: n,
  onChange: a,
  onRefreshAccounts: i,
  onSync: o,
  syncing: m,
  historyDays: y,
  onHistoryDaysChange: l
}) {
  const [u, g] = I(null), [v, f] = I(""), [h, C] = I("CASH"), [c, A] = I(!1), x = t.accounts.filter((p) => !p.wealthfolioAccountId), S = t.accounts.some((p) => !p.lastSyncAt);
  function R(p, N) {
    a({
      ...t,
      accounts: t.accounts.map(
        (k) => k.identity === p ? { ...k, ...N } : k
      )
    });
  }
  async function w(p) {
    A(!0);
    try {
      const N = await It(e, {
        name: v.trim() || p.name,
        currency: p.currency,
        creditCard: h === "CREDIT_CARD"
      });
      R(p.identity, { wealthfolioAccountId: N.id }), e.api.toast.success(`Created Wealthfolio account “${N.name}”`), g(null), f(""), i();
    } catch (N) {
      e.api.toast.error(
        `Could not create the account: ${N instanceof Error ? N.message : String(N)}`
      );
    } finally {
      A(!1);
    }
  }
  return /* @__PURE__ */ r(K, { children: [
    /* @__PURE__ */ r(j, { children: [
      /* @__PURE__ */ s(M, { children: "Bank accounts" }),
      /* @__PURE__ */ s(H, { children: "Each bank account imports into one Wealthfolio account. Transactions become deposits and withdrawals, so the Wealthfolio balance follows the bank." })
    ] }),
    /* @__PURE__ */ r(W, { className: "space-y-4", children: [
      t.accounts.length ? null : /* @__PURE__ */ s(E, { tone: "warning", title: "No accounts shared", children: "The bank did not share any accounts. Reconnect and tick the accounts you want to share." }),
      /* @__PURE__ */ s("div", { className: "space-y-3", children: t.accounts.map((p) => {
        const N = n.find(
          (k) => k.id === p.wealthfolioAccountId
        );
        return /* @__PURE__ */ r("div", { className: "rounded-lg border p-4", children: [
          /* @__PURE__ */ r("div", { className: "flex flex-wrap items-start justify-between gap-3", children: [
            /* @__PURE__ */ r("div", { className: "min-w-0", children: [
              /* @__PURE__ */ r("div", { className: "flex items-center gap-2", children: [
                /* @__PURE__ */ s("span", { className: "font-medium", children: p.name }),
                /* @__PURE__ */ s(J, { tone: N ? "success" : "warning", children: N ? "Linked" : "Not linked" })
              ] }),
              /* @__PURE__ */ s("div", { className: "text-xs text-muted-foreground", children: [pt(p.iban), p.currency, p.product].filter(Boolean).join(" · ") })
            ] }),
            /* @__PURE__ */ r("div", { className: "text-right text-sm", children: [
              /* @__PURE__ */ s("div", { className: "text-muted-foreground", children: "Bank balance" }),
              /* @__PURE__ */ s("div", { className: "font-medium", children: mt(p.lastBankBalance, p.currency) })
            ] })
          ] }),
          /* @__PURE__ */ r("div", { className: "mt-3 grid gap-3 sm:grid-cols-2", children: [
            /* @__PURE__ */ s(q, { label: "Wealthfolio account", children: /* @__PURE__ */ r(
              "select",
              {
                className: "h-9 w-full rounded-md border bg-background px-3 text-sm",
                value: p.wealthfolioAccountId ?? "",
                onChange: (k) => {
                  const d = k.target.value;
                  if (d === Se) {
                    g(p.identity), f(p.name), C("CASH");
                    return;
                  }
                  R(p.identity, { wealthfolioAccountId: d || void 0 });
                },
                children: [
                  /* @__PURE__ */ s("option", { value: "", children: "Select an account…" }),
                  n.map((k) => /* @__PURE__ */ r("option", { value: k.id, children: [
                    k.name,
                    " (",
                    k.currency,
                    ")"
                  ] }, k.id)),
                  /* @__PURE__ */ s("option", { value: Se, children: "+ Create a new account…" })
                ]
              }
            ) }),
            /* @__PURE__ */ r("div", { className: "text-sm", children: [
              /* @__PURE__ */ s("div", { className: "text-muted-foreground", children: "Last sync" }),
              /* @__PURE__ */ s("div", { children: p.lastSyncAt ? ue(p.lastSyncAt) : "Never" }),
              /* @__PURE__ */ s("div", { className: "text-xs text-muted-foreground", children: p.openingBalanceApplied ? "Opening balance booked" : "Opening balance booked on first sync" })
            ] })
          ] }),
          u === p.identity ? /* @__PURE__ */ s("div", { className: "mt-3 rounded-md border bg-muted/30 p-3", children: /* @__PURE__ */ r("div", { className: "grid gap-3 sm:grid-cols-3 sm:items-end", children: [
            /* @__PURE__ */ s(q, { label: "Account name", children: /* @__PURE__ */ s(
              V,
              {
                value: v,
                onChange: (k) => f(k.target.value)
              }
            ) }),
            /* @__PURE__ */ s(q, { label: "Type", children: /* @__PURE__ */ r(
              "select",
              {
                className: "h-9 w-full rounded-md border bg-background px-3 text-sm",
                value: h,
                onChange: (k) => C(k.target.value),
                children: [
                  /* @__PURE__ */ s("option", { value: "CASH", children: "Cash" }),
                  /* @__PURE__ */ s("option", { value: "CREDIT_CARD", children: "Credit card" })
                ]
              }
            ) }),
            /* @__PURE__ */ r("div", { className: "flex gap-2", children: [
              /* @__PURE__ */ s(
                D,
                {
                  size: "sm",
                  onClick: () => w(p),
                  disabled: c,
                  children: c ? "Creating…" : "Create"
                }
              ),
              /* @__PURE__ */ s(
                D,
                {
                  size: "sm",
                  variant: "ghost",
                  onClick: () => g(null),
                  children: "Cancel"
                }
              )
            ] })
          ] }) }) : null,
          /* @__PURE__ */ s("div", { className: "mt-3 flex justify-end", children: /* @__PURE__ */ s(
            D,
            {
              size: "sm",
              variant: "outline",
              onClick: () => o(p.identity),
              disabled: m || !p.wealthfolioAccountId,
              children: "Sync this account"
            }
          ) })
        ] }, p.identity);
      }) }),
      /* @__PURE__ */ s(fe, {}),
      /* @__PURE__ */ r("div", { className: "flex flex-wrap items-end justify-between gap-3", children: [
        /* @__PURE__ */ s(
          q,
          {
            label: "History on first sync",
            hint: S ? "Only used for accounts that have never synced. Later syncs fetch new transactions only." : "Applied already; later syncs fetch new transactions only.",
            children: /* @__PURE__ */ r(
              "select",
              {
                className: "h-9 rounded-md border bg-background px-3 text-sm",
                value: y,
                disabled: !S,
                onChange: (p) => l(Number(p.target.value)),
                children: [
                  /* @__PURE__ */ s("option", { value: 30, children: "Last 30 days" }),
                  /* @__PURE__ */ s("option", { value: 90, children: "Last 90 days" }),
                  /* @__PURE__ */ s("option", { value: 365, children: "Last 12 months" }),
                  /* @__PURE__ */ s("option", { value: oe, children: "Last 24 months" })
                ]
              }
            )
          }
        ),
        /* @__PURE__ */ s("div", { className: "flex gap-2", children: /* @__PURE__ */ s(D, { onClick: () => o(), disabled: m || !!x.length, children: m ? "Syncing…" : "Sync all accounts" }) })
      ] }),
      x.length ? /* @__PURE__ */ s(E, { tone: "warning", children: "Link every bank account to a Wealthfolio account before syncing." }) : null,
      y > 90 && S ? /* @__PURE__ */ r(E, { tone: "warning", title: "Long history may be throttled", children: [
        "UK banks allow only a few requests per account per day. A first sync of",
        " ",
        y,
        " days needs ",
        Math.ceil(y / 89),
        " transaction requests plus a balance request per account, which can exceed that limit. Anything already imported is not duplicated, so you can sync again the next day — or start with 90 days."
      ] }) : null
    ] })
  ] });
}
function Ft({
  ctx: e,
  connections: t,
  wealthfolioAccounts: n,
  syncing: a,
  historyDays: i,
  onHistoryDaysChange: o,
  onChange: m,
  onCheckStatus: y,
  onRemove: l,
  onSync: u,
  onAdd: g,
  onRenew: v,
  onRefreshAccounts: f
}) {
  const [h, C] = I(null);
  return /* @__PURE__ */ r("div", { className: "space-y-4", children: [
    t.map((c) => {
      const A = ye(c.status), x = Re(c.status), S = c.expiresAt ? gt(c.expiresAt) : null, R = c.accounts.some((w) => !w.wealthfolioAccountId);
      return /* @__PURE__ */ r(K, { children: [
        /* @__PURE__ */ s(j, { children: /* @__PURE__ */ r("div", { className: "flex flex-wrap items-start justify-between gap-3", children: [
          /* @__PURE__ */ r("div", { children: [
            /* @__PURE__ */ s(M, { children: c.institutionName }),
            /* @__PURE__ */ r(H, { children: [
              c.accounts.length,
              " account",
              c.accounts.length === 1 ? "" : "s",
              " shared · consent created ",
              ue(c.createdAt)
            ] })
          ] }),
          /* @__PURE__ */ s(J, { tone: A ? "success" : x ? "warning" : "danger", children: c.status })
        ] }) }),
        /* @__PURE__ */ r(W, { className: "space-y-4", children: [
          S !== null && S <= 14 ? /* @__PURE__ */ r(E, { tone: "warning", title: "Consent is expiring", children: [
            "Access ends in ",
            Math.max(S, 0),
            " day(s). Choose “New consent for this bank” — your account mapping is carried over automatically."
          ] }) : null,
          A ? null : /* @__PURE__ */ r("div", { className: "space-y-1", children: [
            /* @__PURE__ */ s(Y, { label: "Requisition", children: /* @__PURE__ */ s($t, { children: c.requisitionId }) }),
            c.expiresAt ? /* @__PURE__ */ s(Y, { label: "Consent valid until", children: ue(c.expiresAt) }) : null,
            c.link ? /* @__PURE__ */ s(
              Pe,
              {
                label: "Consent link",
                value: c.link,
                onCopied: () => e.api.toast.success("Link copied — paste it into your browser"),
                onFailed: () => e.api.toast.warning("Copy failed — select the link and copy it")
              }
            ) : null
          ] }),
          A ? /* @__PURE__ */ s(
            _t,
            {
              ctx: e,
              connection: c,
              wealthfolioAccounts: n,
              onChange: m,
              onRefreshAccounts: f,
              onSync: (w) => u(c.id, w),
              syncing: a,
              historyDays: i,
              onHistoryDaysChange: o
            }
          ) : null,
          /* @__PURE__ */ s(fe, {}),
          /* @__PURE__ */ r("div", { className: "flex flex-wrap gap-2", children: [
            A ? null : /* @__PURE__ */ s(D, { size: "sm", variant: "outline", onClick: () => y(c), children: "Check status" }),
            /* @__PURE__ */ s(D, { size: "sm", variant: "outline", onClick: () => v(c), children: R ? "New consent for this bank" : "Renew consent" }),
            /* @__PURE__ */ s(
              D,
              {
                size: "sm",
                variant: "destructive",
                onClick: () => {
                  h === c.id ? (l(c), C(null)) : C(c.id);
                },
                children: h === c.id ? "Confirm disconnect" : "Disconnect bank"
              }
            )
          ] }),
          /* @__PURE__ */ s("p", { className: "text-xs text-muted-foreground", children: "Disconnecting revokes this GoCardless consent only. Imported activities already in Wealthfolio are kept." })
        ] })
      ] }, c.id);
    }),
    /* @__PURE__ */ s(D, { variant: "outline", onClick: g, children: "+ Add another bank connection" })
  ] });
}
function Ot({
  ctx: e,
  settings: t,
  hasCredentials: n,
  onSaved: a
}) {
  const [i, o] = I(""), [m, y] = I(""), [l, u] = I(t.redirectUrl || ce), [g, v] = I(!1), [f, h] = I(null);
  async function C() {
    if (h(null), !i.trim() || !m.trim()) {
      h("Enter both the secret ID and the secret key from the GoCardless portal.");
      return;
    }
    v(!0);
    try {
      await new $e(e).testCredentials(i.trim(), m.trim()), await Xe(e, { secretId: i.trim(), secretKey: m.trim() }), await Ye(e, {
        ...t,
        redirectUrl: l.trim() || ce
      }), y(""), e.api.toast.success("GoCardless credentials saved"), a();
    } catch (c) {
      const A = c instanceof P ? `${c.message}${c.detail ? ` — ${c.detail}` : ""}` : c instanceof Error ? c.message : String(c);
      h(A);
    } finally {
      v(!1);
    }
  }
  return /* @__PURE__ */ r(K, { children: [
    /* @__PURE__ */ r(j, { children: [
      /* @__PURE__ */ s(M, { children: "GoCardless credentials" }),
      /* @__PURE__ */ s(H, { children: "Wealthfolio add-ons cannot hold an Open Banking licence, so UK bank access is brokered by GoCardless Bank Account Data. Create a free account, then paste your user secrets here." })
    ] }),
    /* @__PURE__ */ r(W, { className: "space-y-4", children: [
      /* @__PURE__ */ r("div", { className: "grid gap-4 sm:grid-cols-2", children: [
        /* @__PURE__ */ s(q, { label: "Secret ID", htmlFor: "gc-uk-secret-id", children: /* @__PURE__ */ s(
          V,
          {
            id: "gc-uk-secret-id",
            autoComplete: "off",
            spellCheck: !1,
            value: i,
            placeholder: n ? "•••••••• (saved)" : "secret_id",
            onChange: (c) => o(c.target.value)
          }
        ) }),
        /* @__PURE__ */ s(q, { label: "Secret key", htmlFor: "gc-uk-secret-key", children: /* @__PURE__ */ s(
          V,
          {
            id: "gc-uk-secret-key",
            type: "password",
            autoComplete: "off",
            value: m,
            placeholder: n ? "•••••••• (saved)" : "secret_key",
            onChange: (c) => y(c.target.value)
          }
        ) })
      ] }),
      /* @__PURE__ */ s(
        q,
        {
          label: "Redirect URL",
          htmlFor: "gc-uk-redirect",
          hint: "Must exactly match a redirect URL registered in the GoCardless portal. The page itself does not need to exist — after bank consent the browser lands there with a ?code= parameter that this add-on does not need.",
          children: /* @__PURE__ */ s(
            V,
            {
              id: "gc-uk-redirect",
              value: l,
              spellCheck: !1,
              onChange: (c) => u(c.target.value)
            }
          )
        }
      ),
      f ? /* @__PURE__ */ s(E, { tone: "danger", title: "Could not verify credentials", children: /* @__PURE__ */ s("p", { children: f }) }) : null,
      /* @__PURE__ */ r("div", { className: "flex flex-wrap items-center gap-2", children: [
        /* @__PURE__ */ s(D, { onClick: C, disabled: g, children: g ? "Verifying…" : n ? "Replace credentials" : "Save and verify" }),
        /* @__PURE__ */ s("span", { className: "text-xs text-muted-foreground", children: "Portal: bankaccountdata.gocardless.com/user-secrets/" })
      ] }),
      /* @__PURE__ */ s(E, { tone: "info", title: "One-time setup on GoCardless", children: /* @__PURE__ */ r("ol", { className: "list-decimal space-y-1 pl-4", children: [
        /* @__PURE__ */ r("li", { children: [
          "Sign in at bankaccountdata.gocardless.com and open ",
          /* @__PURE__ */ s("strong", { children: "User Secrets" }),
          "."
        ] }),
        /* @__PURE__ */ s("li", { children: "Create a secret and copy the ID and key shown." }),
        /* @__PURE__ */ s("li", { children: "Add the redirect URL above under the portal's allowed redirect URLs." })
      ] }) })
    ] })
  ] });
}
function Pt({ result: e }) {
  const t = e.outcomes.reduce(
    (n, a) => ({
      fetched: n.fetched + a.fetched,
      imported: n.imported + a.imported,
      duplicates: n.duplicates + a.duplicates,
      skipped: n.skipped + a.skipped
    }),
    { fetched: 0, imported: 0, duplicates: 0, skipped: 0 }
  );
  return /* @__PURE__ */ r(K, { children: [
    /* @__PURE__ */ s(j, { children: /* @__PURE__ */ s(M, { children: "Last sync" }) }),
    /* @__PURE__ */ r(W, { className: "space-y-3", children: [
      /* @__PURE__ */ r("div", { className: "flex flex-wrap items-center gap-3 text-sm", children: [
        /* @__PURE__ */ s(J, { tone: e.ok ? "success" : "danger", children: e.ok ? "Completed" : "Finished with errors" }),
        /* @__PURE__ */ s("span", { className: "text-muted-foreground", children: new Date(e.finishedAt).toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit"
        }) })
      ] }),
      /* @__PURE__ */ s("div", { className: "grid grid-cols-2 gap-3 sm:grid-cols-4", children: [
        ["Fetched", t.fetched],
        ["Imported", t.imported],
        ["Duplicates", t.duplicates],
        ["Skipped", t.skipped]
      ].map(([n, a]) => /* @__PURE__ */ r("div", { className: "rounded-lg border p-3", children: [
        /* @__PURE__ */ s("div", { className: "text-xs text-muted-foreground", children: n }),
        /* @__PURE__ */ s("div", { className: "text-lg font-semibold", children: a })
      ] }, n)) }),
      t.duplicates > 0 ? /* @__PURE__ */ s(E, { tone: "info", children: "Duplicates are transactions this add-on already imported. They are skipped using a stable per-transaction ID, so overlapping sync windows are safe." }) : null,
      t.skipped > 0 ? /* @__PURE__ */ r(E, { tone: "warning", children: [
        t.skipped,
        " row(s) were skipped. Wealthfolio rejected them before import; the reasons from its validator are listed under the affected account."
      ] }) : null,
      /* @__PURE__ */ s("div", { className: "space-y-2", children: e.outcomes.map((n) => /* @__PURE__ */ r(
        "div",
        {
          className: "flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm",
          children: [
            /* @__PURE__ */ r("div", { children: [
              /* @__PURE__ */ s("div", { className: "font-medium", children: n.bankAccountName }),
              /* @__PURE__ */ s("div", { className: "text-xs text-muted-foreground", children: n.institutionName }),
              /* @__PURE__ */ r("div", { className: "text-xs text-muted-foreground", children: [
                n.imported,
                " imported · ",
                n.duplicates,
                " duplicates ·",
                " ",
                n.skipped,
                " skipped",
                n.openingBalance ? ` · opening ${Number(n.openingBalance).toFixed(2)}` : ""
              ] })
            ] }),
            /* @__PURE__ */ s(J, { tone: n.error ? "danger" : "success", children: n.error ? "Failed" : "OK" }),
            n.error ? /* @__PURE__ */ s("div", { className: "w-full text-xs text-destructive", children: n.error }) : null,
            n.importIssues?.length ? /* @__PURE__ */ s("ul", { className: "w-full list-disc space-y-1 pl-4 text-xs text-muted-foreground", children: n.importIssues.map((a) => /* @__PURE__ */ s("li", { children: a }, a)) }) : null
          ]
        },
        `${n.connectionId}:${n.identity}`
      )) })
    ] })
  ] });
}
function Ut({ ctx: e }) {
  const t = Ge(), n = xe(() => new $e(e), [e]), [a, i] = I("overview"), [o, m] = I(), [y, l] = I(He), [u, g] = I(!1), [v, f] = I(null), [h, C] = I(null), c = Q({
    queryKey: ["gocardless-uk", "settings"],
    queryFn: () => Ve(e)
  }), A = Q({
    queryKey: ["gocardless-uk", "credentials"],
    queryFn: () => De(e)
  }), x = Q({
    queryKey: ["gocardless-uk", "connections"],
    queryFn: () => pe(e)
  }), S = Q({
    queryKey: ["gocardless-uk", "wealthfolio-accounts"],
    queryFn: () => e.api.accounts.getAll(),
    staleTime: 3e4
  }), R = c.data, w = x.data ?? [], p = S.data ?? [], N = !!A.data;
  function k() {
    t.invalidateQueries({ queryKey: ["gocardless-uk"] });
  }
  function d() {
    t.invalidateQueries({
      queryKey: ["gocardless-uk", "wealthfolio-accounts"]
    });
  }
  async function T(b) {
    await ge(e, b), t.setQueryData(["gocardless-uk", "connections"], b);
  }
  async function O(b) {
    const $ = await Ce(e, b);
    t.setQueryData(["gocardless-uk", "connections"], $);
  }
  async function te(b) {
    try {
      const { connection: $, kind: B } = await Ee({
        client: n,
        connection: b,
        carriedAccounts: le(w, b.institutionId)
      }), U = await Ce(e, $);
      t.setQueryData(["gocardless-uk", "connections"], U);
      const X = Be(B, $.institutionName);
      e.api.toast[B === "live" ? "success" : B === "pending" ? "info" : "warning"](X), B === "live" && d();
    } catch ($) {
      const B = $ instanceof P ? `${$.message}${$.detail ? ` — ${$.detail}` : ""}` : $ instanceof Error ? $.message : String($);
      e.api.logger.error(`Could not check ${b.institutionName} status: ${B}`), e.api.toast.error(`Could not check status: ${B}`);
    }
  }
  async function Ue(b) {
    try {
      await n.deleteRequisition(b.requisitionId);
    } catch (B) {
      e.api.logger.warn(`Could not revoke the requisition: ${String(B)}`);
    }
    const $ = await Ze(e, b.id);
    t.setQueryData(["gocardless-uk", "connections"], $), e.api.toast.success(`Disconnected from ${b.institutionName}`);
  }
  async function qe() {
    await et(e), t.setQueryData(["gocardless-uk", "credentials"], null), e.api.toast.success("GoCardless credentials removed");
  }
  async function be(b, $) {
    if (w.length) {
      g(!0), f(null), C(null);
      try {
        const { connections: B, result: U } = await Dt(e, n, w, {
          historyDays: y,
          connectionIds: b ? [b] : void 0,
          identities: $ ? [$] : void 0,
          onProgress: f
        });
        await T(B), C(U);
        for (const L of ["activities", "portfolio", "accounts"])
          e.api.query.invalidateQueries(L);
        d();
        const X = U.outcomes.filter((L) => L.error).length;
        if (X)
          e.api.toast.warning(`Sync finished with ${X} account error(s)`);
        else {
          const L = U.outcomes.reduce((se, ae) => se + ae.imported, 0), ke = U.outcomes.reduce((se, ae) => se + ae.skipped, 0);
          ke ? e.api.toast.warning(
            `Imported ${L} activities; ${ke} row(s) were rejected — see Last sync`
          ) : e.api.toast.success(
            L ? `Imported ${L} activities` : "No new transactions"
          );
        }
      } catch (B) {
        const U = B instanceof Error ? B.message : String(B);
        e.api.logger.error(`Sync failed: ${U}`), e.api.toast.error(`Sync failed: ${U}`);
      } finally {
        g(!1), f(null);
      }
    }
  }
  function ne(b) {
    m(b), i("connect");
  }
  if (c.isPending || x.isPending || A.isPending)
    return /* @__PURE__ */ r("div", { className: "mx-auto max-w-5xl space-y-4 p-6", children: [
      /* @__PURE__ */ s(re, { className: "h-9 w-72" }),
      /* @__PURE__ */ s(re, { className: "h-32 w-full" }),
      /* @__PURE__ */ s(re, { className: "h-48 w-full" })
    ] });
  const Le = !R || !N || a === "settings";
  return /* @__PURE__ */ r("div", { className: "mx-auto max-w-5xl space-y-4 p-6", children: [
    /* @__PURE__ */ r("header", { className: "flex flex-wrap items-start justify-between gap-3", children: [
      /* @__PURE__ */ r("div", { children: [
        /* @__PURE__ */ s("h1", { className: "text-2xl font-semibold", children: "GoCardless UK Banks" }),
        /* @__PURE__ */ s("p", { className: "text-sm text-muted-foreground", children: "Read-only Open Banking access to any UK bank GoCardless supports — multiple banks, one add-on." })
      ] }),
      /* @__PURE__ */ r("div", { className: "flex flex-wrap items-center gap-2", children: [
        a === "overview" && w.length ? /* @__PURE__ */ s(D, { size: "sm", onClick: () => {
          be();
        }, disabled: u || !N, children: u ? "Syncing…" : "Sync all banks" }) : null,
        /* @__PURE__ */ s(D, { variant: "outline", size: "sm", onClick: k, children: "Refresh" }),
        a !== "overview" ? /* @__PURE__ */ s(D, { variant: "ghost", size: "sm", onClick: () => i("overview"), children: "Back to connections" }) : /* @__PURE__ */ s(D, { variant: "ghost", size: "sm", onClick: () => i("settings"), children: "Settings" })
      ] })
    ] }),
    Le ? /* @__PURE__ */ r("div", { className: "space-y-4", children: [
      R ? /* @__PURE__ */ s(
        Ot,
        {
          ctx: e,
          settings: R,
          hasCredentials: N,
          onSaved: k
        }
      ) : null,
      N && a === "settings" ? /* @__PURE__ */ r(K, { children: [
        /* @__PURE__ */ r(j, { children: [
          /* @__PURE__ */ s(M, { children: "Sharing one GoCardless account" }),
          /* @__PURE__ */ s(H, { children: "The secret pair and access token are shared by every bank connection. Each bank has its own consent, requisition and account mapping." })
        ] }),
        /* @__PURE__ */ r(W, { className: "space-y-3", children: [
          /* @__PURE__ */ s(D, { onClick: () => ne(), children: "Add a bank connection" }),
          /* @__PURE__ */ s("p", { className: "text-xs text-muted-foreground", children: "You can add more banks from the connections view at any time." })
        ] })
      ] }) : null,
      w.length ? /* @__PURE__ */ r(K, { children: [
        /* @__PURE__ */ r(j, { children: [
          /* @__PURE__ */ s(M, { children: "Existing connections" }),
          /* @__PURE__ */ r(H, { children: [
            w.length,
            " bank consent(s) stored."
          ] })
        ] }),
        /* @__PURE__ */ r(W, { className: "flex flex-wrap gap-2", children: [
          w.map((b) => /* @__PURE__ */ s(
            D,
            {
              variant: "outline",
              size: "sm",
              onClick: () => i("overview"),
              children: b.institutionName
            },
            b.id
          )),
          /* @__PURE__ */ s(D, { variant: "destructive", size: "sm", onClick: () => {
            qe();
          }, children: "Remove GoCardless credentials" })
        ] })
      ] }) : null
    ] }) : a === "connect" ? /* @__PURE__ */ s("div", { className: "space-y-4", children: R ? /* @__PURE__ */ s(
      Et,
      {
        ctx: e,
        client: n,
        settings: R,
        connections: w,
        preselectedInstitutionId: o,
        onCreated: (b) => {
          O(b);
        },
        onUpdated: (b) => {
          O(b);
        },
        onCancel: () => i("overview"),
        onDismissMessage: () => {
        }
      }
    ) : null }) : /* @__PURE__ */ r("div", { className: "space-y-4", children: [
      w.length ? null : /* @__PURE__ */ s(E, { tone: "info", title: "No bank connected yet", children: "Add your first UK bank connection to start importing transactions." }),
      /* @__PURE__ */ s(
        Ft,
        {
          ctx: e,
          connections: w,
          wealthfolioAccounts: p,
          syncing: u,
          historyDays: y,
          onHistoryDaysChange: l,
          onChange: (b) => {
            O(b);
          },
          onCheckStatus: (b) => {
            te(b);
          },
          onRemove: (b) => {
            Ue(b);
          },
          onSync: (b, $) => {
            be(b, $);
          },
          onAdd: () => ne(),
          onRenew: (b) => ne(b.institutionId),
          onRefreshAccounts: d
        }
      ),
      u ? /* @__PURE__ */ s(E, { tone: "info", title: "Syncing", children: v ?? "Starting…" }) : null,
      h ? /* @__PURE__ */ s(Pt, { result: h }) : null,
      /* @__PURE__ */ s(E, { tone: "neutral", title: "How balances reconcile", children: "The first sync of each account books an opening balance so Wealthfolio matches the bank. Later syncs only add new transactions. Transfers between your own accounts import as a withdrawal and a deposit; use Wealthfolio's “Match transfers” to pair them." })
    ] })
  ] });
}
let me;
function qt() {
  const e = me;
  return e ? /* @__PURE__ */ s(Ke, { client: e.api.query.getClient(), children: /* @__PURE__ */ s(Ut, { ctx: e }) }) : /* @__PURE__ */ s("div", { className: "p-6 text-sm text-muted-foreground", children: "The GoCardless UK Banks add-on is still starting. Close and reopen this page." });
}
const Mt = (e) => {
  me = e, e.router.add({
    id: "gocardless-uk-banks",
    path: "/addons/gocardless-uk-banks",
    component: qt
  }), e.onDisable(() => {
    me = void 0;
  });
};
export {
  Mt as default
};
