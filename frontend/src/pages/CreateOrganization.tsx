import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { useAuth } from '../auth/AuthContext';
import { ApiError, api } from '../lib/api';

const createOrgSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  billingEmail: z
    .string()
    .trim()
    .email('Enter a valid email')
    .optional()
    .or(z.literal('')),
});

type CreateOrgResponse = {
  organization: {
    id: string;
    name: string;
    billingEmail: string;
    membershipRole: 'OWNER' | 'MEMBER';
  };
};

export function CreateOrganization() {
  const { user, isLoading, refreshUser } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [billingEmail, setBillingEmail] = useState(user?.email ?? '');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!isLoading && user?.role === 'ADMIN') {
    return <Navigate to="/admin" replace />;
  }

  if (!isLoading && user?.organization) {
    return <Navigate to="/app" replace />;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setServerError(null);
    const parsed = createOrgSchema.safeParse({ name, billingEmail });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === 'string' && !next[field]) {
          next[field] = issue.message;
        }
      }
      setFieldErrors(next);
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    try {
      const trimmedEmail = parsed.data.billingEmail?.trim() ?? '';
      await api<CreateOrgResponse>('/orgs', {
        method: 'POST',
        body: JSON.stringify({
          name: parsed.data.name,
          ...(trimmedEmail ? { billingEmail: trimmedEmail } : {}),
        }),
      });
      await refreshUser();
      navigate('/app', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.details?.length) {
          const next: Record<string, string> = {};
          for (const detail of err.details) {
            next[detail.field] = detail.message;
          }
          setFieldErrors(next);
        }
        setServerError(err.message);
      } else {
        setServerError('Could not create organization');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="page">
      <h1>Create your organization</h1>
      <p className="muted">
        Billing for subscriptions and invoices will belong to this organization.
      </p>
      <form className="form" onSubmit={(event) => void onSubmit(event)}>
        {serverError && <p className="error">{serverError}</p>}
        <label>
          Organization name
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          {fieldErrors.name && (
            <span className="field-error">{fieldErrors.name}</span>
          )}
        </label>
        <label>
          Billing email (optional)
          <input
            type="email"
            autoComplete="email"
            value={billingEmail}
            onChange={(event) => setBillingEmail(event.target.value)}
          />
          {fieldErrors.billingEmail && (
            <span className="field-error">{fieldErrors.billingEmail}</span>
          )}
        </label>
        <button type="submit" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create organization'}
        </button>
      </form>
    </main>
  );
}
