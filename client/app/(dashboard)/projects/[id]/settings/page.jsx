'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/Select';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { fetchJson, updateProject, registerWebhook, unregisterWebhook } from '@/lib/api';
import { cn } from '@/lib/cn';
import {
  GithubIcon, GitBranchIcon, ServerIcon, ExternalLinkIcon, TrashIcon,
  ChevronLeftIcon, LoaderIcon, CheckCircleIcon, XCircleIcon, PauseIcon,
  SettingsIcon, GlobeIcon, KeyIcon, AlertTriangleIcon, WebhookIcon,
  UnlockIcon, LockIcon, Trash2Icon, UnlinkIcon
} from '@/components/icons';

const FRAMEWORKS = [
  { value: 'nextjs', label: 'Next.js' },
  { value: 'react', label: 'React (Vite/CRA)' },
  { value: 'express', label: 'Express/Node.js' },
  { value: 'static', label: 'Static Site' },
];

const DEFAULT_COMMANDS = {
  nextjs: { install: 'npm ci', build: 'npm run build', start: 'npm start', output: '.next' },
  react: { install: 'npm ci', build: 'npm run build', start: 'npm run preview', output: 'dist' },
  express: { install: 'npm ci', build: 'echo "no build step"', start: 'npm start', output: '' },
  static: { install: 'npm ci', build: 'npm run build', start: 'echo "static only"', output: 'dist' },
};

