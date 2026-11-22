import {
  buildMockCommitEnvelope,
  buildMockDashboardEnvelope,
  buildMockFinalizeLargeCommitEnvelope,
  buildMockFinalizePreviewEnvelope,
  buildMockPreviewBatchEnvelope,
  buildMockPreviewEnvelope,
  buildMockStageLargeBatchEnvelope,
  type MockCommitOutcome,
  type MockPreviewOutcome,
  type MockScenario,
} from './mockFixtures';
import {
  GasRpcClientError,
  type CommitDatasetData,
  type CommitSmallDatasetRequest,
  type DashboardStatusData,
  type FinalizeLargeDatasetCommitRequest,
  type FinalizePreviewRequest,
  type PreviewDatasetBatchData,
  type PreviewDatasetBatchRequest,
  type PreviewDatasetData,
  type PreviewDatasetRequest,
  type StageLargeDatasetBatchData,
  type StageLargeDatasetBatchRequest,
} from './types';
import {
  parseCommitDatasetResponse,
  parseDashboardStatusResponse,
  parsePreviewDatasetBatchResponse,
  parsePreviewDatasetResponse,
  parseStageLargeDatasetBatchResponse,
} from './validators';

export { GasRpcClientError } from './types';
export type { MockCommitOutcome, MockPreviewOutcome, MockScenario } from './mockFixtures';

export interface GoogleScriptRunner {
  withSuccessHandler(callback: (value: unknown) => void): GoogleScriptRunner;
  withFailureHandler(callback: (error: unknown) => void): GoogleScriptRunner;
  getDashboardStatus(): void;
  previewDataset(request: PreviewDatasetRequest): void;
  previewDatasetBatch(request: PreviewDatasetBatchRequest): void;
  finalizePreview(request: FinalizePreviewRequest): void;
  commitSmallDataset(request: CommitSmallDatasetRequest): void;
  stageLargeDatasetBatch(request: StageLargeDatasetBatchRequest): void;
  finalizeLargeDatasetCommit(request: FinalizeLargeDatasetCommitRequest): void;
}

export interface GasRpcTransport {
  readonly mode: 'gas' | 'mock';
  getDashboardStatus(): Promise<DashboardStatusData>;
  previewDataset(request: PreviewDatasetRequest): Promise<PreviewDatasetData>;
  previewDatasetBatch(request: PreviewDatasetBatchRequest): Promise<PreviewDatasetBatchData>;
  finalizePreview(request: FinalizePreviewRequest): Promise<PreviewDatasetData>;
  commitSmallDataset(request: CommitSmallDatasetRequest): Promise<CommitDatasetData>;
  stageLargeDatasetBatch(
    request: StageLargeDatasetBatchRequest,
  ): Promise<StageLargeDatasetBatchData>;
  finalizeLargeDatasetCommit(
    request: FinalizeLargeDatasetCommitRequest,
  ): Promise<CommitDatasetData>;
}

declare global {
  interface Window {
    google?: {
      script?: {
        run?: GoogleScriptRunner;
      };
    };
  }
}

function runGasCall<T>(
  getRunner: () => GoogleScriptRunner,
  invoke: (runner: GoogleScriptRunner) => void,
  parse: (raw: unknown) => T,
  transportErrorMessage: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    try {
      const runner = getRunner()
        .withSuccessHandler((raw: unknown) => {
          try {
            resolve(parse(raw));
          } catch (err) {
            reject(err);
          }
        })
        .withFailureHandler(() => {
          reject(new GasRpcClientError('RPC_TRANSPORT_ERROR', transportErrorMessage));
        });
      invoke(runner);
    } catch {
      reject(
        new GasRpcClientError(
          'RPC_TRANSPORT_ERROR',
          'ไม่สามารถเรียกใช้ google.script.run ได้ กรุณาเปิดผ่าน Web App ของ Google Apps Script',
        ),
      );
    }
  });
}

export class GoogleScriptRunTransport implements GasRpcTransport {
  readonly mode = 'gas' as const;
  private readonly getRunner: () => GoogleScriptRunner;

