import { cn } from '@/lib/cn';

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50';

const VARIANTS = {
  primary: 'bg-accent text-accent-foreground hover:bg-accent/90',
  secondary:
    'border border-border/80 bg-panel/80 text-foreground hover:bg-raised/80',
  ghost: 'text-muted hover:bg-raised/60 hover:text-foreground',
};

const SIZES = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-9 px-4',
  lg: 'h-10 px-5',
};

export function buttonClassName({
  variant = 'primary',
  size = 'md',
  className,
} = {}) {
  return cn(BASE, VARIANTS[variant], SIZES[size], className);
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}) {
  return (
    <button
      type="button"
      className={buttonClassName({ variant, size, className })}
      {...props}
    />
  );
}
