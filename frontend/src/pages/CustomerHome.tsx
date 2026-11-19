import { useAuth } from '../auth/AuthContext';

export function CustomerHome() {
  const { user } = useAuth();

  return (
    <main className="page">
      <h1>Customer area</h1>
      <p>Welcome, {user?.name}.</p>
      {user?.organization && (
        <p>Organization: {user.organization.name}</p>
      )}
    </main>
  );
}
