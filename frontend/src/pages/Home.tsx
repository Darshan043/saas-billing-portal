import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import {
  Badge,
  Button,
  Card,
  Skeleton,
} from '../components/ui';

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

type HealthResponse = {
  status: string;
  service: string;
  database: 'up' | 'down';
  time: string;
};

type LoadState =
  | { kind: 'loading' }
  | { kind: 'success'; data: HealthResponse }
  | { kind: 'error'; message: string };

export function Home() {
  const { user } = useAuth();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    const controller = new AbortController();

    async function loadHealth() {
      try {
        const response = await fetch(`${apiUrl}/health`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Health check failed (${response.status})`);
        }
        const data = (await response.json()) as HealthResponse;
        setState({ kind: 'success', data });
      } catch (err) {
        if (controller.signal.aborted) {
          return;
        }
        const message =
          err instanceof Error ? err.message : 'Could not reach the backend';
        setState({ kind: 'error', message });
      }
    }

    void loadHealth();
    return () => controller.abort();
  }, []);

  const destination = user?.role === 'ADMIN' ? '/admin' : '/app';

  return (
    <main className="page page-wide">
      {/* Hero Section */}
      <div style={{ textAlign: 'center', maxWidth: '44rem', margin: '2rem auto 3.5rem' }}>
        <Badge variant="info" style={{ marginBottom: 'var(--space-3)' }}>
          SaaS Billing & Customer Portal
        </Badge>
        <h1 style={{ fontSize: '2.75rem', fontWeight: 800, lineHeight: 1.15, letterSpacing: '-0.03em', margin: '0 0 1rem' }}>
          Predictable subscription billing for modern engineering teams
        </h1>
        <p className="subtitle" style={{ fontSize: '1.15rem', lineHeight: 1.6, margin: '0 0 2rem' }}>
          Automate recurring subscriptions, monthly quota provisioning, simulated payment gateways, and self-service customer invoices in one unified dashboard.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
          <Link to="/pricing" style={{ textDecoration: 'none' }}>
            <Button size="lg">Explore Pricing Plans →</Button>
          </Link>
          {user ? (
            <Link to={destination} style={{ textDecoration: 'none' }}>
              <Button variant="secondary" size="lg">
                Go to Dashboard
              </Button>
            </Link>
          ) : (
            <Link to="/register" style={{ textDecoration: 'none' }}>
              <Button variant="secondary" size="lg">
                Create Free Account
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Feature Highlights Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(18rem, 1fr))',
          gap: 'var(--space-6)',
          marginBottom: 'var(--space-8)',
        }}
      >
        <Card>
          <div style={{ fontSize: '1.75rem', marginBottom: 'var(--space-2)' }}>⚡</div>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 0.5rem' }}>
            Predictable Quota Limits
          </h2>
          <p className="muted" style={{ margin: 0, fontSize: 'var(--font-size-sm)', lineHeight: 1.5 }}>
            Automate monthly API call limits and scale tier entitlements smoothly without surprise overage charges.
          </p>
        </Card>

        <Card>
          <div style={{ fontSize: '1.75rem', marginBottom: 'var(--space-2)' }}>🔒</div>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 0.5rem' }}>
            Payment Simulator Sandbox
          </h2>
          <p className="muted" style={{ margin: 0, fontSize: 'var(--font-size-sm)', lineHeight: 1.5 }}>
            Test realistic subscription lifecycles, upgrades, prorations, payment failures, and webhook reconciliation safely.
          </p>
        </Card>

        <Card>
          <div style={{ fontSize: '1.75rem', marginBottom: 'var(--space-2)' }}>📄</div>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 0.5rem' }}>
            Automated Customer Invoicing
          </h2>
          <p className="muted" style={{ margin: 0, fontSize: 'var(--font-size-sm)', lineHeight: 1.5 }}>
            Instantly generate itemized billing statements, transaction receipts, and official downloadable PDFs.
          </p>
        </Card>
      </div>

      {/* Live System Health Section */}
      <section style={{ maxWidth: '40rem', margin: '0 auto' }}>
        <Card compact>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
            <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-muted)' }}>
              Live System Status
            </span>
            <span className="muted" style={{ fontSize: 'var(--font-size-xs)' }}>
              {apiUrl}
            </span>
          </div>

          {state.kind === 'loading' && (
            <div style={{ display: 'flex', gap: 'var(--space-4)' }}>
              <Skeleton width="45%" height="1.5rem" />
              <Skeleton width="45%" height="1.5rem" />
            </div>
          )}

          {state.kind === 'error' && (
            <div className="callout-banner callout-banner-danger" style={{ margin: 0 }}>
              <span>Could not reach backend health service: {state.message}</span>
            </div>
          )}

          {state.kind === 'success' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-2) var(--space-3)', background: 'var(--color-surface-secondary)', borderRadius: 'var(--radius-md)' }}>
                <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>API Service</span>
                <Badge variant={state.data.status === 'ok' ? 'success' : 'neutral'}>
                  {state.data.status}
                </Badge>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-2) var(--space-3)', background: 'var(--color-surface-secondary)', borderRadius: 'var(--radius-md)' }}>
                <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>PostgreSQL</span>
                <Badge variant={state.data.database === 'up' ? 'success' : 'danger'}>
                  {state.data.database}
                </Badge>
              </div>
            </div>
          )}
        </Card>
      </section>
    </main>
  );
}
