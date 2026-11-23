'use client';

import { createContext, useContext, useState } from 'react';
import { cn } from '@/lib/cn';

const TabsContext = createContext(null);

export function Tabs({ defaultValue, children, className }) {
  const [value, setValue] = useState(defaultValue);
  return (
    <TabsContext.Provider value={{ value, setValue }}>
      <div className={cn('space-y-4', className)}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({ children, className, 'aria-label': ariaLabel }) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('flex gap-1 border-b border-border/60', className)}
    >
      {children}
    </div>
  );
}

export function TabsTrigger({ value, children, className, disabled }) {
  const { value: currentValue, setValue } = useContext(TabsContext);
  const isActive = currentValue === value;

  return (
    <button
      role="tab"
      aria-selected={isActive}
      aria-controls={`panel-${value}`}
      id={`tab-${value}`}
      tabIndex={isActive ? 0 : -1}
      disabled={disabled}
      onClick={() => !disabled && setValue(value)}
      className={cn(
        'flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors',
        'hover:text-foreground/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        'border-b-2 border-transparent -mb-px',
        disabled ? 'opacity-50 cursor-not-allowed' : '',
        isActive
          ? 'text-accent border-accent'
          : 'text-muted hover:text-foreground/60',
        className
      )}
    >
      {children}
    </button>
  );
}

export function TabsContent({ value, children, className }) {
  const { value: currentValue } = useContext(TabsContext);
  const isActive = currentValue === value;

  if (!isActive) return null;

  return (
    <div
      role="tabpanel"
      id={`panel-${value}`}
      aria-labelledby={`tab-${value}`}
      className={cn('mt-4 animate-in fade-in-0 duration-200', className)}
    >
      {children}
    </div>
  );
}