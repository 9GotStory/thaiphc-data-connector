import { useState } from 'react';
import type { DatasetEndpoint } from '@/api/types';
import { AppHeader, type ActiveView, type HeaderStatusState } from '@/components/AppHeader';
import { DashboardView } from '@/components/DashboardView';
import { SyncWorkspaceShell } from '@/components/SyncWorkspaceShell';
import { useDashboardStatus } from '@/hooks/useDashboardStatus';

export function App() {
  const [activeView, setActiveView] = useState<ActiveView>('dashboard');
  const [selectedEndpoint, setSelectedEndpoint] = useState<DatasetEndpoint>('subdistricts');

  const dashboardQuery = useDashboardStatus();

  const headerStatusState: HeaderStatusState = dashboardQuery.isPending
    ? 'loading'
    : dashboardQuery.isError || !dashboardQuery.data
      ? 'error'
      : 'ready';

  function handleOpenSyncWorkspace(endpoint: DatasetEndpoint) {
    setSelectedEndpoint(endpoint);
    setActiveView('sync-workspace');
  }

  function handleRefresh() {
    void dashboardQuery.refetch();
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
      >
        ข้ามไปยังเนื้อหาหลัก
      </a>

      <AppHeader
        activeView={activeView}
        onNavigate={setActiveView}
        env={dashboardQuery.data?.env ?? null}
        statusState={headerStatusState}
      />

      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto max-w-[1440px] px-3 py-5 sm:px-5 lg:px-8 lg:py-6 focus:outline-none"
      >
        {activeView === 'dashboard' ? (
          <DashboardView
            data={dashboardQuery.data}
            isPending={dashboardQuery.isPending}
            isFetching={dashboardQuery.isFetching}
            isError={dashboardQuery.isError}
            error={dashboardQuery.error}
            onRefresh={handleRefresh}
            onOpenSyncWorkspace={handleOpenSyncWorkspace}
          />
        ) : (
          <SyncWorkspaceShell
            data={dashboardQuery.data}
            isPending={dashboardQuery.isPending}
            isError={dashboardQuery.isError}
            error={dashboardQuery.error}
            selectedEndpoint={selectedEndpoint}
            onSelectEndpoint={setSelectedEndpoint}
            onRefresh={handleRefresh}
            onBackToDashboard={() => setActiveView('dashboard')}
          />
        )}
      </main>
    </div>
  );
}
