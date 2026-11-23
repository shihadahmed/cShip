'use client';

import { forwardRef } from 'react';
import { cn } from '@/lib/cn';

export const Label = forwardRef(
  function Label({ className, children, ...props }, ref) {
    return (
      <label
        ref={ref}
        className={cn(
          'text-sm font-medium text-foreground',
          className
        )}
        {...props}
      >
        {children}
      </label>
    );
  }
);

Label.displayName = 'Label';