import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import {
  Button,
  Card,
  PageHeader,
  Skeleton,
} from '../components/ui';
import { ApiError, api } from '../lib/api';
import { formatMoney } from '../lib/money';
import {
  SIMULATOR_PAYMENT_METHODS,
  type SimulatorPaymentToken,
} from '../lib/paymentTokens';
import { priceFor, type PublicPlan } from '../lib/plans';
import { intervalLabel, type SubscriptionView } from '../lib/subscriptions';

type PlansResponse = { plans: PublicPlan[] };

function CheckIcon() {
  return (
    <svg
      style={{ width: '0.875rem', height: '0.875rem', color: 'var(--color-success-700)', flexShrink: 0 }}
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

export function Checkout() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const planPriceId = searchParams.get('planPriceId');

  const [plans, setPlans] = useState<PublicPlan[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [token, setToken] = useState<SimulatorPaymentToken>(
    'tok_sim_visa_ok',
  );
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const selected = useMemo(() => {
    if (!plans || !planPriceId) {
      return null;
    }
    for (const plan of plans) {
      const month = priceFor(plan, 'MONTH');
      const year = priceFor(plan, 'YEAR');
      if (month?.id === planPriceId) {
        return { plan, price: month };
      }
      if (year?.id === planPriceId) {
        return { plan, price: year };
      }
    }
    return null;
  }, [planPriceId, plans]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await api<PlansResponse>('/plans');
        if (!cancelled) {
          setPlans(data.plans);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : 'Could not load plans',
          );
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const isOwner = user?.organization?.membershipRole === 'OWNER';

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!planPriceId || !isOwner || submitting) {
      return;
    }
    setServerError(null);
    setSubmitting(true);
    try {
      await api<{ subscription: SubscriptionView }>('/subscriptions', {
        method: 'POST',
        body: JSON.stringify({
          planPriceId,
          paymentToken: token,
        }),
      });
      navigate('/app/subscription/status', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setServerError(err.message);
      } else {
        setServerError('Could not start checkout');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="page page-wide">
      <PageHeader
        title="Complete your subscription"
        description={
          user?.organization
            ? `Subscribing organization: ${user.organization.name}`
            : 'Select a simulator payment method to activate your plan'
        }
      />

      {/* Simulator Mode Callout */}
      <div className="simulator-notice" role="note" style={{ marginBottom: 'var(--space-6)' }}>
        SIMULATOR MODE — No real money is required or billed. Use test methods below to simulate outcomes.
      </div>

      {/* Missing Plan parameter error */}
      {!planPriceId && (
        <Card>
          <div className="callout-banner callout-banner-danger" style={{ margin: 0 }}>
            <div>
              <strong>No plan selected.</strong> Please choose a plan from the pricing catalogue.
            </div>
          </div>
          <div style={{ marginTop: 'var(--space-4)' }}>
            <Link to="/pricing">
              <Button size="sm">Back to Pricing</Button>
            </Link>
          </div>
        </Card>
      )}

      {/* Plan loading error */}
      {loadError && (
        <div className="callout-banner callout-banner-danger">
          <span>{loadError}</span>
        </div>
      )}

      {/* Invalid plan price id */}
      {plans && planPriceId && !selected && (
        <Card>
          <div className="callout-banner callout-banner-danger" style={{ margin: 0 }}>
            <div>
              <strong>Selected plan is unavailable.</strong> The requested plan price could not be located.
            </div>
          </div>
          <div style={{ marginTop: 'var(--space-4)' }}>
            <Link to="/pricing">
              <Button size="sm">Back to Pricing</Button>
            </Link>
          </div>
        </Card>
      )}

      {/* Skeleton Loading state */}
      {!plans && !loadError && (
        <div className="checkout-layout">
          <Card>
            <Skeleton width="40%" height="1.5rem" />
            <Skeleton width="100%" height="3rem" style={{ margin: '1rem 0' }} />
            <Skeleton width="100%" height="3rem" style={{ marginBottom: '1rem' }} />
          </Card>
          <Card>
            <Skeleton width="60%" height="1.25rem" />
            <Skeleton width="40%" height="2rem" style={{ margin: '1rem 0' }} />
          </Card>
        </div>
      )}

      {/* Non-Owner alert */}
      {selected && !isOwner && (
        <div className="callout-banner callout-banner-warning">
          <span>
            Only organization owners can initiate or authorize subscriptions. Please contact an organization owner to complete this order.
          </span>
        </div>
      )}

      {/* Main Checkout View: Form + Order Summary */}
      {selected && isOwner && (
        <form onSubmit={(event) => void onSubmit(event)}>
          <div className="checkout-layout">
            {/* Left Column: Payment Method Selection */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
              <Card>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 var(--space-4)' }}>
                  Select Test Payment Method
                </h2>

                <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
                  {SIMULATOR_PAYMENT_METHODS.map((method) => {
                    const isChecked = token === method.token;
                    return (
                      <label
                        key={method.token}
                        className={`radio-card ${isChecked ? 'active' : ''}`}
                      >
                        <input
                          type="radio"
                          name="paymentToken"
                          value={method.token}
                          checked={isChecked}
                          onChange={() => setToken(method.token)}
                        />
                        <div className="radio-card-body">
                          <div className="radio-card-title">{method.label}</div>
                          <div className="radio-card-desc">{method.description}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>

                {serverError && (
                  <div className="callout-banner callout-banner-danger" style={{ marginTop: 'var(--space-4)' }}>
                    <span>{serverError}</span>
                  </div>
                )}

                <div style={{ marginTop: 'var(--space-6)', display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
                  <Button
                    type="submit"
                    size="lg"
                    disabled={submitting}
                  >
                    {submitting
                      ? 'Processing Simulator Order…'
                      : `Subscribe · ${formatMoney(selected.price.amount, selected.price.currency)} / ${intervalLabel(selected.price.interval).toLowerCase()}`}
                  </Button>
                  <Link to="/pricing" style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', textDecoration: 'none' }}>
                    Cancel
                  </Link>
                </div>
              </Card>

              {/* Safe Simulator Notice */}
              <div
                style={{
                  fontSize: 'var(--font-size-xs)',
                  color: 'var(--color-text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  padding: 'var(--space-2) var(--space-3)',
                }}
              >
                <span>🔒 Simulated Sandbox Environment · Instant Token Validation</span>
              </div>
            </div>

            {/* Right Column: Order Summary Card */}
            <div>
              <aside className="order-summary-card">
                <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 var(--space-4)' }}>
                  Order Summary
                </h2>

                <div style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <strong>{selected.plan.name} Plan</strong>
                    <span>{formatMoney(selected.price.amount, selected.price.currency)}</span>
                  </div>
                  <div className="muted" style={{ fontSize: 'var(--font-size-xs)', marginTop: '0.25rem' }}>
                    Billed {intervalLabel(selected.price.interval).toLowerCase()}
                  </div>
                </div>

                <div style={{ marginBottom: 'var(--space-4)' }}>
                  <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: 'var(--space-2)' }}>
                    Plan Highlights
                  </div>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 'var(--space-2)' }}>
                    <li style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--font-size-xs)' }}>
                      <CheckIcon />
                      <span>{selected.plan.usageLimit.toLocaleString()} monthly API calls</span>
                    </li>
                    {selected.plan.features.map((feature) => (
                      <li key={feature} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--font-size-xs)' }}>
                        <CheckIcon />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="order-summary-line">
                  <span className="muted">Subtotal</span>
                  <span>{formatMoney(selected.price.amount, selected.price.currency)}</span>
                </div>
                <div className="order-summary-line">
                  <span className="muted">Taxes (Simulator)</span>
                  <span>$0.00</span>
                </div>
                <div className="order-summary-line total">
                  <span>Total Due Today</span>
                  <span>{formatMoney(selected.price.amount, selected.price.currency)}</span>
                </div>
              </aside>
            </div>
          </div>
        </form>
      )}
    </main>
  );
}
