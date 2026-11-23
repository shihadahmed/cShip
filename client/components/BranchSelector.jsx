'use client';

import { useEffect, useState } from 'react';
import { Select } from '@/components/ui/Select';
import { GitBranchIcon } from '@/components/icons';
import { fetchLatestCommit } from '@/lib/api';

export function BranchSelector({ branches = [], value, onChange, repoFullName, disabled = false, placeholder = 'Select a branch' }) {
  const [enrichedBranches, setEnrichedBranches] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!branches.length || !repoFullName) {
      setEnrichedBranches(branches.map(b => ({ value: b.name, label: b.name })));
      return;
    }

    let mounted = true;
    setLoading(true);

    const enrichBranches = async () => {
      const enriched = await Promise.all(
        branches.map(async (branch) => {
          try {
            const { commit } = await fetchLatestCommit(
              repoFullName.split('/')[0],
              repoFullName.split('/')[1],
              branch.name
            );
            return {
              value: branch.name,
              label: branch.name,
              description: commit ? `${commit.sha.slice(0, 7)} — ${commit.message.split('\n')[0].slice(0, 50)}` : undefined,
            };
          } catch {
            return { value: branch.name, label: branch.name };
          }
        })
      );
      if (mounted) {
        setEnrichedBranches(enriched);
        setLoading(false);
      }
    };

    enrichBranches();

    return () => { mounted = false; };
  }, [branches, repoFullName]);

  return (
    <div className="w-full">
      <label className="block text-sm font-medium text-foreground mb-1.5">
        Branch
      </label>
      <Select
        options={enrichedBranches}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        searchable
        disabled={disabled || loading}
        name="branch"
      />
      {loading && (
        <p className="mt-1 text-xs text-muted">Loading commit info…</p>
      )}
    </div>
  );
}