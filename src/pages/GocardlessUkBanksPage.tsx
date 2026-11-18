import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AddonContext } from '@wealthfolio/addon-sdk';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
} from '@wealthfolio/ui';
import { DEFAULT_SYNC_DAYS } from '../lib/constants';
import {
  carryOverAccounts,
  describeCheck,
  refreshBankConnection,
} from '../lib/connect';
import { GoCardlessClient, GoCardlessError } from '../lib/gocardless';
import {
  clearCredentials,
  loadConnections,
  loadCredentials,
  loadSettings,
  removeConnection,
  saveConnections,
  saveSettings,
  upsertConnection,
} from '../lib/store';
import { runSync } from '../lib/sync';
import type { AddonSettings, ConnectionState, SyncRunResult } from '../types';
import { ConnectPanel } from '../components/ConnectPanel';
import { ConnectionsPanel } from '../components/ConnectionsPanel';
import { CredentialsPanel } from '../components/CredentialsPanel';
import { SyncResults } from '../components/SyncResults';
import { Callout } from '../components/primitives';

type View = 'overview' | 'settings' | 'connect';

export function GocardlessUkBanksPage({ ctx }: { ctx: AddonContext }) {
  const queryClient = useQueryClient();
  const client = useMemo(() => new GoCardlessClient(ctx), [ctx]);

  const [view, setView] = useState<View>('overview');
  const [preselectedInstitutionId, setPreselectedInstitutionId] = useState<string | undefined>();
  const [historyDays, setHistoryDays] = useState(DEFAULT_SYNC_DAYS);
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [lastRun, setLastRun] = useState<SyncRunResult | null>(null);

  const settingsQuery = useQuery({
    queryKey: ['gocardless-uk', 'settings'],
    queryFn: () => loadSettings(ctx),
  });
  const credentialsQuery = useQuery({
    queryKey: ['gocardless-uk', 'credentials'],
    queryFn: () => loadCredentials(ctx),
  });
  const connectionsQuery = useQuery({
    queryKey: ['gocardless-uk', 'connections'],
    queryFn: () => loadConnections(ctx),
  });
  const accountsQuery = useQuery({
    queryKey: ['gocardless-uk', 'wealthfolio-accounts'],
    queryFn: () => ctx.api.accounts.getAll(),
    staleTime: 30_000,
  });

  const settings = settingsQuery.data;
  const connections = connectionsQuery.data ?? [];
  const wealthfolioAccounts = accountsQuery.data ?? [];
  const hasCredentials = Boolean(credentialsQuery.data);

  function refreshAll() {
    void queryClient.invalidateQueries({ queryKey: ['gocardless-uk'] });
  }

  function refreshWealthfolioAccounts() {
    void queryClient.invalidateQueries({
      queryKey: ['gocardless-uk', 'wealthfolio-accounts'],
    });
  }

  async function persistSettings(next: AddonSettings) {
    await saveSettings(ctx, next);
    queryClient.setQueryData(['gocardless-uk', 'settings'], next);
  }

  async function persistConnections(next: ConnectionState[]) {
    await saveConnections(ctx, next);
    queryClient.setQueryData(['gocardless-uk', 'connections'], next);
  }

  async function handleCreated(connection: ConnectionState) {
    const next = await upsertConnection(ctx, connection);
    queryClient.setQueryData(['gocardless-uk', 'connections'], next);
  }

  async function handleCheckStatus(connection: ConnectionState) {
    try {
      const { connection: next, kind } = await refreshBankConnection({
        client,
        connection,
        carriedAccounts: carryOverAccounts(connections, connection.institutionId),
      });
      const updated = await upsertConnection(ctx, next);
      queryClient.setQueryData(['gocardless-uk', 'connections'], updated);
      const text = describeCheck(kind, next.institutionName);
      ctx.api.toast[kind === 'live' ? 'success' : kind === 'pending' ? 'info' : 'warning'](text);
      if (kind === 'live') refreshWealthfolioAccounts();
    } catch (error) {
      const message =
        error instanceof GoCardlessError
          ? `${error.message}${error.detail ? ` — ${error.detail}` : ''}`
          : error instanceof Error
            ? error.message
            : String(error);
      ctx.api.logger.error(`Could not check ${connection.institutionName} status: ${message}`);
      ctx.api.toast.error(`Could not check status: ${message}`);
    }
  }

  async function handleRemove(connection: ConnectionState) {
    try {
      await client.deleteRequisition(connection.requisitionId);
    } catch (error) {
      ctx.api.logger.warn(`Could not revoke the requisition: ${String(error)}`);
    }
    const next = await removeConnection(ctx, connection.id);
    queryClient.setQueryData(['gocardless-uk', 'connections'], next);
    ctx.api.toast.success(`Disconnected from ${connection.institutionName}`);
  }

  async function handleRemoveCredentials() {
    await clearCredentials(ctx);
    queryClient.setQueryData(['gocardless-uk', 'credentials'], null);
    ctx.api.toast.success('GoCardless credentials removed');
  }

  async function handleSync(connectionId?: string, identity?: string) {
    if (!connections.length) return;
    setSyncing(true);
    setProgress(null);
    setLastRun(null);
    try {
      const { connections: next, result } = await runSync(ctx, client, connections, {
        historyDays,
        connectionIds: connectionId ? [connectionId] : undefined,
        identities: identity ? [identity] : undefined,
        onProgress: setProgress,
      });
      await persistConnections(next);
      setLastRun(result);
      for (const key of ['activities', 'portfolio', 'accounts']) {
        ctx.api.query.invalidateQueries(key);
      }
      refreshWealthfolioAccounts();

      const failed = result.outcomes.filter((outcome) => outcome.error).length;
      if (failed) {
        ctx.api.toast.warning(`Sync finished with ${failed} account error(s)`);
      } else {
        const imported = result.outcomes.reduce((total, outcome) => total + outcome.imported, 0);
        const skipped = result.outcomes.reduce((total, outcome) => total + outcome.skipped, 0);
        if (skipped) {
          ctx.api.toast.warning(
            `Imported ${imported} activities; ${skipped} row(s) were rejected — see Last sync`,
          );
        } else {
          ctx.api.toast.success(
            imported ? `Imported ${imported} activities` : 'No new transactions',
          );
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.api.logger.error(`Sync failed: ${message}`);
      ctx.api.toast.error(`Sync failed: ${message}`);
    } finally {
      setSyncing(false);
      setProgress(null);
    }
  }

  function openConnect(institutionId?: string) {
    setPreselectedInstitutionId(institutionId);
    setView('connect');
  }

  if (settingsQuery.isPending || connectionsQuery.isPending || credentialsQuery.isPending) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-6">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const showSetup = !settings || !hasCredentials || view === 'settings';

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">GoCardless UK Banks</h1>
          <p className="text-sm text-muted-foreground">
            Read-only Open Banking access to any UK bank GoCardless supports — multiple banks,
            one add-on.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {view === 'overview' && connections.length ? (
            <Button size="sm" onClick={() => void handleSync()} disabled={syncing || !hasCredentials}>
              {syncing ? 'Syncing…' : 'Sync all banks'}
            </Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={refreshAll}>
            Refresh
          </Button>
          {view !== 'overview' ? (
            <Button variant="ghost" size="sm" onClick={() => setView('overview')}>
              Back to connections
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setView('settings')}>
              Settings
            </Button>
          )}
        </div>
      </header>

      {showSetup ? (
        <div className="space-y-4">
          {settings ? (
            <CredentialsPanel
              ctx={ctx}
              settings={settings}
              hasCredentials={hasCredentials}
              onSaved={refreshAll}
            />
          ) : null}

          {hasCredentials && view === 'settings' ? (
            <Card>
              <CardHeader>
                <CardTitle>Sharing one GoCardless account</CardTitle>
                <CardDescription>
                  The secret pair and access token are shared by every bank connection. Each bank
                  has its own consent, requisition and account mapping.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button onClick={() => openConnect()}>Add a bank connection</Button>
                <p className="text-xs text-muted-foreground">
                  You can add more banks from the connections view at any time.
                </p>
              </CardContent>
            </Card>
          ) : null}

          {connections.length ? (
            <Card>
              <CardHeader>
                <CardTitle>Existing connections</CardTitle>
                <CardDescription>{connections.length} bank consent(s) stored.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {connections.map((connection) => (
                  <Button
                    key={connection.id}
                    variant="outline"
                    size="sm"
                    onClick={() => setView('overview')}
                  >
                    {connection.institutionName}
                  </Button>
                ))}
                <Button variant="destructive" size="sm" onClick={() => void handleRemoveCredentials()}>
                  Remove GoCardless credentials
                </Button>
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : view === 'connect' ? (
        <div className="space-y-4">
          {settings ? (
            <ConnectPanel
              ctx={ctx}
              client={client}
              settings={settings}
              connections={connections}
              preselectedInstitutionId={preselectedInstitutionId}
              onCreated={(connection) => void handleCreated(connection)}
              onUpdated={(connection) => void handleCreated(connection)}
              onCancel={() => setView('overview')}
              onDismissMessage={() => undefined}
            />
          ) : null}
        </div>
      ) : (
        <div className="space-y-4">
          {!connections.length ? (
            <Callout tone="info" title="No bank connected yet">
              Add your first UK bank connection to start importing transactions.
            </Callout>
          ) : null}

          <ConnectionsPanel
            ctx={ctx}
            connections={connections}
            wealthfolioAccounts={wealthfolioAccounts}
            syncing={syncing}
            historyDays={historyDays}
            onHistoryDaysChange={setHistoryDays}
            onChange={(connection) => void handleCreated(connection)}
            onCheckStatus={(connection) => void handleCheckStatus(connection)}
            onRemove={(connection) => void handleRemove(connection)}
            onSync={(connectionId, identity) => void handleSync(connectionId, identity)}
            onAdd={() => openConnect()}
            onRenew={(connection) => openConnect(connection.institutionId)}
            onRefreshAccounts={refreshWealthfolioAccounts}
          />

          {syncing ? (
            <Callout tone="info" title="Syncing">
              {progress ?? 'Starting…'}
            </Callout>
          ) : null}

          {lastRun ? <SyncResults result={lastRun} /> : null}

          <Callout tone="neutral" title="How balances reconcile">
            The first sync of each account books an opening balance so Wealthfolio matches the bank.
            Later syncs only add new transactions. Transfers between your own accounts import as a
            withdrawal and a deposit; use Wealthfolio&apos;s “Match transfers” to pair them.
          </Callout>
        </div>
      )}
    </div>
  );
}
