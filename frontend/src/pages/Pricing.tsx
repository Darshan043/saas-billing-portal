import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { formatMoney, yearlySavingsPercent } from '../lib/money';
import {
  priceFor,
  type BillingInterval,
  type PublicPlan,
} from '../lib/plans';

type PlansResponse = { plans: PublicPlan[] };

export function Pricing() {
  const [plans, setPlans] = useState<PublicPlan[]>([]);
  const [interval, setInterval] = useState<BillingInterval>('MONTH');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

          return (
            <article key={plan.id} className="plan-card">
              <h2>{plan.name}</h2>
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
            </article>
          );
        })}
      </div>
    </main>
  );
}
