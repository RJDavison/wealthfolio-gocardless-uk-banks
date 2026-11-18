import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AddonContext } from '@wealthfolio/addon-sdk';
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
import {
  carryOverAccounts,
  createBankConnection,
  describeCheck,
  refreshBankConnection,
} from '../lib/connect';
import { GoCardlessClient, GoCardlessError, isRequisitionLive } from '../lib/gocardless';
import type {
  AddonSettings,
  ConnectionState,
  GoCardlessInstitution,
} from '../types';
import { Callout, CopyField, Field, InfoRow, StatusPill } from './primitives';

function institutionLine(institution: GoCardlessInstitution): string {
  const days = institution.transaction_total_days;
  return [institution.bic, days ? `up to ${days} days history` : null]
    .filter(Boolean)
    .join(' · ');
}

export function ConnectPanel({
  ctx,
  client,
  settings,
  connections,
  preselectedInstitutionId,
  onCreated,
  onUpdated,
  onCancel,
  onDismissMessage,
}: {
  ctx: AddonContext;
  client: GoCardlessClient;
  settings: AddonSettings;
  connections: ConnectionState[];
  preselectedInstitutionId?: string;
  onCreated: (connection: ConnectionState) => void;
  onUpdated: (connection: ConnectionState) => void;
  onCancel: () => void;
  onDismissMessage: () => void;
}) {
  const [search, setSearch] = useState('');
  const [institutionId, setInstitutionId] = useState(preselectedInstitutionId ?? '');
  const [draft, setDraft] = useState<ConnectionState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const institutionsQuery = useQuery({
    queryKey: ['gocardless-uk', 'institutions', 'gb'],
    queryFn: () => client.listInstitutions('gb'),
    staleTime: 24 * 60 * 60 * 1000,
  });

  const institutions = institutionsQuery.data ?? [];
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = term
      ? institutions.filter(
          (institution) =>
            institution.name.toLowerCase().includes(term) ||
            institution.bic?.toLowerCase().includes(term) ||
            institution.id.toLowerCase().includes(term),
        )
      : institutions;
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [institutions, search]);

  const selected = institutions.find((institution) => institution.id === institutionId) ?? null;

  useEffect(() => {
    if (!preselectedInstitutionId || institutions.length === 0) return;
    if (institutions.some((institution) => institution.id === preselectedInstitutionId)) {
      setInstitutionId(preselectedInstitutionId);
    }
  }, [preselectedInstitutionId, institutions]);

  async function startConnection() {
    if (!selected) {
      setError('Choose a bank from the GoCardless institution list.');
      return;
    }
    setError(null);
    onDismissMessage();
    try {
      const next = await createBankConnection({
        client,
        settings,
        institution: selected,
        carriedAccounts: carryOverAccounts(connections, selected.id),
      });
      setDraft(next);
      onCreated(next);
      ctx.api.toast.info(
        `Consent request created at ${selected.name}. Approve it in your browser, then check the status.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function checkStatus() {
    if (!draft) return;
    setError(null);
    onDismissMessage();
    try {
      const { connection: next, kind } = await refreshBankConnection({
        client,
        connection: draft,
        carriedAccounts: carryOverAccounts(connections, draft.institutionId),
      });
      setDraft(next);
      onUpdated(next);
      ctx.api.toast[kind === 'live' ? 'success' : kind === 'pending' ? 'info' : 'warning'](
        describeCheck(kind, next.institutionName),
      );
    } catch (err) {
      const text =
        err instanceof GoCardlessError
          ? `${err.message}${err.detail ? ` — ${err.detail}` : ''}`
          : err instanceof Error
            ? err.message
            : String(err);
      setError(text);
    }
  }

  const linked = draft ? isRequisitionLive(draft.status) : false;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add a bank connection</CardTitle>
        <CardDescription>
          Pick any UK bank GoCardless supports. You can add as many connections as you need —
          each one gets its own consent and account mapping.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {institutionsQuery.isPending ? (
          <p className="text-sm text-muted-foreground">Loading UK banks from GoCardless…</p>
        ) : null}
        {institutionsQuery.error ? (
          <Callout tone="danger" title="Could not load the bank list">
            {institutionsQuery.error instanceof Error
              ? institutionsQuery.error.message
              : String(institutionsQuery.error)}
          </Callout>
        ) : null}

        {!draft ? (
          <>
            <Field
              label="Search banks"
              hint="Names, BICs and GoCardless institution IDs are searchable. The list comes live from GoCardless."
            >
              <Input
                value={search}
                placeholder="e.g. Barclays, HSBC, Monzo"
                onChange={(event) => setSearch(event.target.value)}
              />
            </Field>

            <Field label="Bank">
              <select
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={institutionId}
                onChange={(event) => setInstitutionId(event.target.value)}
                disabled={institutionsQuery.isPending}
              >
                <option value="">Select a bank…</option>
                {filtered.map((institution) => (
                  <option key={institution.id} value={institution.id}>
                    {institution.name}
                  </option>
                ))}
              </select>
            </Field>

            {selected ? (
              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                <div className="font-medium">{selected.name}</div>
                <div className="text-xs text-muted-foreground">{institutionLine(selected)}</div>
              </div>
            ) : null}
          </>
        ) : (
          <div className="space-y-1">
            <InfoRow label="Bank">{draft.institutionName}</InfoRow>
            <InfoRow label="Status">
              <StatusPill tone={linked ? 'success' : 'warning'}>{draft.status}</StatusPill>
            </InfoRow>
            {draft.expiresAt ? (
              <InfoRow label="Consent valid until">
                {new Date(draft.expiresAt).toLocaleDateString('en-GB')}
              </InfoRow>
            ) : null}
          </div>
        )}

        {draft?.link ? (
          <>
            <Separator />
            <div className="space-y-2">
              <CopyField
                label="Consent link"
                value={draft.link}
                onCopied={() => ctx.api.toast.success('Link copied — paste it into your browser')}
                onFailed={() => ctx.api.toast.warning('Copy failed — select the link and copy it')}
              />
              <p className="text-xs text-muted-foreground">
                Add-ons run in a sandbox that cannot open pop-ups. Paste this link into a normal
                browser window, approve read-only access, then come back and press “Check status”.
              </p>
            </div>
          </>
        ) : null}

        {!draft ? (
          <Callout tone="info" title="What happens next">
            <ol className="list-decimal space-y-1 pl-4">
              <li>GoCardless creates a consent request for the bank you chose.</li>
              <li>You approve read-only access in your browser.</li>
              <li>You press “Check status” and map the accounts that were shared.</li>
            </ol>
          </Callout>
        ) : null}

        {error ? (
          <Callout tone="danger" title="Connection problem">
            {error}
          </Callout>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {!draft ? (
            <Button onClick={startConnection} disabled={!selected || institutionsQuery.isPending}>
              Create consent request
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={checkStatus} disabled={linked}>
                {linked ? 'Connected' : 'Check status'}
              </Button>
              <Button variant="ghost" onClick={onCancel}>
                {linked ? 'Back to connections' : 'Cancel'}
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
