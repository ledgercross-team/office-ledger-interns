'use client';

// Replaces the root layout, so it brings its own document and styles. It
// follows the system colour scheme (global CSS and the theme attribute are
// not available here).
export default function GlobalError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          fontFamily: 'system-ui, sans-serif',
          background: '#eef1ea',
          color: '#2a3027',
        }}
      >
        <main style={{ maxWidth: 480, padding: 24 }}>
          <h1 style={{ fontSize: 20, margin: '0 0 8px' }}>Something went wrong.</h1>
          <p style={{ margin: '0 0 16px' }}>
            Please try again. If it keeps happening, contact your administrator.
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{ padding: '8px 16px', font: 'inherit' }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
