import { Card, CardContent, CardHeader, CardTitle } from '@wealthfolio/ui';
import type { SyncRunResult } from '../types';
import { Callout, StatusPill } from './primitives';

export function SyncResults({ result }: { result: SyncRunResult }) {
  const totals = result.outcomes.reduce(
    (accumulator, outcome) => ({
      fetched: accumulator.fetched + outcome.fetched,
      imported: accumulator.imported + outcome.imported,
      duplicates: accumulator.duplicates + outcome.duplicates,
      skipped: accumulator.skipped + outcome.skipped,
    }),
    { fetched: 0, imported: 0, duplicates: 0, skipped: 0 },
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Last sync</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <StatusPill tone={result.ok ? 'success' : 'danger'}>
            {result.ok ? 'Completed' : 'Finished with errors'}
          </StatusPill>
          <span className="text-muted-foreground">
            {new Date(result.finishedAt).toLocaleTimeString('en-GB', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Fetched', totals.fetched],
            ['Imported', totals.imported],
            ['Duplicates', totals.duplicates],
            ['Skipped', totals.skipped],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">{label}</div>
              <div className="text-lg font-semibold">{value}</div>
            </div>
          ))}
        </div>

        {totals.duplicates > 0 ? (
          <Callout tone="info">
            Duplicates are transactions this add-on already imported. They are skipped using a
            stable per-transaction ID, so overlapping sync windows are safe.
          </Callout>
        ) : null}

        {totals.skipped > 0 ? (
          <Callout tone="warning">
            {totals.skipped} row(s) were skipped. Wealthfolio rejected them before import; the
            reasons from its validator are listed under the affected account.
          </Callout>
        ) : null}

        <div className="space-y-2">
          {result.outcomes.map((outcome) => (
            <div
              key={`${outcome.connectionId}:${outcome.identity}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
            >
              <div>
                <div className="font-medium">{outcome.bankAccountName}</div>
                <div className="text-xs text-muted-foreground">{outcome.institutionName}</div>
                <div className="text-xs text-muted-foreground">
                  {outcome.imported} imported · {outcome.duplicates} duplicates ·{' '}
                  {outcome.skipped} skipped
                  {outcome.openingBalance
                    ? ` · opening ${Number(outcome.openingBalance).toFixed(2)}`
                    : ''}
                </div>
              </div>
              <StatusPill tone={outcome.error ? 'danger' : 'success'}>
                {outcome.error ? 'Failed' : 'OK'}
              </StatusPill>
              {outcome.error ? (
                <div className="w-full text-xs text-destructive">{outcome.error}</div>
              ) : null}
              {outcome.importIssues?.length ? (
                <ul className="w-full list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                  {outcome.importIssues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
