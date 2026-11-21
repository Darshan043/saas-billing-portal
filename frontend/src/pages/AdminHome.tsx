import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Skeleton,
  SkeletonText,
} from '../components/ui';
import { api } from '../lib/api';
import { formatMoney } from '../lib/money';
import { priceFor, type AdminPlan } from '../lib/plans';

type PlansResponse = { plans: AdminPlan[] };

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

type HealthResponse = {
  status: string;
  service: string;
  database: 'up' | 'down';
  time: string;
};

export function AdminHome() {
  const { user } = useAuth();

  const plansQuery = useQuery({
    queryKey: ['admin-plans'],
    queryFn: () => api<PlansResponse>('/admin/plans'),
  });

  const healthQuery = useQuery({
    queryKey: ['system-health'],
    queryFn: async () => {
      const res = await fetch(`${apiUrl}/health`);
      if (!res.ok) throw new Error('Health check failed');
      return (await res.json()) as HealthResponse;
    },
  });

  const plans = plansQuery.data?.plans ?? [];
  const activePlans = plans.filter((p) => p.isActive);
  const inactivePlans = plans.filter((p) => !p.isActive);

  return (
    <main className="page page-wide">
      <PageHeader
        title="Admin Overview"
        description={`Welcome back, ${user?.name}. Manage subscription plans, pricing, and system operational status.`}
        action={
          <Link to="/admin/plans/new" style={{ textDecoration: 'none' }}>
            <Button size="sm">+ Create Plan</Button>
          </Link>
        }
      />

      {/* Loading Skeletons */}
      {plansQuery.isLoading && (
        <div className="metric-grid">
          <Card>
            <Skeleton width="40%" height="0.875rem" />
            <Skeleton width="70%" height="1.75rem" style={{ margin: '0.5rem 0' }} />
            <Skeleton width="50%" height="0.75rem" />
          </Card>
          <Card>
            <Skeleton width="40%" height="0.875rem" />
            <Skeleton width="70%" height="1.75rem" style={{ margin: '0.5rem 0' }} />
            <Skeleton width="50%" height="0.75rem" />
          </Card>
          <Card>
            <Skeleton width="40%" height="0.875rem" />
            <Skeleton width="70%" height="1.75rem" style={{ margin: '0.5rem 0' }} />
            <Skeleton width="50%" height="0.75rem" />
          </Card>
        </div>
      )}

      {/* Plans Load Error */}
      {plansQuery.isError && (
        <div className="callout-banner callout-banner-danger" role="alert">
          <div>
            <strong>Could not load admin plan information.</strong> Please refresh the page or verify the backend service.
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void plansQuery.refetch()}
            style={{ marginLeft: 'auto' }}
          >
            Retry
          </Button>
        </div>
      )}

      {/* Real Metrics Grid (derived from actual API responses) */}
      {!plansQuery.isLoading && !plansQuery.isError && (
        <div className="metric-grid">
          <div className="metric-card">
            <div className="metric-card-header">
              <span className="metric-card-label">Total Plans</span>
              <Badge variant="neutral">{plans.length} configured</Badge>
            </div>
            <div className="metric-card-value">{plans.length}</div>
            <div className="metric-card-sub">Billing plans in database</div>
          </div>

          <div className="metric-card">
            <div className="metric-card-header">
              <span className="metric-card-label">Public Catalogue</span>
              <Badge variant="success">{activePlans.length} active</Badge>
            </div>
            <div className="metric-card-value">{activePlans.length}</div>
            <div className="metric-card-sub">
              {inactivePlans.length > 0 ? `${inactivePlans.length} draft/hidden` : 'All plans visible'}
            </div>
          </div>

          <div className="metric-card">
            <div className="metric-card-header">
              <span className="metric-card-label">System Health</span>
              {healthQuery.data && (
                <Badge
                  variant={
                    healthQuery.data.database === 'up' ? 'success' : 'danger'
                  }
                >
                  DB {healthQuery.data.database}
                </Badge>
              )}
            </div>
            <div className="metric-card-value" style={{ fontSize: '1.25rem' }}>
              {healthQuery.isLoading
                ? 'Checking…'
                : healthQuery.isError
                  ? 'Offline'
                  : 'Operational'}
            </div>
            <div className="metric-card-sub">
              {healthQuery.data ? `${healthQuery.data.service} online` : 'Backend status'}
            </div>
          </div>

          <div className="metric-card">
            <div className="metric-card-header">
              <span className="metric-card-label">Access Level</span>
              <Badge variant="info">Admin</Badge>
            </div>
            <div className="metric-card-value" style={{ fontSize: '1.25rem' }}>
              Full Control
            </div>
            <div className="metric-card-sub">Plan creation & pricing versioning</div>
          </div>
        </div>
      )}

      {/* Quick Navigation Action Bar */}
      <div className="quick-actions-bar">
        <span
          style={{
            fontSize: 'var(--font-size-xs)',
            fontWeight: 'bold',
            textTransform: 'uppercase',
            color: 'var(--color-text-muted)',
            marginRight: 'var(--space-2)',
          }}
        >
          Admin Shortcuts
        </span>
        <Link to="/admin/plans" style={{ textDecoration: 'none' }}>
          <Button variant="secondary" size="sm">
            Manage Plans
          </Button>
        </Link>
        <Link to="/admin/plans/new" style={{ textDecoration: 'none' }}>
          <Button variant="secondary" size="sm">
            + New Plan
          </Button>
        </Link>
        <Link to="/pricing" style={{ textDecoration: 'none' }}>
          <Button variant="ghost" size="sm">
            View Public Pricing ↗
          </Button>
        </Link>
        <Link to="/app" style={{ textDecoration: 'none' }}>
          <Button variant="ghost" size="sm">
            Customer App ↗
          </Button>
        </Link>
      </div>

      {/* Quick Plan List Preview */}
      <section style={{ marginTop: 'var(--space-6)' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 'var(--space-3)',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '1.15rem' }}>Configured Billing Plans</h2>
          <Link
            to="/admin/plans"
            style={{
              fontSize: 'var(--font-size-sm)',
              color: 'var(--color-action-primary)',
              textDecoration: 'none',
              fontWeight: 500,
            }}
          >
            Open full plan table →
          </Link>
        </div>

        {plansQuery.isLoading && (
          <Card>
            <SkeletonText lines={4} />
          </Card>
        )}

        {!plansQuery.isLoading && plans.length > 0 && (
          <div className="table-wrap-card">
            <table>
              <thead>
                <tr>
                  <th>Plan Name</th>
                  <th>Monthly Rate</th>
                  <th>Annual Rate</th>
                  <th>API Usage Limit</th>
                  <th>Status</th>
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
                        <strong>{plan.name}</strong>
                        <div
                          className="muted"
                          style={{
                            fontSize: 'var(--font-size-xs)',
                            maxWidth: '24rem',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {plan.description}
                        </div>
                      </td>
                      <td>
                        {month
                          ? formatMoney(month.amount, month.currency)
                          : '—'}
                      </td>
                      <td>
                        {year ? formatMoney(year.amount, year.currency) : '—'}
                      </td>
                      <td>{plan.usageLimit.toLocaleString()} calls/mo</td>
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
                          <Button variant="ghost" size="sm">
                            Edit →
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

        {!plansQuery.isLoading && plans.length === 0 && (
          <Card>
            <EmptyState
              icon="📦"
              title="No plans configured"
              description="Get started by creating your first subscription plan with monthly and yearly pricing."
              action={
                <Link to="/admin/plans/new" style={{ textDecoration: 'none' }}>
                  <Button>+ Create Plan</Button>
                </Link>
              }
            />
          </Card>
        )}
      </section>
    </main>
  );
}
