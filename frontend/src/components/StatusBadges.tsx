import {
  CheckCircle2,
  Database,
  FlaskConical,
  Layers,
  MinusCircle,
  OctagonAlert,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
} from 'lucide-react';
import type { AppEnvironment, DatasetLastStatus, SyncMode } from '@/api/types';
import { Badge } from '@/components/ui/badge';

export function EnvironmentBadge({ env }: { env: AppEnvironment }) {
  if (env === 'PRODUCTION') {
    return (
      <Badge variant="productionSolid" className="font-mono font-semibold px-2.5 py-1">
        <ShieldAlert className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        <span>PRODUCTION</span>
      </Badge>
    );
  }
  return (
    <Badge variant="sandboxSolid" className="font-mono font-semibold px-2.5 py-1">
      <FlaskConical className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
      <span>SANDBOX</span>
    </Badge>
  );
}

export function SyncModeBadge({ syncMode }: { syncMode: SyncMode }) {
  if (syncMode === 'COMPLETE_SNAPSHOT') {
    return (
      <Badge variant="legacy">
        <Layers className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        <span className="font-mono font-semibold">Complete Snapshot</span>
      </Badge>
    );
  }
  return (
    <Badge variant="primarySoft">
      <Database className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
      <span className="font-mono font-semibold">Keyed Upsert</span>
    </Badge>
  );
}

export function DatasetStatusBadge({ status }: { status: DatasetLastStatus }) {
  switch (status) {
    case 'COMMITTED_VERIFIED':
      return (
        <Badge variant="verified">
          <CheckCircle2 className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          <span className="font-mono font-semibold">COMMITTED_VERIFIED</span>
          <span>· ยืนยันแล้ว</span>
        </Badge>
      );
    case 'UNRESOLVED_PREVIOUS_RUN':
      return (
        <Badge variant="stop">
          <OctagonAlert className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          <span className="font-mono font-semibold">UNRESOLVED_PREVIOUS_RUN</span>
          <span>· ค้างตรวจ</span>
        </Badge>
      );
    case 'FAILED_STOP':
      return (
        <Badge variant="stop">
          <OctagonAlert className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          <span className="font-mono font-semibold">FAILED_STOP</span>
          <span>· หยุดทำงาน</span>
        </Badge>
      );
    case 'NEVER_SYNCED':
      return (
        <Badge variant="neutral">
          <MinusCircle className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          <span className="font-mono font-semibold">NEVER_SYNCED</span>
          <span>· ยังไม่เคยซิงก์</span>
        </Badge>
      );
  }
}

export function WriteGuardBadge({
  enabled,
  compact = false,
}: {
  enabled: boolean;
  compact?: boolean;
}) {
  if (enabled) {
    return (
      <Badge variant="guardOn">
        <ShieldCheck className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        <span className="font-mono font-semibold">ON</span>
        {!compact && <span>· อนุญาตเขียน</span>}
      </Badge>
    );
  }
  return (
    <Badge variant="guardOff">
      <ShieldOff className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
      <span className="font-mono font-semibold">OFF</span>
      {!compact && <span>· ปิดการเขียน (Preview เท่านั้น)</span>}
    </Badge>
  );
}
