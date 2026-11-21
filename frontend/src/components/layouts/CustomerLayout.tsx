import { useAuth } from '../../auth/AuthContext';
import {
  AppSidebarLayout,
  type NavItemConfig,
} from './AppSidebarLayout';
import {
  DashboardIcon,
  InvoicesIcon,
  PaymentsIcon,
  PlansIcon,
  SettingsIcon,
  SubscriptionIcon,
} from './Icons';

export function CustomerLayout() {
  const { user } = useAuth();

  const customerNavItems: NavItemConfig[] = [
    {
      label: 'Dashboard',
      to: '/app',
      icon: DashboardIcon,
      end: true,
    },
    {
      label: 'Subscription',
      to: '/app/subscription',
      icon: SubscriptionIcon,
      end: true,
    },
    {
      label: 'Change Plan',
      to: '/app/subscription/change',
      icon: PlansIcon,
    },
    {
      label: 'Invoices',
      to: '/app/billing/invoices',
      icon: InvoicesIcon,
    },
    {
      label: 'Payments',
      to: '/app/billing/payments',
      icon: PaymentsIcon,
    },
    {
      label: 'Organization Settings',
      to: '/app/settings/organization',
      icon: SettingsIcon,
    },
  ];

  return (
    <AppSidebarLayout
      title="BillingHub"
      orgName={user?.organization?.name}
      orgRole={user?.organization?.membershipRole}
      navItems={customerNavItems}
      isAdmin={false}
    />
  );
}
