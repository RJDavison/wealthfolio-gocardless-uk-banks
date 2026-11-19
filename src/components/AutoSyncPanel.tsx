import type { AddonSettings, AutoSyncHours } from '../types';
import { AUTO_SYNC_OPTIONS } from '../lib/constants';
import { formatDateTime } from '../lib/format';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@wealthfolio/ui';
import { Callout, Field } from './primitives';

export function AutoSyncPanel({
  settings,
  onChange,
}: {
  settings: AddonSettings;
  onChange: (hours: AutoSyncHours) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Automatic sync</CardTitle>
        <CardDescription>
          Choose how often Wealthfolio should sync when you open this add-on. Nothing runs while
          the app is closed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Field
          label="Frequency"
          htmlFor="gc-uk-auto-sync"
          hint="Uses the oldest successful account sync, so a newly added or never-synced bank is included. Failed attempts are retried only after the same interval."
        >
          <select
            id="gc-uk-auto-sync"
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            value={settings.autoSyncHours}
            onChange={(event) =>
              onChange(Number(event.target.value) as AutoSyncHours)
            }
          >
            {AUTO_SYNC_OPTIONS.map((option) => (
              <option key={option.hours} value={option.hours}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>

        {settings.lastAutoSyncAttemptAt ? (
          <p className="text-xs text-muted-foreground">
            Last automatic attempt: {formatDateTime(settings.lastAutoSyncAttemptAt)}
          </p>
        ) : null}

        <Callout tone="neutral" title="Why not more often?">
          UK banks allow only a few GoCardless reads per account per day. Manual sync is always
          available from the connections page if you need an immediate refresh.
        </Callout>
      </CardContent>
    </Card>
  );
}
