import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function AdminHome() {
  const { user } = useAuth();

  return (
    <main className="page">
      <h1>Admin area</h1>
      <p>Welcome, {user?.name}.</p>
      <p className="home-actions">
        <Link to="/admin/plans">Manage plans</Link>
      </p>
    </main>
  );
}
