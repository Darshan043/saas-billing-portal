import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/ui';
import { BrandLogoIcon } from '../components/layouts/Icons';
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
    <div className="auth-container">
      <div className="auth-card">
        <Link to="/" className="auth-brand-wrap" aria-label="BillingHub home">
          <span className="brand-icon">
            <BrandLogoIcon style={{ width: '1.25rem', height: '1.25rem' }} />
          </span>
          <span style={{ fontWeight: 700, fontSize: '1.2rem', color: 'var(--color-navy-900)' }}>
            BillingHub
          </span>
        </Link>

        <h1 className="auth-title">Setup your organization</h1>
        <p className="auth-subtitle">
          Subscriptions, team members, and invoice records belong to your organization
        </p>

        {serverError && (
          <div className="callout-banner callout-banner-danger" role="alert" style={{ marginBottom: 'var(--space-4)' }}>
            <span>{serverError}</span>
          </div>
        )}

        <form onSubmit={(event) => void onSubmit(event)}>
          <div className="form-field">
            <label className="form-field-label" htmlFor="org-create-name">
              Organization Name
            </label>
            <input
              id="org-create-name"
              className={`form-control ${fieldErrors.name ? 'error' : ''}`}
              type="text"
              placeholder="e.g. Acme Corp"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            {fieldErrors.name && (
              <span className="field-error">{fieldErrors.name}</span>
            )}
          </div>

          <div className="form-field" style={{ marginTop: 'var(--space-3)' }}>
            <label className="form-field-label" htmlFor="org-create-email">
              Billing Email (optional)
            </label>
            <input
              id="org-create-email"
              className={`form-control ${fieldErrors.billingEmail ? 'error' : ''}`}
              type="email"
              autoComplete="email"
              placeholder="billing@company.com"
              value={billingEmail}
              onChange={(event) => setBillingEmail(event.target.value)}
            />
            <div className="form-field-helper">
              Defaults to your account email if left blank.
            </div>
            {fieldErrors.billingEmail && (
              <span className="field-error">{fieldErrors.billingEmail}</span>
            )}
          </div>

          <div style={{ marginTop: 'var(--space-5)' }}>
            <Button
              type="submit"
              disabled={submitting}
              style={{ width: '100%', padding: '0.65rem' }}
            >
              {submitting ? 'Creating workspace…' : 'Continue to Dashboard →'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
