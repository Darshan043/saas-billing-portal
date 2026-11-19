import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Forbidden } from '../pages/Forbidden';
import { useAuth } from './AuthContext';
import type { User } from './AuthContext';

export function RequireRole({
  role,
  children,
}: {
  role: User['role'];
  children: ReactNode;
}) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <p className="muted page-status">Loading…</p>;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (user.role !== role) {
    return <Forbidden />;
  }

  return children;
}
