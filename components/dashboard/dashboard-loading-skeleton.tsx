'use client';

export function DashboardStatsLoadingSkeleton() {
  return (
    <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      {[1, 2, 3, 4].map((i) => (
        <div 
          key={i} 
          className="p-4 sm:p-6 rounded-xl bg-gradient-to-br from-slate-200 to-slate-100 dark:from-slate-700 dark:to-slate-800 animate-pulse"
        >
          <div className="h-4 w-32 bg-slate-300 dark:bg-slate-600 rounded mb-3"></div>
          <div className="h-8 w-16 bg-slate-300 dark:bg-slate-600 rounded mb-4"></div>
          <div className="h-6 w-full bg-slate-300 dark:bg-slate-600 rounded"></div>
        </div>
      ))}
    </div>
  );
}

export function DashboardAlertsLoadingSkeleton() {
  return (
    <div className="mb-8">
      <div className="h-6 w-40 bg-slate-300 dark:bg-slate-600 rounded mb-4 animate-pulse"></div>
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="p-4 rounded-lg bg-slate-200 dark:bg-slate-700 animate-pulse">
            <div className="h-4 w-32 bg-slate-300 dark:bg-slate-600 rounded mb-2"></div>
            <div className="h-3 w-48 bg-slate-300 dark:bg-slate-600 rounded mb-2"></div>
            <div className="h-3 w-24 bg-slate-300 dark:bg-slate-600 rounded"></div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardModulesLoadingSkeleton() {
  return (
    <div className="rounded-2xl p-8 md:p-12 mb-8 bg-gradient-to-r from-primary/5 to-primary/10 animate-pulse">
      <div className="h-8 w-64 bg-slate-300 dark:bg-slate-600 rounded mb-2"></div>
      <div className="h-4 w-96 bg-slate-300 dark:bg-slate-600 rounded mb-8"></div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div 
            key={i} 
            className="h-40 rounded-lg bg-slate-300 dark:bg-slate-600"
          ></div>
        ))}
      </div>
    </div>
  );
}
