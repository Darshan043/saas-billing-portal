import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { useAuth } from '../auth/AuthContext';
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

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!isLoading && user) {
    return <Navigate to={destinationFor(user.role)} replace />;
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
      navigate(destinationFor(created.role), { replace: true });
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
    <main className="page">
      <h1>Create an account</h1>
      <form className="form" onSubmit={(event) => void onSubmit(event)}>
        {serverError && <p className="error">{serverError}</p>}
        <label>
          Name
          <input
            type="text"
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          {fieldErrors.name && (
            <span className="field-error">{fieldErrors.name}</span>
          )}
        </label>
        <label>
          Email
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          {fieldErrors.email && (
            <span className="field-error">{fieldErrors.email}</span>
          )}
        </label>
        <label>
          Organization name
          <input
            type="text"
            value={organizationName}
            onChange={(event) => setOrganizationName(event.target.value)}
          />
          {fieldErrors.organizationName && (
            <span className="field-error">{fieldErrors.organizationName}</span>
          )}
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {fieldErrors.password && (
            <span className="field-error">{fieldErrors.password}</span>
          )}
        </label>
        <button type="submit" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Register'}
        </button>
      </form>
      <p className="muted">
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </main>
  );
}
