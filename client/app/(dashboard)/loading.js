export default function DashboardLoading() {
  return (
    <div className="space-y-6" aria-label="Loading dashboard">
      <div className="space-y-2">
        <div className="h-4 w-64 animate-pulse rounded bg-raised" />
        <div className="h-9 w-40 animate-pulse rounded bg-raised" />
      </div>
      <div className="h-28 animate-pulse rounded-lg bg-raised/70" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <div className="h-72 animate-pulse rounded-lg bg-raised/60" />
          <div className="h-48 animate-pulse rounded-lg bg-raised/60" />
        </div>
        <div className="space-y-6">
          <div className="h-80 animate-pulse rounded-lg bg-raised/60" />
          <div className="h-56 animate-pulse rounded-lg bg-raised/60" />
        </div>
      </div>
    </div>
  );
}
