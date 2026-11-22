import { Lock, XCircle } from 'lucide-react';
import type { DatasetEndpoint, PaginationProtocol } from '@/api/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { DATASET_DISPLAY_META } from '@/lib/datasetMeta';

export interface PreviewBatchProgress {
  phase: 'fetching' | 'finalizing';
  batchNumber: number;
  pagesFetched: number;
  totalPages: number | null;
  rowsFetched: number;
  sourceTotal: number | null;
}

interface PreviewProgressCardProps {
  endpoint: DatasetEndpoint;
  paginationProtocol: PaginationProtocol;
  batchProgress?: PreviewBatchProgress | null;
  onCancel: () => void;
}

export function PreviewProgressCard({
  endpoint,
  paginationProtocol,
  batchProgress = null,
  onCancel,
}: PreviewProgressCardProps) {
  const meta = DATASET_DISPLAY_META[endpoint];

  const progressValue =
    batchProgress && batchProgress.totalPages && batchProgress.totalPages > 0
      ? batchProgress.phase === 'finalizing'
        ? 98
        : Math.min(95, Math.round((batchProgress.pagesFetched / batchProgress.totalPages) * 100))
      : null;

  let statusText: string;
  if (!batchProgress) {
    statusText = `กำลังดึงข้อมูล ${endpoint} จากระบบ ThaiPHC (GET, followRedirects: false) และตรวจเทียบกับ Google Sheets...`;
  } else if (batchProgress.phase === 'finalizing') {
    const totalPagesLabel =
      batchProgress.totalPages !== null
        ? ` · ครบ ${batchProgress.totalPages.toLocaleString('en-US')} หน้า`
        : '';
    statusText = `กำลังสรุปผลต่างและ Preview Fingerprint สำหรับ ${endpoint} (${batchProgress.rowsFetched.toLocaleString('en-US')} / ${(batchProgress.sourceTotal ?? batchProgress.rowsFetched).toLocaleString('en-US')} แถว${totalPagesLabel})...`;
  } else if (batchProgress.totalPages !== null && batchProgress.sourceTotal !== null) {
    statusText = `กำลังดึงข้อมูล ${endpoint} — หน้า ${batchProgress.pagesFetched.toLocaleString('en-US')} / ${batchProgress.totalPages.toLocaleString('en-US')} · ดึงแล้ว ${batchProgress.rowsFetched.toLocaleString('en-US')} / ${batchProgress.sourceTotal.toLocaleString('en-US')} แถว (Batch ที่ ${batchProgress.batchNumber})`;
  } else {
    statusText = `กำลังดึงข้อมูล ${endpoint} (Batch ที่ ${batchProgress.batchNumber}) จากระบบ ThaiPHC (GET, followRedirects: false)...`;
  }

  return (
    <Card className="border-primary-soft-border">
      <CardContent className="p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[1.0625rem] font-semibold leading-[1.4] text-foreground">
              กำลังดึงข้อมูล Preview: {meta.thaiName}
            </h2>
            <code className="font-mono text-xs text-muted-foreground">{endpoint}</code>
            <Badge variant="neutral" className="font-mono text-xs">
              โปรโตคอล: {paginationProtocol}
            </Badge>
          </div>
          <Badge variant="primarySoft">
            <Lock className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            <span>อ่านอย่างเดียว · ไม่มีการเขียนชีต</span>
          </Badge>
        </div>

        <Progress value={progressValue} label={`ความคืบหน้า Preview ของ ${endpoint}`} />

        <div className="space-y-1">
          <p
            role="status"
            aria-atomic="true"
            className="font-mono text-sm font-medium tabular-nums text-foreground"
          >
            {statusText}
          </p>
          <p className="text-xs text-muted-foreground">
            ส่งคำขอทีละชุดเพื่อให้อยู่ในขีดจำกัด 6 นาทีของ Google Apps Script
          </p>
        </div>

        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={onCancel}>
            <XCircle className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            <span>ยกเลิก Preview</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
