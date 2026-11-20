import { useEffect, useId, type ReactNode } from 'react';

export type ConfirmVariant = 'primary' | 'danger';

export interface ConfirmDialogProps {
  /** Dialog heading. */
  title: string;
  /** Body content — explanatory text, radio groups, warnings, etc. */
  children: ReactNode;
  /** Label for the confirm / submit button in its idle state. */
  confirmLabel: string;
  /** Label shown while the action is in-flight. Defaults to 'Working…'. */
  busyLabel?: string;
  /** Whether the action is currently executing (disables both buttons). */
  busy: boolean;
  /** Server-side error message to display inside the dialog, or null. */
  error: string | null;
  /** Called when the user confirms the action. */
  onConfirm: () => void;
  /** Called when the user dismisses (Back button, backdrop click, Escape). */
  onClose: () => void;
  /**
   * Visual style of the confirm button.
   * - 'primary' (default) — blue CTA, used for neutral actions (pause, change plan, …)
   * - 'danger' — red CTA, reserved for destructive actions (cancel subscription, …)
   */
  confirmVariant?: ConfirmVariant;
}

/**
 * Reusable modal confirmation dialog.
 *
 * Preserves the exact markup and behaviour of the original inline dialog in
 * ManageSubscription.tsx — modal-backdrop, modal, action-row — so all existing
 * CSS continues to apply without modification.
 *
 * Escape key and backdrop-click both invoke onClose.
 */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  busyLabel = 'Working…',
  busy,
  error,
  onConfirm,
  onClose,
  confirmVariant = 'primary',
}: ConfirmDialogProps) {
  const titleId = useId();

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const confirmClass =
    confirmVariant === 'danger' ? 'btn btn-danger' : 'primary-button';

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId}>{title}</h2>
        {children}
        {error !== null && <p className="error">{error}</p>}
        <div className="action-row">
          <button type="button" onClick={onClose} disabled={busy}>
            Back
          </button>
          <button
            type="button"
            className={confirmClass}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
