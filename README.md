# GoCardless UK Banks for Wealthfolio

Import transactions from **any UK bank GoCardless supports** into Wealthfolio as deposits and
withdrawals. You can connect several banks at once, and each bank keeps its own consent,
accounts and Wealthfolio account mapping.

## Why GoCardless?

Wealthfolio add-ons run in a sandbox and cannot hold an Open Banking licence or an eIDAS
certificate, which banks require for direct API access. This add-on goes through
**GoCardless Bank Account Data** (the former Nordigen API), an FCA-authorised AISP that covers
the major UK banks and many smaller ones.

- Read-only: the consent is `details`, `balances`, `transactions`. No payments.
- Free tier is enough for personal use.
- The bank list is fetched live from GoCardless (`institutions/?country=gb`), so new coverage
  appears automatically.
- The add-on never talks to any host except `bankaccountdata.gocardless.com`.

## Install

> **When installing or updating the zip:** Wealthfolio shows a permission dialog before it
> installs. Tick **bankaccountdata.gocardless.com** under **Network hosts** before pressing
> **Approve**. A reinstall resets this approval, and without it every request is rejected
> locally with `HTTP 400` before it reaches GoCardless. You can change it later under
> **Settings → Add-ons → GoCardless UK Banks → View permissions**.

Install `wealthfolio-gocardless-uk-banks-addon-1.1.0.zip` from **Settings → Add-ons → Install from
file**, then open **GoCardless UK Banks** in the sidebar.

## Setup

### 1. Create GoCardless credentials

1. Sign in at <https://bankaccountdata.gocardless.com>.
2. Open **User Secrets** and create a secret. Copy the **secret ID** and **secret key**.
3. In **User Secrets → Callback URL**, register a redirect URL. The default is
   `https://localhost:8443/gocardless-callback`; any reachable URL works because the add-on does
   not read the redirect — you only need the browser to land there after consent.
4. In the add-on, open **Settings**, paste the secret ID and key, adjust the redirect URL if
   yours is different, and press **Save credentials**.

Credentials and the access token are stored in your OS keyring via Wealthfolio's secrets API.
They are never written to add-on storage or shown again.

### 2. Connect your first bank

1. From the connections view, press **+ Add another bank connection** (or **Add a bank
   connection** in Settings).
2. Search the live UK institution list by bank name, BIC or GoCardless institution ID, then
   select the bank and press **Create consent request**.
3. A consent link appears. Add-ons cannot open pop-ups, so copy the link into a normal browser
   window, log in to your bank and approve **read-only** access to details, balances and
   transactions.
4. Return to the add-on and press **Check status**. When the status becomes `LN` (Connected),
   the accounts the bank shared are listed.

You can repeat this for as many banks as you like. Each connection is independent: one bank's
consent expiring or hitting a rate limit does not affect the others.

### 3. Map accounts

For each shared bank account, choose the Wealthfolio account that should receive its activities,
or press **Create new Wealthfolio account** to make a cash account with the right currency.
Mapping is remembered by IBAN (or the bank's account ID if no IBAN is given), so renewing a
consent does not lose your mapping or sync history.

### 4. Sync

Press **Sync all banks** at the top, or the **Sync** button on an individual account. The first
sync of an account pulls 90 days by default (change it in **Settings → History on first sync**)
and books an opening balance so Wealthfolio matches the bank balance. Later syncs only add new
transactions, with a 7-day overlap to catch late-booked items.

Transfers between your own accounts import as a withdrawal from one and a deposit into the other;
use Wealthfolio's **Match transfers** to pair them.

### Automatic sync on open

Open **Settings → Automatic sync** and choose **Off**, **Every 6 hours**, **Every 12 hours**,
**Once a day** or **Every 2 days**. The default is **Off**.

When enabled, the add-on checks its schedule each time you open the **GoCardless UK Banks** page.
If the oldest successful sync across your mapped accounts is older than the chosen interval, it
runs one sync automatically and shows the result in the **Automatic sync on open** panel.

Notes:

- Nothing runs while Wealthfolio is closed, and only one sync runs at a time.
- A newly added or never-synced bank makes the set due immediately.
- If an automatic attempt fails, the next automatic attempt waits the same interval. Use the
  manual **Sync all banks** button if you need to retry sooner.
- Connections that are not `LN`, or accounts that have not been mapped to a Wealthfolio account,
  are skipped.
- Frequencies are deliberately conservative because UK banks limit GoCardless reads per account
  per day.

## Renewing and disconnecting

- Bank consents expire (usually after 90 days). The connection card warns when yours is close.
  Press **Renew consent** and approve the new link; mapping carries over automatically.
- **Disconnect bank** revokes that GoCardless requisition and removes it from the add-on.
  Activities already imported into Wealthfolio are not deleted.
- **Remove GoCardless credentials** clears the shared secret pair and token. You will need to
  re-enter them before syncing again.

## Troubleshooting

### Every request fails immediately with HTTP 400

Wealthfolio rejected the brokered request because `bankaccountdata.gocardless.com` is not an
approved network host. Reinstalling or updating the zip resets the approval. Re-tick the host
under **Settings → Add-ons → GoCardless UK Banks → View permissions → Network hosts**, save and
retry. The add-on raises a specific error with these instructions in the toast and log.

### `ASPSP_RATE_LIMIT_EXCEEDED` / HTTP 429

Banks limit how often GoCardless can read an account — NatWest, for example, allows only a few
requests per account per day. Wait until the daily reset (midnight UTC), then retry once. Avoid
pressing **Sync** repeatedly. If an import failed after the bank data was fetched, the add-on
caches that data for 12 hours and reuses it on the next attempt, so no extra bank call is spent.

### "The bank returned no balance"

Some banks do not share a balance with GoCardless even when transactions are available. The
add-on refuses to guess an opening balance. Wait until the bank publishes a balance, or choose a
different bank/institution in the list.

### A bank is missing from the list

The list comes from GoCardless and only contains institutions available in Great Britain. If a
bank is genuinely supported but missing, check the GoCardless portal; the add-on has no static
list to update.

## Development

```bash
export PATH="$HOME/.local/node/bin:$PATH"
pnpm type-check
pnpm bundle
```

The bundle is written to `dist/wealthfolio-gocardless-uk-banks-addon-<version>.zip`.

## Licence

MIT
