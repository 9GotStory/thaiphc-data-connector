import { buildMockDashboardEnvelope, type MockScenario } from './mockFixtures';
import { GasRpcClientError, type DashboardStatusData } from './types';
import { parseDashboardStatusResponse } from './validators';

export { GasRpcClientError } from './types';
export type { MockScenario } from './mockFixtures';

export interface GoogleScriptRunner {
  withSuccessHandler(callback: (value: unknown) => void): GoogleScriptRunner;
  withFailureHandler(callback: (error: unknown) => void): GoogleScriptRunner;
  getDashboardStatus(): void;
}

export interface GasRpcTransport {
  readonly mode: 'gas' | 'mock';
  getDashboardStatus(): Promise<DashboardStatusData>;
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

export class GoogleScriptRunTransport implements GasRpcTransport {
  readonly mode = 'gas' as const;
  private readonly getRunner: () => GoogleScriptRunner;

  constructor(getRunner: () => GoogleScriptRunner) {
    this.getRunner = getRunner;
  }

  getDashboardStatus(): Promise<DashboardStatusData> {
    return new Promise<DashboardStatusData>((resolve, reject) => {
      try {
        this.getRunner()
          .withSuccessHandler((raw: unknown) => {
            try {
              resolve(parseDashboardStatusResponse(raw));
            } catch (err) {
              reject(err);
            }
          })
          .withFailureHandler(() => {
            reject(
              new GasRpcClientError(
                'RPC_TRANSPORT_ERROR',
                'ไม่สามารถติดต่อเซิร์ฟเวอร์ Google Apps Script ได้ กรุณาลองโหลดสถานะอีกครั้ง',
              ),
            );
          })
          .getDashboardStatus();
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
}

export interface MockGasTransportOptions {
  scenario?: MockScenario;
  delayMs?: number;
  responseOverride?: () => unknown;
}

export class MockGasTransport implements GasRpcTransport {
  readonly mode = 'mock' as const;
  private readonly scenario: MockScenario;
  private readonly delayMs: number;
  private readonly responseOverride?: () => unknown;

  constructor(options: MockGasTransportOptions = {}) {
    this.scenario = options.scenario ?? 'sandbox-default';
    this.delayMs = options.delayMs ?? 0;
    this.responseOverride = options.responseOverride;
  }

  async getDashboardStatus(): Promise<DashboardStatusData> {
    if (this.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    }
    const raw = this.responseOverride
      ? this.responseOverride()
      : buildMockDashboardEnvelope(this.scenario);
    return parseDashboardStatusResponse(raw);
  }
}

const VALID_MOCK_SCENARIOS: ReadonlySet<string> = new Set<MockScenario>([
  'sandbox-default',
  'production-unresolved',
  'production-clean',
  'same-workbook-unapproved',
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
