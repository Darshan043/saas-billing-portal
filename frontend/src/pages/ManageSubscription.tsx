import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthContext';
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  PageHeader,
  Skeleton,
  StatusPill,
} from '../components/ui';
import { ApiError, api } from '../lib/api';
import { formatMoney } from '../lib/money';
import {
  formatRenewalDate,
  intervalLabel,
  type CurrentSubscriptionResponse,
  type SubscriptionView,
} from '../lib/subscriptions';

type NoticeState = { notice?: string };

export function ManageSubscription() {
  const { user } = useAuth();
  const isOwner = user?.organization?.membershipRole === 'OWNER';
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const notice = (location.state as NoticeState | null)?.notice ?? null;
  const [dialog, setDialog] = useState<'pause' | 'cancel' | null>(null);
  const [cancelWhen, setCancelWhen] = useState<'AT_PERIOD_END' | 'IMMEDIATELY'>(
    'AT_PERIOD_END',
  );
  const [actionError, setActionError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['subscription-current'],
    queryFn: () => api<CurrentSubscriptionResponse>('/subscriptions/current'),
  });
  const subscription = query.data?.subscription ?? null;

  function refetch() {
    void queryClient.invalidateQueries({ queryKey: ['subscription-current'] });
  }

  const undoDowngrade = useMutation({
    mutationFn: () =>
      api<{ subscription: SubscriptionView }>(
        '/subscriptions/current/scheduled-change',
        { method: 'DELETE' },
      ),
    onSuccess: refetch,
  });

  const undoCancel = useMutation({
    mutationFn: () =>
      api<{ subscription: SubscriptionView }>(
        '/subscriptions/current/undo-cancel',
        { method: 'POST' },
      ),
    onSuccess: refetch,
  });

  const resume = useMutation({
    mutationFn: () =>
      api<{ subscription: SubscriptionView }>('/subscriptions/current/resume', {
        method: 'POST',
      }),
    onSuccess: refetch,
  });

  const pause = useMutation({
    mutationFn: () =>
      api<{ subscription: SubscriptionView }>('/subscriptions/current/pause', {
        method: 'POST',
      }),
    onSuccess: () => {
      setDialog(null);
      refetch();
    },
  });

  const cancel = useMutation({
    mutationFn: () =>
      api<{ subscription: SubscriptionView }>('/subscriptions/current/cancel', {
        method: 'POST',
        body: JSON.stringify({ when: cancelWhen }),
      }),
    onSuccess: () => {
      setDialog(null);
      refetch();
    },
  });

  const mutationError =
    actionError ??
    (undoDowngrade.error instanceof ApiError
      ? undoDowngrade.error.message
      : null) ??
    (undoCancel.error instanceof ApiError ? undoCancel.error.message : null) ??
    (resume.error instanceof ApiError ? resume.error.message : null);

  const caps = subscription?.capabilities;
  const noneOrCanceled =
    !query.isLoading &&
    !query.isError &&
    (!subscription || subscription.status === 'CANCELED');

  return (
    <main className="page page-wide">
      <PageHeader
        title="Manage Subscription"
        description="Review your active plan, update billing cycles, or pause and cancel access."
        action={
          caps?.canChangePlan && isOwner ? (
            <Link to="/app/subscription/change" style={{ textDecoration: 'none' }}>
              <Button size="sm">Change Plan</Button>
            </Link>
          ) : undefined
        }
      />

      {/* Simulator Mode Alert */}
      <div className="simulator-notice" role="note">
        SIMULATOR MODE — No real credit cards or currency are charged.
      </div>

      {/* Flash Notice message */}
      {notice && (
        <div className="callout-banner callout-banner-success" role="status">
          <span>{notice}</span>
        </div>
      )}

      {/* Loading Skeleton */}
      {query.isLoading && (
        <Card style={{ marginBottom: 'var(--space-6)' }}>
          <Skeleton width="40%" height="1.5rem" />
          <Skeleton width="60%" height="1rem" style={{ margin: '1rem 0 0.5rem' }} />
          <Skeleton width="80%" height="1rem" />
        </Card>
      )}

      {/* Fetch Error */}
      {query.isError && (
        <div className="callout-banner callout-banner-danger" role="alert">
          <span>Could not load your subscription. Please refresh the page.</span>
        </div>
      )}

      {/* Mutation Error */}
      {mutationError && (
        <div className="callout-banner callout-banner-danger" role="alert">
          <span>{mutationError}</span>
        </div>
      )}

      {/* Non-Owner Notice */}
      {!isOwner && subscription && (
        <div className="callout-banner callout-banner-info">
          <span>
            You are viewing this organization as a member. Only the organization owner can modify, pause, or cancel subscriptions.
          </span>
        </div>
      )}

      {/* Empty / Canceled State */}
      {noneOrCanceled && (
        <Card>
          <EmptyState
            icon="📋"
            title="No active subscription"
            description="Your organization does not have an active billing plan. Choose a plan to restore API access."
            action={
              <Link to="/pricing" style={{ textDecoration: 'none' }}>
                <Button>Choose a Plan</Button>
              </Link>
            }
          />
        </Card>
      )}

      {/* Payment Still Processing / Pending Status */}
      {subscription && subscription.status === 'PENDING' && (
        <Card style={{ marginBottom: 'var(--space-6)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <div className="spinner spinner-sm" aria-hidden="true" />
            <div>
              <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Payment is processing</h3>
              <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: 'var(--font-size-sm)' }}>
                Your payment is being confirmed with the simulator.
              </p>
            </div>
          </div>
          <div style={{ marginTop: 'var(--space-4)' }}>
            <Link to="/app/subscription/status">
              <Button variant="secondary" size="sm">
                View Real-Time Status →
              </Button>
            </Link>
          </div>
        </Card>
      )}

      {/* Active Subscription Details Card */}
      {subscription && subscription.status !== 'CANCELED' && (
        <Card style={{ marginBottom: 'var(--space-6)' }}>
          {/* Card Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              borderBottom: '1px solid var(--color-border)',
              paddingBottom: 'var(--space-4)',
              marginBottom: 'var(--space-5)',
              flexWrap: 'wrap',
              gap: 'var(--space-3)',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>
                  {subscription.planName}
                </h2>
                <StatusPill status={subscription.status} />
              </div>
              <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: 'var(--font-size-sm)' }}>
                Billed {intervalLabel(subscription.interval).toLowerCase()} · Renews automatically
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                {formatMoney(subscription.amount, subscription.currency)}
              </div>
              <span className="muted" style={{ fontSize: 'var(--font-size-xs)' }}>
                per {subscription.interval === 'YEAR' ? 'year' : 'month'}
              </span>
            </div>
          </div>

          {/* Details Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(13rem, 1fr))',
              gap: 'var(--space-4)',
              marginBottom: 'var(--space-6)',
            }}
          >
            <div style={{ background: 'var(--color-surface-secondary)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                Monthly Usage Limit
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 700, marginTop: '0.25rem' }}>
                {subscription.usageLimit.toLocaleString()} calls
              </div>
            </div>

            <div style={{ background: 'var(--color-surface-secondary)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                {subscription.status === 'PAUSED' ? 'Paused Since' : 'Current Period Renewal'}
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 700, marginTop: '0.25rem' }}>
                {subscription.status === 'PAUSED'
                  ? formatRenewalDate(subscription.pausedAt)
                  : formatRenewalDate(subscription.currentPeriodEnd)}
              </div>
            </div>

            <div style={{ background: 'var(--color-surface-secondary)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                Payment Method
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 700, marginTop: '0.25rem' }}>
                Simulator Card
              </div>
            </div>
          </div>

          {/* Scheduled Downgrade Banner */}
          {subscription.pendingChange && (
            <div className="callout-banner callout-banner-info">
              <div style={{ flex: 1 }}>
                <strong>Scheduled plan change:</strong> Downgrading to{' '}
                <strong>{subscription.pendingChange.planName}</strong> on{' '}
                {formatRenewalDate(subscription.pendingChange.effectiveAt)}. You retain current plan limits until that date.
              </div>
              {isOwner && caps?.canUndoScheduledChange && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => undoDowngrade.mutate()}
                  disabled={undoDowngrade.isPending}
                >
                  {undoDowngrade.isPending ? 'Saving…' : 'Keep Current Plan'}
                </Button>
              )}
            </div>
          )}

          {/* Cancellation Pending Banner */}
          {subscription.cancelAtPeriodEnd && (
            <div className="callout-banner callout-banner-warning">
              <div style={{ flex: 1 }}>
                <strong>Cancellation scheduled:</strong> Access will end on{' '}
                {formatRenewalDate(subscription.currentPeriodEnd)}. You will not be charged again.
              </div>
              {isOwner && caps?.canUndoCancel && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => undoCancel.mutate()}
                  disabled={undoCancel.isPending}
                >
                  {undoCancel.isPending ? 'Saving…' : 'Keep Subscription'}
                </Button>
              )}
            </div>
          )}

          {/* Paused Explanation */}
          {subscription.status === 'PAUSED' && (
            <div className="callout-banner callout-banner-warning">
              <div style={{ flex: 1 }}>
                <strong>Subscription is currently paused.</strong> API calls are suspended and billing is halted. When resumed, your current billing period is extended by the paused duration.
              </div>
              {isOwner && caps?.canResume && (
                <Button
                  size="sm"
                  onClick={() => resume.mutate()}
                  disabled={resume.isPending}
                >
                  {resume.isPending ? 'Resuming…' : 'Resume Subscription'}
                </Button>
              )}
            </div>
          )}

          {/* Past Due Warning */}
          {subscription.status === 'PAST_DUE' && (
            <div className="callout-banner callout-banner-danger">
              <div style={{ flex: 1 }}>
                <strong>Payment is required:</strong> The previous billing charge could not be settled. Please resolve outstanding payments to modify this subscription.
              </div>
              <Link to="/app/billing/payments">
                <Button variant="danger" size="sm">
                  View Payments
                </Button>
              </Link>
            </div>
          )}

          {/* Action Row */}
          {isOwner && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-3)',
                paddingTop: 'var(--space-4)',
                borderTop: '1px solid var(--color-border)',
                flexWrap: 'wrap',
              }}
            >
              {caps?.canChangePlan && (
                <Link to="/app/subscription/change" style={{ textDecoration: 'none' }}>
                  <Button>Change Plan</Button>
                </Link>
              )}
              {caps?.canPause && (
                <Button
                  variant="secondary"
                  onClick={() => setDialog('pause')}
                >
                  Pause Subscription
                </Button>
              )}
              {(caps?.canCancelNow || caps?.canCancelAtPeriodEnd) && (
                <Button
                  variant="danger"
                  onClick={() => setDialog('cancel')}
                >
                  Cancel Subscription
                </Button>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Pause Confirmation Dialog */}
      {dialog === 'pause' && (
        <ConfirmDialog
          title="Pause subscription"
          confirmLabel="Pause Subscription"
          busyLabel="Pausing…"
          busy={pause.isPending}
          error={pause.error instanceof ApiError ? pause.error.message : null}
          onClose={() => {
            setDialog(null);
            pause.reset();
          }}
          onConfirm={() => pause.mutate()}
        >
          <p style={{ margin: '0 0 var(--space-3)' }}>
            Are you sure you want to pause your subscription?
          </p>
          <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
            <li>API usage is suspended while paused.</li>
            <li>No renewal charges will occur.</li>
            <li>Your current billing period is extended by the paused duration when you resume.</li>
          </ul>
        </ConfirmDialog>
      )}

      {/* Cancel Confirmation Dialog */}
      {dialog === 'cancel' && (
        <ConfirmDialog
          title="Cancel subscription"
          confirmLabel="Confirm Cancellation"
          busyLabel="Canceling…"
          confirmVariant="danger"
          busy={cancel.isPending}
          error={cancel.error instanceof ApiError ? cancel.error.message : null}
          onClose={() => {
            setDialog(null);
            cancel.reset();
            setActionError(null);
          }}
          onConfirm={() => {
            if (cancelWhen === 'AT_PERIOD_END' && !caps?.canCancelAtPeriodEnd) {
              setActionError(
                'Pause or payment issues must be canceled immediately instead',
              );
              return;
            }
            setActionError(null);
            cancel.mutate();
          }}
        >
          <p style={{ margin: '0 0 var(--space-3)' }}>
            Please select when you would like your cancellation to take effect:
          </p>
          <fieldset className="token-fieldset" style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)' }}>
            <label className="radio-row" style={{ marginBottom: 'var(--space-2)' }}>
              <input
                type="radio"
                name="cancel-when"
                checked={cancelWhen === 'AT_PERIOD_END'}
                onChange={() => setCancelWhen('AT_PERIOD_END')}
                disabled={!caps?.canCancelAtPeriodEnd}
              />
              <span>
                <strong>At period end ({formatRenewalDate(subscription?.currentPeriodEnd ?? null)})</strong>
                <div className="muted" style={{ fontSize: 'var(--font-size-xs)' }}>
                  Keep full access until your billing period concludes.
                </div>
              </span>
            </label>
            <label className="radio-row">
              <input
                type="radio"
                name="cancel-when"
                checked={cancelWhen === 'IMMEDIATELY'}
                onChange={() => setCancelWhen('IMMEDIATELY')}
              />
              <span>
                <strong>Immediately</strong>
                <div className="muted" style={{ fontSize: 'var(--font-size-xs)' }}>
                  Access ends immediately. Unused time is not refunded.
                </div>
              </span>
            </label>
          </fieldset>
          {cancelWhen === 'IMMEDIATELY' && (
            <p className="error" style={{ marginTop: 'var(--space-2)', fontSize: 'var(--font-size-sm)' }}>
              Warning: Immediate cancellation terminates your organization’s active API access instantly.
            </p>
          )}
        </ConfirmDialog>
      )}

      <div style={{ marginTop: 'var(--space-4)' }}>
        <button
          type="button"
          className="link-button"
          onClick={() => navigate(-1)}
          style={{ fontSize: 'var(--font-size-sm)' }}
        >
          ← Back to previous page
        </button>
      </div>
    </main>
  );
}
