'use client';

import { LogoMark } from '@/components/icons';
import { Button } from '@/components/ui/button';

export default function GlobalError({ error, reset }) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-6">
      <div
        aria-hidden="true"
        className="blueprint pointer-events-none absolute inset-0 opacity-60"
      />
      <div className="relative w-full max-w-md rounded-lg border border-border/80 bg-panel/80 p-8 text-center shadow-panel backdrop-blur-sm">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-md border border-danger/25 bg-danger/10 text-danger">
          <LogoMark className="h-6 w-6" />
        </span>
        <p className="mt-5 font-mono text-xs text-muted">engine error</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          The dashboard hit a snag
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          {error?.message || 'An unexpected client error occurred.'}
        </p>
        <Button onClick={reset} className="mt-6">
          Try again
        </Button>
      </div>
    </main>
  );
}
