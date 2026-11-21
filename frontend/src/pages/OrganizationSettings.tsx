import { useEffect, useState, type FormEvent } from 'react';
import { z } from 'zod';
import { useAuth } from '../auth/AuthContext';
import {
  Badge,
  Button,
  Card,
  PageHeader,
  Skeleton,
} from '../components/ui';
import { ApiError, api } from '../lib/api';

const updateOrgSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(100),
  billingEmail: z.string().trim().email('Enter a valid email'),
});

type OrganizationPayload = {
  organization: {
    id: string;
    name: string;
    billingEmail: string;
    createdAt: string;
    updatedAt?: string;
    membershipRole: 'OWNER' | 'MEMBER';
  };
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString();
}

export function OrganizationSettings() {
  const { user, refreshUser } = useAuth();
  const isOwner = user?.organization?.membershipRole === 'OWNER';

  const [name, setName] = useState('');
  const [billingEmail, setBillingEmail] = useState('');
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [membershipRole, setMembershipRole] = useState<'OWNER' | 'MEMBER'>(
    user?.organization?.membershipRole ?? 'OWNER',
  );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await api<OrganizationPayload>('/orgs/current');
        if (cancelled) {
          return;
        }
        setName(data.organization.name);
        setBillingEmail(data.organization.billingEmail);
        setCreatedAt(data.organization.createdAt);
        setMembershipRole(data.organization.membershipRole);
        setLoadError(null);
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof ApiError ? err.message : 'Could not load organization',
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

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setServerError(null);
    setSuccess(null);
    const parsed = updateOrgSchema.safeParse({ name, billingEmail });
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
      const data = await api<OrganizationPayload>('/orgs/current', {
        method: 'PATCH',
        body: JSON.stringify({
          name: parsed.data.name,
          billingEmail: parsed.data.billingEmail,
        }),
      });
      setName(data.organization.name);
      setBillingEmail(data.organization.billingEmail);
      setCreatedAt(data.organization.createdAt);
      await refreshUser();
      setSuccess('Organization details updated successfully.');
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
        setServerError('Could not save organization');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="page page-wide" style={{ maxWidth: '44rem' }}>
        <PageHeader title="Organization Settings" description="Loading workspace details…" />
        <Card>
          <Skeleton width="40%" height="2rem" />
          <Skeleton width="70%" height="2.5rem" style={{ margin: '1rem 0' }} />
        </Card>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="page page-wide" style={{ maxWidth: '44rem' }}>
        <PageHeader title="Organization Settings" />
        <div className="callout-banner callout-banner-danger" role="alert">
          <span>{loadError}</span>
        </div>
      </main>
    );
  }

  return (
    <main className="page page-wide" style={{ maxWidth: '44rem' }}>
      <PageHeader
        title="Organization Settings"
        description="Manage organization profile, billing contact email, and workspace metadata."
      />

      {/* Non-Owner Readonly Card */}
      {!isOwner && (
        <div className="form-section-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
            <h2 className="form-section-title" style={{ margin: 0 }}>
              Organization Details
            </h2>
            <Badge variant="neutral">{membershipRole}</Badge>
          </div>
          <p className="form-section-desc">
            You are currently a {membershipRole.toLowerCase()} of this organization. Only the designated organization owner can modify legal and billing details.
          </p>

          <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
            <div style={{ padding: 'var(--space-3)', background: 'var(--color-surface-secondary)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                Organization Name
              </div>
              <div style={{ fontWeight: 600, fontSize: 'var(--font-size-base)', marginTop: '0.2rem' }}>
                {name}
              </div>
            </div>

            <div style={{ padding: 'var(--space-3)', background: 'var(--color-surface-secondary)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                Billing Email Address
              </div>
              <div style={{ fontWeight: 600, fontSize: 'var(--font-size-base)', marginTop: '0.2rem' }}>
                {billingEmail}
              </div>
            </div>

            <div style={{ padding: 'var(--space-3)', background: 'var(--color-surface-secondary)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                Created Date
              </div>
              <div style={{ fontWeight: 600, fontSize: 'var(--font-size-base)', marginTop: '0.2rem' }}>
                {createdAt ? formatDate(createdAt) : '—'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Owner Edit Form */}
      {isOwner && (
        <form onSubmit={(event) => void onSubmit(event)}>
          {serverError && (
            <div className="callout-banner callout-banner-danger" role="alert" style={{ marginBottom: 'var(--space-4)' }}>
              <span>{serverError}</span>
            </div>
          )}
          {success && (
            <div className="callout-banner callout-banner-success" role="status" style={{ marginBottom: 'var(--space-4)' }}>
              <span>{success}</span>
            </div>
          )}

          <div className="form-section-card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
              <h2 className="form-section-title" style={{ margin: 0 }}>
                Workspace Profile
              </h2>
              <Badge variant="info">Owner Access</Badge>
            </div>
            <p className="form-section-desc">
              Created on {createdAt ? formatDate(createdAt) : '—'}. These details appear on all invoices generated for this organization.
            </p>

            <div className="form-field">
              <label className="form-field-label" htmlFor="org-name">
                Organization Name
              </label>
              <input
                id="org-name"
                className={`form-control ${fieldErrors.name ? 'error' : ''}`}
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              {fieldErrors.name && (
                <span className="field-error">{fieldErrors.name}</span>
              )}
            </div>

            <div className="form-field" style={{ marginTop: 'var(--space-4)' }}>
              <label className="form-field-label" htmlFor="org-email">
                Billing Email
              </label>
              <input
                id="org-email"
                className={`form-control ${fieldErrors.billingEmail ? 'error' : ''}`}
                type="email"
                autoComplete="email"
                value={billingEmail}
                onChange={(event) => setBillingEmail(event.target.value)}
              />
              <div className="form-field-helper">
                Invoices, renewal confirmations, and billing alerts will be delivered here.
              </div>
              {fieldErrors.billingEmail && (
                <span className="field-error">{fieldErrors.billingEmail}</span>
              )}
            </div>
          </div>

          <Button type="submit" disabled={submitting}>
            {submitting ? 'Saving Changes…' : 'Save Organization'}
          </Button>
        </form>
      )}
    </main>
  );
}
