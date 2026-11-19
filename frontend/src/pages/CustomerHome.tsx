import { useAuth } from '../auth/AuthContext';

export function CustomerHome() {
  const { user } = useAuth();

  return (
    <main className="page">
      <h1>Customer area</h1>
      <p>Welcome, {user?.name}.</p>
      <p className="muted">Organizations and billing will appear here in later steps.</p>
    </main>
  );
}
