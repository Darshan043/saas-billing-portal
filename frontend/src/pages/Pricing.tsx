import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Skeleton,
} from '../components/ui';
import { api } from '../lib/api';
import { formatMoney, yearlySavingsPercent } from '../lib/money';
import {
  priceFor,
  type BillingInterval,
  type PublicPlan,
} from '../lib/plans';
import {
  isBlockingSubscription,
  type CurrentSubscriptionResponse,
  type SubscriptionView,
} from '../lib/subscriptions';

type PlansResponse = { plans: PublicPlan[] };

function CheckIcon() {
  return (
    <svg
      className="pricing-feature-icon"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function Pricing() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [plans, setPlans] = useState<PublicPlan[]>([]);
  const [interval, setInterval] = useState<BillingInterval>('MONTH');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<SubscriptionView | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await api<PlansResponse>('/plans');
        if (!cancelled) {
          setPlans(data.plans);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load plans');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!user || user.role !== 'CUSTOMER' || !user.organization) {
      setCurrent(null);
      return;
    }

    async function loadCurrent() {
      try {
        const data = await api<CurrentSubscriptionResponse>(
          '/subscriptions/current',
        );
        if (!cancelled) {
          setCurrent(data.subscription);
        }
      } catch {
        if (!cancelled) {
          setCurrent(null);
        }
      }
    }

    void loadCurrent();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const blocking = isBlockingSubscription(current);
  const isAdmin = user?.role === 'ADMIN';

  // Calculate maximum savings across all available plans
  const maxSavings = plans.reduce((max, plan) => {
    const monthly = priceFor(plan, 'MONTH');
    const yearly = priceFor(plan, 'YEAR');
    if (monthly && yearly) {
      const pct = yearlySavingsPercent(monthly.amount, yearly.amount);
      return pct && pct > max ? pct : max;
    }
    return max;
  }, 0);

  function choosePlan(planPriceId: string) {
    const checkoutPath = `/app/checkout?planPriceId=${planPriceId}`;
    if (!user) {
      navigate('/login', { state: { from: checkoutPath } });
      return;
    }
    navigate(checkoutPath);
  }

  return (
    <main className="page page-wide">
      {/* Header */}
      <div className="pricing-header-wrap">
        <h1 style={{ fontSize: '2.5rem', fontWeight: 800, marginBottom: 'var(--space-2)' }}>
          Transparent, predictable pricing
        </h1>
        <p className="subtitle" style={{ fontSize: '1.125rem' }}>
          Choose the right plan to power your team’s API workflows. Scale effortlessly as you grow.
        </p>

        {/* Monthly / Yearly Toggle */}
        <div className="pricing-toggle-wrap">
          <div className="pricing-toggle-box" role="group" aria-label="Billing interval selection">
            <button
              type="button"
              className={`pricing-toggle-btn ${interval === 'MONTH' ? 'active' : ''}`}
              onClick={() => setInterval('MONTH')}
            >
              Monthly billing
            </button>
            <button
              type="button"
              className={`pricing-toggle-btn ${interval === 'YEAR' ? 'active' : ''}`}
              onClick={() => setInterval('YEAR')}
            >
              Annual billing
            </button>
          </div>
          {maxSavings > 0 && (
            <span className="pricing-savings-pill">
              Save up to {maxSavings}%
            </span>
          )}
        </div>
      </div>

      {/* Loading Skeletons */}
      {loading && (
        <div className="pricing-grid">
          {[1, 2, 3].map((n) => (
            <Card key={n}>
              <Skeleton width="40%" height="1.5rem" />
              <Skeleton width="70%" height="0.875rem" style={{ margin: '0.75rem 0 1.5rem' }} />
              <Skeleton width="50%" height="2.5rem" />
              <div style={{ marginTop: '2rem' }}>
                <Skeleton width="100%" height="1rem" style={{ marginBottom: '0.5rem' }} />
                <Skeleton width="90%" height="1rem" style={{ marginBottom: '0.5rem' }} />
                <Skeleton width="80%" height="1rem" style={{ marginBottom: '0.5rem' }} />
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="callout-banner callout-banner-danger" role="alert">
          <span>{error}</span>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && plans.length === 0 && (
        <Card>
          <EmptyState
            title="No plans available"
            description="There are currently no active public plans available. Please check back soon or contact support."
          />
        </Card>
      )}

      {/* Pricing Cards Grid */}
      <div className="pricing-grid">
        {plans.map((plan, index) => {
          const selected = priceFor(plan, interval);
          const monthly = priceFor(plan, 'MONTH');
          const yearly = priceFor(plan, 'YEAR');
          const savings =
            interval === 'YEAR' && monthly && yearly
              ? yearlySavingsPercent(monthly.amount, yearly.amount)
              : null;
          const isCurrent =
            blocking &&
            current?.planName === plan.name &&
            current.interval === interval;

          // Highlight the middle plan (or 2nd plan) as recommended if 3 plans exist
          const isFeatured = plans.length >= 3 && index === 1;

          return (
            <article
              key={plan.id}
              className={`pricing-card ${isFeatured ? 'featured' : ''}`}
            >
              {isFeatured && <span className="pricing-badge-top">Most Popular</span>}

              <div className="pricing-card-header">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h2 className="pricing-card-title">{plan.name}</h2>
                  {isCurrent && <Badge variant="info">Current Plan</Badge>}
                </div>
                <p className="pricing-card-desc">{plan.description}</p>
              </div>

              {/* Price Display */}
              <div className="pricing-card-price">
                <span className="pricing-card-amount">
                  {selected ? formatMoney(selected.amount, selected.currency) : '—'}
                </span>
                <span className="pricing-card-period">
                  {interval === 'MONTH' ? ' / month' : ' / year'}
                </span>
                {savings !== null && (
                  <div
                    style={{
                      fontSize: 'var(--font-size-xs)',
                      color: 'var(--color-success-700)',
                      fontWeight: 600,
                      marginTop: '0.25rem',
                    }}
                  >
                    Save {savings}% with yearly billing
                  </div>
                )}
              </div>

              {/* Usage Allowance */}
              <div
                style={{
                  padding: 'var(--space-2) var(--space-3)',
                  background: 'var(--color-surface-secondary)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--font-size-xs)',
                  fontWeight: 600,
                  color: 'var(--color-text-secondary)',
                  marginBottom: 'var(--space-4)',
                }}
              >
                ⚡ {plan.usageLimit.toLocaleString()} monthly API requests included
              </div>

              {/* Features List with Checkmarks */}
              <ul className="pricing-feature-list">
                {plan.features.map((feature) => (
                  <li key={feature} className="pricing-feature-item">
                    <CheckIcon />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              {/* CTA Action */}
              <div className="pricing-card-cta">
                {selected && (
                  <>
                    {isAdmin ? (
                      <div style={{ display: 'grid', gap: '0.25rem' }}>
                        <Button disabled style={{ width: '100%' }}>
                          Choose Plan
                        </Button>
                        <span className="muted" style={{ fontSize: 'var(--font-size-xs)', textAlign: 'center' }}>
                          Admin accounts cannot subscribe.
                        </span>
                      </div>
                    ) : isCurrent ? (
                      <Link to="/app/subscription" style={{ textDecoration: 'none' }}>
                        <Button variant="secondary" style={{ width: '100%' }}>
                          Manage Subscription
                        </Button>
                      </Link>
                    ) : blocking ? (
                      <Link to="/app/subscription" style={{ textDecoration: 'none' }}>
                        <Button variant="secondary" style={{ width: '100%' }}>
                          Manage Subscription
                        </Button>
                      </Link>
                    ) : (
                      <Button
                        variant={isFeatured ? 'primary' : 'secondary'}
                        style={{ width: '100%' }}
                        onClick={() => choosePlan(selected.id)}
                      >
                        Get started with {plan.name}
                      </Button>
                    )}
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {/* Organization creation note for authenticated users without org */}
      {user && !user.organization && user.role === 'CUSTOMER' && (
        <Card compact style={{ textAlign: 'center', marginTop: 'var(--space-6)' }}>
          <p className="muted" style={{ margin: 0, fontSize: 'var(--font-size-sm)' }}>
            To activate a subscription, you must first create an organization.{' '}
            <Link to="/app/create-organization" style={{ color: 'var(--color-action-primary)', fontWeight: 600 }}>
              Create Organization →
            </Link>
          </p>
        </Card>
      )}
    </main>
  );
}
