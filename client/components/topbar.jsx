import Link from 'next/link';
import {
  ChevronRightIcon,
  GithubIcon,
  LogoMark,
  ServerIcon,
} from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { ThemeToggle } from '@/components/theme-toggle';

export function Topbar() {
  return (
    <header className="sticky top-0 z-20 border-b border-border/70 bg-background/85 backdrop-blur-md">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 lg:hidden"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-md border border-accent/25 bg-accent/10 text-accent">
            <LogoMark className="h-4 w-4" />
          </span>
          <span className="text-sm font-semibold tracking-tight">cShip</span>
        </Link>

        <div className="hidden min-w-0 items-center gap-2 text-xs text-muted lg:flex">
          <span>Control</span>
          <ChevronRightIcon className="h-3 w-3" />
          <span className="text-foreground">Overview</span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Badge variant="outline" className="hidden sm:inline-flex">
            <ServerIcon className="h-3 w-3" />
            cPanel
          </Badge>
          <span className="hidden items-center gap-1.5 rounded-md border border-border/80 bg-panel/60 px-2.5 py-1.5 text-xs text-muted sm:flex">
            <GithubIcon className="h-3.5 w-3.5" />
            Not connected
          </span>
          <ThemeToggle />
        </div>
      </div>

      <nav
        aria-label="Primary mobile"
        className="flex items-center gap-1 overflow-x-auto border-t border-border/60 px-4 py-2 lg:hidden"
      >
        <Link
          href="/"
          className="rounded-md bg-raised/70 px-2.5 py-1.5 text-xs font-medium text-foreground ring-1 ring-border/70"
        >
          Overview
        </Link>
        {['Projects', 'Deployments', 'Settings'].map((label) => (
          <span
            key={label}
            aria-disabled="true"
            className="flex cursor-not-allowed items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-muted/60"
          >
            {label}
            <span className="rounded border border-border/70 px-1 py-0 text-[9px]">
              Soon
            </span>
          </span>
        ))}
      </nav>
    </header>
  );
}
