'use client';

import { Sidebar } from '@/components/sidebar';
import { Topbar } from '@/components/topbar';
import { AuthProvider } from '@/lib/auth';

export default function DashboardLayout({ children }) {
  return (
    <AuthProvider>
      <div className="relative min-h-screen bg-background">
        <div
          aria-hidden="true"
          className="blueprint pointer-events-none fixed inset-0 opacity-70"
        />
        <div className="relative flex min-h-screen">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <Topbar />
            <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
              {children}
            </main>
          </div>
        </div>
      </div>
    </AuthProvider>
  );
}
