import { Route, Routes } from 'react-router-dom';
import { RequireAuth } from './auth/RequireAuth';
import { RequireOrganization } from './auth/RequireOrganization';
import { RequireRole } from './auth/RequireRole';
import { Layout } from './components/Layout';
import { AdminHome } from './pages/AdminHome';
import { CreateOrganization } from './pages/CreateOrganization';
import { CustomerHome } from './pages/CustomerHome';
import { Home } from './pages/Home';
import { Login } from './pages/Login';
import { NotFound } from './pages/NotFound';
import { OrganizationSettings } from './pages/OrganizationSettings';
import { Register } from './pages/Register';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
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
        <Route
          element={
            <RequireAuth>
              <RequireOrganization />
            </RequireAuth>
          }
        >
          <Route path="/app" element={<CustomerHome />} />
          <Route
            path="/app/settings/organization"
            element={<OrganizationSettings />}
          />
        </Route>
        <Route
          path="/admin"
          element={
            <RequireRole role="ADMIN">
              <AdminHome />
            </RequireRole>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
