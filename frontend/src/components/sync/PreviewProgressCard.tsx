import { Lock, XCircle } from 'lucide-react';
import type { DatasetEndpoint, PaginationProtocol } from '@/api/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { DATASET_DISPLAY_META } from '@/lib/datasetMeta';

interface PreviewProgressCardProps {
  endpoint: DatasetEndpoint;
  paginationProtocol: PaginationProtocol;
  onCancel: () => void;
}

export function PreviewProgressCard({
  endpoint,
  paginationProtocol,
  onCancel,
}: PreviewProgressCardProps) {
  const meta = DATASET_DISPLAY_META[endpoint];

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

        <Progress value={null} label={`ความคืบหน้า Preview ของ ${endpoint}`} />

        <div className="space-y-1">
          <p
            role="status"
            aria-atomic="true"
            className="font-mono text-sm font-medium tabular-nums text-foreground"
          >
            กำลังดึงข้อมูล {endpoint} จากระบบ ThaiPHC (GET, followRedirects: false) และตรวจเทียบกับ Google
            Sheets...
          </p>
          <p className="text-xs text-muted-foreground">
            ส่งคำขอแบบอ่านอย่างเดียวเพื่อให้อยู่ในขีดจำกัด 6 นาทีของ Google Apps Script
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
