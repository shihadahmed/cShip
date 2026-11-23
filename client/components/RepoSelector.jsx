'use client';

import { Select } from '@/components/ui/Select';
import { GithubIcon } from '@/components/icons';

export function RepoSelector({ repos = [], value, onChange, disabled = false, placeholder = 'Select a repository' }) {
  const options = repos.map(repo => ({
    value: repo.full_name,
    label: repo.full_name,
    description: repo.private ? 'Private' : 'Public',
  }));

  return (
    <div className="w-full">
      <label className="block text-sm font-medium text-foreground mb-1.5">
        Repository
      </label>
      <Select
        options={options}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        searchable
        disabled={disabled}
        name="repoFullName"
      />
    </div>
  );
}