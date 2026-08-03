'use client';

import React from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="bg-background text-foreground min-h-screen flex items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full text-center space-y-4 bg-card border border-border p-8 rounded-xl shadow-lg">
          <h2 className="text-xl font-bold text-red-600 dark:text-red-400">Something went wrong!</h2>
          <p className="text-xs text-muted-foreground">An unexpected error occurred while loading this page.</p>
          <button
            onClick={() => reset()}
            className="px-4 py-2 bg-primary text-primary-foreground font-semibold rounded-md text-xs hover:bg-primary/90 transition-colors"
          >
            Try Again
          </button>
        </div>
      </body>
    </html>
  );
}
