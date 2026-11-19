import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <main className="page">
      <h1>Page not found</h1>
      <p>
        <Link to="/">Back to home</Link>
      </p>
    </main>
  );
}
