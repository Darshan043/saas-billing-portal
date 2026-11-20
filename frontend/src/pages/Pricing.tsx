import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
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
      <h1>Pricing</h1>
      <p className="subtitle">Simple plans for teams of every size.</p>

      <div className="billing-toggle" role="group" aria-label="Billing interval">
        <button
          type="button"
          className={interval === 'MONTH' ? 'toggle-active' : ''}
          onClick={() => setInterval('MONTH')}
        >
          Monthly
        </button>
        <button
          type="button"
          className={interval === 'YEAR' ? 'toggle-active' : ''}
          onClick={() => setInterval('YEAR')}
        >
          Yearly
        </button>
      </div>

      {loading && <p className="muted">Loading plans…</p>}
      {error && <p className="error">{error}</p>}
      {!loading && !error && plans.length === 0 && (
        <p className="muted">No plans are available yet.</p>
      )}

      <div className="plan-grid">
        {plans.map((plan) => {
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

          return (
            <article key={plan.id} className="plan-card">
              <h2>{plan.name}</h2>
              {isCurrent && <p className="current-plan">Current plan</p>}
              <p className="muted">{plan.description}</p>
              <p className="plan-price">
                {selected
                  ? formatMoney(selected.amount, selected.currency)
                  : '—'}
                <span className="muted">
                  {interval === 'MONTH' ? ' / month' : ' / year'}
                </span>
              </p>
              {savings !== null && (
                <p className="success">
                  {savings > 0
                    ? `Save ${savings}% with yearly billing`
                    : 'Save with yearly billing'}
                </p>
              )}
              <p>
                Usage limit:{' '}
                {plan.usageLimit.toLocaleString()} API calls / month
              </p>
              <ul className="feature-list">
                {plan.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
              {selected && (
                <p className="plan-cta">
                  {isAdmin ? (
                    <>
                      <button type="button" disabled>
                        Choose plan
                      </button>
                      <span className="muted">
                        Admin accounts cannot subscribe.
                      </span>
                    </>
                  ) : blocking && !isCurrent ? (
                    <>
                      <button type="button" disabled>
                        Choose plan
                      </button>
                      <span className="muted">
                        Changing plans comes in a later step.
                      </span>
                    </>
                  ) : blocking && isCurrent ? (
                    <button type="button" disabled>
                      Current plan
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => choosePlan(selected.id)}
                    >
                      Choose plan
                    </button>
                  )}
                </p>
              )}
            </article>
          );
        })}
      </div>
      {user && !user.organization && user.role === 'CUSTOMER' && (
        <p className="muted">
          Create an organization first to subscribe.{' '}
          <Link to="/app/create-organization">Create organization</Link>
        </p>
      )}
    </main>
  );
}
