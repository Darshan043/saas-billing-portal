import { useMemo, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/ui';
import { BrandLogoIcon, EyeIcon, EyeOffIcon } from '../components/layouts/Icons';
import { ApiError } from '../lib/api';

const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

function destinationFor(role: 'CUSTOMER' | 'ADMIN'): string {
  return role === 'ADMIN' ? '/admin' : '/app';
}

export function Login() {
  const { user, isLoading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const redirectTo = useMemo(() => {
    if (!user) {
      return null;
    }
    if (from && from !== '/login' && from !== '/register') {
      return from;
    }
    return destinationFor(user.role);
  }, [from, user]);

  if (!isLoading && user && redirectTo) {
    return <Navigate to={redirectTo} replace />;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setServerError(null);
    const parsed = loginSchema.safeParse({ email, password });
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
      const loggedIn = await login(parsed.data.email, parsed.data.password);
      navigate(from && from !== '/login' ? from : destinationFor(loggedIn.role), {
        replace: true,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        setServerError(err.message);
      } else {
        setServerError('Could not log in');
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

        <h1 className="auth-title">Welcome back</h1>
        <p className="auth-subtitle">
          Enter your credentials to access your billing account
        </p>

        {serverError && (
          <div className="callout-banner callout-banner-danger" role="alert" style={{ marginBottom: 'var(--space-4)' }}>
            <span>{serverError}</span>
          </div>
        )}

        <form onSubmit={(event) => void onSubmit(event)}>
          <div className="form-field">
            <label className="form-field-label" htmlFor="login-email">
              Email address
            </label>
            <input
              id="login-email"
              className={`form-control ${fieldErrors.email ? 'error' : ''}`}
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            {fieldErrors.email && (
              <span className="field-error">{fieldErrors.email}</span>
            )}
          </div>

          <div className="form-field" style={{ marginTop: 'var(--space-3)' }}>
            <label className="form-field-label" htmlFor="login-password">
              Password
            </label>
            <div className="password-input-wrap">
              <input
                id="login-password"
                className={`form-control ${fieldErrors.password ? 'error' : ''}`}
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
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
              {submitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </div>
        </form>

        <div className="auth-footer">
          Don’t have an account yet?{' '}
          <Link to="/register" state={from ? { from } : undefined}>
            Create an account
          </Link>
        </div>
      </div>
    </div>
  );
}
