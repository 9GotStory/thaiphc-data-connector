import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, OctagonAlert, RotateCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useGasTransport } from '@/api/TransportContext';
import {
  GasRpcClientError,
  type CommitDatasetData,
  type DashboardStatusData,
  type DatasetEndpoint,
  type ExtendedAggregateGroup,
  type ExtendedSampleCandidate,
  type PreviewDatasetData,
  type PreviewFingerprint,
  type PreviewRowDigestEntry,
} from '@/api/types';
import { BearerTokenBar } from '@/components/sync/BearerTokenBar';
import {
  CommitOutcomePanel,
  CommitProgressCard,
  type CommitBatchProgress,
} from '@/components/sync/CommitOutcomePanel';
import { ConfirmationGate } from '@/components/sync/ConfirmationGate';
import { DatasetSelector } from '@/components/sync/DatasetSelector';
import { DiffReviewInspector } from '@/components/sync/DiffReviewInspector';
import {
  PreviewProgressCard,
  type PreviewBatchProgress,
} from '@/components/sync/PreviewProgressCard';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { TokenSession } from '@/hooks/useTokenSession';
import { DATASET_DISPLAY_META } from '@/lib/datasetMeta';
import { cn } from '@/lib/utils';

const STAGES = [
  { num: 1, label: 'เลือกชุดข้อมูล' },
  { num: 2, label: 'Preview & ตรวจผลต่าง' },
  { num: 3, label: 'ยืนยันและบันทึก' },
  { num: 4, label: 'ผลตรวจอ่านซ้ำ' },
] as const;

// Gate 0–calibrated sequential batching constants for large person-level datasets
const BATCHED_PREVIEW_PAGE_SIZE = 100;
const BATCHED_PREVIEW_BATCH_PAGES = 10;

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

interface PreviewExecutionInput {
  endpoint: DatasetEndpoint;
  token: string;
  runToken: number;
}

interface CommitExecutionInput {
  endpoint: DatasetEndpoint;
  token: string;
  expectedFingerprint: PreviewFingerprint;
  destinationTab: string;
  confirmationPhrase?: string;
  acknowledgeUnresolvedRunId?: string;
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
  const [commitOutcome, setCommitOutcome] = useState<CommitDatasetData | null>(null);
  const [previewRpcErrorState, setPreviewRpcErrorState] = useState<BoundPreviewErrorState | null>(
    null,
  );
  const [cancelNotice, setCancelNotice] = useState<string | null>(null);
  const [previewBatchProgress, setPreviewBatchProgress] = useState<PreviewBatchProgress | null>(
    null,
  );
  const [commitBatchProgress, setCommitBatchProgress] = useState<CommitBatchProgress | null>(null);

  const previewRunTokenRef = useRef(0);
  const activeStageTrackerRef = useRef<{ runId: string | null; stagingTabName: string | null }>({
    runId: null,
    stagingTabName: null,
  });

  // Abort any in-flight sequential Batched Preview loop when leaving Sync Workspace
  useEffect(() => {
    const tokenRef = previewRunTokenRef;
    return () => {
      tokenRef.current += 1;
    };
  }, []);

  const selectedDataset = data?.datasets.find((d) => d.endpoint === selectedEndpoint);
  const targetWorkbook =
    data === undefined
      ? null
      : selectedDataset?.group === 'extended_report'
        ? (data.workbooks.report ?? data.workbooks.reference)
        : data.workbooks.reference;

