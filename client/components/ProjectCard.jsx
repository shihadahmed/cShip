'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Panel } from '@/components/ui/panel';
import { GithubIcon, TrashIcon, ExternalLinkIcon, ServerIcon, GitBranchIcon } from '@/components/icons';
import { cn } from '@/lib/cn';
import { fetchJson } from '@/lib/api';

export function ProjectCard({ project, onDelete }) {
  const { logout } = useAuth();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm(`Delete "${project.name}"? This action cannot be undone.`)) return;
    setDeleting(true);
    try {
      await fetchJson(`/api/projects/${project._id}`, { method: 'DELETE' });
      onDelete?.(project._id);
    } catch (error) {
      alert(error.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Panel className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-foreground truncate">{project.name}</h3>
            {project.subdomain && (
              <Badge variant="outline" className="flex items-center gap-1 text-xs">
                <ServerIcon className="h-3 w-3" />
                {project.subdomain}
              </Badge>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            <span className="flex items-center gap-1">
              <GithubIcon className="h-3.5 w-3.5" />
              <a
                href={project.repoUrl || `https://github.com/${project.repoFullName}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-accent truncate max-w-[300px] block"
              >
                {project.repoFullName}
              </a>
            </span>
            <span className="flex items-center gap-1">
              <GitBranchIcon className="h-3.5 w-3.5" />
              {project.defaultBranch || 'main'}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/60">
        <Button
          variant="outline"
          size="sm"
          className="flex items-center gap-1.5"
        >
          <ExternalLinkIcon className="h-3.5 w-3.5" />
          View on GitHub
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDelete}
          disabled={deleting}
          className="text-danger hover:text-danger hover:bg-danger/10"
        >
          <TrashIcon className="h-4 w-4" />
          <span className="hidden sm:inline">Delete</span>
        </Button>
      </div>
    </Panel>
  );
}