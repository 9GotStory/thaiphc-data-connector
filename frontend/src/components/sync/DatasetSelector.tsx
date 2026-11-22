import { Database, FileSpreadsheet, Info, Lock, OctagonAlert, Play, ShieldOff } from 'lucide-react';
import type { DashboardDatasetStatus, DashboardStatusData, DatasetEndpoint } from '@/api/types';
import { SyncModeBadge } from '@/components/StatusBadges';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { DATASET_DISPLAY_META } from '@/lib/datasetMeta';
import { cn } from '@/lib/utils';

interface DatasetSelectorProps {
  data: DashboardStatusData;
  selectedEndpoint: DatasetEndpoint;
  onSelectEndpoint: (endpoint: DatasetEndpoint) => void;
  onStartPreview: () => void;
  isLocked: boolean;
}

function isWriteGuardAllowedForDataset(
  data: DashboardStatusData,
  ds: DashboardDatasetStatus,
): boolean {
  if (ds.group === 'reference') {
    return data.guards.writeEnabled;
  }
  const requiresHmac = DATASET_DISPLAY_META[ds.endpoint].usesHmacPseudonym;
  return (
    data.guards.writeEnabled &&
    data.guards.personDataWriteEnabled &&
    data.guards.reportWorkbookApproved &&
    (!requiresHmac || data.guards.hmacKeyConfigured)
  );
}

function DatasetRadioCard({
  dataset,
  data,
  selected,
  disabled,
  onSelect,
}: {
  dataset: DashboardDatasetStatus;
  data: DashboardStatusData;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const meta = DATASET_DISPLAY_META[dataset.endpoint];
  const writeAllowed = isWriteGuardAllowedForDataset(data, dataset);
  const isExtended = dataset.group === 'extended_report';
  const inputId = `dataset-radio-${dataset.endpoint}`;

  return (
    <label
      htmlFor={inputId}
      className={cn(
        'relative flex flex-col justify-between rounded-lg border bg-card p-3.5 transition-colors duration-150 cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:checked]:border-primary has-[:checked]:bg-primary-soft/60',
        selected ? 'border-primary bg-primary-soft/60' : 'border-border hover:bg-muted/50',
        disabled && 'cursor-not-allowed opacity-60',
      )}
    >
      <input
        id={inputId}
        type="radio"
        name="thaiphc-dataset-selector"
        value={dataset.endpoint}
        checked={selected}
        disabled={disabled}
        onChange={onSelect}
        className="sr-only"
      />

      <div className="space-y-1">
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm font-semibold leading-snug text-foreground">
            {meta.thaiName}
          </span>
          <span
            aria-hidden="true"
            className={cn(
              'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border',
              selected ? 'border-primary bg-primary' : 'border-input bg-card',
            )}
          >
            {selected && <span className="size-1.5 rounded-full bg-primary-foreground" />}
          </span>
        </div>
        <div className="font-mono text-xs text-muted-foreground">{dataset.endpoint}</div>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <SyncModeBadge syncMode={dataset.syncMode} />
        {isExtended && (
          <Badge variant="neutral">
            <Lock className="size-3 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            <span>Minimized Projection</span>
          </Badge>
        )}
        {meta.policyTag && <Badge variant="neutral">{meta.policyTag}</Badge>}
        {dataset.lastStatus === 'UNRESOLVED_PREVIOUS_RUN' && (
          <Badge variant="stop">
            <OctagonAlert className="size-3 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            <span className="font-mono font-semibold">UNRESOLVED_PREVIOUS_RUN</span>
          </Badge>
        )}
        {!writeAllowed && (
          <Badge variant="guardOff">
            <ShieldOff className="size-3 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            <span>Preview เท่านั้น (Guard OFF)</span>
          </Badge>
        )}
      </div>
    </label>
  );
}

export function DatasetSelector({
  data,
  selectedEndpoint,
  onSelectEndpoint,
  onStartPreview,
  isLocked,
}: DatasetSelectorProps) {
  const referenceDatasets = data.datasets.filter((d) => d.group === 'reference');
  const extendedDatasets = data.datasets.filter((d) => d.group === 'extended_report');

  return (
    <Card>
      <CardHeader>
        <h2
          id="dataset-selector-heading"
          className="text-[1.0625rem] font-semibold leading-[1.4] text-foreground"
        >
          1. เลือกชุดข้อมูลสำหรับซิงก์ (1 API ต่อ 1 รอบ)
        </h2>
        <CardDescription>
          เลือก 1 ชุดข้อมูลภายใต้ขอบเขต จ.แพร่ (54) / อ.สอง (5406) แบ่งกลุ่ม Reference Datasets (3) และ
          Extended Report Datasets (5)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <fieldset
          disabled={isLocked}
          role="radiogroup"
          aria-labelledby="dataset-selector-heading"
          className="space-y-5"
        >
          <div className="space-y-2.5" role="group" aria-labelledby="ws-group-ref-heading">
            <h3
              id="ws-group-ref-heading"
              className="flex items-center gap-1.5 text-[0.9375rem] font-semibold leading-[1.45] text-foreground"
            >
              <Database
                className="size-4 shrink-0 text-primary"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <span>ชุดข้อมูลอ้างอิงพื้นฐาน (Reference Datasets · 3 APIs)</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {referenceDatasets.map((ds) => (
                <DatasetRadioCard
                  key={ds.endpoint}
                  dataset={ds}
                  data={data}
                  selected={ds.endpoint === selectedEndpoint}
                  disabled={isLocked}
                  onSelect={() => onSelectEndpoint(ds.endpoint)}
                />
              ))}
            </div>
          </div>

          <div className="space-y-2.5" role="group" aria-labelledby="ws-group-ext-heading">
            <h3
              id="ws-group-ext-heading"
              className="flex items-center gap-1.5 text-[0.9375rem] font-semibold leading-[1.45] text-foreground"
            >
              <FileSpreadsheet
                className="size-4 shrink-0 text-primary"
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <span>
                ชุดข้อมูลรายงานขยาย (Extended Report Datasets · 5 APIs · Minimized Projection)
              </span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {extendedDatasets.map((ds) => (
                <DatasetRadioCard
                  key={ds.endpoint}
                  dataset={ds}
                  data={data}
                  selected={ds.endpoint === selectedEndpoint}
                  disabled={isLocked}
                  onSelect={() => onSelectEndpoint(ds.endpoint)}
                />
              ))}
            </div>
          </div>
        </fieldset>

        <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <Info
              className="mt-0.5 size-4 shrink-0 text-primary"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <span>
              ขั้นตอน Preview เป็นโหมดอ่านอย่างเดียว (GET) ไม่มีการเขียนลง Google Sheets และไม่เก็บข้อมูลบุคคลลง
              Cache
            </span>
          </p>
          <Button
            type="button"
            variant="primary"
            disabled={isLocked}
            onClick={onStartPreview}
            className="w-full sm:w-auto px-5"
          >
            <Play className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            <span>เริ่ม Preview (อ่านอย่างเดียว)</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
