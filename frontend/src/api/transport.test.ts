import { describe, expect, it } from 'vitest';
import {
  createDefaultGasTransport,
  GasRpcClientError,
  GoogleScriptRunTransport,
  MockGasTransport,
  type GoogleScriptRunner,
} from './transport';

function createFakeRunner(
  handler: (onSuccess: (value: unknown) => void, onFailure: (error: unknown) => void) => void,
): GoogleScriptRunner {
  let successCb: ((value: unknown) => void) | null = null;
  let failureCb: ((error: unknown) => void) | null = null;

  const runner: GoogleScriptRunner = {
    withSuccessHandler(cb) {
      successCb = cb;
      return runner;
    },
    withFailureHandler(cb) {
      failureCb = cb;
      return runner;
    },
    getDashboardStatus() {
      handler(
        (val) => successCb?.(val),
        (err) => failureCb?.(err),
      );
    },
  };
  return runner;
}

describe('GasRpcTransport Seam', () => {
  it('MockGasTransport returns deterministic validated 8-dataset metadata across scenarios with zero PII', async () => {
    const sandbox = new MockGasTransport({ scenario: 'sandbox-default' });
    const data = await sandbox.getDashboardStatus();

    expect(sandbox.mode).toBe('mock');
    expect(data.env).toBe('SANDBOX');
    expect(data.scope).toEqual({ provinceCode: '54', districtCode: '5406' });
    expect(data.datasets).toHaveLength(8);
    expect(data.datasets.filter((d) => d.group === 'reference')).toHaveLength(3);
    expect(data.datasets.filter((d) => d.group === 'extended_report')).toHaveLength(5);
    expect(data.datasets.find((d) => d.endpoint === 'volunteer-family')?.syncMode).toBe(
      'COMPLETE_SNAPSHOT',
    );
    expect(JSON.stringify(data)).not.toMatch(/citizenId|firstName|lastName|osmCode/);

    const prod = new MockGasTransport({ scenario: 'production-unresolved' });
    const prodData = await prod.getDashboardStatus();
    expect(prodData.env).toBe('PRODUCTION');
    expect(prodData.unresolvedRuns.length).toBeGreaterThan(0);

    const errMock = new MockGasTransport({ scenario: 'rpc-error' });
    await expect(errMock.getDashboardStatus()).rejects.toMatchObject({
      name: 'GasRpcClientError',
      code: 'WORKBOOK_ACCESS_FAILED',
    });
  });

  it('GoogleScriptRunTransport validates unknown RPC payloads and rejects malformed responses', async () => {
    const mockData = await new MockGasTransport({
      scenario: 'sandbox-default',
    }).getDashboardStatus();

    const validTransport = new GoogleScriptRunTransport(() =>
      createFakeRunner((onSuccess) => {
        onSuccess({ ok: true, data: mockData });
      }),
    );
    const parsed = await validTransport.getDashboardStatus();
    expect(validTransport.mode).toBe('gas');
    expect(parsed.env).toBe('SANDBOX');
    expect(parsed.datasets).toHaveLength(8);

    const malformedPayloads: unknown[] = [
      null,
      'not-an-object',
      { ok: true, data: { env: 'STAGING' } },
      { ok: true, data: { ...mockData, datasets: mockData.datasets.slice(0, 3) } },
      { ok: true, data: { ...mockData, scope: { provinceCode: '10', districtCode: '1001' } } },
    ];

    for (const bad of malformedPayloads) {
      const badTransport = new GoogleScriptRunTransport(() =>
        createFakeRunner((onSuccess) => onSuccess(bad)),
      );
      await expect(badTransport.getDashboardStatus()).rejects.toBeInstanceOf(GasRpcClientError);
      await expect(badTransport.getDashboardStatus()).rejects.toMatchObject({
        code: 'INVALID_RPC_RESPONSE',
      });
    }
  });

  it('GoogleScriptRunTransport normalizes server error envelopes and transport exceptions safely', async () => {
    const serverErrTransport = new GoogleScriptRunTransport(() =>
      createFakeRunner((onSuccess) =>
        onSuccess({
          ok: false,
          error: { code: 'SPREADSHEET_NOT_CONFIGURED', message: 'Missing spreadsheet ID' },
        }),
      ),
    );
    await expect(serverErrTransport.getDashboardStatus()).rejects.toMatchObject({
      code: 'SPREADSHEET_NOT_CONFIGURED',
    });

    const unknownErrTransport = new GoogleScriptRunTransport(() =>
      createFakeRunner((onSuccess) =>
        onSuccess({
          ok: false,
          error: { code: 'RAW_INTERNAL_SQL_SECRET', message: 'stack trace' },
        }),
      ),
    );
    await expect(unknownErrTransport.getDashboardStatus()).rejects.toMatchObject({
      code: 'DASHBOARD_LOAD_FAILED',
    });

    const failedTransport = new GoogleScriptRunTransport(() =>
      createFakeRunner((_onSuccess, onFailure) =>
        onFailure(new Error('Raw GAS stack trace with Bearer secret')),
      ),
    );
    try {
      await failedTransport.getDashboardStatus();
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(GasRpcClientError);
      const rpcErr = err as GasRpcClientError;
      expect(rpcErr.code).toBe('RPC_TRANSPORT_ERROR');
      expect(rpcErr.message).not.toContain('Bearer secret');
    }
  });

  it('createDefaultGasTransport selects GoogleScriptRunTransport when google.script.run exists and MockGasTransport otherwise', () => {
    const offline = createDefaultGasTransport(undefined);
    expect(offline.mode).toBe('mock');

    const online = createDefaultGasTransport(() => createFakeRunner(() => {}));
    expect(online.mode).toBe('gas');
  });
});
