import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function Layout() {
  const { user, isLoading, logout } = useAuth();
  const navigate = useNavigate();

  async function onLogout() {
    await logout();
    navigate('/');
  }

  return (
    <div className="shell">
      <header className="nav">
        <Link to="/" className="nav-brand">
          BillingHub
        </Link>
        <nav className="nav-links">
          <Link to="/pricing">Pricing</Link>
          {!isLoading && !user && (
            <>
              <Link to="/login">Login</Link>
              <Link to="/register">Register</Link>
            </>
          )}
          {user && (
            <>
              <Link to="/app">App</Link>
              {user.role === 'CUSTOMER' && user.organization && (
                <>
                  <Link to="/app/subscription">Manage subscription</Link>
                  <Link to="/app/billing/invoices">Invoices</Link>
                  <Link to="/app/billing/payments">Payments</Link>
                  <Link to="/app/settings/organization">Organization settings</Link>
                </>
              )}
              {user.role === 'ADMIN' && (
                <>
                  <Link to="/admin">Admin</Link>
                  <Link to="/admin/plans">Plans</Link>
                </>
              )}
              <span className="nav-user">
                {user.name}
                {user.role === 'CUSTOMER' && user.organization
                  ? ` · ${user.organization.name}`
                  : ''}
              </span>
              <button
                type="button"
                className="link-button"
                onClick={() => void onLogout()}
              >
                Logout
              </button>
            </>
          )}
        </nav>
      </header>
      <Outlet />
    </div>
  );
}
