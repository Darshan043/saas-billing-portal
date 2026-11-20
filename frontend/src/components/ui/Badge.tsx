import type { CSSProperties, ReactNode } from 'react';

export type BadgeVariant = 'success' | 'warning' | 'danger' | 'neutral' | 'info';

export interface BadgeProps {
  variant: BadgeVariant;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function Badge({ variant, children, className = '', style }: BadgeProps) {
  const classes = [`badge badge-${variant}`, className].filter(Boolean).join(' ');
  return (
    <span className={classes} style={style}>
      {children}
    </span>
  );
}

/** Maps a raw status string to a BadgeVariant. */
function statusToVariant(status: string): BadgeVariant {
  const lower = status.toLowerCase();
  if (['active', 'paid', 'succeeded', 'ok'].includes(lower)) return 'success';
  if (['pending', 'open', 'processing'].includes(lower)) return 'warning';
  if (['canceled', 'failed', 'down', 'declined'].includes(lower)) return 'danger';
  return 'neutral'; // paused, past_due, void, inactive, …
}

export interface StatusPillProps {
  /** Raw status value, e.g. "ACTIVE", "past_due". */
  status: string;
  /** Optional display label override. */
  label?: string;
  className?: string;
}

/**
 * Renders a colour-coded badge for a subscription / payment / invoice status.
 * Falls back to a human-readable label derived from the status string.
 */
export function StatusPill({ status, label, className = '' }: StatusPillProps) {
  const variant = statusToVariant(status);
  const displayLabel =
    label ??
    status
      .toLowerCase()
      .replace(/_/g, ' ')
      .replace(/^\w/, (c) => c.toUpperCase());

  return (
    <Badge variant={variant} className={className}>
      {displayLabel}
    </Badge>
  );
}
