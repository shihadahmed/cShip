import Link from 'next/link';
import { LogoMark } from '@/components/icons';
import { buttonClassName } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-6">
      <div
        aria-hidden="true"
        className="blueprint pointer-events-none absolute inset-0 opacity-60"
      />
      <div className="relative w-full max-w-md rounded-lg border border-border/80 bg-panel/80 p-8 text-center shadow-panel backdrop-blur-sm">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-md border border-accent/25 bg-accent/10 text-accent">
          <LogoMark className="h-6 w-6" />
        </span>
        <p className="mt-5 font-mono text-xs text-muted">404 · off chart</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          This route is not in the harbor
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          The page you requested does not exist or has not shipped yet.
        </p>
        <Link href="/" className={buttonClassName({ className: 'mt-6' })}>
          Back to overview
        </Link>
      </div>
    </main>
  );
}
