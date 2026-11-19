import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext';

export function RequireOrganization() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <p className="muted page-status">Loading…</p>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role === 'ADMIN') {
    return <Outlet />;
  }

  if (!user.organization) {
    return <Navigate to="/app/create-organization" replace />;
  }

  return <Outlet />;
}
