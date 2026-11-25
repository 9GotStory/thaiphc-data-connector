import { Archive, ArrowRight, Database, FileSpreadsheet } from 'lucide-react';
import type { DashboardDatasetStatus, DatasetEndpoint, DatasetGroup } from '@/api/types';
import { CopyableIdentifier } from '@/components/CopyableIdentifier';
import { DatasetStatusBadge, SyncModeBadge, WriteGuardBadge } from '@/components/StatusBadges';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { DATASET_DISPLAY_META } from '@/lib/datasetMeta';
import { formatBangkokDateTime, formatRowCount } from '@/lib/formatters';

interface DatasetGroupCardProps {
  group: DatasetGroup;
  datasets: DashboardDatasetStatus[];
  guardProperty: string;
  guardEnabled: boolean;
  onOpenSyncWorkspace: (endpoint: DatasetEndpoint) => void;
}

export function DatasetGroupCard({
  group,
  datasets,
  guardProperty,
  guardEnabled,
  onOpenSyncWorkspace,
}: DatasetGroupCardProps) {
  const isReference = group === 'reference';
  const headingId = isReference ? 'reference-datasets-heading' : 'extended-report-datasets-heading';
  const title = isReference
    ? 'ชุดข้อมูลอ้างอิงพื้นฐาน (Reference Datasets · 3 APIs)'
    : 'ชุดข้อมูลรายงานขยาย (Extended Report Datasets · 5 APIs)';
  const subtitle = isReference
    ? 'ข้อมูลพื้นที่และหน่วยบริการสาธารณสุข · ใช้โหมด Keyed Upsert ทั้ง 3 ชุด · ฐานข้อมูลอ้างอิงที่ตรวจรับแล้ว (Historical Acceptance Baseline): 111 แถว (8 / 85 / 18)'
    : 'โหมดเก็บครบทุกฟิลด์สำหรับเจ้าหน้าที่ (Full-Field Operator Mode · ADR-0005) · หน้า Dashboard แสดงเฉพาะ Metadata ไม่แสดงข้อมูลบุคคล';
  const caption = isReference
    ? 'ตารางสถานะชุดข้อมูลอ้างอิงพื้นฐาน 3 APIs (จ.แพร่ 54 / อ.สอง 5406)'
    : 'ตารางสถานะชุดข้อมูลรายงานขยาย 5 APIs (แสดงเฉพาะ Metadata ไม่แสดงข้อมูลบุคคล)';

  return (
    <section aria-labelledby={headingId}>
      <Card>
        <CardHeader className="border-b border-border/70">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2">
                {isReference ? (
                  <Database
                    className="size-5 shrink-0 text-primary"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                ) : (
                  <FileSpreadsheet
                    className="size-5 shrink-0 text-primary"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                )}
                <h2
                  id={headingId}
                  className="text-[1.0625rem] font-semibold leading-[1.4] text-foreground"
                >
                  {title}
                </h2>
              </div>
              <CardDescription>{subtitle}</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <span className="font-mono text-xs text-muted-foreground">
                Write Guard: {guardProperty}
              </span>
              <WriteGuardBadge enabled={guardEnabled} compact />
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-4">
          {/* Desktop & Tablet (>=768px): Semantic Table */}
          <div className="hidden md:block">
            <Table>
              <TableCaption>{caption}</TableCaption>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>ชุดข้อมูล (Dataset)</TableHead>
                  <TableHead>โหมดซิงก์ (Sync Mode)</TableHead>
                  <TableHead>แท็บปลายทาง (Destination Tab)</TableHead>
                  <TableHead className="text-right">จำนวนแถว (Rows)</TableHead>
                  <TableHead>Last Run ID</TableHead>
                  <TableHead>ซิงก์ล่าสุด (Last Synced)</TableHead>
                  <TableHead>สถานะล่าสุด (Last Status)</TableHead>
                  <TableHead className="text-right">การทำงาน (Action)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {datasets.map((dataset) => {
                  const meta = DATASET_DISPLAY_META[dataset.endpoint];
                  const isUnresolved = dataset.lastStatus === 'UNRESOLVED_PREVIOUS_RUN';
                  return (
                    <TableRow key={dataset.endpoint}>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium text-foreground">{meta.thaiName}</div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <code className="font-mono text-xs text-muted-foreground">
                              {dataset.endpoint}
                            </code>
                            {meta.policyTag && (
                              <Badge variant="neutral" className="text-[0.7rem] px-1.5 py-0">
                                {meta.policyTag}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </TableCell>

                      <TableCell>
                        <SyncModeBadge syncMode={dataset.syncMode} />
                      </TableCell>

                      <TableCell>
                        <div className="space-y-1">
                          <code className="font-mono text-xs font-medium text-foreground">
                            {dataset.destinationTab}
                          </code>
                          {dataset.syncMode === 'COMPLETE_SNAPSHOT' && (
                            <div className="text-[0.75rem] text-muted-foreground">
                              ผ่าน <span className="font-mono">_ThaiPHCReportCurrent</span>
                            </div>
                          )}
                          {dataset.legacySnapshotPresent && (
                            <div>
                              <Badge variant="legacy" className="text-[0.7rem]">
                                <Archive
                                  className="size-3 shrink-0"
                                  strokeWidth={1.75}
                                  aria-hidden="true"
                                />
                                <span className="font-mono">LEGACY_F010_SNAPSHOT_PRESENT</span>
                              </Badge>
                            </div>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="text-right font-mono tabular-nums font-medium">
                        {formatRowCount(dataset.rowCount)}
                      </TableCell>

                      <TableCell>
                        {dataset.lastRunId ? (
                          <CopyableIdentifier
                            value={dataset.lastRunId}
                            label={`Run ID ของ ${dataset.endpoint}`}
                          />
                        ) : (
                          <span className="font-mono text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>

                      <TableCell className="font-mono tabular-nums text-xs text-muted-foreground whitespace-nowrap">
                        {formatBangkokDateTime(dataset.lastSyncedAtUtc)}
                      </TableCell>

                      <TableCell>
                        <DatasetStatusBadge status={dataset.lastStatus} />
                      </TableCell>

                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant={isUnresolved ? 'destructiveOutline' : 'outline'}
                          onClick={() => onOpenSyncWorkspace(dataset.endpoint)}
                        >
                          <span>{isUnresolved ? 'ตรวจสอบ' : 'เปิดในพื้นที่ซิงก์'}</span>
                          <ArrowRight className="size-3.5 shrink-0" aria-hidden="true" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Mobile (<768px / 375px): Stacked Dataset Status Cards (Zero Horizontal Overflow) */}
          <ul className="space-y-3 md:hidden" aria-label={title}>
            {datasets.map((dataset) => {
              const meta = DATASET_DISPLAY_META[dataset.endpoint];
              const isUnresolved = dataset.lastStatus === 'UNRESOLVED_PREVIOUS_RUN';
              return (
                <li
                  key={dataset.endpoint}
                  className="rounded-lg border border-border bg-card p-3.5 space-y-3 shadow-[var(--shadow-xs)]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-sm text-foreground">{meta.thaiName}</div>
                      <code className="font-mono text-xs text-muted-foreground">
                        {dataset.endpoint}
                      </code>
                    </div>
                    <DatasetStatusBadge status={dataset.lastStatus} />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <SyncModeBadge syncMode={dataset.syncMode} />
                    <code className="font-mono text-xs text-foreground break-all">
                      {dataset.destinationTab}
                    </code>
                    {dataset.legacySnapshotPresent && (
                      <Badge variant="legacy" className="text-[0.7rem]">
                        <Archive className="size-3 shrink-0" aria-hidden="true" />
                        <span className="font-mono">LEGACY_F010_SNAPSHOT_PRESENT</span>
                      </Badge>
                    )}
                  </div>

                  {dataset.syncMode === 'COMPLETE_SNAPSHOT' && (
                    <div className="text-xs text-muted-foreground">
                      ตัวชี้แท็บเผยแพร่: <span className="font-mono">_ThaiPHCReportCurrent</span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 rounded-md bg-muted/60 p-2.5 text-xs">
                    <div>
                      <div className="text-muted-foreground">จำนวนแถว</div>
                      <div className="mt-0.5 font-mono tabular-nums font-semibold text-foreground">
                        {formatRowCount(dataset.rowCount)}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">ซิงก์ล่าสุด</div>
                      <div className="mt-0.5 font-mono tabular-nums text-foreground">
                        {formatBangkokDateTime(dataset.lastSyncedAtUtc)}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1 text-xs">
                    <div className="text-muted-foreground">Last Run ID</div>
                    {dataset.lastRunId ? (
                      <CopyableIdentifier
                        value={dataset.lastRunId}
                        label={`Run ID ของ ${dataset.endpoint}`}
                        maxWidthClass="max-w-full"
                      />
                    ) : (
                      <span className="font-mono text-muted-foreground">—</span>
                    )}
                  </div>

                  <Button
                    className="w-full min-h-11"
                    variant={isUnresolved ? 'destructiveOutline' : 'outline'}
                    onClick={() => onOpenSyncWorkspace(dataset.endpoint)}
                  >
                    <span>{isUnresolved ? 'ตรวจสอบในพื้นที่ซิงก์' : 'เปิดในพื้นที่ซิงก์'}</span>
                    <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
                  </Button>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </section>
  );
}
