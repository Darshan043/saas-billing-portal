import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  SkeletonText,
} from '../components/ui';
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
      <PageHeader
        title="Plan Management"
        description="Create, version, and manage the subscription tiers and usage quotas available to customers."
        action={
          <Link to="/admin/plans/new" style={{ textDecoration: 'none' }}>
            <Button size="sm">+ Create Plan</Button>
          </Link>
        }
      />

      {/* Loading Skeletons */}
      {loading && (
        <Card>
          <SkeletonText lines={5} />
        </Card>
      )}

      {/* Error Banner */}
      {error && (
        <div className="callout-banner callout-banner-danger" role="alert">
          <span>{error}</span>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && plans.length === 0 && (
        <Card>
          <EmptyState
            icon="📦"
            title="No plans created yet"
            description="Create your first subscription tier to make it available for customer signups and upgrades."
            action={
              <Link to="/admin/plans/new" style={{ textDecoration: 'none' }}>
                <Button>+ Create Plan</Button>
              </Link>
            }
          />
        </Card>
      )}

      {/* Plan Table Card */}
      {!loading && plans.length > 0 && (
        <div className="table-wrap-card">
          <table>
            <thead>
              <tr>
                <th>Plan Name & Details</th>
                <th>Monthly Price</th>
                <th>Yearly Price</th>
                <th>API Call Quota</th>
                <th>Features</th>
                <th>Catalog Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => {
                const month = priceFor(plan, 'MONTH');
                const year = priceFor(plan, 'YEAR');
                return (
                  <tr key={plan.id}>
                    <td>
                      <strong style={{ fontSize: 'var(--font-size-base)', color: 'var(--color-navy-900)' }}>
                        {plan.name}
                      </strong>
                      <div
                        className="muted"
                        style={{
                          fontSize: 'var(--font-size-xs)',
                          maxWidth: '22rem',
                          marginTop: '0.2rem',
                        }}
                      >
                        {plan.description}
                      </div>
                    </td>
                    <td>
                      <strong>
                        {month
                          ? formatMoney(month.amount, month.currency)
                          : '—'}
                      </strong>
                      <div className="muted" style={{ fontSize: 'var(--font-size-xs)' }}>/ month</div>
                    </td>
                    <td>
                      <strong>
                        {year ? formatMoney(year.amount, year.currency) : '—'}
                      </strong>
                      <div className="muted" style={{ fontSize: 'var(--font-size-xs)' }}>/ year</div>
                    </td>
                    <td>
                      <span style={{ fontWeight: 600 }}>
                        {plan.usageLimit.toLocaleString()}
                      </span>{' '}
                      <span className="muted" style={{ fontSize: 'var(--font-size-xs)' }}>calls/mo</span>
                    </td>
                    <td>
                      <ul
                        style={{
                          margin: 0,
                          paddingLeft: '1rem',
                          fontSize: 'var(--font-size-xs)',
                          color: 'var(--color-text-secondary)',
                          lineHeight: 1.4,
                        }}
                      >
                        {plan.features.slice(0, 3).map((feature) => (
                          <li key={feature}>{feature}</li>
                        ))}
                        {plan.features.length > 3 && (
                          <li className="muted">+{plan.features.length - 3} more</li>
                        )}
                      </ul>
                    </td>
                    <td>
                      <Badge variant={plan.isActive ? 'success' : 'neutral'}>
                        {plan.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Link
                        to={`/admin/plans/${plan.id}/edit`}
                        style={{ textDecoration: 'none' }}
                      >
                        <Button variant="secondary" size="sm">
                          Edit Plan
                        </Button>
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ marginTop: 'var(--space-5)' }}>
        <Link
          to="/admin"
          style={{
            fontSize: 'var(--font-size-sm)',
            color: 'var(--color-action-primary)',
            textDecoration: 'none',
          }}
        >
          ← Back to Admin Overview
        </Link>
      </div>
    </main>
  );
}
