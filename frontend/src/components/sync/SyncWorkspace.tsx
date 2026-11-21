import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, OctagonAlert, RotateCw } from 'lucide-react';
import { useRef, useState } from 'react';
import { useGasTransport } from '@/api/TransportContext';
import {
  GasRpcClientError,
  type CommitSmallDatasetData,
  type CommitSmallDatasetRequest,
  type DashboardStatusData,
  type DatasetEndpoint,
  type PreviewDatasetData,
  type PreviewDatasetRequest,
} from '@/api/types';
import { BearerTokenBar } from '@/components/sync/BearerTokenBar';
import { CommitOutcomePanel, CommitProgressCard } from '@/components/sync/CommitOutcomePanel';
import { ConfirmationGate } from '@/components/sync/ConfirmationGate';
import { DatasetSelector } from '@/components/sync/DatasetSelector';
import { DiffReviewInspector } from '@/components/sync/DiffReviewInspector';
import { PreviewProgressCard } from '@/components/sync/PreviewProgressCard';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { TokenSession } from '@/hooks/useTokenSession';
import { cn } from '@/lib/utils';

const STAGES = [
  { num: 1, label: 'เลือกชุดข้อมูล' },
  { num: 2, label: 'Preview & ตรวจผลต่าง' },
  { num: 3, label: 'ยืนยันและบันทึก' },
  { num: 4, label: 'ผลตรวจอ่านซ้ำ' },
] as const;

interface BoundPreviewState {
  tokenRevision: number;
  endpoint: DatasetEndpoint;
  data: PreviewDatasetData;
}

interface BoundPreviewErrorState {
  tokenRevision: number;
  endpoint: DatasetEndpoint;
  message: string;
}

interface SyncWorkspaceProps {
  data: DashboardStatusData | undefined;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  selectedEndpoint: DatasetEndpoint;
  onSelectEndpoint: (endpoint: DatasetEndpoint) => void;
  tokenSession: TokenSession;
  onBusyChange: (busy: boolean) => void;
  onRefresh: () => void;
  onBackToDashboard: () => void;
}

