'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';
import { ChevronLeftIcon, ChevronRightIcon, CheckIcon, GithubIcon, GitBranchIcon, LoaderIcon } from '@/components/icons';
import { RepoSelector } from '@/components/RepoSelector';
import { BranchSelector } from '@/components/BranchSelector';
import { fetchJson } from '@/lib/api';

const STEPS = [
  { key: 'repo', label: 'Repository', icon: GithubIcon },
  { key: 'branch', label: 'Branch', icon: GitBranchIcon },
  { key: 'create', label: 'Create', icon: CheckIcon },
];

export default function NewProjectPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [repos, setRepos] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [formData, setFormData] = useState({
    repoFullName: '',
    branch: '',
    name: '',
  });

  useEffect(() => {
    if (step === 0) {
      loadRepos();
    }
  }, [step]);

  const loadRepos = async () => {
    setLoading(true);
    try {
      const data = await fetchJson('/api/github/repos');
      setRepos(data.repos || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadBranches = async (repoFullName) => {
    setLoading(true);
    setBranches([]);
    try {
      const data = await fetchJson(`/api/github/repos/${repoFullName}/branches`);
      setBranches(data.branches || []);
      if (data.branches?.length > 0) {
        setFormData(prev => ({ ...prev, branch: data.branches[0].name }));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleNext = () => {
    if (step === 0 && formData.repoFullName) {
      loadBranches(formData.repoFullName);
      setStep(1);
    } else if (step === 1 && formData.branch) {
      setFormData(prev => ({ ...prev, name: prev.name || formData.repoFullName.split('/')[1] }));
      setStep(2);
    }
  };

  const handleBack = () => {
    setStep(prev => Math.max(0, prev - 1));
  };

  const handleSubmit = async () => {
    if (!formData.repoFullName || !formData.branch || !formData.name) return;
    setLoading(true);
    setError(null);
    try {
      await fetchJson('/api/projects', {
        method: 'POST',
        body: JSON.stringify({
          repoFullName: formData.repoFullName,
          defaultBranch: formData.branch,
          name: formData.name,
        }),
      });
      router.push('/projects');
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const currentStep = STEPS[step];
  const isLastStep = step === STEPS.length - 1;

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold">New Project</h1>
        <p className="text-muted">Connect a GitHub repository and configure deployment</p>
      </div>

      {/* Progress indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {STEPS.map((s, i) => (
            <div key={s.key} className="flex flex-col items-center">
              <div
                className={cn(
                  'relative flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors',
                  i < step
                    ? 'border-accent bg-accent text-background'
                    : i === step
                    ? 'border-accent bg-background text-accent'
                    : 'border-border/60 bg-background text-muted'
                )}
              >
                {i < step ? <CheckIcon className="h-5 w-5" /> : <s.icon className="h-5 w-5" />}
              </div>
              <span className={cn('mt-1.5 text-xs text-center', i <= step ? 'text-foreground' : 'text-muted')}>
                {s.label}
              </span>
              {i < STEPS.length - 1 && (
                <div
                  className={cn(
                    'absolute top-5 left-1/2 w-full h-0.5 -translate-x-1/2',
                    i < step ? 'bg-accent' : 'bg-border/60'
                  )}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-md bg-danger/10 p-3 text-sm text-danger" role="alert">
          {error}
        </div>
      )}

      <Panel className="space-y-6">
        {/* Step 1: Repository */}
        {step === 0 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-medium">Choose Repository</h2>
              <p className="text-sm text-muted">Select a GitHub repository to deploy</p>
            </div>
            <RepoSelector
              repos={repos}
              value={formData.repoFullName}
              onChange={(value) => setFormData(prev => ({ ...prev, repoFullName: value }))}
              disabled={loading}
              placeholder="Select a repository"
            />
            {loading && (
              <div className="flex items-center gap-2 text-sm text-muted">
                <LoaderIcon className="h-4 w-4 animate-spin" />
                Loading repositories…
              </div>
            )}
          </div>
        )}

        {/* Step 2: Branch */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-medium">Choose Branch</h2>
              <p className="text-sm text-muted">Select the branch to deploy</p>
            </div>
            <BranchSelector
              branches={branches}
              repoFullName={formData.repoFullName}
              value={formData.branch}
              onChange={(value) => setFormData(prev => ({ ...prev, branch: value }))}
              disabled={loading}
              placeholder="Select a branch"
            />
            {loading && (
              <div className="flex items-center gap-2 text-sm text-muted">
                <LoaderIcon className="h-4 w-4 animate-spin" />
                Loading branch info…
              </div>
            )}
          </div>
        )}

        {/* Step 3: Create */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-medium">Confirm & Create</h2>
              <p className="text-sm text-muted">Review your configuration</p>
            </div>
            <div className="space-y-3 rounded-md border border-border/60 bg-raised/50 p-4">
              <div className="flex items-center gap-2 text-sm">
                <GithubIcon className="h-4 w-4 text-muted" />
                <span className="font-medium">{formData.repoFullName}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <GitBranchIcon className="h-4 w-4 text-muted" />
                <span className="font-medium">{formData.branch}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="w-8 h-4 text-muted">Name</span>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="flex-1 rounded-md border border-border/80 bg-background px-2 py-1.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                />
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between border-t border-border/60 pt-6">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={step === 0 || loading}
          >
            <ChevronLeftIcon className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div className="flex gap-2 ml-auto">
            {isLastStep ? (
              <Button
                onClick={handleSubmit}
                disabled={loading || !formData.repoFullName || !formData.branch || !formData.name}
              >
                {loading ? (
                  <>
                    <LoaderIcon className="mr-2 h-4 w-4 animate-spin" />
                    Creating…
                  </>
                ) : (
                  'Create Project'
                )}
              </Button>
            ) : (
              <Button onClick={handleNext} disabled={loading || !formData.repoFullName || (step === 1 && !formData.branch)}>
                Next
                <ChevronRightIcon className="ml-2 h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </Panel>
    </div>
  );
}

function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}