export default function ProjectSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id;

  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [envVars, setEnvVars] = useState({});
  const [newEnvKey, setNewEnvKey] = useState('');
  const [newEnvValue, setNewEnvValue] = useState('');
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);
  const [webhookSecret, setWebhookSecret] = useState(null);

  useEffect(() => {
    loadProject();
  }, [projectId]);

  const loadProject = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson(`/api/projects/${projectId}`);
      setProject(data.project);
      if (data.project.envVars) {
        const envObj = {};
        for (const [key, value] of Object.entries(data.project.envVars)) {
          envObj[key] = value;
        }
        setEnvVars(envObj);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (section, data) => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await updateProject(projectId, data);
      setSuccess(`${section} saved successfully`);
      setTimeout(() => setSuccess(null), 3000);
      // Reload project to get updated data
      const data = await fetchJson(`/api/projects/${projectId}`);
      setProject(data.project);
      if (data.project.envVars) {
        const envObj = {};
        for (const [key, value] of Object.entries(data.project.envVars)) {
          envObj[key] = value;
        }
        setEnvVars(envObj);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEnvSave = async () => {
    await handleSave('Environment', { envVars });
  };

  const addEnvVar = () => {
    if (!newEnvKey.trim()) return;
    setEnvVars(prev => ({ ...prev, [newEnvKey]: newEnvValue }));
    setNewEnvKey('');
    setNewEnvValue('');
  };

  const removeEnvVar = (key) => {
    setEnvVars(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleRegisterWebhook = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await registerWebhook(projectId);
      setWebhookSecret(result.webhook?.secret || 'Secret displayed once');
      setShowWebhookSecret(true);
      setSuccess('Webhook registered successfully');
      setTimeout(() => setSuccess(null), 3000);
      const data = await fetchJson(`/api/projects/${projectId}`);
      setProject(data.project);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUnregisterWebhook = async () => {
    if (!confirm('Unregister webhook? This will stop automatic deployments on push.')) return;
    setSaving(true);
    setError(null);
    try {
      await unregisterWebhook(projectId);
      setSuccess('Webhook unregistered');
      setTimeout(() => setSuccess(null), 3000);
      const data = await fetchJson(`/api/projects/${projectId}`);
      setProject(data.project);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${project?.name}"? This action cannot be undone.`)) return;
    setSaving(true);
    try {
      await fetchJson(`/api/projects/${projectId}`, { method: 'DELETE' });
      router.push('/projects');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
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

  const webhookUrl = project.webhook?.active
    ? `${project.webhook.url || ''}`
    : '';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Link href={`/projects/${projectId}`} className="text-sm text-muted hover:text-foreground mb-2 inline-flex items-center gap-1">
            <ChevronLeftIcon className="h-4 w-4" />
            Project Detail
          </Link>
          <h1 className="text-2xl font-semibold">Settings</h1>
          <p className="text-sm text-muted mt-1">Configure {project.name}</p>
        </div>
      </div>

      {success && (
        <div className="rounded-lg bg-success/10 border border-success/20 p-3 text-success text-sm animate-in slide-in-from-top-2">
          {success}
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-danger/10 border border-danger/20 p-3 text-danger text-sm animate-in slide-in-from-top-2">
          {error}
        </div>
      )}

      <Tabs defaultValue="general" aria-label="Project settings">
        <TabsList className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="build">Build & Deploy</TabsTrigger>
          <TabsTrigger value="domain">Domain</TabsTrigger>
          <TabsTrigger value="env">Environment</TabsTrigger>
          <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
          <TabsTrigger value="danger">Danger Zone</TabsTrigger>
        </TabsList>

        {/* General Tab */}
        <TabsContent value="general">
          <Panel className="space-y-4">
            <h2 className="text-lg font-medium flex items-center gap-2">
              <SettingsIcon className="h-5 w-5" />
              General Settings
            </h2>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="name" className="block text-sm font-medium mb-1">
                  Project Name
                </Label>
                <Input
                  id="name"
                  defaultValue={project.name}
                  onBlur={(e) => handleSave('General', { name: e.target.value })}
                  disabled={saving}
                />
              </div>

              <div>
                <Label htmlFor="framework" className="block text-sm font-medium mb-1">
                  Framework
                </Label>
                <Select
                  options={FRAMEWORKS}
                  value={project.framework}
                  onChange={(value) => {
                    handleSave('General', { framework: value });
                    // Update defaults when framework changes
                    const defaults = DEFAULT_COMMANDS[value];
                    handleSave('Build & Deploy', {
                      installCommand: defaults.install,
                      buildCommand: defaults.build,
                      startCommand: defaults.start,
                      outputDirectory: defaults.output,
                    });
                  }}
                  disabled={saving}
                  placeholder="Select framework"
                />
              </div>

              <div>
                <Label htmlFor="branch" className="block text-sm font-medium mb-1">
                  Branch
                </Label>
                <Input
                  id="branch"
                  defaultValue={project.branch || project.defaultBranch || 'main'}
                  onBlur={(e) => handleSave('General', { branch: e.target.value })}
                  disabled={saving}
                />
              </div>

              <div>
                <Label htmlFor="defaultBranch" className="block text-sm font-medium mb-1">
                  Default Branch (from GitHub)
                </Label>
                <Input
                  id="defaultBranch"
                  defaultValue={project.defaultBranch || 'main'}
                  readOnly
                  className="bg-muted"
                />
              </div>

              <div className="flex items-center gap-2">
                <Link href={`https://github.com/${project.repoFullName}`} target="_blank" rel="noopener noreferrer">
                  <Button variant="outline">
                    <ExternalLinkIcon className="mr-2 h-4 w-4" />
                    View on GitHub
                  </Button>
                </Link>
              </div>
            </div>
          </Panel>
        </TabsContent>

        {/* Build & Deploy Tab */}
        <TabsContent value="build">
          <Panel className="space-y-4">
            <h2 className="text-lg font-medium flex items-center gap-2">
              <GitBranchIcon className="h-5 w-5" />
              Build & Deploy
            </h2>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="installCommand" className="block text-sm font-medium mb-1">
                  Install Command
                </Label>
                <Input
                  id="installCommand"
                  defaultValue={project.installCommand || DEFAULT_COMMANDS[project.framework]?.install || 'npm ci'}
                  onBlur={(e) => handleSave('Build & Deploy', { installCommand: e.target.value })}
                  disabled={saving}
                />
              </div>

              <div>
                <Label htmlFor="buildCommand" className="block text-sm font-medium mb-1">
                  Build Command
                </Label>
                <Input
                  id="buildCommand"
                  defaultValue={project.buildCommand || DEFAULT_COMMANDS[project.framework]?.build || 'npm run build'}
                  onBlur={(e) => handleSave('Build & Deploy', { buildCommand: e.target.value })}
                  disabled={saving}
                />
              </div>

              <div>
                <Label htmlFor="startCommand" className="block text-sm font-medium mb-1">
                  Start Command (for Node.js apps)
                </Label>
                <Input
                  id="startCommand"
                  defaultValue={project.startCommand || DEFAULT_COMMANDS[project.framework]?.start || 'npm start'}
                  onBlur={(e) => handleSave('Build & Deploy', { startCommand: e.target.value })}
                  disabled={saving}
                />
              </div>

              <div>
                <Label htmlFor="outputDirectory" className="block text-sm font-medium mb-1">
                  Output Directory
                </Label>
                <Input
                  id="outputDirectory"
                  defaultValue={project.outputDirectory || DEFAULT_COMMANDS[project.framework]?.output || '.next'}
                  onBlur={(e) => handleSave('Build & Deploy', { outputDirectory: e.target.value })}
                  disabled={saving}
                />
              </div>

              <p className="text-sm text-muted">
                Framework-specific defaults will be applied when you change the framework in the General tab.
              </p>
            </div>
          </Panel>
        </TabsContent>

        {/* Domain Tab */}
        <TabsContent value="domain">
          <Panel className="space-y-4">
            <h2 className="text-lg font-medium flex items-center gap-2">
              <GlobeIcon className="h-5 w-5" />
              Domain Settings
            </h2>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="subdomain" className="block text-sm font-medium mb-1">
                  Subdomain <span className="text-danger">*</span>
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="subdomain"
                    defaultValue={project.subdomain || ''}
                    placeholder="myapp"
                    pattern="^[a-z0-9-]+$"
                    maxLength={63}
                    onBlur={(e) => handleSave('Domain', { subdomain: e.target.value.toLowerCase() })}
                    disabled={saving}
                  />
                  <span className="text-muted">.yourdomain.com</span>
                </div>
                <p className="text-sm text-muted">
                  Lowercase alphanumeric with hyphens only. Max 63 characters.
                </p>
              </div>

              <div>
                <Label htmlFor="domain" className="block text-sm font-medium mb-1">
                  Custom Domain (optional)
                </Label>
                <Input
                  id="domain"
                  defaultValue={project.domain || ''}
                  placeholder="example.com"
                  onBlur={(e) => handleSave('Domain', { domain: e.target.value })}
                  disabled={saving}
                />
                <p className="text-sm text-muted">
                  Add a custom domain after configuring DNS.
                </p>
              </div>

              <div className="bg-muted/50 rounded-lg p-4">
                <Label className="block text-sm font-medium mb-1">Document Root</Label>
                <p className="text-sm text-muted font-mono">
                  {project.documentRoot || 'Not configured (set after first deploy)'}
                </p>
                <p className="text-xs text-muted mt-1">
                  This is auto-configured when the subdomain is created via cPanel.
                </p>
              </div>
            </div>
          </Panel>
        </TabsContent>

        {/* Environment Tab */}
        <TabsContent value="env">
          <Panel className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium flex items-center gap-2">
                <KeyIcon className="h-5 w-5" />
                Environment Variables
              </h2>
              <Button variant="outline" size="sm" onClick={addEnvVar} disabled={saving || !newEnvKey.trim()}>
                Add Variable
              </Button>
            </div>

            <div className="space-y-2">
              {Object.entries(envVars).length === 0 ? (
                <p className="text-sm text-muted text-center py-8">
                  No environment variables configured. Add your first variable above.
                </p>
              ) : (
                <div className="space-y-2">
                  {Object.entries(envVars).map(([key, value]) => (
                    <div key={key} className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                      <Input
                        defaultValue={key}
                        readOnly
                        className="w-40 bg-transparent border-none font-mono text-sm"
                      />
                      <span className="text-muted">=</span>
                      <Input
                        type={showWebhookSecret ? 'text' : 'password'}
                        defaultValue={value}
                        readOnly
                        className="flex-1 bg-transparent border-none font-mono text-sm"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeEnvVar(key)}
                        disabled={saving}
                        className="text-danger hover:text-danger"
                      >
                        <Trash2Icon className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2 p-3 bg-muted/50 rounded-lg">
                <Input
                  placeholder="KEY"
                  value={newEnvKey}
                  onChange={(e) => setNewEnvKey(e.target.value)}
                  className="w-40"
                  disabled={saving}
                />
                <Input
                  type="password"
                  placeholder="VALUE"
                  value={newEnvValue}
                  onChange={(e) => setNewEnvValue(e.target.value)}
                  className="flex-1"
                  disabled={saving}
                />
                <Button variant="outline" size="sm" onClick={addEnvVar} disabled={saving || !newEnvKey.trim()}>
                  Add
                </Button>
              </div>

              <div className="flex gap-2">
                <Button onClick={handleEnvSave} disabled={saving}>
                  {saving ? 'Saving...' : 'Save Environment Variables'}
                </Button>
              </div>

              <p className="text-sm text-muted">
                Values are encrypted at rest. They are never returned in plaintext from the API.
              </p>
            </div>
          </Panel>
        </TabsContent>

        {/* Webhooks Tab */}
        <TabsContent value="webhooks">
          <Panel className="space-y-4">
            <h2 className="text-lg font-medium flex items-center gap-2">
              <WebhookIcon className="h-5 w-5" />
              GitHub Webhook
            </h2>

            <div className="space-y-4">
              <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
                <div className="flex-1">
                  <p className="text-sm font-medium">Status</p>
                  <p className={cn('text-lg font-medium', project.webhook?.active ? 'text-success' : 'text-muted')}>
                    {project.webhook?.active ? 'Active' : 'Inactive'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {project.webhook?.active ? (
                    <Button variant="outline" onClick={handleUnregisterWebhook} disabled={saving}>
                      <UnlinkIcon className="mr-2 h-4 w-4" />
                      Unregister
                    </Button>
                  ) : (
                    <Button onClick={handleRegisterWebhook} disabled={saving}>
                      <WebhookIcon className="mr-2 h-4 w-4" />
                      Register Webhook
                    </Button>
                  )}
                </div>
              </div>

              {project.webhook?.active && (
                <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
                  <p className="text-sm font-medium">Webhook URL</p>
                  <p className="text-sm font-mono text-muted break-all">
                    {project.webhook.url || `${project.webhook.url || ''}`}
                  </p>
                  <p className="text-sm font-medium">Secret</p>
                  <div className="flex items-center gap-2">
                    <Input
                      type={showWebhookSecret ? 'text' : 'password'}
                      defaultValue={webhookSecret || '••••••••'}
                      readOnly
                      className="flex-1 font-mono"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowWebhookSecret(!showWebhookSecret)}
                    >
                      {showWebhookSecret ? <LockIcon className="h-4 w-4" /> : <UnlockIcon className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted">
                    Secret is shown only once after registration. Save it securely.
                  </p>
                </div>
              )}

              <div className="p-4 bg-muted/50 rounded-lg">
                <p className="text-sm font-medium mb-2">How it works</p>
                <ul className="text-sm text-muted space-y-1 list-disc list-inside">
                  <li>Registering creates a webhook in your GitHub repo pointing to this cShip instance</li>
                  <li>On push to the configured branch, GitHub sends a payload to trigger a deployment</li>
                  <li>Deployments are queued and run sequentially (max 1 at a time)</li>
                  <li>Unregistering removes the webhook from GitHub</li>
                </ul>
              </div>
            </div>
          </Panel>
        </TabsContent>

        {/* Danger Zone Tab */}
        <TabsContent value="danger">
          <Panel className="space-y-6">
            <div className="border-l-4 border-danger/30 pl-4">
              <h2 className="text-lg font-medium flex items-center gap-2 text-danger">
                <AlertTriangleIcon className="h-5 w-5" />
                Danger Zone
              </h2>
              <p className="text-sm text-muted mt-1">
                Irreversible actions. Please proceed with caution.
              </p>
            </div>

            <div className="p-4 bg-danger/5 border border-danger/20 rounded-lg">
              <h3 className="font-medium text-danger mb-2 flex items-center gap-2">
                <Trash2Icon className="h-5 w-5" />
                Delete Project
              </h3>
              <p className="text-sm text-muted mb-4">
                This will permanently delete the project, all its deployment history, and cannot be undone.
                Any associated webhook will also be removed from GitHub.
              </p>
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={saving}
                className="w-full"
              >
                {saving ? 'Deleting...' : 'Delete Project'}
              </Button>
            </div>
          </Panel>
        </TabsContent>
      </Tabs>
    </div>
  );
}