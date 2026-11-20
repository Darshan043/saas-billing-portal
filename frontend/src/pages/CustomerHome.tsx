import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';
import {
  formatRenewalDate,
  intervalLabel,
  type CurrentSubscriptionResponse,
} from '../lib/subscriptions';

export function CustomerHome() {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ['subscription-current'],
    queryFn: () => api<CurrentSubscriptionResponse>('/subscriptions/current'),
  });
  const subscription = query.data?.subscription ?? null;

  return (
    <main className="page">
      <h1>Customer area</h1>
      <p>Welcome, {user?.name}.</p>
      {user?.organization && (
        <p>Organization: {user.organization.name}</p>
      )}

      {query.isLoading && <p className="muted">Loading plan…</p>}
      {query.isError && (
        <p className="error">Could not load your subscription.</p>
      )}
      {!query.isLoading && !query.isError && subscription && (
        <section className="status-box">
          <h2>Current plan</h2>
          <p>
            {subscription.planName} · {intervalLabel(subscription.interval)}
          </p>
          <p>
            <span className={`pill status-${subscription.status.toLowerCase()}`}>
              {subscription.status}
            </span>
          </p>
          <p className="muted">
            Renews {formatRenewalDate(subscription.currentPeriodEnd)}
          </p>
        </section>
      )}
      {!query.isLoading && !query.isError && !subscription && (
        <p>
          No plan yet. <Link to="/pricing">Choose a plan</Link>
        </p>
      )}
    </main>
  );
}
