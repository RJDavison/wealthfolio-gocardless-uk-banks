import { useState } from 'react';
import type { Account, AddonContext } from '@wealthfolio/addon-sdk';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Separator,
} from '@wealthfolio/ui';
import { MAX_HISTORY_DAYS } from '../lib/constants';
import { formatDate, formatMoney, maskIban } from '../lib/format';
import { createWealthfolioAccount } from '../lib/sync';
import type { BankAccountLink, ConnectionState } from '../types';
import { Callout, Field, StatusPill } from './primitives';

const CREATE_VALUE = '__create__';

export function AccountsPanel({
  ctx,
  connection,
  wealthfolioAccounts,
  onChange,
  onRefreshAccounts,
  onSync,
  syncing,
  historyDays,
  onHistoryDaysChange,
}: {
  ctx: AddonContext;
  connection: ConnectionState;
  wealthfolioAccounts: Account[];
  onChange: (connection: ConnectionState) => void;
  onRefreshAccounts: () => void;
  onSync: (identity?: string) => void;
  syncing: boolean;
  historyDays: number;
  onHistoryDaysChange: (days: number) => void;
}) {
  const [creatingFor, setCreatingFor] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<'CASH' | 'CREDIT_CARD'>('CASH');
  const [creating, setCreating] = useState(false);

  const needsMapping = connection.accounts.filter((link) => !link.wealthfolioAccountId);
  const neverSynced = connection.accounts.some((link) => !link.lastSyncAt);

  function updateLink(identity: string, patch: Partial<BankAccountLink>) {
    onChange({
      ...connection,
      accounts: connection.accounts.map((link) =>
        link.identity === identity ? { ...link, ...patch } : link,
      ),
    });
  }

  async function handleCreate(link: BankAccountLink) {
    setCreating(true);
    try {
      const account = await createWealthfolioAccount(ctx, {
        name: newName.trim() || link.name,
        currency: link.currency,
        creditCard: newType === 'CREDIT_CARD',
      });
      updateLink(link.identity, { wealthfolioAccountId: account.id });
      ctx.api.toast.success(`Created Wealthfolio account “${account.name}”`);
      setCreatingFor(null);
      setNewName('');
      onRefreshAccounts();
    } catch (error) {
      ctx.api.toast.error(
        `Could not create the account: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bank accounts</CardTitle>
        <CardDescription>
          Each bank account imports into one Wealthfolio account. Transactions become
          deposits and withdrawals, so the Wealthfolio balance follows the bank.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!connection.accounts.length ? (
          <Callout tone="warning" title="No accounts shared">
            The bank did not share any accounts. Reconnect and tick the accounts you want to
            share.
          </Callout>
        ) : null}

        <div className="space-y-3">
          {connection.accounts.map((link) => {
            const mapped = wealthfolioAccounts.find(
              (account) => account.id === link.wealthfolioAccountId,
            );
            return (
              <div key={link.identity} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{link.name}</span>
                      <StatusPill tone={mapped ? 'success' : 'warning'}>
                        {mapped ? 'Linked' : 'Not linked'}
                      </StatusPill>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {[maskIban(link.iban), link.currency, link.product]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </div>
                  <div className="text-right text-sm">
                    <div className="text-muted-foreground">Bank balance</div>
                    <div className="font-medium">
                      {formatMoney(link.lastBankBalance, link.currency)}
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field label="Wealthfolio account">
                    <select
                      className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                      value={link.wealthfolioAccountId ?? ''}
                      onChange={(event) => {
                        const value = event.target.value;
                        if (value === CREATE_VALUE) {
                          setCreatingFor(link.identity);
                          setNewName(link.name);
                          setNewType('CASH');
                          return;
                        }
                        updateLink(link.identity, { wealthfolioAccountId: value || undefined });
                      }}
                    >
                      <option value="">Select an account…</option>
                      {wealthfolioAccounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name} ({account.currency})
                        </option>
                      ))}
                      <option value={CREATE_VALUE}>+ Create a new account…</option>
                    </select>
                  </Field>

                  <div className="text-sm">
                    <div className="text-muted-foreground">Last sync</div>
                    <div>{link.lastSyncAt ? formatDate(link.lastSyncAt) : 'Never'}</div>
                    <div className="text-xs text-muted-foreground">
                      {link.openingBalanceApplied
                        ? 'Opening balance booked'
                        : 'Opening balance booked on first sync'}
                    </div>
                  </div>
                </div>

                {creatingFor === link.identity ? (
                  <div className="mt-3 rounded-md border bg-muted/30 p-3">
                    <div className="grid gap-3 sm:grid-cols-3 sm:items-end">
                      <Field label="Account name">
                        <Input
                          value={newName}
                          onChange={(event) => setNewName(event.target.value)}
                        />
                      </Field>
                      <Field label="Type">
                        <select
                          className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                          value={newType}
                          onChange={(event) =>
                            setNewType(event.target.value as 'CASH' | 'CREDIT_CARD')
                          }
                        >
                          <option value="CASH">Cash</option>
                          <option value="CREDIT_CARD">Credit card</option>
                        </select>
                      </Field>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleCreate(link)}
                          disabled={creating}
                        >
                          {creating ? 'Creating…' : 'Create'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setCreatingFor(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="mt-3 flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onSync(link.identity)}
                    disabled={syncing || !link.wealthfolioAccountId}
                  >
                    Sync this account
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <Separator />

        <div className="flex flex-wrap items-end justify-between gap-3">
          <Field
            label="History on first sync"
            hint={
              neverSynced
                ? 'Only used for accounts that have never synced. Later syncs fetch new transactions only.'
                : 'Applied already; later syncs fetch new transactions only.'
            }
          >
            <select
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={historyDays}
              disabled={!neverSynced}
              onChange={(event) => onHistoryDaysChange(Number(event.target.value))}
            >
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
              <option value={365}>Last 12 months</option>
              <option value={MAX_HISTORY_DAYS}>Last 24 months</option>
            </select>
          </Field>

          <div className="flex gap-2">
            <Button onClick={() => onSync()} disabled={syncing || !!needsMapping.length}>
              {syncing ? 'Syncing…' : 'Sync all accounts'}
            </Button>
          </div>
        </div>

        {needsMapping.length ? (
          <Callout tone="warning">
            Link every bank account to a Wealthfolio account before syncing.
          </Callout>
        ) : null}

        {historyDays > 90 && neverSynced ? (
          <Callout tone="warning" title="Long history may be throttled">
            UK banks allow only a few requests per account per day. A first sync of{' '}
            {historyDays} days needs {Math.ceil(historyDays / 89)} transaction requests plus a
            balance request per account, which can exceed that limit. Anything already imported
            is not duplicated, so you can sync again the next day — or start with 90 days.
          </Callout>
        ) : null}
      </CardContent>
    </Card>
  );
}
