import { useAuth } from '../auth/AuthContext';

export function AdminHome() {
  const { user } = useAuth();

  return (
    <main className="page">
      <h1>Admin area</h1>
      <p>Welcome, {user?.name}.</p>
      <p className="muted">Admin tools will appear here in later steps.</p>
    </main>
  );
}
