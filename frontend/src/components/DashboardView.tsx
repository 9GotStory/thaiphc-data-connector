import {
  ArrowRight,
  FileSpreadsheet,
  Lock,
  OctagonAlert,
  RotateCw,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import {
  GasRpcClientError,
  type DashboardStatusData,
  type DatasetEndpoint,
  type SameWorkbookPolicy,
} from '@/api/types';
import { CopyableIdentifier } from '@/components/CopyableIdentifier';
import { DatasetGroupCard } from '@/components/DatasetGroupCard';
import { EnvironmentBadge, WriteGuardBadge } from '@/components/StatusBadges';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  formatBangkokDateTime,
  formatBangkokLongDateTime,
  maskSpreadsheetId,
} from '@/lib/formatters';
import { cn } from '@/lib/utils';

interface DashboardViewProps {
  data: DashboardStatusData | undefined;
  isPending: boolean;
  isFetching: boolean;
  isError: boolean;
  error: unknown;
  onRefresh: () => void;
  onOpenSyncWorkspace: (endpoint: DatasetEndpoint) => void;
}

interface PolicyBadgeConfig {
  variant: BadgeProps['variant'];
  icon: 'separate' | 'lock' | 'stop';
  propertyKey: string;
  code: string;
  headerThaiLabel: string;
  stripThaiLabel: string;
}

const SAME_WORKBOOK_POLICY_META: Readonly<Record<SameWorkbookPolicy, PolicyBadgeConfig>> = {
  SEPARATE_WORKBOOK: {
    variant: 'neutral',
    icon: 'separate',
    propertyKey: 'THAIPHC_REPORT_SPREADSHEET_ID',
    code: 'SEPARATE_WORKBOOK',
    headerThaiLabel: 'แยกสมุดงานรายงาน',
    stripThaiLabel: 'แยกสมุดงานรายงาน',
  },
  SAME_WORKBOOK_APPROVED: {
    variant: 'legacy',
    icon: 'lock',
    propertyKey: 'THAIPHC_SAME_WORKBOOK_APPROVAL',
    code: 'OWNER_ONLY_5406_APPROVED',
    headerThaiLabel: 'ใช้สมุดงานเดียวกัน',
    stripThaiLabel: 'อนุมัติสมุดงานเดียวกัน',
  },
  SAME_WORKBOOK_UNAPPROVED: {
    variant: 'stop',
    icon: 'stop',
    propertyKey: 'THAIPHC_SAME_WORKBOOK_APPROVAL',
    code: 'STOP',
    headerThaiLabel: 'ยังไม่อนุมัติการเขียนรายงานลงสมุดงานเดียวกัน',
    stripThaiLabel: 'ยังไม่อนุมัติสมุดงานเดียวกัน',
  },
  INVALID_REPORT_WORKBOOK: {
    variant: 'stop',
    icon: 'stop',
    propertyKey: 'THAIPHC_REPORT_SPREADSHEET_ID',
    code: 'INVALID_REPORT_WORKBOOK',
    headerThaiLabel: 'รหัสสมุดงานรายงานไม่ถูกต้อง',
    stripThaiLabel: 'รูปแบบรหัสสมุดงานไม่ถูกต้อง',
  },
};

function PolicyIcon({ kind }: { kind: PolicyBadgeConfig['icon'] }) {
  if (kind === 'separate') {
    return <FileSpreadsheet className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />;
  }
  if (kind === 'lock') {
    return <Lock className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />;
  }
  return <OctagonAlert className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />;
}

