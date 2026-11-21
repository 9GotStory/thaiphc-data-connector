import {
  buildMockCommitEnvelope,
  buildMockDashboardEnvelope,
  buildMockPreviewEnvelope,
  type MockCommitOutcome,
  type MockPreviewOutcome,
  type MockScenario,
} from './mockFixtures';
import {
  GasRpcClientError,
  type CommitSmallDatasetData,
  type CommitSmallDatasetRequest,
  type DashboardStatusData,
  type PreviewDatasetData,
  type PreviewDatasetRequest,
} from './types';
import {
  parseCommitSmallDatasetResponse,
  parseDashboardStatusResponse,
  parsePreviewDatasetResponse,
} from './validators';

export { GasRpcClientError } from './types';
export type { MockCommitOutcome, MockPreviewOutcome, MockScenario } from './mockFixtures';

export interface GoogleScriptRunner {
  withSuccessHandler(callback: (value: unknown) => void): GoogleScriptRunner;
  withFailureHandler(callback: (error: unknown) => void): GoogleScriptRunner;
  getDashboardStatus(): void;
  previewDataset(request: PreviewDatasetRequest): void;
  commitSmallDataset(request: CommitSmallDatasetRequest): void;
}

export interface GasRpcTransport {
  readonly mode: 'gas' | 'mock';
  getDashboardStatus(): Promise<DashboardStatusData>;
  previewDataset(request: PreviewDatasetRequest): Promise<PreviewDatasetData>;
  commitSmallDataset(request: CommitSmallDatasetRequest): Promise<CommitSmallDatasetData>;
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

  commitSmallDataset(request: CommitSmallDatasetRequest): Promise<CommitSmallDatasetData> {
    return runGasCall(
      this.getRunner,
      (runner) => runner.commitSmallDataset(request),
      parseCommitSmallDatasetResponse,
      'การสื่อสารกับ Google Apps Script ขาดหายระหว่าง Commit (UNKNOWN_OUTCOME_STOP) กรุณาตรวจสอบชีตปลายทางและ _ThaiPHCSyncLog ห้ามกดลองซ้ำอัตโนมัติ',
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

  async commitSmallDataset(request: CommitSmallDatasetRequest): Promise<CommitSmallDatasetData> {
    await this.waitDelay();
    const raw = buildMockCommitEnvelope(request, this.scenario, this.commitOutcome);
    return parseCommitSmallDatasetResponse(raw);
  }
}

const VALID_MOCK_SCENARIOS: ReadonlySet<string> = new Set<MockScenario>([
  'sandbox-default',
  'sandbox-writable',
  'sandbox-report-writable',
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