  const previewMutation = useMutation({
    mutationFn: async (input: PreviewExecutionInput): Promise<PreviewDatasetData | null> => {
      if (!DATASET_DISPLAY_META[input.endpoint].usesBatchedSync) {
        setPreviewBatchProgress(null);
        return transport.previewDataset({ endpoint: input.endpoint, token: input.token });
      }

      // Client-orchestrated sequential Batched Preview (Gate 0 calibrated: pageSize=100, batchPages=10)
      const allRowDigests: PreviewRowDigestEntry[] = [];
      const allAggregates: ExtendedAggregateGroup[] = [];
      const allSampleCandidates: ExtendedSampleCandidate[] = [];
      let nextPage: number | null = 1;
      let batchNumber = 0;
      let pagesFetched = 0;
      let rowsFetched = 0;
      let sourceTotal: number | null = null;
      let totalPages: number | null = null;

      while (nextPage !== null) {
        if (previewRunTokenRef.current !== input.runToken) {
          return null;
        }
        batchNumber += 1;
        setPreviewBatchProgress({
          phase: 'fetching',
          batchNumber,
          pagesFetched,
          totalPages,
          rowsFetched,
          sourceTotal,
        });

        const batchRes = await transport.previewDatasetBatch({
          endpoint: input.endpoint,
          token: input.token,
          startPage: nextPage,
          batchPages: BATCHED_PREVIEW_BATCH_PAGES,
          pageSize: BATCHED_PREVIEW_PAGE_SIZE,
          expectedSourceTotal: sourceTotal ?? undefined,
        });

        if (previewRunTokenRef.current !== input.runToken) {
          return null;
        }

        if (batchRes.status === 'STOP_BLOCKED') {
          return {
            status: 'STOP_BLOCKED',
            endpoint: batchRes.endpoint,
            env: batchRes.env,
            syncMode:
              selectedDataset?.syncMode ??
              (input.endpoint === 'volunteer-family' ? 'COMPLETE_SNAPSHOT' : 'KEYED_UPSERT'),
            paginationProtocol:
              selectedDataset?.paginationProtocol ??
              (input.endpoint === 'assignments' ? 'assignment' : 'report'),
            destinationTab:
              input.endpoint === 'volunteer-family'
                ? 'RFamily_<runId>'
                : (selectedDataset?.destinationTab ?? input.endpoint),
            previewedAtUtc: new Date().toISOString(),
            pagesFetched: pagesFetched + batchRes.pagesFetchedInBatch,
            diagnostics: batchRes.diagnostics,
            unresolvedPreviousRun:
              data?.unresolvedRuns.find((r) => r.endpoint === input.endpoint) ?? null,
          };
        }

        pagesFetched += batchRes.pagesFetchedInBatch;
        rowsFetched += batchRes.rowsInBatch;
        sourceTotal = batchRes.sourceTotal;
        totalPages = batchRes.totalPages;
        allRowDigests.push(...batchRes.rowDigests);
        allAggregates.push(...batchRes.aggregateSummary);
        allSampleCandidates.push(...batchRes.sampleCandidates);
        nextPage = batchRes.hasMore ? batchRes.nextPage : null;

        setPreviewBatchProgress({
          phase: nextPage === null ? 'finalizing' : 'fetching',
          batchNumber,
          pagesFetched,
          totalPages,
          rowsFetched,
          sourceTotal,
        });
      }

      if (previewRunTokenRef.current !== input.runToken) {
        return null;
      }

      return transport.finalizePreview({
        endpoint: input.endpoint,
        sourceTotal: sourceTotal ?? rowsFetched,
        pagesFetched,
        rowDigests: allRowDigests,
        aggregateSummary: allAggregates,
        sampleCandidates: allSampleCandidates,
      });
    },
    retry: false,
    onSettled: (_data, _err, variables) => {
      if (previewRunTokenRef.current === variables.runToken) {
        setPreviewBatchProgress(null);
      }
    },
  });

