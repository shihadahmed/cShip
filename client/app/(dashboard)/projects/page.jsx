'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';
import { PlusIcon, GithubIcon, ServerIcon, GitBranchIcon } from '@/components/icons';
import { ProjectCard } from '@/components/ProjectCard';
import { fetchJson } from '@/lib/api';

export default function ProjectsPage() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    fetchJson('/api/projects')
      .then(data => {
        if (mounted) {
          setProjects(data.projects || []);
          setLoading(false);
        }
      })
      .catch(err => {
        if (mounted) {
          setError(err.message);
          setLoading(false);
        }
      });
    return () => { mounted = false; };
  }, []);

  const handleDelete = (projectId) => {
    setProjects(prev => prev.filter(p => p._id !== projectId));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
      </div>
    );
  }

  if (error) {
    return (
      <Panel className="text-center py-8">
        <p className="text-danger">Failed to load projects: {error}</p>
      </Panel>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Projects</h1>
          <p className="text-muted text-sm">Manage your deployed repositories</p>
        </div>
        <Link href="/projects/new">
          <Button size="lg">
            <PlusIcon className="mr-2 h-5 w-5" />
            New Project
          </Button>
        </Link>
      </div>

      {projects.length === 0 ? (
        <Panel className="text-center py-12">
          <GithubIcon className="mx-auto h-12 w-12 text-muted/50 mb-4" />
          <h2 className="text-xl font-semibold mb-2">No projects yet</h2>
          <p className="text-muted mb-6">Create your first project to start deploying to cPanel.</p>
          <Link href="/projects/new">
            <Button size="lg">
              <PlusIcon className="mr-2 h-5 w-5" />
              Create Project
            </Button>
          </Link>
        </Panel>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map(project => (
            <ProjectCard
              key={project._id}
              project={{
                ...project,
                repoUrl: `https://github.com/${project.repoFullName}`,
              }}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}