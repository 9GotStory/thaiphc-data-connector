import {
  AlertTriangle,
  FlaskConical,
  KeyRound,
  OctagonAlert,
  ShieldAlert,
  ShieldOff,
} from 'lucide-react';
import { useState } from 'react';
import type { PreviewDatasetData, WorkbookInfo } from '@/api/types';
import { EnvironmentBadge, SyncModeBadge } from '@/components/StatusBadges';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DATASET_DISPLAY_META } from '@/lib/datasetMeta';

interface ConfirmationGateProps {
  preview: PreviewDatasetData;
  targetWorkbook: WorkbookInfo;
  isCommitting: boolean;
  onConfirmCommit: (params: {
    confirmationPhrase?: string;
    acknowledgeUnresolvedRunId?: string;
  }) => void;
}

export function ConfirmationGate({
  preview,
  targetWorkbook,
  isCommitting,
  onConfirmCommit,
}: ConfirmationGateProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [typedPhrase, setTypedPhrase] = useState('');
  const [unresolvedAck, setUnresolvedAck] = useState(false);

  function handleDialogOpenChange(nextOpen: boolean) {
    setDialogOpen(nextOpen);
    if (!nextOpen) {
      setTypedPhrase('');
    }
  }

  // Gate State 1A — Locked by STOP/BLOCKED
  if (preview.status === 'STOP_BLOCKED') {
    return (
      <Card className="bg-muted/60 border-border">
        <CardContent className="p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2.5 text-sm text-status-stop-fg">
            <OctagonAlert
              className="mt-0.5 size-5 shrink-0"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <p id="commit-blocked-desc" className="font-medium">
              การยืนยันถูกปิดใช้งานเนื่องจากพบข้อผิดพลาด STOP/BLOCKED ด้านบน
            </p>
          </div>
          <Button type="button" variant="primary" disabled aria-describedby="commit-blocked-desc">
            ยืนยันการบันทึกถูกปิดใช้งาน
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Gate State 1B — Locked by Write Guard OFF or Unapproved Workbook Policy
  if (!preview.writeAllowed) {
    const guardReason = preview.blockedGuardReason ?? 'THAIPHC_WRITE_ENABLED';
    return (
      <Card className="bg-muted/60 border-border">
        <CardContent className="p-5 space-y-3">
          <div className="flex items-start gap-3">
            <ShieldOff
              className="mt-0.5 size-5 shrink-0 text-guard-off-fg"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <div className="space-y-1">
              <h3 className="text-[0.9375rem] font-semibold leading-[1.45] text-foreground">
                โหมดอ่านอย่างเดียว — ไม่สามารถ Commit ได้
              </h3>
              <p id="commit-guard-off-desc" className="text-sm text-muted-foreground">
                {guardReason === 'THAIPHC_SAME_WORKBOOK_APPROVAL' ? (
                  <>
                    การเขียนชุดข้อมูลรายงานขยายลงสมุดงานเดียวกับข้อมูลอ้างอิงถูกบล็อกโดยนโยบายแยกสมุดงาน —
                    ต้องกำหนด{' '}
                    <code className="font-mono font-semibold text-foreground">
                      THAIPHC_SAME_WORKBOOK_APPROVAL
                    </code>{' '}
                    เป็น{' '}
                    <code className="font-mono font-semibold text-foreground">
                      OWNER_ONLY_5406_APPROVED
                    </code>{' '}
                    หรือกำหนด{' '}
                    <code className="font-mono font-semibold text-foreground">
                      THAIPHC_REPORT_SPREADSHEET_ID
                    </code>{' '}
                    แยกสมุดงานใน Google Apps Script Project Settings &gt; Script Properties
                  </>
                ) : guardReason === 'THAIPHC_REPORT_SPREADSHEET_ID' ? (
                  <>
                    ค่า{' '}
                    <code className="font-mono font-semibold text-foreground">
                      THAIPHC_REPORT_SPREADSHEET_ID
                    </code>{' '}
                    ไม่ถูกต้อง — แก้ไขได้เฉพาะผ่าน Google Apps Script Project Settings &gt; Script
                    Properties
                  </>
                ) : (
                  <>
                    สวิตช์ฝั่งเซิร์ฟเวอร์{' '}
                    <code className="font-mono font-semibold text-foreground">{guardReason}</code>{' '}
                    มีค่าเป็น <code className="font-mono">false</code> (OFF) — เปิดใช้งานได้เฉพาะผ่าน
                    Google Apps Script Project Settings &gt; Script Properties
                  </>
                )}
              </p>
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              disabled
              aria-describedby="commit-guard-off-desc"
            >
              ปิดการเขียน (Write Guard OFF)
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const isProd = preview.env === 'PRODUCTION';
  const showHmacContinuityReminder =
    isProd && DATASET_DISPLAY_META[preview.endpoint].usesHmacPseudonym;
  const expectedPhrase = `PRODUCTION 5406 ${preview.endpoint}`;
  const needsUnresolvedAck = preview.unresolvedPreviousRun !== null;
  const canOpenConfirm = !isCommitting && (!needsUnresolvedAck || unresolvedAck);
  const canSubmitConfirm =
    !isCommitting &&
    (!needsUnresolvedAck || unresolvedAck) &&
    (!isProd || typedPhrase.trim() === expectedPhrase);

  function handleConfirm() {
    if (!canSubmitConfirm) return;
    const submittedPhrase = isProd ? typedPhrase.trim() : undefined;
    handleDialogOpenChange(false);
    onConfirmCommit({
      confirmationPhrase: submittedPhrase,
      acknowledgeUnresolvedRunId: preview.unresolvedPreviousRun?.runId,
    });
  }

  return (
    <Card
      className={
        isProd
          ? 'border-2 border-destructive bg-env-prod-bg/40'
          : 'border-2 border-env-sandbox-border bg-card'
      }
    >
      <CardHeader className="border-b border-border/70">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {isProd ? (
              <ShieldAlert
                className="size-5 shrink-0 text-destructive"
                strokeWidth={1.75}
                aria-hidden="true"
              />
            ) : (
              <FlaskConical
                className="size-5 shrink-0 text-env-sandbox-fg"
                strokeWidth={1.75}
                aria-hidden="true"
              />
            )}
            <h2 className="text-[1.0625rem] font-semibold leading-[1.4] text-foreground">
              {isProd ? '3. เขตยืนยันการเขียนข้อมูลจริง (PRODUCTION)' : '3. ยืนยันและบันทึกข้อมูล (SANDBOX)'}
            </h2>
            <EnvironmentBadge env={preview.env} />
          </div>
          <SyncModeBadge syncMode={preview.syncMode} />
        </div>
      </CardHeader>

      <CardContent className="p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div className="rounded-md border border-border bg-card p-3 min-w-0">
            <div className="text-muted-foreground">สมุดงานปลายทาง (Target Workbook)</div>
            <div className="mt-1 font-medium text-foreground truncate">{targetWorkbook.name}</div>
            <div className="font-mono text-[0.7rem] text-muted-foreground truncate">
              {targetWorkbook.spreadsheetId}
            </div>
          </div>
          <div className="rounded-md border border-border bg-card p-3">
            <div className="text-muted-foreground">ชุดข้อมูลและแท็บปลายทาง</div>
            <div className="mt-1 font-mono font-semibold text-foreground">
              {preview.endpoint} → {preview.destinationTab}
            </div>
          </div>
          <div className="rounded-md border border-border bg-card p-3">
            <div className="text-muted-foreground">ผลกระทบที่ตรวจพบ</div>
            <div className="mt-1 font-mono font-semibold tabular-nums text-foreground">
              +{preview.counts.insert} INSERT / ~{preview.counts.update} UPDATE / =
              {preview.counts.unchanged} UNCHANGED / !{preview.counts.review} REVIEW
            </div>
          </div>
          <div className="rounded-md border border-border bg-card p-3">
            <div className="text-muted-foreground">Preview Fingerprint (สั้น)</div>
            <div className="mt-1 font-mono font-semibold text-foreground">
              {preview.fingerprint.fingerprintDigest.slice(0, 12)}…
            </div>
          </div>
        </div>

        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <AlertTriangle
            className="mt-0.5 size-4 shrink-0 text-diff-review-fg"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <span>
            การเขียนลง Google Sheets ไม่ใช่ระบบ ACID และระบบจะไม่ลองซ้ำอัตโนมัติหากผลลัพธ์ไม่แน่ชัด — GAS จะตรวจ
            Preview Fingerprint ซ้ำภายใต้ LockService ก่อนเขียนจริง
          </span>
        </p>

        {showHmacContinuityReminder && (
          <div
            role="note"
            className="flex items-start gap-2.5 rounded-md border border-status-legacy-border bg-status-legacy-bg p-3 text-xs text-foreground"
          >
            <KeyRound
              className="mt-0.5 size-4 shrink-0 text-status-legacy-fg"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <div className="space-y-1">
              <div className="font-semibold text-status-legacy-fg">
                การตรวจสอบความต่อเนื่องของคีย์ F010 (THAIPHC_HMAC_KEY_B64)
              </div>
              <p>
                ก่อนยืนยันการเขียนลง PRODUCTION กรุณาตรวจสอบว่าค่า{' '}
                <code className="font-mono font-semibold">THAIPHC_HMAC_KEY_B64</code> ใน GAS Script
                Properties ตรงกับคีย์ F010 เดิมทุกตัวอักษร เพื่อให้ Pseudonymous Key (
                <code className="font-mono">h1_...</code>) ตรงกับข้อมูลเดิมและไม่เกิดแถวบุคคลซ้ำซ้อน
              </p>
            </div>
          </div>
        )}

        {needsUnresolvedAck && preview.unresolvedPreviousRun && (
          <label className="flex items-start gap-2.5 rounded-md border border-status-stop-border bg-status-stop-bg/70 p-3 text-xs text-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={unresolvedAck}
              onChange={(e) => setUnresolvedAck(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-destructive"
            />
            <span>
              ฉันได้ตรวจสอบแท็บปลายทาง{' '}
              <code className="font-mono font-semibold">{preview.destinationTab}</code> และรอบที่ค้าง{' '}
              <code className="font-mono font-semibold">{preview.unresolvedPreviousRun.runId}</code>{' '}
              ใน <code className="font-mono">_ThaiPHCSyncLog</code> แล้ว และต้องการเริ่มรอบยืนยันใหม่
            </span>
          </label>
        )}

        <div className="flex justify-end">
          <Button
            type="button"
            variant={isProd ? 'destructive' : 'primary'}
            disabled={!canOpenConfirm}
            onClick={() => setDialogOpen(true)}
            className="w-full sm:w-auto min-h-11"
          >
            {isProd ? 'ดำเนินการยืนยันการบันทึก (PRODUCTION)' : 'ตรวจสอบและยืนยันการบันทึก (SANDBOX)'}
          </Button>
        </div>

        <AlertDialog
          open={dialogOpen}
          onOpenChange={handleDialogOpenChange}
          closeLocked={isCommitting}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle
                className={isProd ? 'flex items-center gap-2 text-status-stop-fg' : undefined}
              >
                {isProd && (
                  <ShieldAlert className="size-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                )}
                <span>
                  {isProd ? 'ยืนยันการเขียนข้อมูลลง PRODUCTION' : 'ยืนยันการบันทึกข้อมูลลงสภาพแวดล้อม SANDBOX'}
                </span>
              </AlertDialogTitle>
              <AlertDialogDescription>
                <p>
                  สมุดงานปลายทาง:{' '}
                  <strong className="font-semibold text-foreground">{targetWorkbook.name}</strong>
                </p>
                <p>
                  ชุดข้อมูล:{' '}
                  <code className="font-mono font-semibold text-foreground">
                    {preview.endpoint}
                  </code>{' '}
                  · โหมด:{' '}
                  <code className="font-mono font-semibold text-foreground">
                    {preview.syncMode}
                  </code>{' '}
                  · แท็บปลายทาง:{' '}
                  <code className="font-mono font-semibold text-foreground">
                    {preview.destinationTab}
                  </code>
                </p>
                <p>
                  Preview Fingerprint:{' '}
                  <code className="font-mono text-xs text-foreground">
                    {preview.fingerprint.fingerprintDigest.slice(0, 16)}…
                  </code>
                </p>
                <p>GAS จะตรวจสอบ Fingerprint ซ้ำภายใต้ LockService ก่อนเขียนจริง และไม่ลองเขียนซ้ำอัตโนมัติ</p>
              </AlertDialogDescription>
            </AlertDialogHeader>

            {isProd && (
              <div className="space-y-2.5">
                {showHmacContinuityReminder && (
                  <div className="rounded-md border border-status-legacy-border bg-status-legacy-bg p-2.5 text-xs text-foreground">
                    <span className="font-semibold text-status-legacy-fg">ย้ำความต่อเนื่อง F010: </span>
                    ยืนยันว่า <code className="font-mono font-semibold">
                      THAIPHC_HMAC_KEY_B64
                    </code>{' '}
                    ตรงกับคีย์เดิมของ F010 เพื่อป้องกันรหัส <code className="font-mono">h1_...</code> ซ้ำซ้อน
                  </div>
                )}
                <div className="rounded-md border border-border bg-muted p-3 font-mono text-sm font-semibold text-foreground">
                  {expectedPhrase}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="prod-confirm-phrase">
                    พิมพ์ข้อความด้านบนให้ตรงทุกตัวอักษรเพื่อเปิดปุ่มยืนยัน
                  </Label>
                  <Input
                    id="prod-confirm-phrase"
                    value={typedPhrase}
                    onChange={(e) => setTypedPhrase(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    className="font-mono text-sm"
                    placeholder={expectedPhrase}
                  />
                </div>
              </div>
            )}

            <AlertDialogFooter>
              <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
              <AlertDialogAction
                variant={isProd ? 'destructive' : 'primary'}
                disabled={!canSubmitConfirm}
                onClick={handleConfirm}
              >
                {isProd ? 'ยืนยันบันทึกข้อมูลลง PRODUCTION' : 'ยืนยันบันทึกข้อมูล'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
