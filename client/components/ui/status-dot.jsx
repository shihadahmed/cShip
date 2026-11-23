import { cn } from '@/lib/cn';

const TONES = {
  accent: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  muted: 'bg-muted/60',
};

export function StatusDot({ tone = 'muted', pulse = false, className }) {
  const toneClass = TONES[tone] ?? TONES.muted;

  return (
    <span
      className={cn('relative inline-flex h-2 w-2', className)}
      aria-hidden="true"
    >
      {pulse ? (
        <span
          className={cn(
            'absolute inline-flex h-full w-full animate-ping rounded-full opacity-40',
            toneClass,
          )}
        />
      ) : null}
      <span
        className={cn('relative inline-flex h-2 w-2 rounded-full', toneClass)}
      />
    </span>
  );
}
