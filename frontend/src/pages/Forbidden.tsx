import { Link } from 'react-router-dom';
import { Button, Card, EmptyState } from '../components/ui';

export function Forbidden() {
  return (
    <main className="page" style={{ maxWidth: '32rem', margin: '3rem auto' }}>
      <Card>
        <EmptyState
          icon="🚫"
          title="403 — Access Denied"
          description="You are signed in, but your user account does not hold the permissions required to view this area."
          action={
            <Link to="/app" style={{ textDecoration: 'none' }}>
              <Button>← Back to Customer Dashboard</Button>
            </Link>
          }
        />
      </Card>
    </main>
  );
}
