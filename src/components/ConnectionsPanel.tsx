import { useState } from 'react';
import type { Account, AddonContext } from '@wealthfolio/addon-sdk';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Separator,
} from '@wealthfolio/ui';
import { daysUntil, formatDate } from '../lib/format';
import { isRequisitionLive, isRequisitionPending } from '../lib/gocardless';
import type { ConnectionState } from '../types';
import { AccountsPanel } from './AccountsPanel';
import { Callout, CopyField, InfoRow, Mono, StatusPill } from './primitives';

export function ConnectionsPanel({
  ctx,
  connections,
  wealthfolioAccounts,
  syncing,
  historyDays,
  onHistoryDaysChange,
  onChange,
  onCheckStatus,
  onRemove,
  onSync,
  onAdd,
  onRenew,
  onRefreshAccounts,
}: {
  ctx: AddonContext;
  connections: ConnectionState[];
  wealthfolioAccounts: Account[];
  syncing: boolean;
  historyDays: number;
  onHistoryDaysChange: (days: number) => void;
  onChange: (connection: ConnectionState) => void;
  onCheckStatus: (connection: ConnectionState) => void;
  onRemove: (connection: ConnectionState) => void;
  onSync: (connectionId: string, identity?: string) => void;
  onAdd: () => void;
  onRenew: (connection: ConnectionState) => void;
  onRefreshAccounts: () => void;
}) {
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {connections.map((connection) => {
        const live = isRequisitionLive(connection.status);
        const pending = isRequisitionPending(connection.status);
        const expiryDays = connection.expiresAt ? daysUntil(connection.expiresAt) : null;
        const needsMapping = connection.accounts.some((link) => !link.wealthfolioAccountId);

        return (
          <Card key={connection.id}>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>{connection.institutionName}</CardTitle>
                  <CardDescription>
                    {connection.accounts.length} account{connection.accounts.length === 1 ? '' : 's'} shared
                    · consent created {formatDate(connection.createdAt)}
                  </CardDescription>
                </div>
                <StatusPill tone={live ? 'success' : pending ? 'warning' : 'danger'}>
                  {connection.status}
                </StatusPill>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {expiryDays !== null && expiryDays <= 14 ? (
                <Callout tone="warning" title="Consent is expiring">
                  Access ends in {Math.max(expiryDays, 0)} day(s). Choose “New consent for this
                  bank” — your account mapping is carried over automatically.
                </Callout>
              ) : null}

              {!live ? (
                <div className="space-y-1">
                  <InfoRow label="Requisition">
                    <Mono>{connection.requisitionId}</Mono>
                  </InfoRow>
                  {connection.expiresAt ? (
                    <InfoRow label="Consent valid until">
                      {formatDate(connection.expiresAt)}
                    </InfoRow>
                  ) : null}
                  {connection.link ? (
                    <CopyField
                      label="Consent link"
                      value={connection.link}
                      onCopied={() =>
                        ctx.api.toast.success('Link copied — paste it into your browser')
                      }
                      onFailed={() =>
                        ctx.api.toast.warning('Copy failed — select the link and copy it')
                      }
                    />
                  ) : null}
                </div>
              ) : null}

              {live ? (
                <AccountsPanel
                  ctx={ctx}
                  connection={connection}
                  wealthfolioAccounts={wealthfolioAccounts}
                  onChange={onChange}
                  onRefreshAccounts={onRefreshAccounts}
                  onSync={(identity) => onSync(connection.id, identity)}
                  syncing={syncing}
                  historyDays={historyDays}
                  onHistoryDaysChange={onHistoryDaysChange}
                />
              ) : null}

              <Separator />

              <div className="flex flex-wrap gap-2">
                {!live ? (
                  <Button size="sm" variant="outline" onClick={() => onCheckStatus(connection)}>
                    Check status
                  </Button>
                ) : null}
                <Button size="sm" variant="outline" onClick={() => onRenew(connection)}>
                  {needsMapping ? 'New consent for this bank' : 'Renew consent'}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    if (confirmRemove === connection.id) {
                      onRemove(connection);
                      setConfirmRemove(null);
                    } else {
                      setConfirmRemove(connection.id);
                    }
                  }}
                >
                  {confirmRemove === connection.id ? 'Confirm disconnect' : 'Disconnect bank'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Disconnecting revokes this GoCardless consent only. Imported activities already in
                Wealthfolio are kept.
              </p>
            </CardContent>
          </Card>
        );
      })}

      <Button variant="outline" onClick={onAdd}>
        + Add another bank connection
      </Button>
    </div>
  );
}
