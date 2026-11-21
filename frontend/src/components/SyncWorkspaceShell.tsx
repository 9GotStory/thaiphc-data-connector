import {
  ArrowLeft,
  Database,
  FileSpreadsheet,
  Info,
  Lock,
  OctagonAlert,
  RotateCw,
} from 'lucide-react';
import { GasRpcClientError, type DashboardStatusData, type DatasetEndpoint } from '@/api/types';
import {
  DatasetStatusBadge,
  EnvironmentBadge,
  SyncModeBadge,
  WriteGuardBadge,
} from '@/components/StatusBadges';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { DATASET_DISPLAY_META } from '@/lib/datasetMeta';
import { formatBangkokDateTime, formatRowCount } from '@/lib/formatters';
import { cn } from '@/lib/utils';

const PSEUDONYMIZED_ENDPOINTS: ReadonlySet<DatasetEndpoint> = new Set([
  'assignments',
  'resigned-volunteers',
  'volunteer-tenure',
]);

interface SyncWorkspaceShellProps {
  data: DashboardStatusData | undefined;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  selectedEndpoint: DatasetEndpoint;
  onSelectEndpoint: (endpoint: DatasetEndpoint) => void;
  onRefresh: () => void;
  onBackToDashboard: () => void;
}

export function SyncWorkspaceShell({
  data,
  isPending,
  isError,
  error,
  selectedEndpoint,
  onSelectEndpoint,
  onRefresh,
  onBackToDashboard,
}: SyncWorkspaceShellProps) {
  const selectedDataset = data?.datasets.find((d) => d.endpoint === selectedEndpoint);
  const selectedMeta = DATASET_DISPLAY_META[selectedEndpoint];
  const isExtended = selectedDataset?.group === 'extended_report';
  const requiresHmacKey = PSEUDONYMIZED_ENDPOINTS.has(selectedEndpoint);
  const targetWriteAllowed = data
    ? isExtended
      ? data.guards.writeEnabled &&
        data.guards.personDataWriteEnabled &&
        data.guards.reportWorkbookApproved &&
        (!requiresHmacKey || data.guards.hmacKeyConfigured)
      : data.guards.writeEnabled
    : false;

  const referenceDatasets = data ? data.datasets.filter((d) => d.group === 'reference') : [];
  const extendedDatasets = data ? data.datasets.filter((d) => d.group === 'extended_report') : [];

  return (
    <div className="mx-auto max-w-[1280px] space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-[1.375rem] font-semibold leading-[1.35] tracking-tight text-foreground">
            พื้นที่ซิงก์ข้อมูล (Sync Workspace)
          </h1>
          <p className="text-sm text-muted-foreground">
            เลือก 1 ชุดข้อมูลต่อรอบการซิงก์ (Repeatable Sync) ภายใต้ขอบเขต จ.แพร่ (54) / อ.สอง (5406)
          </p>
        </div>
        <Button variant="outline" onClick={onBackToDashboard} className="w-full sm:w-auto">
          <ArrowLeft className="size-4 shrink-0" aria-hidden="true" />
          <span>กลับหน้าภาพรวม (Dashboard)</span>
        </Button>
      </div>

      {isPending && (
        <Card aria-busy="true" aria-label="กำลังโหลดข้อมูลพื้นที่ซิงก์">
          <CardContent className="p-5 space-y-3">
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-4 w-96 max-w-full" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          </CardContent>
        </Card>
      )}

      {!isPending && (isError || !data) && (
        <Alert variant="stop" role="alert" className="space-y-3">
          <div className="flex items-start gap-3">
            <OctagonAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            <div className="space-y-1.5 min-w-0">
              <AlertTitle>ไม่สามารถโหลดสถานะระบบสำหรับพื้นที่ซิงก์ข้อมูลได้</AlertTitle>
              <Badge variant="stop" className="font-mono font-semibold">
                {error instanceof GasRpcClientError ? error.code : 'DASHBOARD_LOAD_FAILED'}
              </Badge>
              <AlertDescription className="text-foreground">
                {error instanceof GasRpcClientError
                  ? error.message
                  : 'กรุณาลองโหลดสถานะระบบอีกครั้งก่อนเริ่มทำงานในพื้นที่ซิงก์ข้อมูล'}
              </AlertDescription>
            </div>
          </div>
          <div>
            <Button variant="outline" onClick={onRefresh}>
              <RotateCw className="size-4 shrink-0" aria-hidden="true" />
              <span>ลองโหลดสถานะอีกครั้ง</span>
            </Button>
          </div>
        </Alert>
      )}

      {selectedDataset?.lastStatus === 'UNRESOLVED_PREVIOUS_RUN' && (
        <Alert variant="stop" role="alert">
          <div className="flex items-start gap-3">
            <OctagonAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
            <div className="space-y-1">
              <AlertTitle>
                ชุดข้อมูล <code className="font-mono">{selectedDataset.endpoint}</code> มีสถานะ{' '}
                <code className="font-mono">UNRESOLVED_PREVIOUS_RUN</code>
              </AlertTitle>
              <AlertDescription className="text-foreground">
                กรุณาตรวจสอบแท็บปลายทาง{' '}
                <code className="font-mono">{selectedDataset.destinationTab}</code> และ{' '}
                <code className="font-mono">_ThaiPHCSyncLog</code> ใน Google Sheets ก่อนดำเนินการรอบ
                Preview ใหม่ (ระบบไม่ลองเขียนซ้ำอัตโนมัติ)
              </AlertDescription>
            </div>
          </div>
        </Alert>
      )}

      {selectedDataset && data && (
        <section aria-labelledby="selected-dataset-heading">
          <Card>
            <CardHeader className="border-b border-border/70">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <h2
                    id="selected-dataset-heading"
                    className="text-[1.0625rem] font-semibold leading-[1.4] text-foreground"
                  >
                    ชุดข้อมูลที่เลือก: {selectedMeta.thaiName}{' '}
                    <code className="font-mono text-xs text-muted-foreground">
                      ({selectedDataset.endpoint})
                    </code>
                  </h2>
                  <CardDescription>
                    แท็บปลายทาง: <code className="font-mono">{selectedDataset.destinationTab}</code>{' '}
                    · โปรโตคอลแบ่งหน้า:{' '}
                    <code className="font-mono">{selectedDataset.paginationProtocol}</code>
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <EnvironmentBadge env={data.env} />
                  <SyncModeBadge syncMode={selectedDataset.syncMode} />
                  <DatasetStatusBadge status={selectedDataset.lastStatus} />
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                <div className="rounded-md border border-border bg-muted/50 p-3">
                  <div className="text-xs text-muted-foreground">จำนวนแถวปลายทางปัจจุบัน</div>
                  <div className="mt-1 font-mono text-lg font-semibold tabular-nums text-foreground">
                    {formatRowCount(selectedDataset.rowCount)}
                  </div>
                </div>
                <div className="rounded-md border border-border bg-muted/50 p-3">
                  <div className="text-xs text-muted-foreground">ซิงก์ล่าสุด (Asia/Bangkok)</div>
                  <div className="mt-1 font-mono text-sm font-medium tabular-nums text-foreground">
                    {formatBangkokDateTime(selectedDataset.lastSyncedAtUtc)}
                  </div>
                </div>
                <div className="rounded-md border border-border bg-muted/50 p-3 space-y-1">
                  <div className="text-xs text-muted-foreground">สถานะ Write Guard สำหรับชุดนี้</div>
                  <WriteGuardBadge enabled={targetWriteAllowed} />
                </div>
              </div>

              {isExtended && (
                <div className="flex items-start gap-2 rounded-md border border-border border-l-4 border-l-primary bg-muted/70 p-3 text-xs text-foreground">
                  <Lock className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                  <span>
                    ชุดข้อมูลรายงานขยายผ่านการลดทอนข้อมูลส่วนบุคคล (Minimized Projection) ฝั่ง GAS
                    ก่อนส่งกลับมายังเบราว์เซอร์ — ไม่แสดงเลขบัตรประชาชน ชื่อ-สกุล ที่อยู่ หรือรหัส อสม.
                  </span>
                </div>
              )}

              <Alert variant="info" role="status">
                <div className="flex items-start gap-2.5">
                  <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                  <div className="space-y-1">
                    <div className="font-semibold text-foreground">
                      โครงสร้างพื้นที่ซิงก์พร้อมใช้งาน (Vertical Shell Ready)
                    </div>
                    <p className="text-xs text-muted-foreground">
                      ขั้นตอนรับ Bearer Token ในหน่วยความจำ, Batched Preview, Diff Inspector,
                      Confirmation Gate และ Destination Readback จะเปิดใช้งานตามรอบงานถัดไป (Tickets
                      03–07)
                    </p>
                  </div>
                </div>
              </Alert>
            </CardContent>
          </Card>
        </section>
      )}

      {data && (
        <section aria-labelledby="workspace-dataset-switcher-heading">
          <Card>
            <CardHeader>
              <h2
                id="workspace-dataset-switcher-heading"
                className="text-[1.0625rem] font-semibold leading-[1.4] text-foreground"
              >
                สลับชุดข้อมูลที่ต้องการตรวจสอบ (8 APIs)
              </h2>
              <CardDescription>
                เลือกดูบริบทของแต่ละชุดข้อมูลแบบในหน่วยความจำ แบ่งกลุ่ม Reference Datasets (3) และ Extended
                Report Datasets (5) (Iframe-safe, ไม่เปลี่ยน URL)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2" role="group" aria-labelledby="ws-group-ref-heading">
                <h3
                  id="ws-group-ref-heading"
                  className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"
                >
                  <Database className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                  <span>ชุดข้อมูลอ้างอิงพื้นฐาน (Reference Datasets · 3 APIs)</span>
                </h3>
                <div className="flex flex-wrap gap-2">
                  {referenceDatasets.map((ds) => {
                    const meta = DATASET_DISPLAY_META[ds.endpoint];
                    const isSelected = ds.endpoint === selectedEndpoint;
                    return (
                      <button
                        key={ds.endpoint}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => onSelectEndpoint(ds.endpoint)}
                        className={cn(
                          'inline-flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-medium transition-colors duration-150 cursor-pointer min-h-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                          isSelected
                            ? 'border-primary bg-primary-soft text-primary-soft-foreground'
                            : 'border-border bg-card text-foreground hover:bg-muted',
                        )}
                      >
                        <span>{meta.thaiName}</span>
                        <Badge variant="neutral" className="font-mono text-[0.7rem] px-1.5 py-0">
                          {ds.endpoint}
                        </Badge>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2" role="group" aria-labelledby="ws-group-ext-heading">
                <h3
                  id="ws-group-ext-heading"
                  className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"
                >
                  <FileSpreadsheet className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                  <span>ชุดข้อมูลรายงานขยาย (Extended Report Datasets · 5 APIs)</span>
                </h3>
                <div className="flex flex-wrap gap-2">
                  {extendedDatasets.map((ds) => {
                    const meta = DATASET_DISPLAY_META[ds.endpoint];
                    const isSelected = ds.endpoint === selectedEndpoint;
                    return (
                      <button
                        key={ds.endpoint}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => onSelectEndpoint(ds.endpoint)}
                        className={cn(
                          'inline-flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-medium transition-colors duration-150 cursor-pointer min-h-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                          isSelected
                            ? 'border-primary bg-primary-soft text-primary-soft-foreground'
                            : 'border-border bg-card text-foreground hover:bg-muted',
                        )}
                      >
                        <span>{meta.thaiName}</span>
                        <Badge variant="neutral" className="font-mono text-[0.7rem] px-1.5 py-0">
                          {ds.endpoint}
                        </Badge>
                      </button>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}
