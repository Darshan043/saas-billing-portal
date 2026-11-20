import { Link } from 'react-router-dom';
import { Button, Card, EmptyState } from '../components/ui';

export function NotFound() {
  return (
    <main className="page" style={{ maxWidth: '32rem', margin: '3rem auto' }}>
      <Card>
        <EmptyState
          icon="🔍"
          title="Page not found"
          description="The page you are looking for does not exist or has been moved."
          action={
            <Link to="/" style={{ textDecoration: 'none' }}>
              <Button>← Return to Home</Button>
            </Link>
          }
        />
      </Card>
    </main>
  );
}
