import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import type { AddonContext, AddonEnableFunction } from '@wealthfolio/addon-sdk';
import { GocardlessUkBanksPage } from './pages/GocardlessUkBanksPage';

// The host owns a single React root per addon and mounts the route `component`
// itself with no access to the addon context. Capture it at enable time so the
// route wrapper can hand it down. Do not call createRoot yourself.
let addonCtx: AddonContext | undefined;

function GocardlessUkBanksRoute() {
  const ctx = addonCtx;
  if (!ctx) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        The GoCardless UK Banks add-on is still starting. Close and reopen this page.
      </div>
    );
  }

  return (
    <QueryClientProvider client={ctx.api.query.getClient() as QueryClient}>
      <GocardlessUkBanksPage ctx={ctx} />
    </QueryClientProvider>
  );
}

const enable: AddonEnableFunction = (ctx) => {
  addonCtx = ctx;

  // The route id and path must match `contributes.routes[].id` in manifest.json.
  ctx.router.add({
    id: 'gocardless-uk-banks',
    path: '/addons/gocardless-uk-banks',
    component: GocardlessUkBanksRoute,
  });

  ctx.onDisable(() => {
    addonCtx = undefined;
  });
};

export default enable;
