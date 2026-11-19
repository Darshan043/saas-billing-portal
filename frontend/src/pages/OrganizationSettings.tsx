import { useEffect, useState, type FormEvent } from 'react';
import { z } from 'zod';
import { useAuth } from '../auth/AuthContext';
import { ApiError, api } from '../lib/api';

const updateOrgSchema = z
  .object({
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
      setSuccess('Organization saved.');
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
      <main className="page">
        <p className="muted">Loading organization…</p>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="page">
        <h1>Organization settings</h1>
        <p className="error">{loadError}</p>
      </main>
    );
  }

  if (!isOwner) {
    return (
      <main className="page">
        <h1>Organization settings</h1>
        <p className="muted">
          You are a {membershipRole.toLowerCase()} of this organization. Only
          the owner can change these details.
        </p>
        <dl>
          <div>
            <dt>Name</dt>
            <dd>{name}</dd>
          </div>
          <div>
            <dt>Billing email</dt>
            <dd>{billingEmail}</dd>
          </div>
          <div>
            <dt>Created</dt>
            <dd>{createdAt ? formatDate(createdAt) : '—'}</dd>
          </div>
        </dl>
      </main>
    );
  }

  return (
    <main className="page">
      <h1>Organization settings</h1>
      <p className="muted">
        Created {createdAt ? formatDate(createdAt) : '—'}.
      </p>
      <form className="form" onSubmit={(event) => void onSubmit(event)}>
        {serverError && <p className="error">{serverError}</p>}
        {success && <p className="success">{success}</p>}
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
          Billing email
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
          {submitting ? 'Saving…' : 'Save'}
        </button>
      </form>
    </main>
  );
}
