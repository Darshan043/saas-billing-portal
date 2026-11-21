import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/ui';
import { BrandLogoIcon, EyeIcon, EyeOffIcon } from '../components/layouts/Icons';
import { ApiError } from '../lib/api';

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().trim().email('Enter a valid email'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be at most 72 characters')
    .regex(/[A-Za-z]/, 'Password must include a letter')
    .regex(/[0-9]/, 'Password must include a number'),
  organizationName: z
    .string()
    .trim()
    .min(2, 'Organization name must be at least 2 characters')
    .max(100),
});

function destinationFor(role: 'CUSTOMER' | 'ADMIN'): string {
  return role === 'ADMIN' ? '/admin' : '/app';
}

export function Register() {
  const { user, isLoading, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!isLoading && user) {
    return (
      <Navigate
        to={from && from !== '/login' && from !== '/register' ? from : destinationFor(user.role)}
        replace
      />
    );
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setServerError(null);
    const parsed = registerSchema.safeParse({
      name,
      email,
      password,
      organizationName,
    });
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
      const created = await register(
        parsed.data.name,
        parsed.data.email,
        parsed.data.password,
        parsed.data.organizationName,
      );
      navigate(
        from && from !== '/login' && from !== '/register'
          ? from
          : destinationFor(created.role),
        { replace: true },
      );
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
        setServerError('Could not register');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        {/* Brand Header */}
        <Link to="/" className="auth-brand-wrap" aria-label="BillingHub home">
          <span className="brand-icon">
            <BrandLogoIcon style={{ width: '1.25rem', height: '1.25rem' }} />
          </span>
          <span style={{ fontWeight: 700, fontSize: '1.2rem', color: 'var(--color-navy-900)' }}>
            BillingHub
          </span>
        </Link>

        <h1 className="auth-title">Create your account</h1>
        <p className="auth-subtitle">
          Start your organization workspace and API billing portal
        </p>

        {serverError && (
          <div className="callout-banner callout-banner-danger" role="alert" style={{ marginBottom: 'var(--space-4)' }}>
            <span>{serverError}</span>
          </div>
        )}

        <form onSubmit={(event) => void onSubmit(event)}>
          <div className="form-field">
            <label className="form-field-label" htmlFor="register-name">
              Full name
            </label>
            <input
              id="register-name"
              className={`form-control ${fieldErrors.name ? 'error' : ''}`}
              type="text"
              autoComplete="name"
              placeholder="Jane Doe"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            {fieldErrors.name && (
              <span className="field-error">{fieldErrors.name}</span>
            )}
          </div>

          <div className="form-field" style={{ marginTop: 'var(--space-3)' }}>
            <label className="form-field-label" htmlFor="register-email">
              Work email
            </label>
            <input
              id="register-email"
              className={`form-control ${fieldErrors.email ? 'error' : ''}`}
              type="email"
              autoComplete="email"
              placeholder="jane@company.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            {fieldErrors.email && (
              <span className="field-error">{fieldErrors.email}</span>
            )}
          </div>

          <div className="form-field" style={{ marginTop: 'var(--space-3)' }}>
            <label className="form-field-label" htmlFor="register-org">
              Organization name
            </label>
            <input
              id="register-org"
              className={`form-control ${fieldErrors.organizationName ? 'error' : ''}`}
              type="text"
              placeholder="Acme Inc."
              value={organizationName}
              onChange={(event) => setOrganizationName(event.target.value)}
            />
            <div className="form-field-helper">
              Your subscriptions, API keys, and team invoices belong to this organization.
            </div>
            {fieldErrors.organizationName && (
              <span className="field-error">{fieldErrors.organizationName}</span>
            )}
          </div>

          <div className="form-field" style={{ marginTop: 'var(--space-3)' }}>
            <label className="form-field-label" htmlFor="register-password">
              Password
            </label>
            <div className="password-input-wrap">
              <input
                id="register-password"
                className={`form-control ${fieldErrors.password ? 'error' : ''}`}
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="At least 8 characters"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                type="button"
                className="password-toggle-btn"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword((prev) => !prev)}
              >
                {showPassword ? (
                  <EyeOffIcon style={{ width: '1.125rem', height: '1.125rem' }} />
                ) : (
                  <EyeIcon style={{ width: '1.125rem', height: '1.125rem' }} />
                )}
              </button>
            </div>
            <div className="form-field-helper">
              Must be at least 8 characters and include both letters and numbers.
            </div>
            {fieldErrors.password && (
              <span className="field-error">{fieldErrors.password}</span>
            )}
          </div>

          <div style={{ marginTop: 'var(--space-5)' }}>
            <Button
              type="submit"
              disabled={submitting}
              style={{ width: '100%', padding: '0.65rem' }}
            >
              {submitting ? 'Creating account…' : 'Create Account'}
            </Button>
          </div>
        </form>

        <div className="auth-footer">
          Already have an account?{' '}
          <Link to="/login" state={from ? { from } : undefined}>
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