export function SyncWorkspace({
  data,
  isPending,
  isError,
  error,
  selectedEndpoint,
  onSelectEndpoint,
  tokenSession,
  onBusyChange,
  onRefresh,
  onBackToDashboard,
}: SyncWorkspaceProps) {
  const transport = useGasTransport();
  const queryClient = useQueryClient();

  const [previewState, setPreviewState] = useState<BoundPreviewState | null>(null);
  const [commitOutcome, setCommitOutcome] = useState<CommitSmallDatasetData | null>(null);
  const [previewRpcErrorState, setPreviewRpcErrorState] = useState<BoundPreviewErrorState | null>(
    null,
  );
  const [cancelNotice, setCancelNotice] = useState<string | null>(null);

  const previewRunTokenRef = useRef(0);

  const selectedDataset = data?.datasets.find((d) => d.endpoint === selectedEndpoint);

  const previewMutation = useMutation({
    mutationFn: (request: PreviewDatasetRequest) => transport.previewDataset(request),
    retry: false,
  });

  const commitMutation = useMutation({
    mutationFn: (request: CommitSmallDatasetRequest) => transport.commitSmallDataset(request),
    retry: false,
    onMutate: () => {
      onBusyChange(true);
    },
    onSettled: () => {
      onBusyChange(false);
    },
  });

  const isPreviewing = previewMutation.isPending;
  const isCommitting = commitMutation.isPending;
  const isBusy = isPreviewing || isCommitting;

  // Bind active preview & error strictly to the current tokenRevision and endpoint:
  // any manual clear, 15-min idle wipe, HTTP_401 wipe, or token edit permanently invalidates them.
  const activePreviewData =
    tokenSession.token.length > 0 &&
    previewState !== null &&
    previewState.tokenRevision === tokenSession.tokenRevision &&
    previewState.endpoint === selectedEndpoint
      ? previewState.data
      : null;

  const activePreviewRpcError =
    tokenSession.token.length > 0 &&
    previewRpcErrorState !== null &&
    previewRpcErrorState.tokenRevision === tokenSession.tokenRevision &&
    previewRpcErrorState.endpoint === selectedEndpoint
      ? previewRpcErrorState.message
      : null;

  const previewInstanceKey = activePreviewData
    ? activePreviewData.status === 'READY'
      ? `${activePreviewData.endpoint}-${activePreviewData.fingerprint.fingerprintDigest}-${activePreviewData.previewedAtUtc}-${tokenSession.tokenRevision}`
      : `${activePreviewData.endpoint}-blocked-${activePreviewData.previewedAtUtc}-${tokenSession.tokenRevision}`
    : 'none';

  function handleSelectEndpoint(endpoint: DatasetEndpoint) {
    if (isBusy) return;
    onSelectEndpoint(endpoint);
    setPreviewState(null);
    setCommitOutcome(null);
    setPreviewRpcErrorState(null);
    setCancelNotice(null);
  }

  function runPreview(endpointToRun: DatasetEndpoint) {
    const err = tokenSession.validateNow();
    if (err !== null) {
      return;
    }

    tokenSession.touchActivity();
    setCancelNotice(null);
    setPreviewRpcErrorState(null);
    setCommitOutcome(null);
    setPreviewState(null);

    const runToken = previewRunTokenRef.current + 1;
    previewRunTokenRef.current = runToken;
    const startedTokenRevision = tokenSession.tokenRevision;

    previewMutation.mutate(
      { endpoint: endpointToRun, token: tokenSession.token },
      {
        onSuccess: (result) => {
          if (previewRunTokenRef.current !== runToken) {
            return;
          }
          setPreviewState({
            tokenRevision: startedTokenRevision,
            endpoint: endpointToRun,
            data: result,
          });
        },
        onError: (mutationErr) => {
          if (previewRunTokenRef.current !== runToken) {
            return;
          }
          if (mutationErr instanceof GasRpcClientError && mutationErr.code === 'HTTP_401') {
            setPreviewState(null);
            setPreviewRpcErrorState(null);
            tokenSession.clearToken('http_401');
            return;
          }
          setPreviewRpcErrorState({
            tokenRevision: startedTokenRevision,
            endpoint: endpointToRun,
            message:
              mutationErr instanceof GasRpcClientError
                ? `${mutationErr.code}: ${mutationErr.message}`
                : 'ไม่สามารถรัน Preview ข้อมูลได้ กรุณาตรวจสอบการเชื่อมต่อแล้วลองใหม่',
          });
        },
      },
    );
  }

  function handleCancelPreview() {
    previewRunTokenRef.current += 1;
    previewMutation.reset();
    setPreviewState(null);
    setPreviewRpcErrorState(null);
    setCancelNotice('ยกเลิก Preview แล้ว — ไม่มีการเปลี่ยนแปลงใน Google Sheets');
  }

  function handleConfirmCommit(params: {
    confirmationPhrase?: string;
    acknowledgeUnresolvedRunId?: string;
  }) {
    if (!activePreviewData || activePreviewData.status !== 'READY') return;
    const tokenErr = tokenSession.validateNow();
    if (tokenErr !== null) return;

    tokenSession.touchActivity();
    setCommitOutcome(null);
    setPreviewRpcErrorState(null);

    const request: CommitSmallDatasetRequest = {
      endpoint: activePreviewData.endpoint,
      token: tokenSession.token,
      expectedFingerprint: activePreviewData.fingerprint,
      confirmationPhrase: params.confirmationPhrase,
      acknowledgeUnresolvedRunId: params.acknowledgeUnresolvedRunId,
    };

    commitMutation.mutate(request, {
      onSuccess: (outcome) => {
        setCommitOutcome(outcome);
        void queryClient.invalidateQueries({ queryKey: ['dashboard-status'] });
      },
      onError: (mutationErr) => {
        if (mutationErr instanceof GasRpcClientError && mutationErr.code === 'HTTP_401') {
          setPreviewState(null);
          setPreviewRpcErrorState(null);
          tokenSession.clearToken('http_401');
          return;
        }
        // Unknown non-ACID transport failure during Commit -> UNKNOWN_OUTCOME_STOP (never auto-retry!)
        setCommitOutcome({
          status: 'UNKNOWN_OUTCOME_STOP',
          runId: null,
          endpoint: activePreviewData.endpoint,
          env: activePreviewData.env,
          destinationTab: activePreviewData.destinationTab,
          stopCode: 'WRITE_FAILED_UNKNOWN',
          message:
            mutationErr instanceof GasRpcClientError
              ? mutationErr.message
              : 'การสื่อสารกับ Google Apps Script ขาดหายระหว่าง Commit กรุณาตรวจสอบชีตปลายทางและ _ThaiPHCSyncLog',
          syncLogStatus: 'STARTED',
          stagingTabRetained: null,
        });
        void queryClient.invalidateQueries({ queryKey: ['dashboard-status'] });
      },
    });
  }

  function handleSyncNextDataset() {
    // Keeps active in-memory Bearer Token intact for sequential dataset syncs
    setPreviewState(null);
    setCommitOutcome(null);
    setPreviewRpcErrorState(null);
    setCancelNotice(null);
  }

  function handleBackToDashboard() {
    if (isCommitting) return;
    void queryClient.invalidateQueries({ queryKey: ['dashboard-status'] });
    onBackToDashboard();
  }

  const activeStage = commitOutcome
    ? 4
    : isCommitting
      ? 3
      : activePreviewData || isPreviewing
        ? 2
        : 1;

  return (
    <div className="sync-workspace-root mx-auto max-w-[1280px] space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-[1.375rem] font-semibold leading-[1.35] tracking-tight text-foreground">
            พื้นที่ซิงก์ข้อมูล (Sync Workspace)
          </h1>
          <p className="text-sm text-muted-foreground">
            เลือก 1 ชุดข้อมูลต่อรอบการซิงก์ (Repeatable Sync) ภายใต้ขอบเขต จ.แพร่ (54) / อ.สอง (5406)
          </p>
        </div>
        <Button
          variant="outline"
          disabled={isCommitting}
          onClick={handleBackToDashboard}
          className="w-full sm:w-auto"
        >
          <ArrowLeft className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
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
            <OctagonAlert
              className="mt-0.5 size-5 shrink-0"
              strokeWidth={1.75}
              aria-hidden="true"
            />
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
              <RotateCw className="size-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              <span>ลองโหลดสถานะอีกครั้ง</span>
            </Button>
          </div>
        </Alert>
      )}

      {data && (
        <>
          {/* Module 1: Persistent Bearer Token Bar */}
          <BearerTokenBar session={tokenSession} disabled={isBusy} />

          {/* 4-Stage Linear Stepper */}
          <nav
            aria-label="ขั้นตอนการซิงก์ข้อมูล"
            className="rounded-lg border border-border bg-card px-4 py-3"
          >
            <div className="text-xs font-semibold text-primary sm:hidden">
              ขั้นตอน {activeStage} / 4: {STAGES[activeStage - 1].label}
            </div>
            <ol className="hidden sm:grid sm:grid-cols-4 gap-2 text-xs">
              {STAGES.map((stage) => {
                const isCurrent = stage.num === activeStage;
                const isDone = stage.num < activeStage;
                return (
                  <li
                    key={stage.num}
                    aria-current={isCurrent ? 'step' : undefined}
                    className={cn(
                      'flex items-center gap-2 rounded-md border px-3 py-2 font-medium',
                      isCurrent
                        ? 'border-primary bg-primary-soft text-primary-soft-foreground'
                        : isDone
                          ? 'border-status-verified-border bg-status-verified-bg/60 text-status-verified-fg'
                          : 'border-border bg-muted/40 text-muted-foreground',
                    )}
                  >
                    <span className="font-mono font-semibold">{stage.num}.</span>
                    <span className="truncate">{stage.label}</span>
                  </li>
                );
              })}
            </ol>
          </nav>

          {/* Module 2: Single-API Dataset Selector (8 APIs) */}
          <DatasetSelector
            data={data}
            selectedEndpoint={selectedEndpoint}
            onSelectEndpoint={handleSelectEndpoint}
            onStartPreview={() => runPreview(selectedEndpoint)}
            isLocked={isBusy}
          />

          {cancelNotice && (
            <div
              role="status"
              className="rounded-lg border border-border bg-muted/70 px-4 py-3 text-sm text-foreground"
            >
              {cancelNotice}
            </div>
          )}

          {activePreviewRpcError && (
            <Alert variant="stop" role="alert">
              <div className="flex items-start gap-2.5">
                <OctagonAlert
                  className="mt-0.5 size-5 shrink-0"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                <div className="space-y-1">
                  <AlertTitle>ไม่สามารถรันขั้นตอน Preview ได้</AlertTitle>
                  <AlertDescription className="text-foreground">
                    {activePreviewRpcError}
                  </AlertDescription>
                </div>
              </div>
            </Alert>
          )}

          {/* Module 3: Batched Preview Progress & Cancel */}
          {isPreviewing && selectedDataset && (
            <PreviewProgressCard
              endpoint={selectedDataset.endpoint}
              paginationProtocol={selectedDataset.paginationProtocol}
              onCancel={handleCancelPreview}
            />
          )}

          {/* Module 6.1: In-flight Commit Progress */}
          {isCommitting && <CommitProgressCard endpoint={selectedEndpoint} />}

          {/* Module 6.2–6.4: Commit Outcomes */}
          {!isCommitting && commitOutcome && (
            <CommitOutcomePanel
              outcome={commitOutcome}
              onSyncNextDataset={handleSyncNextDataset}
              onBackToDashboard={handleBackToDashboard}
              onRunFreshPreview={() => runPreview(selectedEndpoint)}
              onResetWorkspace={handleSyncNextDataset}
            />
          )}

          {/* Module 4 & 5: Diff & Review Inspector + Explicit Confirmation Gate */}
          {!isPreviewing && !isCommitting && !commitOutcome && activePreviewData && (
            <>
              <DiffReviewInspector key={`diff-${previewInstanceKey}`} preview={activePreviewData} />
              <ConfirmationGate
                key={`gate-${previewInstanceKey}`}
                preview={activePreviewData}
                targetWorkbook={data.workbooks.reference}
                isCommitting={isCommitting}
                onConfirmCommit={handleConfirmCommit}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
