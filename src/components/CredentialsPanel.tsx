import { useState } from 'react';
import type { AddonContext } from '@wealthfolio/addon-sdk';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from '@wealthfolio/ui';
import { DEFAULT_REDIRECT_URL } from '../lib/constants';
import { saveCredentials, saveSettings } from '../lib/store';
import { GoCardlessClient, GoCardlessError } from '../lib/gocardless';
import type { AddonSettings } from '../types';
import { Callout, Field } from './primitives';

export function CredentialsPanel({
  ctx,
  settings,
  hasCredentials,
  onSaved,
}: {
  ctx: AddonContext;
  settings: AddonSettings;
  hasCredentials: boolean;
  onSaved: () => void;
}) {
  const [secretId, setSecretId] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [redirectUrl, setRedirectUrl] = useState(settings.redirectUrl || DEFAULT_REDIRECT_URL);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setError(null);
    if (!secretId.trim() || !secretKey.trim()) {
      setError('Enter both the secret ID and the secret key from the GoCardless portal.');
      return;
    }
    setBusy(true);
    try {
      const client = new GoCardlessClient(ctx);
      await client.testCredentials(secretId.trim(), secretKey.trim());
      await saveCredentials(ctx, { secretId: secretId.trim(), secretKey: secretKey.trim() });
      await saveSettings(ctx, {
        ...settings,
        redirectUrl: redirectUrl.trim() || DEFAULT_REDIRECT_URL,
      });
      setSecretKey('');
      ctx.api.toast.success('GoCardless credentials saved');
      onSaved();
    } catch (err) {
      const message =
        err instanceof GoCardlessError
          ? `${err.message}${err.detail ? ` — ${err.detail}` : ''}`
          : err instanceof Error
            ? err.message
            : String(err);
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>GoCardless credentials</CardTitle>
        <CardDescription>
          Wealthfolio add-ons cannot hold an Open Banking licence, so UK bank access is
          brokered by GoCardless Bank Account Data. Create a free account, then paste your
          user secrets here.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Secret ID" htmlFor="gc-uk-secret-id">
            <Input
              id="gc-uk-secret-id"
              autoComplete="off"
              spellCheck={false}
              value={secretId}
              placeholder={hasCredentials ? '•••••••• (saved)' : 'secret_id'}
              onChange={(event) => setSecretId(event.target.value)}
            />
          </Field>
          <Field label="Secret key" htmlFor="gc-uk-secret-key">
            <Input
              id="gc-uk-secret-key"
              type="password"
              autoComplete="off"
              value={secretKey}
              placeholder={hasCredentials ? '•••••••• (saved)' : 'secret_key'}
              onChange={(event) => setSecretKey(event.target.value)}
            />
          </Field>
        </div>

        <Field
          label="Redirect URL"
          htmlFor="gc-uk-redirect"
          hint="Must exactly match a redirect URL registered in the GoCardless portal. The page itself does not need to exist — after bank consent the browser lands there with a ?code= parameter that this add-on does not need."
        >
          <Input
            id="gc-uk-redirect"
            value={redirectUrl}
            spellCheck={false}
            onChange={(event) => setRedirectUrl(event.target.value)}
          />
        </Field>

        {error ? (
          <Callout tone="danger" title="Could not verify credentials">
            <p>{error}</p>
          </Callout>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={handleSave} disabled={busy}>
            {busy ? 'Verifying…' : hasCredentials ? 'Replace credentials' : 'Save and verify'}
          </Button>
          <span className="text-xs text-muted-foreground">
            Portal: bankaccountdata.gocardless.com/user-secrets/
          </span>
        </div>

        <Callout tone="info" title="One-time setup on GoCardless">
          <ol className="list-decimal space-y-1 pl-4">
            <li>
              Sign in at bankaccountdata.gocardless.com and open <strong>User Secrets</strong>.
            </li>
            <li>Create a secret and copy the ID and key shown.</li>
            <li>
              Add the redirect URL above under the portal&apos;s allowed redirect URLs.
            </li>
          </ol>
        </Callout>
      </CardContent>
    </Card>
  );
}
