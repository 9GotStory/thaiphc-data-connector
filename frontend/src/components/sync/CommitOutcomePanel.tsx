import {
  AlertTriangle,
  CheckCircle2,
  ClockAlert,
  MinusCircle,
  OctagonAlert,
  PlusCircle,
  RefreshCw,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { CommitDatasetData, DatasetEndpoint, StaleDriftReason, SyncMode } from '@/api/types';
import { CopyableIdentifier } from '@/components/CopyableIdentifier';
import { EnvironmentBadge, SyncModeBadge } from '@/components/StatusBadges';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { formatBangkokDateTime } from '@/lib/formatters';
import { cn } from '@/lib/utils';

export interface CommitBatchProgress {
  phase: 'staging' | 'finalizing';
  batchNumber: number;
  pagesStaged: number;
  totalPages: number | null;
  rowsStaged: number;
  sourceTotal: number;
  stagingTabName: string | null;
}

const DRIFT_LABELS: Record<StaleDriftReason, string> = {
  SOURCE_CHANGED: 'ข้อมูลต้นทางจาก ThaiPHC (sourceTotal / datasetDigest) เปลี่ยนแปลงหลัง Preview',
  DESTINATION_CHANGED: 'สถานะชีตปลายทาง (sheetRevisionFingerprint) เปลี่ยนแปลงหลัง Preview',
  BOTH_CHANGED: 'ทั้งข้อมูลต้นทาง ThaiPHC และชีตปลายทางเปลี่ยนแปลงหลัง Preview',
  ENV_MISMATCH: 'สภาพแวดล้อม (THAIPHC_ENV) เปลี่ยนแปลงหลัง Preview',
};

export function CommitProgressCard({
  endpoint,
  syncMode = 'KEYED_UPSERT',
  batchProgress = null,
}: {
  endpoint: DatasetEndpoint;
  syncMode?: SyncMode;
  batchProgress?: CommitBatchProgress | null;
}) {
  const isCompleteSnapshot = syncMode === 'COMPLETE_SNAPSHOT';
  const steps = isCompleteSnapshot
    ? [
        '1. ตรวจ LockService & Preview Fingerprint',
        '2. จัดเตรียมแท็บซ่อน (RFamily_<runId>) & ตรวจ Chunk Digest',
        '3. เผยแพร่ _ThaiPHCReportCurrent & อ่านตรวจซ้ำ (Destination Readback)',
        '4. บันทึก _ThaiPHCSyncLog & ปิดงาน',
      ]
    : [
        '1. ตรวจ LockService & Preview Fingerprint',
        batchProgress
          ? '2. จัดเตรียมแท็บซ่อน (_Stage_*) / เขียนปลายทาง'
          : '2. จัดเตรียมข้อมูล / เขียนปลายทาง (Keyed Upsert)',
        '3. อ่านตรวจซ้ำปลายทาง (Destination Readback)',
        '4. บันทึก _ThaiPHCSyncLog & ปิดงาน',
      ];

  const progressValue =
    batchProgress && batchProgress.phase === 'staging' && batchProgress.totalPages
      ? Math.min(90, Math.round((batchProgress.pagesStaged / batchProgress.totalPages) * 90))
      : null;

  let statusText: string;
  if (!batchProgress) {
    statusText =
      'กำลังตรวจ Preview Fingerprint ภายใต้ LockService และดำเนินการ Keyed Upsert + Destination Readback...';
  } else if (batchProgress.phase === 'staging') {
    const tabPart = batchProgress.stagingTabName ? ` (${batchProgress.stagingTabName})` : '';
    if (batchProgress.totalPages !== null && batchProgress.pagesStaged > 0) {
      statusText = `กำลังจัดเตรียมข้อมูลลงแท็บซ่อน${tabPart} — หน้า ${batchProgress.pagesStaged.toLocaleString('en-US')} / ${batchProgress.totalPages.toLocaleString('en-US')} · จัดเก็บแล้ว ${batchProgress.rowsStaged.toLocaleString('en-US')} / ${batchProgress.sourceTotal.toLocaleString('en-US')} แถว (Batch ที่ ${batchProgress.batchNumber})`;
    } else if (isCompleteSnapshot) {
      statusText = `กำลังจัดเตรียมข้อมูลลงแท็บซ่อน RFamily_<runId> (Batch ที่ ${batchProgress.batchNumber}) ภายใต้ LockService...`;
    } else {
      statusText = `กำลังจัดเตรียมข้อมูลลงแท็บซ่อน _Stage_${endpoint}_* (Batch ที่ ${batchProgress.batchNumber}) ภายใต้ LockService...`;
    }
  } else if (isCompleteSnapshot) {
    statusText =
      'กำลังตรวจ Chunk SHA-256 Digest & Pointer Revision ภายใต้ LockService, เปิดแสดง RFamily_<runId>, อัปเดต _ThaiPHCReportCurrent และตรวจสอบ Destination Readback...';
  } else {
    statusText = `กำลังตรวจ Staged Digest & Preview Fingerprint ซ้ำภายใต้ LockService, ดำเนินการ Keyed Upsert ลงปลายทาง, และตรวจสอบ Destination Readback...`;
  }

  const activeStepIdx = !batchProgress ? 1 : batchProgress.phase === 'staging' ? 1 : 2;

  return (
    <Card className="border-primary-soft-border">
      <CardContent className="p-5 space-y-4">
        <h2 className="text-[1.0625rem] font-semibold leading-[1.4] text-foreground">
          กำลังบันทึกข้อมูลและตรวจสอบปลายทาง: <code className="font-mono">{endpoint}</code>
        </h2>

        <ol className="grid grid-cols-1 md:grid-cols-4 gap-2 text-xs">
          {steps.map((step, idx) => (
            <li
              key={step}
              className={cn(
                'rounded-md border px-3 py-2 font-medium',
                idx === activeStepIdx
                  ? 'border-primary bg-primary-soft text-primary-soft-foreground'
                  : 'border-border bg-muted/60 text-foreground',
              )}
            >
              {step}
            </li>
          ))}
        </ol>

        <Progress value={progressValue} label={`กำลังบันทึกข้อมูล ${endpoint}`} />

        <p
          role="status"
          aria-atomic="true"
          className="font-mono text-sm font-medium tabular-nums text-foreground"
        >
          {statusText}
        </p>

        <p className="flex items-start gap-2 text-xs font-medium text-diff-review-fg">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          <span>กรุณาอย่าปิดแท็บนี้ระหว่างบันทึก — ระบบไม่ลองเขียนซ้ำอัตโนมัติ (No Auto-Retry)</span>
        </p>
      </CardContent>
    </Card>
  );
}

interface CommitOutcomePanelProps {
  outcome: CommitDatasetData;
  onSyncNextDataset: () => void;
  onBackToDashboard: () => void;
  onRunFreshPreview: () => void;
  onResetWorkspace: () => void;
}

export function CommitOutcomePanel({
  outcome,
  onSyncNextDataset,
  onBackToDashboard,
  onRunFreshPreview,
  onResetWorkspace,
}: CommitOutcomePanelProps) {
  const stopFocusRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (outcome.status !== 'COMMITTED_VERIFIED') {
      stopFocusRef.current?.focus();
    }
  }, [outcome]);

  // Outcome A — Verified Success (COMMITTED_VERIFIED)
  if (outcome.status === 'COMMITTED_VERIFIED') {
    const rb = outcome.readback;
    const isCompleteSnapshot = outcome.syncMode === 'COMPLETE_SNAPSHOT';
    return (
      <Card className="border-status-verified-border border-l-4 border-l-status-verified-fg">
        <CardHeader className="border-b border-border/70">
          <div className="flex flex-wrap items-center gap-2.5">
            <CheckCircle2
              className="size-6 shrink-0 text-status-verified-fg"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <Badge variant="verified" className="font-mono font-semibold">
              COMMITTED_VERIFIED
            </Badge>
            <SyncModeBadge syncMode={outcome.syncMode} />
            <h2 className="text-[1.0625rem] font-semibold leading-[1.4] text-foreground">
              ซิงก์และตรวจสอบ Destination Readback สำเร็จ
            </h2>
          </div>
        </CardHeader>
        <CardContent className="p-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div className="rounded-md border border-border bg-muted/50 p-3 min-w-0">
              <div className="text-muted-foreground">Run ID</div>
              <div className="mt-1">
                <CopyableIdentifier
                  value={outcome.runId}
                  label="Run ID"
                  maxWidthClass="max-w-full"
                />
              </div>
            </div>
            <div className="rounded-md border border-border bg-muted/50 p-3 space-y-1">
              <div className="text-muted-foreground">สภาพแวดล้อม</div>
              <EnvironmentBadge env={outcome.env} />
            </div>
            <div className="rounded-md border border-border bg-muted/50 p-3 min-w-0">
              <div className="text-muted-foreground">แท็บปลายทาง</div>
              <div className="mt-1 font-mono font-semibold text-foreground break-all">
                {outcome.destinationTab}
              </div>
              {isCompleteSnapshot && (
                <div className="mt-0.5 text-[0.7rem] text-muted-foreground">
                  เผยแพร่ผ่านตัวชี้ <code className="font-mono">_ThaiPHCReportCurrent</code>
                </div>
              )}
            </div>
            <div className="rounded-md border border-border bg-muted/50 p-3">
              <div className="text-muted-foreground">เสร็จสิ้นเมื่อ (Asia/Bangkok)</div>
              <div className="mt-1 font-mono font-medium tabular-nums text-foreground">
                {formatBangkokDateTime(outcome.completedAtUtc)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-md border border-diff-insert-border bg-diff-insert-bg p-3 text-diff-insert-fg">
              <div className="flex items-center justify-between gap-1.5">
                <span className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold">
                  <PlusCircle className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                  <span>INSERT</span>
                </span>
                <span className="text-xs font-medium">เพิ่มใหม่</span>
              </div>
              <div className="mt-1 font-mono text-2xl font-semibold tabular-nums">
                {outcome.counts.insert.toLocaleString('en-US')}
              </div>
            </div>
            <div className="rounded-md border border-diff-update-border bg-diff-update-bg p-3 text-diff-update-fg">
              <div className="flex items-center justify-between gap-1.5">
                <span className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold">
                  <RefreshCw className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                  <span>UPDATE</span>
                </span>
                <span className="text-xs font-medium">อัปเดต</span>
              </div>
              <div className="mt-1 font-mono text-2xl font-semibold tabular-nums">
                {outcome.counts.update.toLocaleString('en-US')}
              </div>
            </div>
            <div className="rounded-md border border-diff-unchanged-border bg-diff-unchanged-bg p-3 text-diff-unchanged-fg">
              <div className="flex items-center justify-between gap-1.5">
                <span className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold">
                  <MinusCircle className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                  <span>UNCHANGED</span>
                </span>
                <span className="text-xs font-medium">ไม่เปลี่ยนแปลง</span>
              </div>
              <div className="mt-1 font-mono text-2xl font-semibold tabular-nums">
                {outcome.counts.unchanged.toLocaleString('en-US')}
              </div>
            </div>
            <div className="rounded-md border border-diff-review-border bg-diff-review-bg p-3 text-diff-review-fg">
              <div className="flex items-center justify-between gap-1.5">
                <span className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold">
                  <AlertTriangle
                    className="size-4 shrink-0"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  <span>REVIEW</span>
                </span>
                <span className="text-xs font-medium">ต้องตรวจสอบ</span>
              </div>
              <div className="mt-1 font-mono text-2xl font-semibold tabular-nums">
                {outcome.counts.review.toLocaleString('en-US')}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-status-verified-border bg-status-verified-bg/60 p-4 space-y-2">
            <h3 className="text-[0.9375rem] font-semibold leading-[1.45] text-status-verified-fg">
              รายการยืนยัน Destination Readback
            </h3>
            <ul className="space-y-1.5 text-sm text-foreground">
              <li className="flex items-center gap-2">
                <CheckCircle2
                  className="size-4 shrink-0 text-status-verified-fg"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                <span>
                  จำนวนแถวปลายทางตรงกับยอดที่ตรวจสอบแล้ว ({rb.actualRowCount.toLocaleString('en-US')} /{' '}
                  {rb.expectedRowCount.toLocaleString('en-US')} แถว)
                </span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2
                  className="size-4 shrink-0 text-status-verified-fg"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                <span>
                  {isCompleteSnapshot
                    ? 'คีย์ลำดับรอบ snapshot_<runId>_NNNNN ครบถ้วนไม่ซ้ำกัน (Verified Complete Snapshot)'
                    : 'คีย์ _source_key ไม่ซ้ำกัน'}
                </span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2
                  className="size-4 shrink-0 text-status-verified-fg"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                <span>
                  {isCompleteSnapshot
                    ? 'ค่า _row_digest และ Chunk SHA-256 Digest ตรงกับข้อมูลที่บันทึกครบทุกชุด'
                    : 'ค่า _row_digest ตรงกับข้อมูลที่บันทึกและคงข้อมูลเดิมครบถ้วน'}
                </span>
              </li>
              {isCompleteSnapshot && rb.publicationPointerVerified === true && (
                <li className="flex items-center gap-2">
                  <CheckCircle2
                    className="size-4 shrink-0 text-status-verified-fg"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  <span>
                    อัปเดตตัวชี้เผยแพร่ _ThaiPHCReportCurrent ชี้ไปยัง{' '}
                    <code className="font-mono font-semibold">{outcome.destinationTab}</code>{' '}
                    เรียบร้อยแล้ว
                  </span>
                </li>
              )}
              <li className="flex items-center gap-2">
                <CheckCircle2
                  className="size-4 shrink-0 text-status-verified-fg"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                <span>
                  {isCompleteSnapshot ? (
                    <>
                      แท็บอื่นทั้งหมด, แท็บ RFamily_* เวอร์ชันเดิม และแท็บ{' '}
                      <code className="font-mono">ชีต1</code> ยังอยู่ครบถ้วนไม่ถูกกระทบ
                    </>
                  ) : (
                    <>
                      แท็บอื่นทั้งหมดและแท็บ <code className="font-mono">ชีต1</code> ยังอยู่ครบถ้วนไม่ถูกกระทบ
                    </>
                  )}
                </span>
              </li>
              {rb.stagingTabCleaned === true && (
                <li className="flex items-center gap-2">
                  <CheckCircle2
                    className="size-4 shrink-0 text-status-verified-fg"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  <span>ลบแท็บพักชั่วคราว _Stage_* หลังตรวจสอบผ่านเรียบร้อย</span>
                </li>
              )}
            </ul>
          </div>

          <div className="flex flex-col gap-2.5 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onBackToDashboard}>
              กลับหน้า Dashboard
            </Button>
            <Button type="button" variant="primary" onClick={onSyncNextDataset}>
              ซิงก์ชุดข้อมูลถัดไป
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Outcome B — Stale Preview Stop (PREVIEW_STALE_RECONFIRM_REQUIRED)
  const isFamilySnapshot = outcome.endpoint === 'volunteer-family';

  if (outcome.status === 'PREVIEW_STALE_RECONFIRM_REQUIRED') {
    return (
      <Alert
        ref={stopFocusRef}
        variant="stale"
        role="alert"
        tabIndex={-1}
        className="p-5 space-y-4 focus:outline-2 focus:outline-offset-2 focus:outline-status-stale-fg"
      >
        <div className="flex items-start gap-3">
          <ClockAlert className="mt-0.5 size-6 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="stale" className="font-mono font-semibold">
                PREVIEW_STALE_RECONFIRM_REQUIRED
              </Badge>
              <Badge variant="stale" className="font-mono font-semibold">
                PREVIEW_STALE
              </Badge>
            </div>
            <AlertTitle>ข้อมูลมีการเปลี่ยนแปลงหลัง Preview — หยุดก่อนเขียนลงแท็บจริง</AlertTitle>
            <AlertDescription className="text-foreground space-y-1">
              <p>
                {isFamilySnapshot && outcome.driftReason === 'DESTINATION_CHANGED'
                  ? 'สถานะตัวชี้เผยแพร่ _ThaiPHCReportCurrent (sheetRevisionFingerprint) เปลี่ยนแปลงหลัง Preview'
                  : DRIFT_LABELS[outcome.driftReason]}
              </p>
              <p className="text-xs text-muted-foreground">
                {isFamilySnapshot ? (
                  <>
                    ยืนยันว่าไม่มีการเปลี่ยนแปลงตัวชี้เผยแพร่{' '}
                    <code className="font-mono">_ThaiPHCReportCurrent</code>{' '}
                    และแท็บที่เผยแพร่อยู่เดิมไม่ถูกกระทบ
                  </>
                ) : (
                  <>
                    ยืนยันว่าไม่มีการเขียนเปลี่ยนแปลงใดๆ ลงแท็บปลายทาง{' '}
                    <code className="font-mono">{outcome.destinationTab}</code>
                  </>
                )}
              </p>
            </AlertDescription>
          </div>
        </div>
        <div className="flex justify-end">
          <Button type="button" variant="primary" className="min-h-11" onClick={onRunFreshPreview}>
            <RefreshCw className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            <span>รัน Preview ใหม่เพื่อตรวจสอบล่าสุด</span>
          </Button>
        </div>
      </Alert>
    );
  }

  // Outcome C — Unknown Outcome / Failure Stop (UNKNOWN_OUTCOME_STOP / FAILED_STOP)
  const isPrePublishFamilyStop = isFamilySnapshot && outcome.syncLogStatus === 'NOT_WRITTEN';
  return (
    <Alert
      ref={stopFocusRef}
      variant="stop"
      role="alert"
      tabIndex={-1}
      className="p-5 space-y-4 focus:outline-2 focus:outline-offset-2 focus:outline-destructive"
    >
      <div className="flex items-start gap-3">
        <OctagonAlert className="mt-0.5 size-6 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        <div className="space-y-1.5 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="stop" className="font-mono font-semibold">
              {outcome.status}
            </Badge>
            <Badge variant="neutral" className="font-mono font-semibold">
              {outcome.stopCode}
            </Badge>
          </div>
          <AlertTitle>หยุดการทำงานทันที — ต้องตรวจสอบชีตปลายทางก่อนดำเนินการต่อ</AlertTitle>
        </div>
      </div>

      <div className="rounded-md border border-status-stop-border bg-card p-3.5 text-sm text-foreground space-y-1.5">
        {outcome.runId && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">Run ID:</span>
            <CopyableIdentifier value={outcome.runId} label="Run ID" maxWidthClass="max-w-xs" />
          </div>
        )}
        <p>
          <span className="text-muted-foreground">รหัสวินิจฉัย:</span>{' '}
          <code className="font-mono font-semibold">{outcome.stopCode}</code> — {outcome.message}
        </p>
        <p>
          <span className="text-muted-foreground">สถานะใน _ThaiPHCSyncLog:</span>{' '}
          <code className="font-mono font-semibold">{outcome.syncLogStatus}</code>
        </p>
        {outcome.stagingTabRetained && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">
              {isFamilySnapshot
                ? isPrePublishFamilyStop
                  ? 'แท็บซ่อน RFamily_<runId> ที่คงไว้เพื่อตรวจสอบ (ยังไม่เผยแพร่):'
                  : 'แท็บ Snapshot RFamily_<runId> ที่ต้องตรวจสอบสถานะการเผยแพร่:'
                : 'แท็บพักซ่อนที่คงไว้เพื่อตรวจสอบ:'}
            </span>
            <CopyableIdentifier
              value={outcome.stagingTabRetained}
              label={
                isFamilySnapshot
                  ? isPrePublishFamilyStop
                    ? 'แท็บซ่อน RFamily_<runId>'
                    : 'แท็บ Snapshot RFamily_<runId>'
                  : 'แท็บซ่อน _Stage_*'
              }
              maxWidthClass="max-w-xs"
            />
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          {isPrePublishFamilyStop
            ? 'รอบนี้หยุดก่อนขั้นตอนเผยแพร่ — หากมีการสร้างแท็บซ่อน RFamily_<runId> ระบบจะคงซ่อนแท็บไว้เพื่อตรวจสอบ โดยไม่อัปเดต _ThaiPHCReportCurrent และไม่ลบทิ้งอัตโนมัติ'
            : isFamilySnapshot
              ? 'รอบนี้หยุดระหว่างหรือหลังขั้นตอนเผยแพร่ — สถานะการเปิดแสดง RFamily_<runId> และตัวชี้ _ThaiPHCReportCurrent อาจเปลี่ยนแปลงแล้วบางส่วน กรุณาตรวจสอบทั้ง RFamily_<runId>, _ThaiPHCReportCurrent และ _ThaiPHCSyncLog ด้วยตนเองก่อนดำเนินการต่อ (ระบบไม่ลบทิ้งแท็บอัตโนมัติ)'
              : 'หากรอบนี้สร้างแท็บพักชั่วคราว (_Stage_*) ระบบจะคงซ่อนแท็บไว้ในสมุดงานเพื่อให้ตรวจสอบ ไม่ลบทิ้งอัตโนมัติ'}
        </p>
        <p className="text-xs font-medium text-status-stop-fg">
          ระบบไม่ลองเขียนซ้ำอัตโนมัติ (No Auto-Retry) เพื่อป้องกันข้อมูลซ้ำซ้อนหรือเสียหายบน Google Sheets
        </p>
      </div>

      <div className="space-y-2 text-foreground">
        <h3 className="text-[0.9375rem] font-semibold leading-[1.45]">
          ขั้นตอนการตรวจสอบและกู้คืน (3 ขั้นตอน)
        </h3>
        <ol className="list-decimal pl-5 space-y-2 text-sm">
          <li>
            {isFamilySnapshot ? (
              <>
                เปิดสมุดงาน Google Sheets ปลายทาง ตรวจสอบแท็บ Snapshot{' '}
                <code className="font-mono">
                  {outcome.stagingTabRetained ?? outcome.destinationTab}
                </code>
                , ตัวชี้เผยแพร่ <code className="font-mono">_ThaiPHCReportCurrent</code> และแถว{' '}
                <code className="font-mono">run_id</code> ล่าสุดใน{' '}
                <code className="font-mono">_ThaiPHCSyncLog</code>
              </>
            ) : (
              <>
                เปิดสมุดงาน Google Sheets ปลายทาง ตรวจสอบแท็บข้อมูล{' '}
                <code className="font-mono">{outcome.destinationTab}</code> และแถว{' '}
                <code className="font-mono">run_id</code> ล่าสุดใน{' '}
                <code className="font-mono">_ThaiPHCSyncLog</code>
              </>
            )}
          </li>
          <li>
            {isFamilySnapshot ? (
              <>
                ตรวจสอบสถานะการซ่อน/เปิดแสดงของแท็บ{' '}
                <code className="font-mono">RFamily_&lt;runId&gt;</code>, แถว{' '}
                <code className="font-mono">volunteer-family</code> ใน{' '}
                <code className="font-mono">_ThaiPHCReportCurrent</code> และยืนยันว่าแท็บ{' '}
                <code className="font-mono">RFamily_*</code> เวอร์ชันเดิมยังอยู่ครบถ้วน
              </>
            ) : (
              <>
                ตรวจสอบว่ามีแท็บซ่อน <code className="font-mono">_Stage_*</code> ค้างอยู่หรือไม่
                และตรวจสอบความครบถ้วนของข้อมูลจริง
              </>
            )}
          </li>
          <li>
            กลับไปหน้า Dashboard เพื่อรีเฟรชสถานะ จากนั้นเริ่มรอบ <strong>Preview → Diff → Confirm</strong>{' '}
            ใหม่ตั้งแต่ต้น
          </li>
        </ol>
      </div>

      {/* Strictly NO "Retry Commit" button */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onBackToDashboard}>
          กลับหน้า Dashboard เพื่อตรวจสถานะ
        </Button>
        <Button type="button" variant="secondary" onClick={onResetWorkspace}>
          ล้างผลลัพธ์และเริ่ม Preview ใหม่
        </Button>
      </div>
    </Alert>
  );
}
