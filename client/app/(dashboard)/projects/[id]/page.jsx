'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';
import { Badge } from '@/components/ui/badge';
import { DeploymentConsole } from '@/components/DeploymentConsole';
import {
  GithubIcon, GitBranchIcon, ServerIcon, ExternalLinkIcon, TrashIcon,
  ChevronLeftIcon, LoaderIcon, CheckCircleIcon, XCircleIcon, PauseIcon, RotateCcwIcon, SettingsIcon
} from '@/components/icons';
import { fetchJson } from '@/lib/api';
import { cn } from '@/lib/cn';

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id;

  const [project, setProject] = useState(null);
  const [deployments, setDeployments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedDeployment, setSelectedDeployment] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    loadProject();
  }, [projectId]);

  const loadProject = async () => {
    setLoading(true);
    setError(null);
    try {
      const [projectData, deploymentsData] = await Promise.all([
        fetchJson(`/api/projects/${projectId}`),
        fetchJson(`/api/deployments/${projectId}`),
      ]);
      setProject(projectData.project);
      setDeployments(deploymentsData.deployments || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRedeploy = async (deploymentId) => {
    setActionLoading(true);
    try {
      await fetchJson(`/api/deployments/${projectId}/redeploy`, {
        method: 'POST',
        body: JSON.stringify({ deploymentId }),
      });
      router.refresh();
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRollback = async (deploymentId) => {
    setActionLoading(true);
    try {
      await fetchJson(`/api/deployments/${projectId}/redeploy`, {
        method: 'POST',
        body: JSON.stringify({ deploymentId }),
      });
      router.refresh();
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${project?.name}"? This action cannot be undone.`)) return;
    try {
      await fetchJson(`/api/projects/${projectId}`, { method: 'DELETE' });
      router.push('/projects');
    } catch (err) {
      alert(err.message);
    }
  };

  const handleNewDeploy = async () => {
    try {
      await fetchJson(`/api/deployments/${projectId}`, {
        method: 'POST',
        body: JSON.stringify({ trigger: 'manual' }),
      });
      router.refresh();
    } catch (err) {
      alert(err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoaderIcon className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <Panel className="text-center py-8">
        <p className="text-danger">Failed to load project: {error || 'Not found'}</p>
        <Link href="/projects">
          <Button variant="secondary" className="mt-4">
            <ChevronLeftIcon className="mr-2 h-4 w-4" />
            Back to Projects
          </Button>
        </Link>
      </Panel>
    );
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'ready': return <CheckCircleIcon className="h-3.5 w-3.5 text-success" />;
      case 'failed': return <XCircleIcon className="h-3.5 w-3.5 text-danger" />;
      case 'building': return <LoaderIcon className="h-3.5 w-3.5 animate-spin text-warning" />;
      case 'queued': return <PauseIcon className="h-3.5 w-3.5 text-muted" />;
      default: return <PauseIcon className="h-3.5 w-3.5 text-muted" />;
    }
  };

  const getStatusBadge = (status) => {
    const variants = {
      ready: 'success',
      failed: 'danger',
      building: 'info',
      queued: 'outline',
      cancelled: 'outline',
    };
    return <Badge variant={variants[status] || 'outline'}>{status}</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Link href="/projects" className="text-sm text-muted hover:text-foreground mb-2 inline-flex items-center gap-1">
            <ChevronLeftIcon className="h-4 w-4" />
            All Projects
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{project.name}</h1>
            {project.subdomain && (
              <Badge variant="outline" className="flex items-center gap-1">
                <ServerIcon className="h-3 w-3" />
                {project.subdomain}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted mt-1">
            <GithubIcon className="h-3.5 w-3.5 inline" />
            <a href={`https://github.com/${project.repoFullName}`} target="_blank" rel="noopener noreferrer" className="hover:text-accent">
              {project.repoFullName}
            </a>
            <span className="mx-2">•</span>
            <GitBranchIcon className="h-3.5 w-3.5 inline" />
            {project.defaultBranch || 'main'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`https://github.com/${project.repoFullName}`} target="_blank" rel="noopener noreferrer">
            <Button variant="outline">
              <ExternalLinkIcon className="mr-2 h-4 w-4" />
              View on GitHub
            </Button>
          </Link>
          <Link href={`/projects/${projectId}/settings`}>
            <Button variant="outline">
              <SettingsIcon className="mr-2 h-4 w-4" />
              Settings
            </Button>
          </Link>
          <Button variant="secondary" onClick={handleNewDeploy} disabled={actionLoading}>
            <RotateCcwIcon className="mr-2 h-4 w-4" />
            Deploy
          </Button>
          <Button variant="ghost" onClick={handleDelete} className="text-danger hover:text-danger hover:bg-danger/10">
            <TrashIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-6">
          <Panel>
            <div className="border-b border-border/60 px-5 py-4">
              <h2 className="text-lg font-medium">Deployments</h2>
            </div>
            <div className="p-0">
              {deployments.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <GitBranchIcon className="mx-auto h-10 w-10 text-muted/50 mb-3" />
                  <h3 className="text-base font-medium mb-1">No deployments yet</h3>
                  <p className="text-sm text-muted">Trigger a deployment to see build history here</p>
                  <Button className="mt-4" onClick={handleNewDeploy} disabled={actionLoading}>
                    <RotateCcwIcon className="mr-2 h-4 w-4" />
                    Deploy Now
                  </Button>
                </div>
              ) : (
                <div className="divide-y divide-border/60">
                  {deployments.map(deployment => (
                    <div key={deployment._id} className="px-5 py-4 hover:bg-raised/50 transition-colors">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          {getStatusIcon(deployment.status)}
                          <div>
                            <p className="font-medium text-sm">
                              {deployment.commit?.sha ? deployment.commit.sha.slice(0, 7) : 'unknown'}
                              <span className="mx-2 text-muted">•</span>
                              <span className="text-muted">{new Date(deployment.createdAt).toLocaleString()}</span>
                            </p>
                            <p className="text-xs text-muted truncate max-w-md">
                              {deployment.commit?.message?.split('\n')[0] || 'No message'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {getStatusBadge(deployment.status)}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedDeployment(deployment)}
                          >
                            Logs
                          </Button>
                          {(deployment.status === 'ready' || deployment.status === 'failed') && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRedeploy(deployment._id)}
                              disabled={actionLoading}
                            >
                              <RotateCcwIcon className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Panel>
        </div>

        <aside>
          {selectedDeployment && (
            <DeploymentConsole
              deploymentId={selectedDeployment._id}
              projectId={projectId}
              initialLogs={[]}
              status={selectedDeployment.status}
              onClose={() => setSelectedDeployment(null)}
            />
          )}
        </aside>
      </div>
    </div>
  );
}