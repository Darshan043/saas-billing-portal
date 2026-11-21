import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { Button } from '../ui';
import { BrandLogoIcon, CloseIcon, MenuIcon } from './Icons';

export function PublicLayout() {
  const { user, isLoading, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  async function onLogout() {
    await logout();
    setMobileMenuOpen(false);
    navigate('/');
  }

  const appDestination = user?.role === 'ADMIN' ? '/admin' : '/app';

  return (
    <div className="public-shell">
      <header className="public-header">
        <div className="public-header-inner">
          <Link to="/" className="brand" aria-label="BillingHub home">
            <span className="brand-icon">
              <BrandLogoIcon style={{ width: '1.25rem', height: '1.25rem' }} />
            </span>
            <span>BillingHub</span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="public-nav-links" aria-label="Main navigation">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `public-nav-item ${isActive ? 'active' : ''}`
              }
            >
              Home
            </NavLink>
            <NavLink
              to="/pricing"
              className={({ isActive }) =>
                `public-nav-item ${isActive ? 'active' : ''}`
              }
            >
              Pricing
            </NavLink>
          </nav>

          {/* Desktop Actions */}
          <div className="public-nav-actions">
            {!isLoading && !user && (
              <>
                <Link to="/login" className="public-nav-item">
                  Log in
                </Link>
                <Link to="/register">
                  <Button size="sm">Get Started</Button>
                </Link>
              </>
            )}

            {!isLoading && user && (
              <>
                <span className="muted" style={{ fontSize: 'var(--font-size-sm)' }}>
                  {user.name}
                </span>
                <Link to={appDestination}>
                  <Button size="sm">Go to App</Button>
                </Link>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void onLogout()}
                >
                  Log out
                </Button>
              </>
            )}
          </div>

          {/* Mobile Menu Toggle Button */}
          <button
            type="button"
            className="mobile-menu-toggle"
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((prev) => !prev)}
          >
            {mobileMenuOpen ? (
              <CloseIcon style={{ width: '1.25rem', height: '1.25rem' }} />
            ) : (
              <MenuIcon style={{ width: '1.25rem', height: '1.25rem' }} />
            )}
          </button>
        </div>

        {/* Mobile Dropdown Navigation */}
        {mobileMenuOpen && (
          <nav
            className="public-mobile-menu"
            aria-label="Mobile navigation"
          >
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `public-mobile-item ${isActive ? 'active' : ''}`
              }
              onClick={() => setMobileMenuOpen(false)}
            >
              Home
            </NavLink>
            <NavLink
              to="/pricing"
              className={({ isActive }) =>
                `public-mobile-item ${isActive ? 'active' : ''}`
              }
              onClick={() => setMobileMenuOpen(false)}
            >
              Pricing
            </NavLink>

            <div className="public-mobile-actions">
              {!isLoading && !user && (
                <>
                  <Link
                    to="/login"
                    className="public-mobile-item"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Log in
                  </Link>
                  <Link
                    to="/register"
                    onClick={() => setMobileMenuOpen(false)}
                    style={{ textDecoration: 'none' }}
                  >
                    <Button style={{ width: '100%' }}>Get Started</Button>
                  </Link>
                </>
              )}

              {!isLoading && user && (
                <>
                  <div
                    style={{
                      padding: '0.5rem 0.75rem',
                      fontSize: 'var(--font-size-sm)',
                      fontWeight: 600,
                    }}
                  >
                    Signed in as {user.name}
                  </div>
                  <Link
                    to={appDestination}
                    onClick={() => setMobileMenuOpen(false)}
                    style={{ textDecoration: 'none' }}
                  >
                    <Button style={{ width: '100%' }}>Go to App</Button>
                  </Link>
                  <Button
                    variant="secondary"
                    onClick={() => void onLogout()}
                    style={{ width: '100%' }}
                  >
                    Log out
                  </Button>
                </>
              )}
            </div>
          </nav>
        )}
      </header>

      <main className="public-main">
        <Outlet />
      </main>
    </div>
  );
}
