import Link from 'next/link';
import {
  ChevronRightIcon,
  DeploymentsIcon,
  LogoMark,
  OverviewIcon,
  ProjectsIcon,
  SettingsIcon,
} from '@/components/icons';
import { Badge } from '@/components/ui/badge';

const NAV_ITEMS = [
  {
    label: 'Overview',
    href: '/',
    icon: OverviewIcon,
    active: true,
  },
  {
    label: 'Projects',
    href: '#',
    icon: ProjectsIcon,
    soon: true,
  },
  {
    label: 'Deployments',
    href: '#',
    icon: DeploymentsIcon,
    soon: true,
  },
  {
    label: 'Settings',
    href: '#',
    icon: SettingsIcon,
    soon: true,
  },
];

export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-border/70 bg-panel/40 px-3 py-4 lg:flex">
      <Link
        href="/"
        className="flex items-center gap-3 rounded-md px-2 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-md border border-accent/25 bg-accent/10 text-accent shadow-glow">
          <LogoMark className="h-5 w-5" />
        </span>
        <span>
          <span className="block text-sm font-semibold tracking-tight">
            cShip
          </span>
          <span className="block text-[11px] text-muted">Deploy control</span>
        </span>
      </Link>

      <nav className="mt-8 space-y-1" aria-label="Primary">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;

          if (item.soon) {
            return (
              <span
                key={item.label}
                aria-disabled="true"
                className="flex cursor-not-allowed items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted/60"
              >
                <Icon className="h-4 w-4" />
                <span className="flex-1">{item.label}</span>
                <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                  Soon
                </Badge>
              </span>
            );
          }

          return (
            <Link
              key={item.label}
              href={item.href}
              className="flex items-center gap-2.5 rounded-md bg-raised/70 px-2.5 py-2 text-sm font-medium text-foreground ring-1 ring-border/70"
            >
              <Icon className="h-4 w-4 text-accent" />
              <span className="flex-1">{item.label}</span>
              <ChevronRightIcon className="h-3.5 w-3.5 text-muted" />
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto rounded-lg border border-border/70 bg-background/40 p-3">
        <div className="flex items-center gap-2 text-xs font-medium">
          <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-accent" />
          Engine foundation
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
          cPanel · Passenger
          <br />
          Awaiting first project
        </p>
        <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2 text-[10px] text-muted">
          <span>v0.1.0</span>
          <span className="font-mono">phase 1</span>
        </div>
      </div>
    </aside>
  );
}
