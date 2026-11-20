import {
  AppSidebarLayout,
  type NavItemConfig,
} from './AppSidebarLayout';
import {
  DashboardIcon,
  ExternalLinkIcon,
  PlansIcon,
} from './Icons';

export function AdminLayout() {
  const adminNavItems: NavItemConfig[] = [
    {
      label: 'Admin Overview',
      to: '/admin',
      icon: DashboardIcon,
      end: true,
    },
    {
      label: 'Manage Plans',
      to: '/admin/plans',
      icon: PlansIcon,
    },
  ];

  const adminSecondaryItems: NavItemConfig[] = [
    {
      label: 'Customer App',
      to: '/app',
      icon: ExternalLinkIcon,
    },
    {
      label: 'Public Website',
      to: '/',
      icon: ExternalLinkIcon,
    },
  ];

  return (
    <AppSidebarLayout
      title="BillingHub"
      badge="Admin"
      navItems={adminNavItems}
      secondaryHeading="Shortcuts"
      secondaryNavItems={adminSecondaryItems}
      isAdmin={true}
    />
  );
}
