'use client';

import { MoonIcon, SunIcon } from '@/components/icons';

export function ThemeToggle() {
  function toggleTheme() {
    const root = document.documentElement;
    const nextDark = !root.classList.contains('dark');
    root.classList.toggle('dark', nextDark);
    root.style.colorScheme = nextDark ? 'dark' : 'light';

    try {
      localStorage.setItem('cship-theme', nextDark ? 'dark' : 'light');
    } catch {
      // Storage can be unavailable in strict privacy modes.
    }
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label="Toggle color theme"
      className="flex h-8 w-8 items-center justify-center rounded-md border border-border/80 bg-panel/70 text-muted transition-colors hover:bg-raised/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
    >
      <MoonIcon className="h-4 w-4 dark:hidden" />
      <SunIcon className="hidden h-4 w-4 dark:block" />
    </button>
  );
}
