import type { ReactNode } from 'react';

export interface EmptyStateProps {
  /** Short heading, e.g. "No invoices yet". */
  title: string;
  /** Optional supporting sentence below the title. */
  description?: string;
  /** Optional action area (e.g. a Button or Link). */
  action?: ReactNode;
  /** Optional emoji or icon element rendered above the title. */
  icon?: ReactNode;
  className?: string;
}

/**
 * Centred empty-state block used when a list or table has no items.
 */
export function EmptyState({
  title,
  description,
  action,
  icon,
  className = '',
}: EmptyStateProps) {
  return (
    <div className={['empty-state', className].filter(Boolean).join(' ')}>
      {icon !== undefined && <div className="empty-state-icon">{icon}</div>}
      <p className="empty-state-title">{title}</p>
      {description !== undefined && (
        <p className="empty-state-desc">{description}</p>
      )}
      {action !== undefined && (
        <div className="empty-state-action">{action}</div>
      )}
    </div>
  );
}