  const commitMutation = useMutation({
    mutationFn: async (input: CommitExecutionInput): Promise<CommitDatasetData> => {
      activeStageTrackerRef.current = { runId: null, stagingTabName: null };

      if (!DATASET_DISPLAY_META[input.endpoint].usesBatchedSync) {
        setCommitBatchProgress(null);
        return transport.commitSmallDataset({
          endpoint: input.endpoint,
          token: input.token,
          expectedFingerprint: input.expectedFingerprint,
          confirmationPhrase: input.confirmationPhrase,
          acknowledgeUnresolvedRunId: input.acknowledgeUnresolvedRunId,
        });
      }

      // Client-orchestrated sequential Multi-Batch Staging -> LockService Finalize Commit (No Auto-Retry)
      let nextPage: number | null = 1;
      let batchNumber = 0;
      let activeRunId: string | undefined;
      let pagesStaged = 0;
      let totalPages: number | null = null;
      let rowsStaged = 0;
      let stagingTabName: string | null = null;

      while (nextPage !== null) {
        batchNumber += 1;
        setCommitBatchProgress({
          phase: 'staging',
          batchNumber,
          pagesStaged,
          totalPages,
          rowsStaged,
          sourceTotal: input.expectedFingerprint.sourceTotal,
          stagingTabName,
        });

        const stageRes = await transport.stageLargeDatasetBatch({
          endpoint: input.endpoint,
          token: input.token,
          expectedFingerprint: input.expectedFingerprint,
          confirmationPhrase: input.confirmationPhrase,
          acknowledgeUnresolvedRunId: input.acknowledgeUnresolvedRunId,
          runId: activeRunId,
          startPage: nextPage,
          batchPages: BATCHED_PREVIEW_BATCH_PAGES,
          pageSize: BATCHED_PREVIEW_PAGE_SIZE,
        });

        if (stageRes.status !== 'BATCH_STAGED') {
          return stageRes;
        }

        activeRunId = stageRes.runId;
        stagingTabName = stageRes.stagingTabName;
        activeStageTrackerRef.current = { runId: activeRunId, stagingTabName };
        pagesStaged = stageRes.lastPageStaged;
        totalPages = stageRes.totalPages;
        rowsStaged = stageRes.stagedRowCount;
        nextPage = stageRes.hasMore ? stageRes.nextPage : null;

        setCommitBatchProgress({
          phase: nextPage === null ? 'finalizing' : 'staging',
          batchNumber,
          pagesStaged,
          totalPages,
          rowsStaged,
          sourceTotal: stageRes.sourceTotal,
          stagingTabName,
        });
      }

      if (!activeRunId) {
        return {
          status: 'FAILED_STOP',
          runId: null,
          endpoint: input.endpoint,
          env: input.expectedFingerprint.env,
          destinationTab: input.destinationTab,
          stopCode: 'STAGING_STATE_INVALID',
          message: 'Staging did not return a valid runId before commit finalization.',
          syncLogStatus: 'NOT_WRITTEN',
          stagingTabRetained: stagingTabName,
        };
      }

      return transport.finalizeLargeDatasetCommit({
        endpoint: input.endpoint,
        expectedFingerprint: input.expectedFingerprint,
        runId: activeRunId,
        confirmationPhrase: input.confirmationPhrase,
        acknowledgeUnresolvedRunId: input.acknowledgeUnresolvedRunId,
      });
    },
    retry: false,
    onMutate: () => {
      onBusyChange(true);
    },
    onSettled: () => {
      setCommitBatchProgress(null);
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
      { endpoint: endpointToRun, token: tokenSession.token, runToken },
      {
        onSuccess: (result) => {
          if (previewRunTokenRef.current !== runToken || result === null) {
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
    setPreviewBatchProgress(null);
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

    const request: CommitExecutionInput = {
      endpoint: activePreviewData.endpoint,
      token: tokenSession.token,
      expectedFingerprint: activePreviewData.fingerprint,
      destinationTab: activePreviewData.destinationTab,
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
          runId: activeStageTrackerRef.current.runId,
          endpoint: activePreviewData.endpoint,
          env: activePreviewData.env,
          destinationTab: activePreviewData.destinationTab,
          stopCode: 'WRITE_FAILED_UNKNOWN',
          message:
            mutationErr instanceof GasRpcClientError
              ? mutationErr.message
              : 'การสื่อสารกับ Google Apps Script ขาดหายระหว่าง Commit กรุณาตรวจสอบชีตปลายทางและ _ThaiPHCSyncLog',
          syncLogStatus: 'STARTED',
          stagingTabRetained: activeStageTrackerRef.current.stagingTabName,
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
              batchProgress={previewBatchProgress}
              onCancel={handleCancelPreview}
            />
          )}

          {/* Module 6.1: In-flight Commit Progress */}
          {isCommitting && (
            <CommitProgressCard
              endpoint={selectedEndpoint}
              syncMode={
                selectedDataset?.syncMode ??
                (selectedEndpoint === 'volunteer-family' ? 'COMPLETE_SNAPSHOT' : 'KEYED_UPSERT')
              }
              batchProgress={commitBatchProgress}
            />
          )}

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
          {!isPreviewing &&
            !isCommitting &&
            !commitOutcome &&
            activePreviewData &&
            targetWorkbook && (
              <>
                <DiffReviewInspector
                  key={`diff-${previewInstanceKey}`}
                  preview={activePreviewData}
                />
                <ConfirmationGate
                  key={`gate-${previewInstanceKey}`}
                  preview={activePreviewData}
                  targetWorkbook={targetWorkbook}
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