function DashboardLoadingSkeleton() {
  return (
    <div className="space-y-5 lg:space-y-6" aria-busy="true" aria-label="กำลังโหลดสถานะ Dashboard">
      <h1 className="sr-only">ภาพรวมสถานะระบบ ThaiPHC Data Connector</h1>
      <Card>
        <CardContent className="p-5 space-y-3">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-4 w-80 max-w-full" />
          <div className="flex flex-wrap gap-4 pt-2">
            <Skeleton className="h-5 w-60" />
            <Skeleton className="h-5 w-48" />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-5 space-y-3">
            <Skeleton className="h-5 w-52" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 space-y-3">
            <Skeleton className="h-5 w-56" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-5 space-y-3">
          <Skeleton className="h-5 w-64" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5 space-y-3">
          <Skeleton className="h-5 w-72" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

export function DashboardView({
  data,
  isPending,
  isFetching,
  isError,
  error,
  onRefresh,
  onOpenSyncWorkspace,
}: DashboardViewProps) {
  const errorAlertRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isError && errorAlertRef.current) {
      errorAlertRef.current.focus();
    }
  }, [isError]);

  if (isPending) {
    return <DashboardLoadingSkeleton />;
  }

  if (isError || !data) {
    const safeErrorCode = error instanceof GasRpcClientError ? error.code : 'DASHBOARD_LOAD_FAILED';
    const safeErrorMessage =
      error instanceof GasRpcClientError
        ? error.message
        : 'ไม่สามารถโหลดสถานะ Dashboard จากเซิร์ฟเวอร์ Google Apps Script ได้';

    return (
      <div className="space-y-4">
        <h1 className="sr-only">ภาพรวมสถานะระบบ ThaiPHC Data Connector</h1>
        <Alert
          ref={errorAlertRef}
          variant="stop"
          role="alert"
          tabIndex={-1}
          aria-labelledby="dashboard-error-heading"
          className="space-y-3"
        >
          <div className="flex items-start gap-3">
            <OctagonAlert
              className="mt-0.5 size-6 shrink-0"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <div className="space-y-1.5 min-w-0">
              <AlertTitle id="dashboard-error-heading">
                ไม่สามารถโหลดสถานะภาพรวมจาก Google Apps Script ได้
              </AlertTitle>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="stop" className="font-mono font-semibold">
                  {safeErrorCode}
                </Badge>
              </div>
              <AlertDescription className="text-foreground">{safeErrorMessage}</AlertDescription>
            </div>
          </div>
          <div>
            <Button variant="outline" onClick={onRefresh}>
              <RotateCw className="size-4 shrink-0" aria-hidden="true" />
              <span>ลองโหลดสถานะอีกครั้ง</span>
            </Button>
          </div>
        </Alert>
      </div>
    );
  }

  const isProd = data.env === 'PRODUCTION';
  const referenceDatasets = data.datasets.filter((d) => d.group === 'reference');
  const extendedDatasets = data.datasets.filter((d) => d.group === 'extended_report');
  const workbookPolicyMeta = SAME_WORKBOOK_POLICY_META[data.workbooks.sameWorkbookPolicy];

  return (
    <div className="space-y-5 lg:space-y-6">
      <h1 className="sr-only">ภาพรวมสถานะระบบ ThaiPHC Data Connector</h1>

      {/* SECTION 1: Environment & Destination Workbook Header Card */}
      <section aria-label="สภาพแวดล้อมและสมุดงานปลายทาง">
        <Card
          className={cn(
            'border-l-4',
            isProd
              ? 'bg-env-prod-bg/60 border-env-prod-border border-l-env-prod-solid'
              : 'bg-env-sandbox-bg/50 border-env-sandbox-border border-l-env-sandbox-solid',
          )}
        >
          <CardContent className="p-4 sm:p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="space-y-3 min-w-0">
                <div className="flex flex-wrap items-center gap-2.5">
                  <EnvironmentBadge env={data.env} />
                  <p
                    className={cn(
                      'text-sm font-medium',
                      isProd ? 'text-env-prod-fg' : 'text-env-sandbox-fg',
                    )}
                  >
                    {isProd
                      ? 'สภาพแวดล้อมใช้งานจริง (Production) — การยืนยันซิงก์จะบันทึกข้อมูลลงชีตจริง'
                      : 'สภาพแวดล้อมทดสอบ (Sandbox) — ใช้สำหรับทดสอบและตรวจสอบก่อนใช้งานจริง'}
                  </p>
                </div>

                <div className="flex flex-wrap items-start gap-x-6 gap-y-3 text-sm">
                  <div className="space-y-0.5 min-w-0">
                    <div className="text-xs font-medium text-muted-foreground">
                      สมุดงานปลายทาง (Reference Workbook)
                    </div>
                    <div className="font-semibold text-foreground">
                      {data.workbooks.reference.name}
                    </div>
                    <CopyableIdentifier
                      value={data.workbooks.reference.spreadsheetId}
                      displayValue={maskSpreadsheetId(data.workbooks.reference.spreadsheetId)}
                      label="Spreadsheet ID สมุดงานอ้างอิง"
                      maxWidthClass="max-w-[240px]"
                    />
                  </div>

                  {data.workbooks.sameWorkbookPolicy === 'SEPARATE_WORKBOOK' &&
                    data.workbooks.report && (
                      <div className="space-y-0.5 min-w-0">
                        <div className="text-xs font-medium text-muted-foreground">
                          สมุดงานรายงานขยาย (Report Workbook)
                        </div>
                        <div className="font-semibold text-foreground">
                          {data.workbooks.report.name}
                        </div>
                        <CopyableIdentifier
                          value={data.workbooks.report.spreadsheetId}
                          displayValue={maskSpreadsheetId(data.workbooks.report.spreadsheetId)}
                          label="Spreadsheet ID สมุดงานรายงานขยาย"
                          maxWidthClass="max-w-[240px]"
                        />
                      </div>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="neutral"
                    className="whitespace-normal flex-wrap leading-normal max-w-full"
                  >
                    <span>ขอบเขต: จ.แพร่</span>
                    <code className="font-mono font-semibold">({data.scope.provinceCode})</code>
                    <span>/ อ.สอง</span>
                    <code className="font-mono font-semibold">({data.scope.districtCode})</code>
                  </Badge>

                  {data.workbooks.sameWorkbookPolicy !== 'SEPARATE_WORKBOOK' && (
                    <Badge
                      variant={workbookPolicyMeta.variant}
                      className="whitespace-normal flex-wrap break-words leading-normal max-w-full"
                    >
                      <PolicyIcon kind={workbookPolicyMeta.icon} />
                      <code className="font-mono font-semibold">{workbookPolicyMeta.code}</code>
                      <span>· {workbookPolicyMeta.headerThaiLabel}</span>
                    </Badge>
                  )}
                </div>

                {data.workbooks.sameWorkbookPolicy === 'SAME_WORKBOOK_APPROVED' && (
                  <p className="text-xs text-muted-foreground">
                    ตรวจสอบสิทธิ์แชร์เฉพาะเจ้าของก่อนซิงก์ชุดข้อมูลรายงานขยาย
                  </p>
                )}
              </div>

              <div className="flex flex-col items-stretch md:items-end gap-1.5 shrink-0">
                <Button
                  variant="outline"
                  onClick={onRefresh}
                  disabled={isFetching}
                  className="w-full md:w-auto"
                >
                  <RotateCw
                    className={cn('size-4 shrink-0', isFetching && 'animate-spin')}
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  <span>{isFetching ? 'กำลังรีเฟรช...' : 'รีเฟรชสถานะ'}</span>
                </Button>
                <p className="text-[0.78125rem] text-muted-foreground font-mono tabular-nums">
                  ตรวจสอบล่าสุด: {formatBangkokLongDateTime(data.generatedAtUtc)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* SECTION 2 (CONDITIONAL): UNRESOLVED_PREVIOUS_RUN Priority Alert Banner */}
      {data.unresolvedRuns.length > 0 && (
        <Alert
          variant="stop"
          role="alert"
          aria-labelledby="unresolved-run-heading"
          className="space-y-3"
        >
          <div className="flex items-start gap-3">
            <OctagonAlert
              className="mt-0.5 size-5 shrink-0"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <div className="space-y-2 min-w-0 flex-1">
              <AlertTitle id="unresolved-run-heading">
                พบรอบซิงก์ก่อนหน้ายังไม่ปิดสมบูรณ์ —{' '}
                <span className="font-mono">UNRESOLVED_PREVIOUS_RUN</span>
              </AlertTitle>
              <AlertDescription className="space-y-3">
                <ul className="space-y-2">
                  {data.unresolvedRuns.map((run) => (
                    <li
                      key={`${run.endpoint}-${run.runId}`}
                      className="flex flex-col gap-2 rounded-md border border-status-stop-border bg-card/90 p-3 text-foreground sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <code className="font-mono font-semibold text-status-stop-fg">
                            {run.endpoint}
                          </code>
                          <span className="text-muted-foreground">·</span>
                          <span>
                            สถานะ <code className="font-mono font-semibold">_ThaiPHCSyncLog</code>:{' '}
                            <code className="font-mono font-semibold text-status-stop-fg">
                              {run.status}
                            </code>
                          </span>
                          <span className="text-muted-foreground">·</span>
                          <span className="font-mono tabular-nums text-muted-foreground">
                            {formatBangkokDateTime(run.startedAtUtc)}
                          </span>
                        </div>
                        <CopyableIdentifier
                          value={run.runId}
                          label={`Run ID ค้างตรวจของ ${run.endpoint}`}
                          maxWidthClass="max-w-full sm:max-w-[300px]"
                        />
                      </div>
                      <Button
                        size="sm"
                        variant="destructiveOutline"
                        onClick={() => onOpenSyncWorkspace(run.endpoint)}
                        className="w-full sm:w-auto"
                      >
                        <span>เปิดชุดข้อมูลในพื้นที่ซิงก์</span>
                        <ArrowRight className="size-3.5 shrink-0" aria-hidden="true" />
                      </Button>
                    </li>
                  ))}
                </ul>
                <p className="text-sm text-status-stop-fg">
                  Google Sheets ไม่รองรับการย้อนกลับอัตโนมัติ (Non-ACID)
                  กรุณาเปิดสมุดงานปลายทางเพื่อตรวจสอบแท็บข้อมูล,{' '}
                  <code className="font-mono font-semibold">_ThaiPHCSyncLog</code>{' '}
                  และแท็บพักข้อมูลที่ซ่อนอยู่ (<code className="font-mono font-semibold">_Stage_*</code>)
                  ก่อนเริ่มรอบ Preview → Diff → Confirm ใหม่
                </p>
              </AlertDescription>
            </div>
          </div>
        </Alert>
      )}

      {/* SECTION 3: Read-Only Write Guard Status Cards + Policy Strip */}
      <section aria-labelledby="write-guards-heading" className="space-y-3">
        <h2 id="write-guards-heading" className="sr-only">
          สถานะสิทธิ์การเขียนฝั่งเซิร์ฟเวอร์ (Read-Only Write Guards)
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="cursor-default">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="space-y-0.5 min-w-0">
                  <CardTitle>สิทธิ์เขียนข้อมูลลง Google Sheets</CardTitle>
                  <code className="block font-mono text-xs text-muted-foreground">
                    THAIPHC_WRITE_ENABLED
                  </code>
                </div>
                <WriteGuardBadge enabled={data.guards.writeEnabled} />
              </div>
            </CardHeader>
            <CardContent className="pb-3">
              <CardDescription className="text-sm text-foreground/85">
                {data.guards.writeEnabled
                  ? 'อนุญาตให้เขียนข้อมูลลงสมุดงานปลายทางเมื่อผ่านการ Preview และยืนยันตัวตนแล้ว'
                  : 'ปิดการเขียนฝั่งเซิร์ฟเวอร์ — สามารถรัน Preview แบบอ่านอย่างเดียวได้ตามปกติ แต่ Commit จะถูกบล็อกแบบ fail-closed'}
              </CardDescription>
            </CardContent>
            <CardFooter className="gap-1.5">
              <Lock className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              <span>อ่านอย่างเดียว — แก้ไขได้เฉพาะใน Google Apps Script &gt; Script Properties</span>
            </CardFooter>
          </Card>

          <Card className="cursor-default">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="space-y-0.5 min-w-0">
                  <CardTitle>สิทธิ์เขียนชุดข้อมูลรายงานขยาย</CardTitle>
                  <code className="block font-mono text-xs text-muted-foreground">
                    THAIPHC_PERSON_DATA_WRITE_ENABLED
                  </code>
                </div>
                <WriteGuardBadge enabled={data.guards.personDataWriteEnabled} />
              </div>
            </CardHeader>
            <CardContent className="pb-3">
              <CardDescription className="text-sm text-foreground/85">
                {data.guards.personDataWriteEnabled
                  ? 'อนุญาตให้บันทึกชุดข้อมูลรายงานขยาย 5 ชุดเมื่อเปิดควบคู่กับสวิตช์หลักและสวิตช์ Full-Field PII'
                  : 'ปิดการเขียนชุดข้อมูลรายงานขยาย 5 ชุดฝั่งเซิร์ฟเวอร์ — ต้องเปิดครบทั้ง 3 สวิตช์จึงจะ Commit รายงานได้'}
              </CardDescription>
            </CardContent>
            <CardFooter className="gap-1.5">
              <Lock className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              <span>อ่านอย่างเดียว — แก้ไขได้เฉพาะใน Google Apps Script &gt; Script Properties</span>
            </CardFooter>
          </Card>

          <Card className="cursor-default">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="space-y-0.5 min-w-0">
                  <CardTitle>สิทธิ์บันทึกครบทุกฟิลด์รวม PII (ADR-0005)</CardTitle>
                  <code className="block font-mono text-xs text-muted-foreground">
                    THAIPHC_FULL_PII_WRITE_ENABLED
                  </code>
                </div>
                <WriteGuardBadge enabled={data.guards.fullPiiWriteEnabled} />
              </div>
            </CardHeader>
            <CardContent className="pb-3">
              <CardDescription className="text-sm text-foreground/85">
                {data.guards.fullPiiWriteEnabled
                  ? 'เปิดโหมด Full-Field Operator Mode — บันทึกครบทุกคอลัมน์จาก ThaiPHC (รวมเลขบัตร 13 หลัก/ชื่อ-สกุล/ที่อยู่ และตัวเลขจริง 1..4) ลงสมุดงานจำกัดสิทธิ์'
                  : 'ปิดการบันทึกข้อมูลส่วนบุคคลครบทุกฟิลด์ — สามารถ Preview (ซ่อนเลขบัตรบางหลัก) ได้ตามปกติ แต่ Commit รายงานขยายจะถูกบล็อกแบบ fail-closed'}
              </CardDescription>
            </CardContent>
            <CardFooter className="gap-1.5">
              <Lock className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              <span>อ่านอย่างเดียว — แก้ไขได้เฉพาะใน Google Apps Script &gt; Script Properties</span>
            </CardFooter>
          </Card>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/70 px-3.5 py-2.5 text-xs">
          <span className="inline-flex items-center gap-1.5 font-medium text-muted-foreground mr-1">
            <Lock className="size-3.5 shrink-0" aria-hidden="true" />
            <span>นโยบายฝั่ง GAS (Read-Only):</span>
          </span>

          {data.guards.fullPiiWriteEnabled ? (
            <Badge
              variant="guardOn"
              className="whitespace-normal flex-wrap break-words max-w-full leading-normal"
            >
              <ShieldCheck className="size-3.5 shrink-0" aria-hidden="true" />
              <code className="font-mono font-semibold">ADR-0005</code>
              <span>· Full-Field Operator Mode เปิดใช้งาน (Preview ซ่อน citizenId บางหลัก)</span>
            </Badge>
          ) : (
            <Badge
              variant="guardOff"
              className="whitespace-normal flex-wrap break-words max-w-full leading-normal"
            >
              <OctagonAlert className="size-3.5 shrink-0" aria-hidden="true" />
              <code className="font-mono font-semibold">THAIPHC_FULL_PII_WRITE_ENABLED</code>
              <span>· ปิดอยู่ (บล็อก Commit รายงานขยาย)</span>
            </Badge>
          )}

          <Badge
            variant={workbookPolicyMeta.variant}
            className="whitespace-normal flex-wrap break-words max-w-full leading-normal"
          >
            <PolicyIcon kind={workbookPolicyMeta.icon} />
            <code className="font-mono font-semibold">{workbookPolicyMeta.propertyKey}</code>
            <span>
              · {workbookPolicyMeta.stripThaiLabel} ({workbookPolicyMeta.code})
            </span>
          </Badge>
        </div>
      </section>

      {/* SECTION 4A: Reference Datasets (3 APIs) */}
      <DatasetGroupCard
        group="reference"
        datasets={referenceDatasets}
        guardProperty="THAIPHC_WRITE_ENABLED"
        guardEnabled={data.guards.writeEnabled}
        onOpenSyncWorkspace={onOpenSyncWorkspace}
      />

      {/* SECTION 4B: Extended Report Datasets (5 APIs) */}
      <DatasetGroupCard
        group="extended_report"
        datasets={extendedDatasets}
        guardProperty="THAIPHC_PERSON_DATA_WRITE_ENABLED + THAIPHC_FULL_PII_WRITE_ENABLED"
        guardEnabled={data.guards.personDataWriteEnabled && data.guards.fullPiiWriteEnabled}
        onOpenSyncWorkspace={onOpenSyncWorkspace}
      />
    </div>
  );
}
