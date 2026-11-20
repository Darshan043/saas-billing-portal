import { Route, Routes } from 'react-router-dom';
import { RequireAuth } from './auth/RequireAuth';
import { RequireOrganization } from './auth/RequireOrganization';
import { RequireRole } from './auth/RequireRole';
import { AdminLayout, CustomerLayout, PublicLayout } from './components/layouts';
import { AdminHome } from './pages/AdminHome';
import { AdminPlanForm } from './pages/AdminPlanForm';
import { AdminPlans } from './pages/AdminPlans';
import { CreateOrganization } from './pages/CreateOrganization';
import { CustomerHome } from './pages/CustomerHome';
import { Home } from './pages/Home';
import { Login } from './pages/Login';
import { NotFound } from './pages/NotFound';
import { OrganizationSettings } from './pages/OrganizationSettings';
import { ChangePlan } from './pages/ChangePlan';
import { Checkout } from './pages/Checkout';
import { InvoiceDetail } from './pages/InvoiceDetail';
import { Invoices } from './pages/Invoices';
import { ManageSubscription } from './pages/ManageSubscription';
import { Payments } from './pages/Payments';
import { Pricing } from './pages/Pricing';
import { Register } from './pages/Register';
import { SubscriptionStatus } from './pages/SubscriptionStatus';

export default function App() {
  return (
    <Routes>
      {/* Public routes wrapped in PublicLayout */}
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          path="/app/create-organization"
          element={
            <RequireAuth>
              <CreateOrganization />
            </RequireAuth>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Route>

      {/* Customer authenticated routes wrapped in CustomerLayout */}
      <Route
        element={
          <RequireAuth>
            <RequireOrganization />
          </RequireAuth>
        }
      >
        <Route element={<CustomerLayout />}>
          <Route path="/app" element={<CustomerHome />} />
          <Route path="/app/checkout" element={<Checkout />} />
          <Route path="/app/subscription" element={<ManageSubscription />} />
          <Route path="/app/subscription/change" element={<ChangePlan />} />
          <Route
            path="/app/subscription/status"
            element={<SubscriptionStatus />}
          />
          <Route path="/app/billing/invoices" element={<Invoices />} />
          <Route
            path="/app/billing/invoices/:id"
            element={<InvoiceDetail />}
          />
          <Route path="/app/billing/payments" element={<Payments />} />
          <Route
            path="/app/settings/organization"
            element={<OrganizationSettings />}
          />
        </Route>
      </Route>

      {/* Admin authenticated routes wrapped in AdminLayout */}
      <Route
        element={
          <RequireRole role="ADMIN">
            <AdminLayout />
          </RequireRole>
        }
      >
        <Route path="/admin" element={<AdminHome />} />
        <Route path="/admin/plans" element={<AdminPlans />} />
        <Route path="/admin/plans/new" element={<AdminPlanForm />} />
        <Route path="/admin/plans/:id/edit" element={<AdminPlanForm />} />
      </Route>
    </Routes>
  );
}
