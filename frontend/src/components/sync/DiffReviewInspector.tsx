import {
  AlertTriangle,
  CheckCircle2,
  MinusCircle,
  OctagonAlert,
  PlusCircle,
  RefreshCw,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type {
  DiffKind,
  PreviewDatasetData,
  ReferencePreviewRow,
  ReviewReasonCode,
} from '@/api/types';
import { CopyableIdentifier } from '@/components/CopyableIdentifier';
import { EnvironmentBadge } from '@/components/StatusBadges';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatBangkokDateTime } from '@/lib/formatters';
import { cn } from '@/lib/utils';

type DiffFilter = 'ALL' | DiffKind;

const REVIEW_EXPLANATIONS: Record<ReviewReasonCode, string> = {
  MISSING_IN_SOURCE: 'พบในชีตเดิมแต่ไม่พบในต้นทาง — ระบบจะคงแถวเดิมไว้ ไม่ลบอัตโนมัติ',
  PLACEHOLDER_COORDS: 'พบพิกัด (0, 0) ซึ่งเป็นค่าตัวแทน (คงค่าไว้ในชีต ห้ามนำไปปักหมุดแผนที่)',
};

function shortHex(hex: string): string {
  return hex.length > 12 ? `${hex.slice(0, 12)}…` : hex;
}

function DiffBadge({ kind }: { kind: DiffKind }) {
  switch (kind) {
    case 'INSERT':
      return (
        <Badge variant="insert">
          <PlusCircle className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          <span className="font-mono font-semibold">INSERT</span>
          <span>· เพิ่มใหม่</span>
        </Badge>
      );
    case 'UPDATE':
      return (
        <Badge variant="update">
          <RefreshCw className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          <span className="font-mono font-semibold">UPDATE</span>
          <span>· อัปเดต</span>
        </Badge>
      );
    case 'UNCHANGED':
      return (
        <Badge variant="unchanged">
          <MinusCircle className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          <span className="font-mono font-semibold">UNCHANGED</span>
          <span>· ไม่เปลี่ยนแปลง</span>
        </Badge>
      );
    case 'REVIEW':
      return (
        <Badge variant="review">
          <AlertTriangle className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          <span className="font-mono font-semibold">REVIEW</span>
          <span>· ต้องตรวจสอบ</span>
        </Badge>
      );
  }
}

