import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  PageHeader,
  Skeleton,
} from '../components/ui';
import { ApiError, api } from '../lib/api';
import { formatMoney } from '../lib/money';
import { priceFor, type PlanPrice, type PublicPlan } from '../lib/plans';
import {
  formatRenewalDate,
  intervalLabel,
  type ChangePreview,
  type CurrentSubscriptionResponse,
  type SubscriptionView,
} from '../lib/subscriptions';

type PlansResponse = { plans: PublicPlan[] };

export function ChangePlan() {
  const navigate = useNavigate();
  const [selectedPriceId, setSelectedPriceId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const currentQuery = useQuery({
    queryKey: ['subscription-current'],
    queryFn: () => api<CurrentSubscriptionResponse>('/subscriptions/current'),
  });
  const plansQuery = useQuery({
    queryKey: ['public-plans'],
    queryFn: () => api<PlansResponse>('/plans'),
  });

  const subscription = currentQuery.data?.subscription ?? null;
  const interval = subscription?.interval ?? 'MONTH';

  const sameIntervalPlans = useMemo(() => {
    return (plansQuery.data?.plans ?? [])
      .map((plan) => {
        const price = priceFor(plan, interval);
        return price ? { plan, price } : null;
      })
      .filter((row): row is { plan: PublicPlan; price: PlanPrice } => row !== null);
  }, [plansQuery.data?.plans, interval]);

  const previewQuery = useQuery({
    queryKey: ['change-preview', selectedPriceId],
    enabled: Boolean(selectedPriceId),
    queryFn: () =>
      api<ChangePreview>(
        `/subscriptions/current/change-preview?planPriceId=${selectedPriceId}`,
      ),
  });

  const change = useMutation({
    mutationFn: (planPriceId: string) =>
      api<{
        kind: 'UPGRADE' | 'DOWNGRADE';
        chargeAmount?: number;
        currency?: string;
        effectiveAt?: string;
        subscription: SubscriptionView;
      }>('/subscriptions/current/change-plan', {
        method: 'POST',
        body: JSON.stringify({ planPriceId }),
      }),
    onSuccess: (result) => {
      const name = result.subscription.planName;
      const notice =
        result.kind === 'UPGRADE'
          ? `Upgraded to ${name}. Charged ${formatMoney(
              result.chargeAmount ?? 0,
              result.currency ?? result.subscription.currency,
            )}.`
          : `Downgrade scheduled for ${formatRenewalDate(
              result.effectiveAt ?? null,
            )}.`;
      navigate('/app/subscription', { state: { notice } });
    },
  });

  const preview = previewQuery.data;
  const previewError =
    previewQuery.error instanceof ApiError ? previewQuery.error.message : null;
  const changeError =
    change.error instanceof ApiError ? change.error.message : null;

  return (
    <main className="page page-wide">
      <PageHeader
        title="Change Subscription Plan"
        description={`Switch your plan for the ${intervalLabel(interval).toLowerCase()} billing cycle. Upgrades take effect immediately with prorated charges; downgrades take effect at period end.`}
        action={
          <Link to="/app/subscription" style={{ textDecoration: 'none' }}>
            <Button variant="secondary" size="sm">
              ← Back to Subscription
            </Button>
          </Link>
        }
      />

      <div className="simulator-notice" role="note" style={{ marginBottom: 'var(--space-6)' }}>
        SIMULATOR MODE — Prorated charges and scheduled changes operate in test mode.
      </div>

      {(currentQuery.isLoading || plansQuery.isLoading) && (
        <div className="pricing-grid">
          {[1, 2, 3].map((n) => (
            <Card key={n}>
              <Skeleton width="50%" height="1.5rem" />
              <Skeleton width="40%" height="2rem" style={{ margin: '1rem 0' }} />
              <Skeleton width="70%" height="1rem" />
            </Card>
          ))}
        </div>
      )}

      {currentQuery.isError && (
        <div className="callout-banner callout-banner-danger" role="alert">
          <span>Could not load your active subscription. Please refresh.</span>
        </div>
      )}

      {/* Plan Cards Grid */}
      <div className="pricing-grid">
        {sameIntervalPlans.map(({ plan, price }) => {
          const isCurrent = subscription?.planPriceId === price.id;
          const isSelected = selectedPriceId === price.id;
          const kind =
            isCurrent || !subscription
              ? null
              : price.amount > subscription.amount
                ? 'Upgrade'
                : price.amount < subscription.amount
                  ? 'Downgrade'
                  : null;

          return (
            <article
              key={plan.id}
              className={`pricing-card ${isSelected ? 'featured' : ''}`}
            >
              <div className="pricing-card-header">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h2 className="pricing-card-title">{plan.name}</h2>
                  {isCurrent && <Badge variant="info">Current Plan</Badge>}
                  {kind && (
                    <Badge variant={kind === 'Upgrade' ? 'success' : 'warning'}>
                      {kind}
                    </Badge>
                  )}
                </div>
                <p className="pricing-card-desc">{plan.description}</p>
              </div>

              <div className="pricing-card-price">
                <span className="pricing-card-amount">
                  {formatMoney(price.amount, price.currency)}
                </span>
                <span className="pricing-card-period">
                  {interval === 'YEAR' ? ' / year' : ' / month'}
                </span>
              </div>

              <div
                style={{
                  padding: 'var(--space-2) var(--space-3)',
                  background: 'var(--color-surface-secondary)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--font-size-xs)',
                  fontWeight: 600,
                  marginBottom: 'var(--space-4)',
                }}
              >
                ⚡ {plan.usageLimit.toLocaleString()} monthly API calls
              </div>

              <div className="pricing-card-cta">
                {isCurrent ? (
                  <Button disabled style={{ width: '100%' }}>
                    Active Plan
                  </Button>
                ) : (
                  <Button
                    variant={isSelected ? 'primary' : 'secondary'}
                    style={{ width: '100%' }}
                    onClick={() => setSelectedPriceId(price.id)}
                  >
                    {isSelected ? '✓ Selected' : `Select ${plan.name}`}
                  </Button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {/* Proration & Change Preview Panel */}
      {selectedPriceId && (
        <Card style={{ marginTop: 'var(--space-6)' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 var(--space-4)' }}>
            Plan Change Summary & Estimate
          </h2>

          {previewQuery.isLoading && (
            <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
              <Skeleton width="60%" height="1.25rem" />
              <Skeleton width="40%" height="1rem" />
            </div>
          )}

          {previewError && (
            <div className="callout-banner callout-banner-danger">
              <span>{previewError}</span>
            </div>
          )}

          {preview && (
            <div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))',
                  gap: 'var(--space-4)',
                  padding: 'var(--space-4)',
                  background: 'var(--color-surface-secondary)',
                  borderRadius: 'var(--radius-md)',
                  marginBottom: 'var(--space-4)',
                }}
              >
                <div>
                  <div className="muted" style={{ fontSize: 'var(--font-size-xs)', textTransform: 'uppercase', fontWeight: 600 }}>
                    Plan Transition
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)', marginTop: '0.2rem' }}>
                    {preview.current.planName} → {preview.target.planName}
                  </div>
                </div>

                <div>
                  <div className="muted" style={{ fontSize: 'var(--font-size-xs)', textTransform: 'uppercase', fontWeight: 600 }}>
                    Usage Quota Transition
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)', marginTop: '0.2rem' }}>
                    {preview.current.usageLimit.toLocaleString()} → {preview.target.usageLimit.toLocaleString()} calls/mo
                  </div>
                </div>

                <div>
                  <div className="muted" style={{ fontSize: 'var(--font-size-xs)', textTransform: 'uppercase', fontWeight: 600 }}>
                    Effective Timing
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)', marginTop: '0.2rem' }}>
                    {preview.kind === 'UPGRADE'
                      ? 'Immediate'
                      : `End of cycle (${formatRenewalDate(preview.effectiveAt)})`}
                  </div>
                </div>
              </div>

              {preview.kind === 'UPGRADE' && preview.proration && (
                <div className="callout-banner callout-banner-info">
                  <div>
                    <strong>Prorated charge today: </strong>
                    {formatMoney(
                      preview.proration.chargeAmount,
                      preview.proration.currency,
                    )}{' '}
                    (calculated for {preview.proration.remainingDays} days remaining in current billing period). Your new quota applies immediately.
                  </div>
                </div>
              )}

              {preview.kind === 'DOWNGRADE' && (
                <div className="callout-banner callout-banner-warning">
                  <div>
                    <strong>Scheduled change: </strong>
                    Takes effect on {formatRenewalDate(preview.effectiveAt)}. You retain current limits until that date. No charges today.
                  </div>
                </div>
              )}

              {changeError && (
                <div className="callout-banner callout-banner-danger" style={{ marginTop: 'var(--space-3)' }}>
                  <span>{changeError}</span>
                </div>
              )}

              <div style={{ marginTop: 'var(--space-4)', display: 'flex', gap: 'var(--space-3)' }}>
                <Button
                  onClick={() => setConfirmOpen(true)}
                  disabled={change.isPending}
                >
                  Review & Confirm Change →
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setSelectedPriceId(null)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Confirmation Dialog */}
      {confirmOpen && preview && selectedPriceId && (
        <ConfirmDialog
          title="Confirm Plan Change"
          confirmLabel={change.isPending ? 'Updating…' : 'Confirm & Save'}
          busyLabel="Processing…"
          busy={change.isPending}
          error={changeError}
          onClose={() => setConfirmOpen(false)}
          onConfirm={() => change.mutate(selectedPriceId)}
        >
          <p style={{ margin: '0 0 var(--space-3)' }}>
            {preview.kind === 'UPGRADE'
              ? `Are you sure you want to upgrade to ${preview.target.planName} immediately?`
              : `Are you sure you want to schedule a downgrade to ${preview.target.planName}?`}
          </p>
          <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
            <li>New Rate: {formatMoney(preview.target.amount, preview.target.currency)} / {intervalLabel(preview.target.interval).toLowerCase()}</li>
            <li>New Limit: {preview.target.usageLimit.toLocaleString()} API calls per month</li>
          </ul>
        </ConfirmDialog>
      )}
    </main>
  );
}
