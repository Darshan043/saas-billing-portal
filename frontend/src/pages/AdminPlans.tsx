import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, api } from '../lib/api';
import { formatMoney } from '../lib/money';
import { priceFor, type AdminPlan } from '../lib/plans';

type PlansResponse = { plans: AdminPlan[] };

export function AdminPlans() {
  const [plans, setPlans] = useState<AdminPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await api<PlansResponse>('/admin/plans');
        if (!cancelled) {
          setPlans(data.plans);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError ? err.message : 'Could not load plans',
          );
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
      <h1>Plans</h1>
      <p className="subtitle">Create and version the plans sold to customers.</p>
      <p className="home-actions">
        <Link to="/admin/plans/new">Create plan</Link>
        <Link to="/admin">Back to admin</Link>
      </p>

      {loading && <p className="muted">Loading plans…</p>}
      {error && <p className="error">{error}</p>}
      {!loading && !error && plans.length === 0 && (
        <p className="muted">No plans yet.</p>
      )}

      {plans.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Monthly</th>
                <th>Yearly</th>
                <th>Usage limit</th>
                <th>Features</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => {
                const month = priceFor(plan, 'MONTH');
                const year = priceFor(plan, 'YEAR');
                return (
                  <tr key={plan.id}>
                    <td>
                      <strong>{plan.name}</strong>
                      <div className="muted">{plan.description}</div>
                    </td>
                    <td>
                      {month
                        ? formatMoney(month.amount, month.currency)
                        : '—'}
                    </td>
                    <td>
                      {year ? formatMoney(year.amount, year.currency) : '—'}
                    </td>
                    <td>{plan.usageLimit.toLocaleString()}</td>
                    <td>
                      <ul className="feature-list compact">
                        {plan.features.map((feature) => (
                          <li key={feature}>{feature}</li>
                        ))}
                      </ul>
                    </td>
                    <td>
                      <span
                        className={
                          plan.isActive ? 'pill pill-ok' : 'pill pill-down'
                        }
                      >
                        {plan.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <Link to={`/admin/plans/${plan.id}/edit`}>Edit</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
