'use client';

import { forwardRef } from 'react';
import { cn } from '@/lib/cn';

export const Input = forwardRef(
  function Input({ className, type = 'text', disabled, ...props }, ref) {
    return (
      <input
        type={type}
        ref={ref}
        disabled={disabled}
        className={cn(
          'flex h-10 w-full rounded-md border border-border/80 bg-background px-3 py-2 text-sm',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
          'placeholder:text-muted/60 disabled:opacity-50 disabled:cursor-not-allowed',
          'transition-colors',
          className
        )}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';