import { useState, type ComponentType, type CSSProperties } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { BrandLogoIcon, CloseIcon, LogoutIcon, MenuIcon } from './Icons';

export interface NavItemConfig {
  label: string;
  to: string;
  icon: ComponentType<{ className?: string; style?: CSSProperties }>;
  end?: boolean;
}

export interface AppSidebarLayoutProps {
  title?: string;
  badge?: string;
  orgName?: string | null;
  orgRole?: string | null;
  navItems: NavItemConfig[];
  secondaryHeading?: string;
  secondaryNavItems?: NavItemConfig[];
  isAdmin?: boolean;
}

export function AppSidebarLayout({
  title = 'BillingHub',
  badge,
  orgName,
  orgRole,
  navItems,
  secondaryHeading,
  secondaryNavItems,
  isAdmin = false,
}: AppSidebarLayoutProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  async function handleLogout() {
    await logout();
    setMobileDrawerOpen(false);
    navigate('/');
  }

  // Generate initials from user name
  const initials = user?.name
    ? user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : 'U';

  const renderNavList = (isMobile = false) => (
    <>
      <div className="app-nav-heading">Navigation</div>
      {navItems.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `app-nav-item ${isActive ? 'active' : ''}`
            }
            onClick={() => {
              if (isMobile) setMobileDrawerOpen(false);
            }}
          >
            <Icon className="app-nav-icon" />
            <span>{item.label}</span>
          </NavLink>
        );
      })}

      {secondaryNavItems && secondaryNavItems.length > 0 && (
        <>
          {secondaryHeading && (
            <div className="app-nav-heading" style={{ marginTop: 'var(--space-3)' }}>
              {secondaryHeading}
            </div>
          )}
          {secondaryNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `app-nav-item ${isActive ? 'active' : ''}`
                }
                onClick={() => {
                  if (isMobile) setMobileDrawerOpen(false);
                }}
              >
                <Icon className="app-nav-icon" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </>
      )}
    </>
  );

  const renderUserBlock = () => (
    <div className="app-sidebar-footer">
      <div className="app-user-block">
        <div className={`app-user-avatar ${isAdmin ? 'admin-avatar' : ''}`}>
          {initials}
        </div>
        <div className="app-user-info">
          <div className="app-user-name" title={user?.name ?? ''}>
            {user?.name ?? 'User'}
          </div>
          <div className="app-user-email" title={user?.email ?? ''}>
            {user?.email ?? ''}
          </div>
        </div>
      </div>
      <button
        type="button"
        className="app-logout-button"
        onClick={() => void handleLogout()}
        aria-label="Log out"
      >
        <LogoutIcon style={{ width: '0.875rem', height: '0.875rem' }} />
        <span>Log out</span>
      </button>
    </div>
  );

  return (
    <div className="app-shell">
      {/* Desktop Sidebar */}
      <aside className="app-sidebar" aria-label="Sidebar navigation">
        <div className="app-sidebar-header">
          <Link to="/" className="brand">
            <span className="brand-icon">
              <BrandLogoIcon style={{ width: '1.25rem', height: '1.25rem' }} />
            </span>
            <span>{title}</span>
            {badge && <span className="brand-badge">{badge}</span>}
          </Link>

          {orgName && (
            <div className="app-sidebar-org">
              <span className="app-sidebar-org-label">
                {orgRole ? `${orgRole} · Organization` : 'Organization'}
              </span>
              <span className="app-sidebar-org-name" title={orgName}>
                {orgName}
              </span>
            </div>
          )}
        </div>

        <nav className="app-sidebar-nav">{renderNavList(false)}</nav>

        {renderUserBlock()}
      </aside>

      {/* Main Content Area */}
      <div className="app-main-wrap">
        {/* Mobile Topbar */}
        <header className="app-mobile-topbar">
          <Link to="/" className="brand">
            <span className="brand-icon">
              <BrandLogoIcon style={{ width: '1.125rem', height: '1.125rem' }} />
            </span>
            <span>{title}</span>
            {badge && <span className="brand-badge">{badge}</span>}
          </Link>

          <button
            type="button"
            className="mobile-menu-toggle"
            aria-label="Open sidebar menu"
            onClick={() => setMobileDrawerOpen(true)}
          >
            <MenuIcon style={{ width: '1.25rem', height: '1.25rem' }} />
          </button>
        </header>

        {/* Child Pages Outlet */}
        <main className="app-main-content">
          <Outlet />
        </main>
      </div>

      {/* Mobile Drawer Overlay */}
      {mobileDrawerOpen && (
        <>
          <div
            className="mobile-drawer-overlay"
            onClick={() => setMobileDrawerOpen(false)}
            aria-hidden="true"
          />
          <aside
            className="mobile-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Mobile navigation"
          >
            <button
              type="button"
              className="mobile-drawer-close"
              aria-label="Close navigation"
              onClick={() => setMobileDrawerOpen(false)}
            >
              <CloseIcon style={{ width: '1.125rem', height: '1.125rem' }} />
            </button>

            <div className="app-sidebar-header" style={{ paddingRight: '3rem' }}>
              <Link
                to="/"
                className="brand"
                onClick={() => setMobileDrawerOpen(false)}
              >
                <span className="brand-icon">
                  <BrandLogoIcon style={{ width: '1.25rem', height: '1.25rem' }} />
                </span>
                <span>{title}</span>
                {badge && <span className="brand-badge">{badge}</span>}
              </Link>

              {orgName && (
                <div className="app-sidebar-org">
                  <span className="app-sidebar-org-label">
                    {orgRole ? `${orgRole} · Organization` : 'Organization'}
                  </span>
                  <span className="app-sidebar-org-name">{orgName}</span>
                </div>
              )}
            </div>

            <nav className="app-sidebar-nav">{renderNavList(true)}</nav>

            {renderUserBlock()}
          </aside>
        </>
      )}
    </div>
  );
}