  constructor(getRunner: () => GoogleScriptRunner) {
    this.getRunner = getRunner;
  }

  getDashboardStatus(): Promise<DashboardStatusData> {
    return runGasCall(
      this.getRunner,
      (runner) => runner.getDashboardStatus(),
      parseDashboardStatusResponse,
      'ไม่สามารถติดต่อเซิร์ฟเวอร์ Google Apps Script ได้ กรุณาลองโหลดสถานะอีกครั้ง',
    );
  }

  previewDataset(request: PreviewDatasetRequest): Promise<PreviewDatasetData> {
    return runGasCall(
      this.getRunner,
      (runner) => runner.previewDataset(request),
      parsePreviewDatasetResponse,
      'ไม่สามารถติดต่อเซิร์ฟเวอร์ Google Apps Script ระหว่าง Preview ได้ (ไม่มีการเขียนชีต)',
    );
  }

  previewDatasetBatch(request: PreviewDatasetBatchRequest): Promise<PreviewDatasetBatchData> {
    return runGasCall(
      this.getRunner,
      (runner) => runner.previewDatasetBatch(request),
      parsePreviewDatasetBatchResponse,
      'ไม่สามารถติดต่อเซิร์ฟเวอร์ Google Apps Script ระหว่าง Batched Preview ได้ (ไม่มีการเขียนชีต)',
    );
  }

  finalizePreview(request: FinalizePreviewRequest): Promise<PreviewDatasetData> {
    return runGasCall(
      this.getRunner,
      (runner) => runner.finalizePreview(request),
      parsePreviewDatasetResponse,
      'ไม่สามารถสรุปผล Preview จาก Google Apps Script ได้ (ไม่มีการเขียนชีต)',
    );
  }

  commitSmallDataset(request: CommitSmallDatasetRequest): Promise<CommitDatasetData> {
    return runGasCall(
      this.getRunner,
      (runner) => runner.commitSmallDataset(request),
      parseCommitDatasetResponse,
      'การสื่อสารกับ Google Apps Script ขาดหายระหว่าง Commit (UNKNOWN_OUTCOME_STOP) กรุณาตรวจสอบชีตปลายทางและ _ThaiPHCSyncLog ห้ามกดลองซ้ำอัตโนมัติ',
    );
  }

  stageLargeDatasetBatch(
    request: StageLargeDatasetBatchRequest,
  ): Promise<StageLargeDatasetBatchData> {
    return runGasCall(
      this.getRunner,
      (runner) => runner.stageLargeDatasetBatch(request),
      parseStageLargeDatasetBatchResponse,
      'การสื่อสารกับ Google Apps Script ขาดหายระหว่างจัดเตรียมแท็บซ่อน _Stage_* (UNKNOWN_OUTCOME_STOP) กรุณาตรวจสอบสมุดงานปลายทาง ห้ามกดลองซ้ำอัตโนมัติ',
    );
  }

  finalizeLargeDatasetCommit(
    request: FinalizeLargeDatasetCommitRequest,
  ): Promise<CommitDatasetData> {
    return runGasCall(
      this.getRunner,
      (runner) => runner.finalizeLargeDatasetCommit(request),
      parseCommitDatasetResponse,
      'การสื่อสารกับ Google Apps Script ขาดหายระหว่าง Finalize Commit (UNKNOWN_OUTCOME_STOP) กรุณาตรวจสอบแท็บปลายทาง, แท็บซ่อน _Stage_*, และ _ThaiPHCSyncLog ห้ามกดลองซ้ำอัตโนมัติ',
    );
  }
}

export interface MockGasTransportOptions {
  scenario?: MockScenario;
  previewOutcome?: MockPreviewOutcome;
  commitOutcome?: MockCommitOutcome;
  delayMs?: number;
  responseOverride?: () => unknown;
}

export class MockGasTransport implements GasRpcTransport {
  readonly mode = 'mock' as const;
  private readonly scenario: MockScenario;
  private readonly previewOutcome: MockPreviewOutcome;
  private readonly commitOutcome: MockCommitOutcome;
  private readonly delayMs: number;
  private readonly responseOverride?: () => unknown;

