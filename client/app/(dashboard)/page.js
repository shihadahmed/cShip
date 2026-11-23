import {
  CheckIcon,
  DeploymentsIcon,
  GithubIcon,
  GitBranchIcon,
  PlusIcon,
  ProjectsIcon,
  ShieldIcon,
  TerminalIcon,
} from '@/components/icons';
import { SystemStatus } from '@/components/system-status';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Panel, PanelBody, PanelHeader } from '@/components/ui/panel';
import { cn } from '@/lib/cn';

export const metadata = {
  title: 'Overview',
};

const STATS = [
  {
    label: 'Projects',
    value: '0',
    hint: 'No repositories connected',
  },
  {
    label: 'Deployments',
    value: '0',
    hint: 'Build history is empty',
  },
  {
    label: 'Build queue',
    value: '—',
    hint: 'Ships in Phase 3',
  },
  {
    label: 'Heap cap',
    value: '512 MB',
    hint: 'Default cap · configurable',
  },
];

const NEXT_UP = [
  {
    icon: GithubIcon,
    title: 'GitHub authentication',
    copy: 'OAuth login and the admin allowlist.',
  },
  {
    icon: ShieldIcon,
    title: 'Project data model',
    copy: 'Encrypted env values and deploy history.',
  },
  {
    icon: GitBranchIcon,
    title: 'Repository import',
    copy: 'Branches, commits, and push webhooks.',
  },
];

export default function OverviewPage() {
  return (
    <div className="reveal space-y-7">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted">
            Deployment control for your cPanel account
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Overview
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            disabled
            title="GitHub authentication arrives in Phase 2"
            className="whitespace-nowrap"
          >
            <PlusIcon className="h-4 w-4" />
            New project
            <Badge variant="outline" className="ml-1">
              Phase 2
            </Badge>
          </Button>
        </div>
      </header>

      <dl className="grid grid-cols-2 overflow-hidden rounded-lg border border-border/80 bg-panel/60 shadow-panel sm:grid-cols-4">
        {STATS.map((stat, index) => (
          <div
            key={stat.label}
            className={cn(
              'px-4 py-4 sm:px-5',
              index % 2 === 1 && 'border-l border-border/70',
              index >= 2 && 'border-t border-border/70 sm:border-t-0',
              index > 0 && 'sm:border-l sm:border-border/70',
            )}
          >
            <dt className="text-xs text-muted">{stat.label}</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">
              {stat.value}
            </dd>
            <p className="mt-1 text-[11px] text-muted">{stat.hint}</p>
          </div>
        ))}
      </dl>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <Panel>
            <PanelHeader
              title="Projects"
              description="Repositories connected to this cPanel account"
              action={<Badge variant="outline">0 deployed</Badge>}
            />
            <PanelBody>
              <div className="relative overflow-hidden rounded-md border border-dashed border-border/90 bg-background/30 px-5 py-10 text-center sm:px-8">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,hsl(var(--accent)_/_0.08),transparent_60%)]" />
                <div className="relative mx-auto flex h-12 w-12 items-center justify-center rounded-md border border-accent/20 bg-accent/10 text-accent">
                  <ProjectsIcon className="h-6 w-6" />
                </div>
                <h2 className="relative mt-4 text-base font-medium">
                  Your fleet is empty
                </h2>
                <p className="relative mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-muted">
                  Connect a GitHub repository to deploy your first project to a
                  cPanel subdomain. cShip will provision the subdomain, write
                  environment values, and restart Passenger.
                </p>
                <div className="relative mt-5 flex flex-wrap items-center justify-center gap-2">
                  <Button variant="secondary" disabled>
                    <GithubIcon className="h-4 w-4" />
                    Connect GitHub
                    <Badge variant="outline" className="ml-1">
                      Phase 2
                    </Badge>
                  </Button>
                  <span className="text-xs text-muted">
                    The project wizard arrives next.
                  </span>
                </div>
              </div>
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader
              title="Recent deployments"
              description="Builds stream here over SSE when a project is connected"
              action={
                <Badge variant="outline">
                  <TerminalIcon className="h-3 w-3" />
                  No logs yet
                </Badge>
              }
            />
            <PanelBody className="p-0">
              <div className="flex items-center gap-3 border-b border-border/60 px-5 py-4 text-sm text-muted">
                <DeploymentsIcon className="h-4 w-4 shrink-0" />
                <span>
                  Push to a connected branch or redeploy a project to start a
                  build.
                </span>
              </div>
              <div className="grid gap-3 px-5 py-4 sm:grid-cols-3">
                {['Queued', 'Building', 'Ready'].map((status) => (
                  <div
                    key={status}
                    className="rounded-md border border-border/60 bg-background/30 px-3 py-2.5"
                  >
                    <p className="text-xs text-muted">{status}</p>
                    <p className="mt-1 font-mono text-lg text-foreground/80">
                      0
                    </p>
                  </div>
                ))}
              </div>
            </PanelBody>
          </Panel>
        </div>

        <aside className="space-y-6">
          <SystemStatus />

          <Panel>
            <PanelHeader
              title="Next up"
              description="Foundation is online; features land in phases"
              action={<Badge variant="accent">Phase 2</Badge>}
            />
            <PanelBody className="space-y-3">
              {NEXT_UP.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border/70 bg-raised/50 text-muted">
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <div>
                      <p className="text-sm text-foreground">{item.title}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted">
                        {item.copy}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div className="flex items-center gap-2 border-t border-border/60 pt-3 text-xs text-muted">
                <CheckIcon className="h-3.5 w-3.5 text-accent" />
                Phase 1 foundation is running.
              </div>
            </PanelBody>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
