import { cn } from '@/lib/cn';

export function Panel({ className, children, ...props }) {
  return (
    <section
      className={cn(
        'rounded-lg border border-border/80 bg-panel/70 shadow-panel backdrop-blur-[2px]',
        className,
      )}
      {...props}
    >
      {children}
    </section>
  );
}

export function PanelHeader({ title, description, action, className }) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-4 border-b border-border/70 px-5 py-4',
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-sm font-medium text-foreground">{title}</h2>
        {description ? (
          <p className="mt-1 text-xs leading-relaxed text-muted">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function PanelBody({ className, children }) {
  return <div className={cn('p-5', className)}>{children}</div>;
}
