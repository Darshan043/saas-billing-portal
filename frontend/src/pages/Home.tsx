import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

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

  return (
    <main className="page">
      <h1>BillingHub</h1>
      <p className="subtitle">
        Subscription billing and customer portal
      </p>

      <p className="home-actions">
        <Link to="/pricing">View pricing</Link>
      </p>

      {!user && (
        <p className="home-actions">
          <Link to="/login">Login</Link>
          <Link to="/register">Register</Link>
        </p>
      )}
      {user && (
        <p className="home-actions">
          <Link to={user.role === 'ADMIN' ? '/admin' : '/app'}>
            Go to {user.role === 'ADMIN' ? 'admin' : 'app'}
          </Link>
        </p>
      )}

      <section className="status-box" aria-live="polite">
        <h2>System status</h2>
        {state.kind === 'loading' && (
          <p className="muted">Checking backend health…</p>
        )}
        {state.kind === 'error' && (
          <p className="error">Could not load status: {state.message}</p>
        )}
        {state.kind === 'success' && (
          <dl>
            <div>
              <dt>Backend</dt>
              <dd>
                <span className="pill pill-ok">{state.data.status}</span>
                <span className="muted"> ({state.data.service})</span>
              </dd>
            </div>
            <div>
              <dt>Database</dt>
              <dd>
                <span
                  className={
                    state.data.database === 'up' ? 'pill pill-ok' : 'pill pill-down'
                  }
                >
                  {state.data.database}
                </span>
              </dd>
            </div>
          </dl>
        )}
      </section>
    </main>
  );
}