  constructor(options: MockGasTransportOptions = {}) {
    this.scenario = options.scenario ?? 'sandbox-default';
    this.previewOutcome = options.previewOutcome ?? 'ready';
    this.commitOutcome = options.commitOutcome ?? 'verified';
    this.delayMs = options.delayMs ?? 0;
    this.responseOverride = options.responseOverride;
  }

  private async waitDelay(): Promise<void> {
    if (this.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    }
  }

  async getDashboardStatus(): Promise<DashboardStatusData> {
    await this.waitDelay();
    const raw = this.responseOverride
      ? this.responseOverride()
      : buildMockDashboardEnvelope(this.scenario);
    return parseDashboardStatusResponse(raw);
  }

  async previewDataset(request: PreviewDatasetRequest): Promise<PreviewDatasetData> {
    await this.waitDelay();
    const raw = buildMockPreviewEnvelope(request, this.scenario, this.previewOutcome);
    return parsePreviewDatasetResponse(raw);
  }

  async previewDatasetBatch(request: PreviewDatasetBatchRequest): Promise<PreviewDatasetBatchData> {
    await this.waitDelay();
    const raw = buildMockPreviewBatchEnvelope(request, this.scenario, this.previewOutcome);
    return parsePreviewDatasetBatchResponse(raw);
  }

  async finalizePreview(request: FinalizePreviewRequest): Promise<PreviewDatasetData> {
    await this.waitDelay();
    const raw = buildMockFinalizePreviewEnvelope(request, this.scenario, this.previewOutcome);
    return parsePreviewDatasetResponse(raw);
  }

  async commitSmallDataset(request: CommitSmallDatasetRequest): Promise<CommitDatasetData> {
    await this.waitDelay();
    const raw = buildMockCommitEnvelope(request, this.scenario, this.commitOutcome);
    return parseCommitDatasetResponse(raw);
  }

  async stageLargeDatasetBatch(
    request: StageLargeDatasetBatchRequest,
  ): Promise<StageLargeDatasetBatchData> {
    await this.waitDelay();
    const raw = buildMockStageLargeBatchEnvelope(request, this.scenario, this.commitOutcome);
    return parseStageLargeDatasetBatchResponse(raw);
  }

  async finalizeLargeDatasetCommit(
    request: FinalizeLargeDatasetCommitRequest,
  ): Promise<CommitDatasetData> {
    await this.waitDelay();
    const raw = buildMockFinalizeLargeCommitEnvelope(request, this.scenario, this.commitOutcome);
    return parseCommitDatasetResponse(raw);
  }
}

const VALID_MOCK_SCENARIOS: ReadonlySet<string> = new Set<MockScenario>([
  'sandbox-default',
  'sandbox-writable',
  'sandbox-report-writable',
  'sandbox-assignments-legacy',
  'sandbox-report-legacy',
  'production-unresolved',
  'production-writable',
  'production-report-writable',
  'production-clean',
  'same-workbook-unapproved',
  'same-workbook-unapproved-writable',
  'rpc-error',
]);

function readScenarioFromQuery(): MockScenario {
  if (typeof window === 'undefined') {
    return 'sandbox-default';
  }
  try {
    const param = new URLSearchParams(window.location.search).get('mockScenario');
    if (param && VALID_MOCK_SCENARIOS.has(param)) {
      return param as MockScenario;
    }
  } catch {
    return 'sandbox-default';
  }
  return 'sandbox-default';
}

export function createDefaultGasTransport(
  runnerFactory?: () => GoogleScriptRunner,
): GasRpcTransport {
  if (runnerFactory) {
    return new GoogleScriptRunTransport(runnerFactory);
  }
  if (typeof window !== 'undefined' && window.google?.script?.run) {
    return new GoogleScriptRunTransport(() => {
      const runner = window.google?.script?.run;
      if (!runner) {
        throw new Error('GAS_RUNNER_UNAVAILABLE');
      }
      return runner;
    });
  }
  return new MockGasTransport({ scenario: readScenarioFromQuery() });
}
