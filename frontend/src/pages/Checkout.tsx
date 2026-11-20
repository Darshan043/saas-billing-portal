import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ApiError, api } from '../lib/api';
import { formatMoney } from '../lib/money';
import {
  SIMULATOR_PAYMENT_METHODS,
  type SimulatorPaymentToken,
} from '../lib/paymentTokens';
import { priceFor, type PublicPlan } from '../lib/plans';
import { intervalLabel, type SubscriptionView } from '../lib/subscriptions';

type PlansResponse = { plans: PublicPlan[] };

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
    <main className="page">
      <h1>Checkout</h1>
      <p className="subtitle">
        {user?.organization
          ? `Organization: ${user.organization.name}`
          : 'Subscribe to a plan'}
      </p>

      <p className="simulator-notice" role="note">
        SIMULATOR — no real money. Use a test payment method.
      </p>

      {!planPriceId && (
        <p className="error">
          No plan selected.{' '}
          <Link to="/pricing">Choose a plan</Link>
        </p>
      )}
      {loadError && <p className="error">{loadError}</p>}
      {plans && planPriceId && !selected && (
        <p className="error">
          That plan is not available.{' '}
          <Link to="/pricing">Back to pricing</Link>
        </p>
      )}
      {!plans && !loadError && <p className="muted">Loading plan…</p>}

      {selected && (
        <section className="status-box">
          <h2>{selected.plan.name}</h2>
          <p className="muted">{selected.plan.description}</p>
          <p className="plan-price">
            {formatMoney(selected.price.amount, selected.price.currency)}
            <span className="muted">
              {' '}
              / {intervalLabel(selected.price.interval).toLowerCase()}
            </span>
          </p>
          <ul className="feature-list">
            {selected.plan.features.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
        </section>
      )}

      {selected && !isOwner && (
        <p className="muted">
          Only the organization owner can subscribe. Ask an owner to complete
          checkout.
        </p>
      )}

      {selected && isOwner && (
        <form className="form form-wide" onSubmit={(event) => void onSubmit(event)}>
          <fieldset className="token-fieldset">
            <legend>Test payment method</legend>
            {SIMULATOR_PAYMENT_METHODS.map((method) => (
              <label key={method.token} className="radio-row">
                <input
                  type="radio"
                  name="paymentToken"
                  value={method.token}
                  checked={token === method.token}
                  onChange={() => setToken(method.token)}
                />
                <span>
                  <strong>{method.label}</strong>
                  <span className="muted"> — {method.description}</span>
                </span>
              </label>
            ))}
          </fieldset>
          {serverError && <p className="error">{serverError}</p>}
          <button type="submit" disabled={submitting}>
            {submitting ? 'Subscribing…' : 'Subscribe'}
          </button>
          <p>
            <Link to="/pricing">Back to pricing</Link>
          </p>
        </form>
      )}
    </main>
  );
}
