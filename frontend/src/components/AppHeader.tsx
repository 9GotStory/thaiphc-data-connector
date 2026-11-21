import { Database, LayoutDashboard, OctagonAlert } from 'lucide-react';
import type { AppEnvironment } from '@/api/types';
import { EnvironmentBadge } from '@/components/StatusBadges';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type ActiveView = 'dashboard' | 'sync-workspace';
export type HeaderStatusState = 'loading' | 'ready' | 'error';

interface AppHeaderProps {
  activeView: ActiveView;
  onNavigate: (view: ActiveView) => void;
  env: AppEnvironment | null;
  statusState: HeaderStatusState;
}

function HeaderEnvironmentPill({
  env,
  statusState,
}: {
  env: AppEnvironment | null;
  statusState: HeaderStatusState;
}) {
  if (statusState === 'ready' && env) {
    return <EnvironmentBadge env={env} />;
  }
  if (statusState === 'error') {
    return (
      <Badge variant="stop" className="font-mono font-semibold">
        <OctagonAlert className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        <span>LOAD_ERROR</span>
      </Badge>
    );
  }
  return <Badge variant="neutral">กำลังโหลด...</Badge>;
}

export function AppHeader({ activeView, onNavigate, env, statusState }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card shadow-[var(--shadow-xs)]">
      {env === 'PRODUCTION' && (
        <div
          data-testid="production-hazard-strip"
          aria-hidden="true"
          className="h-1 w-full bg-env-prod-strip"
        />
      )}
      <div className="mx-auto max-w-[1440px] px-3 sm:px-5 lg:px-8">
        <div className="flex flex-col gap-2 py-2.5 lg:h-16 lg:flex-row lg:items-center lg:justify-between lg:py-0">
          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <span className="text-base font-semibold tracking-tight text-foreground truncate">
                ThaiPHC Data Connector
              </span>
              <Badge variant="neutral" className="font-mono text-[0.75rem]">
                จ.แพร่ 54 · อ.สอง 5406
              </Badge>
            </div>
            <div className="lg:hidden shrink-0">
              <HeaderEnvironmentPill env={env} statusState={statusState} />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 lg:justify-end">
            <nav aria-label="เมนูหลัก" className="flex w-full items-center gap-1.5 lg:w-auto">
              <button
                type="button"
                aria-current={activeView === 'dashboard' ? 'page' : undefined}
                onClick={() => onNavigate('dashboard')}
                className={cn(
                  'inline-flex flex-1 lg:flex-none items-center justify-center gap-2 min-h-10 rounded-md border-b-2 px-3 py-2 text-sm font-medium transition-colors duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                  activeView === 'dashboard'
                    ? 'border-primary bg-primary-soft text-primary-soft-foreground'
                    : 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <LayoutDashboard
                  className="size-4 shrink-0"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                <span>ภาพรวม</span>
              </button>
              <button
                type="button"
                aria-current={activeView === 'sync-workspace' ? 'page' : undefined}
                onClick={() => onNavigate('sync-workspace')}
                className={cn(
                  'inline-flex flex-1 lg:flex-none items-center justify-center gap-2 min-h-10 rounded-md border-b-2 px-3 py-2 text-sm font-medium transition-colors duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                  activeView === 'sync-workspace'
                    ? 'border-primary bg-primary-soft text-primary-soft-foreground'
                    : 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Database className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                <span>พื้นที่ซิงก์ข้อมูล</span>
              </button>
            </nav>

            <div className="hidden lg:block shrink-0">
              <HeaderEnvironmentPill env={env} statusState={statusState} />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