function RowChangeDetails({ row }: { row: ReferencePreviewRow }) {
  return (
    <div className="space-y-1.5 text-xs">
      {row.changedFields.length > 0 && (
        <ul className="space-y-1">
          {row.changedFields.map((ch) => (
            <li key={ch.field} className="flex flex-wrap items-baseline gap-1.5">
              <code className="font-mono font-medium text-foreground">{ch.field}:</code>
              <span className="line-through text-muted-foreground">{ch.before}</span>
              <span aria-hidden="true" className="text-muted-foreground">
                →
              </span>
              <span className="font-medium text-diff-update-fg">{ch.after}</span>
            </li>
          ))}
        </ul>
      )}
      {row.changedFields.length === 0 && row.summaryFields.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
          {row.summaryFields.map((sf) => (
            <span key={sf.field}>
              <code className="font-mono text-foreground">{sf.field}</code>: {sf.value}
            </span>
          ))}
        </div>
      )}
      {row.reviewReasons.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {row.reviewReasons.map((reason) => (
            <Badge key={reason} variant="review" className="font-mono font-semibold">
              <AlertTriangle className="size-3 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              <span>{reason}</span>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

interface DiffReviewInspectorProps {
  preview: PreviewDatasetData;
}

export function DiffReviewInspector({ preview }: DiffReviewInspectorProps) {
  const [activeFilter, setActiveFilter] = useState<DiffFilter>('ALL');
  const stopSummaryRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (preview.status === 'STOP_BLOCKED') {
      stopSummaryRef.current?.focus();
    }
  }, [preview]);

  if (preview.status === 'STOP_BLOCKED') {
    return (
      <section aria-label="สรุปข้อผิดพลาดจากขั้นตอน Preview" className="space-y-4">
        <Alert
          ref={stopSummaryRef}
          variant="stop"
          role="alert"
          tabIndex={-1}
          aria-labelledby="stop-summary-title"
          className="space-y-3 focus:outline-2 focus:outline-offset-2 focus:outline-destructive"
        >
          <div className="flex items-start gap-3">
            <OctagonAlert
              className="mt-0.5 size-5 shrink-0"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <div className="space-y-2 min-w-0">
              <h3
                id="stop-summary-title"
                className="text-[0.9375rem] font-semibold leading-[1.45] text-status-stop-fg"
              >
                พบข้อผิดพลาดร้ายแรง — บล็อกการบันทึกข้อมูล (STOP/BLOCKED)
              </h3>
              <ul className="list-disc pl-5 space-y-1.5 text-sm text-foreground">
                {preview.diagnostics.map((diag, idx) => (
                  <li key={`${diag.code}-${idx}`}>
                    <a
                      href={`#diag-${idx}`}
                      className="underline decoration-destructive/60 underline-offset-2 hover:text-status-stop-fg"
                    >
                      <code className="font-mono font-semibold">{diag.code}</code>
                    </a>
                    {diag.field && (
                      <span className="ml-1.5 font-mono text-xs text-muted-foreground">
                        (ฟิลด์: {diag.field})
                      </span>
                    )}
                    <span className="ml-1.5">— {diag.message}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs font-medium text-status-stop-fg">
                ไม่สามารถยืนยันการเขียนข้อมูลได้จนกว่าจะแก้ไขสาเหตุและรัน Preview ใหม่
              </p>
            </div>
          </div>
        </Alert>

        <div className="space-y-2">
          {preview.diagnostics.map((diag, idx) => (
            <Card
              key={`card-${diag.code}-${idx}`}
              id={`diag-${idx}`}
              className="border-status-stop-border"
            >
              <CardContent className="p-3.5 text-sm space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="stop" className="font-mono font-semibold">
                    {diag.code}
                  </Badge>
                  {diag.field && (
                    <span className="font-mono text-xs text-muted-foreground">
                      field: {diag.field}
                    </span>
                  )}
                  {diag.rowIndex !== undefined && (
                    <span className="font-mono text-xs text-muted-foreground">
                      row #{diag.rowIndex + 1}
                    </span>
                  )}
                  {diag.pageOffset !== undefined && (
                    <span className="font-mono text-xs text-muted-foreground">
                      offset: {diag.pageOffset}
                    </span>
                  )}
                </div>
                <p className="text-foreground">{diag.message}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    );
  }

  const filteredRows = preview.sampleRows.filter((row) => {
    if (activeFilter === 'ALL') return true;
    if (activeFilter === 'REVIEW') {
      return row.diffKind === 'REVIEW' || row.reviewReasons.length > 0;
    }
    return row.diffKind === activeFilter;
  });

  const allUnchanged =
    preview.counts.insert === 0 && preview.counts.update === 0 && preview.counts.review === 0;

  const counterCards: Array<{
    kind: DiffKind;
    thaiLabel: string;
    count: number;
    icon: typeof PlusCircle;
    classes: string;
  }> = [
    {
      kind: 'INSERT',
      thaiLabel: 'เพิ่มใหม่',
      count: preview.counts.insert,
      icon: PlusCircle,
      classes: 'bg-diff-insert-bg border-diff-insert-border text-diff-insert-fg',
    },
    {
      kind: 'UPDATE',
      thaiLabel: 'อัปเดต',
      count: preview.counts.update,
      icon: RefreshCw,
      classes: 'bg-diff-update-bg border-diff-update-border text-diff-update-fg',
    },
    {
      kind: 'UNCHANGED',
      thaiLabel: 'ไม่เปลี่ยนแปลง',
      count: preview.counts.unchanged,
      icon: MinusCircle,
      classes: 'bg-diff-unchanged-bg border-diff-unchanged-border text-diff-unchanged-fg',
    },
    {
      kind: 'REVIEW',
      thaiLabel: 'ต้องตรวจสอบ',
      count: preview.counts.review,
      icon: AlertTriangle,
      classes: 'bg-diff-review-bg border-diff-review-border text-diff-review-fg',
    },
  ];

  const reviewEntries = Object.entries(preview.reviewBreakdown) as Array<
    [ReviewReasonCode, number]
  >;

  return (
    <section aria-labelledby="diff-inspector-heading" className="space-y-4">
      {preview.unresolvedPreviousRun && (
        <Alert variant="stop" role="alert">
          <div className="flex items-start gap-3">
            <OctagonAlert
              className="mt-0.5 size-5 shrink-0"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <div className="space-y-1">
              <AlertTitle>พบรอบซิงก์ก่อนหน้าค้างอยู่ (UNRESOLVED_PREVIOUS_RUN)</AlertTitle>
              <AlertDescription className="text-foreground">
                รอบ{' '}
                <code className="font-mono font-semibold">
                  {preview.unresolvedPreviousRun.runId}
                </code>{' '}
                มีสถานะ <code className="font-mono">STARTED</code> ใน{' '}
                <code className="font-mono">_ThaiPHCSyncLog</code> กรุณาตรวจสอบแท็บปลายทาง{' '}
                <code className="font-mono">{preview.destinationTab}</code>{' '}
                และติ๊กยืนยันการตรวจสอบในขั้นตอนยืนยันก่อนบันทึกข้อมูลใหม่
              </AlertDescription>
            </div>
          </div>
        </Alert>
      )}

      {/* 4.1 Preview Fingerprint Metadata Strip */}
      <div className="rounded-lg border border-border bg-muted/70 p-3.5 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2
              id="diff-inspector-heading"
              className="text-[1.0625rem] font-semibold leading-[1.4] text-foreground"
            >
              2. ผลตรวจสอบ Preview &amp; Preview Fingerprint
            </h2>
            <EnvironmentBadge env={preview.env} />
            <Badge variant="neutral" className="font-mono">
              {preview.endpoint} → {preview.destinationTab}
            </Badge>
          </div>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            เวลา Preview (Asia/Bangkok): {formatBangkokDateTime(preview.previewedAtUtc)}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="rounded-md border border-border bg-card p-2.5">
            <div className="text-muted-foreground">จำนวนข้อมูลต้นทาง (sourceTotal)</div>
            <div className="mt-1 font-mono text-base font-semibold tabular-nums text-foreground">
              {preview.sourceTotal.toLocaleString('en-US')} แถว ({preview.pagesFetched} หน้า)
            </div>
          </div>
          <div className="rounded-md border border-border bg-card p-2.5 min-w-0">
            <div className="text-muted-foreground">datasetDigest (SHA-256)</div>
            <div className="mt-1">
              <CopyableIdentifier
                value={preview.fingerprint.datasetDigest}
                displayValue={shortHex(preview.fingerprint.datasetDigest)}
                label="datasetDigest"
                maxWidthClass="max-w-full"
              />
            </div>
          </div>
          <div className="rounded-md border border-border bg-card p-2.5 min-w-0">
            <div className="text-muted-foreground">sheetRevisionFingerprint</div>
            <div className="mt-1">
              <CopyableIdentifier
                value={preview.fingerprint.sheetRevisionFingerprint}
                displayValue={shortHex(preview.fingerprint.sheetRevisionFingerprint)}
                label="sheetRevisionFingerprint"
                maxWidthClass="max-w-full"
              />
            </div>
          </div>
          <div className="rounded-md border border-border bg-card p-2.5 min-w-0">
            <div className="text-muted-foreground">Preview Fingerprint Digest</div>
            <div className="mt-1">
              <CopyableIdentifier
                value={preview.fingerprint.fingerprintDigest}
                displayValue={shortHex(preview.fingerprint.fingerprintDigest)}
                label="Preview Fingerprint"
                maxWidthClass="max-w-full"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 4.4 Diff Classification Counter Cards (Interactive Filters) */}
      <div
        className="grid grid-cols-2 lg:grid-cols-4 gap-3"
        role="group"
        aria-label="ตัวกรองตามการจำแนกผลต่าง"
      >
        {counterCards.map((item) => {
          const Icon = item.icon;
          const isPressed = activeFilter === item.kind;
          return (
            <button
              key={item.kind}
              type="button"
              aria-pressed={isPressed}
              onClick={() => setActiveFilter((prev) => (prev === item.kind ? 'ALL' : item.kind))}
              className={cn(
                'flex flex-col items-start gap-1.5 rounded-lg border p-3.5 text-left transition-colors duration-150 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                item.classes,
                isPressed && 'ring-2 ring-ring ring-offset-2',
              )}
            >
              <div className="flex w-full items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold">
                  <Icon className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                  <span>{item.kind}</span>
                </span>
                <span className="text-xs font-medium">{item.thaiLabel}</span>
              </div>
              <span className="font-mono text-2xl font-semibold leading-[1.2] tabular-nums">
                {item.count.toLocaleString('en-US')}
              </span>
            </button>
          );
        })}
      </div>

      {/* 4.5 REVIEW Sub-Category Breakdown */}
      {reviewEntries.length > 0 && (
        <div
          role="status"
          className="rounded-lg border border-diff-review-border bg-diff-review-bg/60 p-3.5 space-y-2"
        >
          <div className="flex items-center gap-1.5 text-sm font-semibold text-diff-review-fg">
            <AlertTriangle className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            <span>รายละเอียดรายการต้องตรวจสอบ (REVIEW)</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {reviewEntries.map(([reason, count]) => (
              <div
                key={reason}
                className="flex flex-wrap items-center gap-2 rounded-md border border-diff-review-border bg-card px-2.5 py-1.5 text-xs"
              >
                <Badge variant="review" className="font-mono font-semibold">
                  {reason} ({count})
                </Badge>
                <span className="text-foreground">{REVIEW_EXPLANATIONS[reason]}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4.6 Mode A — Reference Readable Sample & Changed-Fields Table */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 border-b border-border/70">
          <div>
            <h3 className="text-[0.9375rem] font-semibold leading-[1.45] text-foreground">
              ตัวอย่างรายการเปรียบเทียบ (Mode A · Reference Dataset)
            </h3>
            <p className="text-xs text-muted-foreground">
              แสดง {filteredRows.length.toLocaleString('en-US')} รายการ
              {activeFilter !== 'ALL' ? ` (กรองเฉพาะ ${activeFilter})` : ' (ทั้งหมด)'}
            </p>
          </div>
          {activeFilter !== 'ALL' && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setActiveFilter('ALL')}
            >
              แสดงทั้งหมด
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0 sm:p-4">
          {allUnchanged && activeFilter === 'ALL' ? (
            <div className="flex items-center gap-2.5 rounded-lg border border-status-verified-border bg-status-verified-bg/60 p-4 m-4 sm:m-0 text-sm text-status-verified-fg">
              <CheckCircle2 className="size-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              <span>ข้อมูลต้นทางตรงกับปลายทางทั้งหมด (UNCHANGED) — ไม่มีความจำเป็นต้องเขียนข้อมูลใหม่</span>
            </div>
          ) : filteredRows.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              ไม่มีรายการที่ตรงกับตัวกรอง <code className="font-mono">{activeFilter}</code>
            </p>
          ) : (
            <>
              {/* Desktop / Tablet semantic table */}
              <div className="hidden md:block">
                <Table>
                  <caption className="sr-only">
                    ตารางตัวอย่างผลต่างของชุดข้อมูล {preview.endpoint}
                  </caption>
                  <TableHeader>
                    <TableRow>
                      <TableHead scope="col">สถานะ (Diff)</TableHead>
                      <TableHead scope="col">_source_key</TableHead>
                      <TableHead scope="col">ชื่อ / รหัสอ้างอิง</TableHead>
                      <TableHead scope="col">รายการเปลี่ยนแปลง (Changed Fields)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.map((row) => (
                      <TableRow key={`${row.diffKind}-${row.sourceKey}`}>
                        <TableCell>
                          <DiffBadge kind={row.diffKind} />
                        </TableCell>
                        <TableCell className="font-mono text-xs font-medium tabular-nums">
                          {row.sourceKey}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-foreground">{row.displayName}</div>
                          <div className="font-mono text-xs text-muted-foreground">
                            {row.displayCode}
                          </div>
                        </TableCell>
                        <TableCell>
                          <RowChangeDetails row={row} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile 375px stacked cards (zero horizontal page overflow) */}
              <div className="space-y-2.5 p-3 md:hidden">
                {filteredRows.map((row) => (
                  <div
                    key={`card-${row.diffKind}-${row.sourceKey}`}
                    className="rounded-lg border border-border bg-card p-3 space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <DiffBadge kind={row.diffKind} />
                      <code className="font-mono text-xs font-medium text-foreground">
                        {row.sourceKey}
                      </code>
                    </div>
                    <div className="text-sm font-medium text-foreground">{row.displayName}</div>
                    <RowChangeDetails row={row} />
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
