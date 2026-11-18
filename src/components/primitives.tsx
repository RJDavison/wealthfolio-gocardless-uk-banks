import type { ReactNode } from 'react';
import { Badge, Button } from '@wealthfolio/ui';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const TONE_VARIANT: Record<Tone, 'secondary' | 'success' | 'warning' | 'destructive' | 'info'> = {
  neutral: 'secondary',
  success: 'success',
  warning: 'warning',
  danger: 'destructive',
  info: 'info',
};

export function StatusPill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <Badge variant={TONE_VARIANT[tone]}>{children}</Badge>;
}

export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium leading-none">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}

export function Callout({
  tone = 'neutral',
  title,
  children,
}: {
  tone?: Tone;
  title?: string;
  children: ReactNode;
}) {
  const styles: Record<Tone, string> = {
    neutral: 'border-border bg-muted/40',
    success: 'border-border bg-muted/40',
    warning: 'border-border bg-muted/40',
    danger: 'border-destructive/40 bg-destructive/10',
    info: 'border-border bg-muted/30',
  };
  return (
    <div className={`rounded-lg border p-3 text-sm ${styles[tone]}`}>
      {title ? <div className="mb-1 font-medium">{title}</div> : null}
      <div className="space-y-1 text-muted-foreground">{children}</div>
    </div>
  );
}

export function KeyValueGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">{children}</div>;
}

export function Mono({ children }: { children: ReactNode }) {
  return (
    <span className="break-all font-mono text-xs text-muted-foreground">{children}</span>
  );
}

/**
 * The add-on iframe is cross-origin sandboxed, so `navigator.clipboard` can be
 * unavailable. Fall back to a hidden textarea and `execCommand`, which works in
 * opaque origins.
 */
export async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Fall through to the legacy path.
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-1000px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    return copied;
  } catch {
    return false;
  }
}

/** A read-only value with a copy button, for URLs that must be pasted manually. */
export function CopyField({
  value,
  label,
  onCopied,
  onFailed,
}: {
  value: string;
  label?: string;
  onCopied?: () => void;
  onFailed?: () => void;
}) {
  return (
    <div className="space-y-1.5">
      {label ? <div className="text-sm font-medium">{label}</div> : null}
      <div className="flex items-start gap-2">
        <input
          readOnly
          value={value}
          onFocus={(event) => event.currentTarget.select()}
          className="h-9 w-full min-w-0 rounded-md border bg-muted/40 px-3 font-mono text-xs"
        />
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={async () => {
            const ok = await copyText(value);
            if (ok) onCopied?.();
            else onFailed?.();
          }}
        >
          Copy
        </Button>
      </div>
    </div>
  );
}
