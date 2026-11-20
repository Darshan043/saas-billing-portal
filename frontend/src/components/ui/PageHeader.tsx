import type { ReactNode } from 'react';

export interface PageHeaderProps {
  /** Page title rendered as an h1. */
  title: string;
  /** Optional subtitle rendered below the title. */
  description?: string;
  /** Optional action slot (e.g. a primary Button) placed at the top-right. */
  action?: ReactNode;
  className?: string;
}

/**
 * Consistent page-level header with title, optional description,
 * and an optional right-aligned action slot.
 *
 * Uses `.page-header-title` (not the global h1 style) so each page can
 * adopt the new typography incrementally without affecting other elements.
 */
export function PageHeader({
  title,
  description,
  action,
  className = '',
}: PageHeaderProps) {
  return (
    <div className={['page-header', className].filter(Boolean).join(' ')}>
      <div className="page-header-top">
        <h1 className="page-header-title">{title}</h1>
        {action !== undefined && (
          <div className="page-header-action">{action}</div>
        )}
      </div>
      {description !== undefined && (
        <p className="page-header-desc">{description}</p>
      )}
    </div>
  );
}
