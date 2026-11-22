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
    previewDataset() {
      handler(
        (val) => successCb?.(val),
        (err) => failureCb?.(err),
      );
    },
    commitSmallDataset() {
      handler(
        (val) => successCb?.(val),
        (err) => failureCb?.(err),
      );
    },
    previewDatasetBatch() {
      handler(
        (val) => successCb?.(val),
        (err) => failureCb?.(err),
      );
    },
    finalizePreview() {
      handler(
        (val) => successCb?.(val),
        (err) => failureCb?.(err),
      );
    },
    stageLargeDatasetBatch() {
      handler(
        (val) => successCb?.(val),
        (err) => failureCb?.(err),
      );
    },
    finalizeLargeDatasetCommit() {
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

  it('validates previewDataset and commitSmallDataset envelopes at the GasRpcTransport boundary and rejects malformed payloads', async () => {
    const mock = new MockGasTransport({ scenario: 'sandbox-writable' });
    const preview = await mock.previewDataset({
      endpoint: 'subdistricts',
      token: 'synthetic_token_for_transport_test',
    });
    expect(preview.status).toBe('READY');
    if (preview.status !== 'READY') throw new Error('expected READY');

    const commit = await mock.commitSmallDataset({
      endpoint: 'subdistricts',
      token: 'synthetic_token_for_transport_test',
      expectedFingerprint: preview.fingerprint,
    });
    expect(commit.status).toBe('COMMITTED_VERIFIED');

    const badPreviewTransport = new GoogleScriptRunTransport(() =>
      createFakeRunner((onSuccess) => onSuccess({ ok: true, data: { status: 'UNKNOWN' } })),
    );
    await expect(
      badPreviewTransport.previewDataset({
        endpoint: 'subdistricts',
        token: 'synthetic_token_for_transport_test',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_RPC_RESPONSE' });

    const authErrorTransport = new GoogleScriptRunTransport(() =>
      createFakeRunner((onSuccess) =>
        onSuccess({ ok: false, error: { code: 'HTTP_401', message: 'Unauthorized' } }),
      ),
    );
    await expect(
      authErrorTransport.previewDataset({
        endpoint: 'subdistricts',
        token: 'synthetic_token_for_transport_test',
      }),
    ).rejects.toMatchObject({ code: 'HTTP_401' });
  });

  it('validates Mode B EXTENDED_MINIMIZED volunteer-gender previews, enforces report write guards, and rejects malformed Mode B payloads at the GasRpcTransport boundary', async () => {
    // 1. MockGasTransport sandbox-report-writable returns valid Mode B preview & COMMITTED_VERIFIED commit
    const reportMock = new MockGasTransport({ scenario: 'sandbox-report-writable' });
    const vgPreview = await reportMock.previewDataset({
      endpoint: 'volunteer-gender',
      token: 'synthetic_token_for_gender_test',
    });
    expect(vgPreview.status).toBe('READY');
    if (vgPreview.status !== 'READY' || vgPreview.previewMode !== 'EXTENDED_MINIMIZED') {
      throw new Error('Expected READY EXTENDED_MINIMIZED preview for volunteer-gender');
    }

    expect(vgPreview.destinationTab).toBe('VolunteerGender');
    expect(vgPreview.paginationProtocol).toBe('report');
    expect(vgPreview.legacySnapshotPresent).toBe(true);
    expect(vgPreview.legacySnapshotTab).toBe('RGender_f010_20261119');
    expect(vgPreview.writeAllowed).toBe(true);
    expect(vgPreview.reviewBreakdown.SMALL_CELL_SUPPRESSED).toBeGreaterThan(0);
    expect(vgPreview.aggregateSummary.length).toBeGreaterThan(0);
    expect(
      vgPreview.sampleRows.some(
        (r) =>
          r.reviewReasons.includes('SMALL_CELL_SUPPRESSED') &&
          r.minimizedAttributes.some((a) => a.field === 'male' && a.value === null),
      ),
    ).toBe(true);
    expect(JSON.stringify(vgPreview)).not.toMatch(/citizenId|firstName|lastName|osmCode/);

    const vgCommit = await reportMock.commitSmallDataset({
      endpoint: 'volunteer-gender',
      token: 'synthetic_token_for_gender_test',
      expectedFingerprint: vgPreview.fingerprint,
    });
    expect(vgCommit.status).toBe('COMMITTED_VERIFIED');
    if (vgCommit.status === 'COMMITTED_VERIFIED') {
      expect(vgCommit.destinationTab).toBe('VolunteerGender');
      expect(vgCommit.readback.verified).toBe(true);
    }

    // 2. sandbox-writable has personDataWriteEnabled: false -> blocks volunteer-gender commit fail-closed
    const personOffMock = new MockGasTransport({ scenario: 'sandbox-writable' });
    const personOffPreview = await personOffMock.previewDataset({
      endpoint: 'volunteer-gender',
      token: 'synthetic_token_for_gender_test',
    });
    expect(personOffPreview.status).toBe('READY');
    if (personOffPreview.status === 'READY') {
      expect(personOffPreview.writeAllowed).toBe(false);
      expect(personOffPreview.blockedGuardReason).toBe('THAIPHC_PERSON_DATA_WRITE_ENABLED');
      const personOffCommit = await personOffMock.commitSmallDataset({
        endpoint: 'volunteer-gender',
        token: 'synthetic_token_for_gender_test',
        expectedFingerprint: personOffPreview.fingerprint,
      });
      expect(personOffCommit.status).toBe('FAILED_STOP');
      if (personOffCommit.status === 'FAILED_STOP') {
        expect(personOffCommit.stopCode).toBe('PERSON_DATA_WRITE_DISABLED');
      }
    }

    // 3. GoogleScriptRunTransport rejects malformed EXTENDED_MINIMIZED payloads (missing aggregateSummary)
    const malformedModeB = new GoogleScriptRunTransport(() =>
      createFakeRunner((onSuccess) =>
        onSuccess({
          ok: true,
          data: {
            ...vgPreview,
            aggregateSummary: 'not-an-array',
          },
        }),
      ),
    );
    await expect(
      malformedModeB.previewDataset({
        endpoint: 'volunteer-gender',
        token: 'synthetic_token_for_gender_test',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_RPC_RESPONSE' });

    const invalidGuardReason = new GoogleScriptRunTransport(() =>
      createFakeRunner((onSuccess) =>
        onSuccess({
          ok: true,
          data: {
            ...vgPreview,
            writeAllowed: false,
            blockedGuardReason: 'UNLISTED_GUARD_PROPERTY',
          },
        }),
      ),
    );
    await expect(
      invalidGuardReason.previewDataset({
        endpoint: 'volunteer-gender',
        token: 'synthetic_token_for_gender_test',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_RPC_RESPONSE' });
  });

  it('validates multi-batch previewDatasetBatch, finalizePreview, stageLargeDatasetBatch, and finalizeLargeDatasetCommit envelopes for assignments with zero PII and rejects malformed payloads', async () => {
    const mock = new MockGasTransport({ scenario: 'sandbox-assignments-legacy' });
    const b1 = await mock.previewDatasetBatch({
      endpoint: 'assignments',
      token: 'synthetic_token_for_assign_test',
      startPage: 1,
      batchPages: 10,
      pageSize: 100,
    });
    expect(b1.status).toBe('BATCH_OK');
    if (b1.status !== 'BATCH_OK') throw new Error('Expected BATCH_OK');
    expect(b1.hasMore).toBe(true);
    expect(b1.nextPage).toBe(11);
    expect(b1.totalPages).toBe(16);
    expect(b1.sourceTotal).toBe(1571);
    expect(b1.rowDigests[0].key).toMatch(/^h1_[a-f0-9]{64}$/);
    expect(JSON.stringify(b1)).not.toMatch(/citizenId|firstName|lastName|fullName|osmCode/);

    const b2 = await mock.previewDatasetBatch({
      endpoint: 'assignments',
      token: 'synthetic_token_for_assign_test',
      startPage: 11,
      batchPages: 10,
      pageSize: 100,
      expectedSourceTotal: b1.sourceTotal,
    });
    expect(b2.status).toBe('BATCH_OK');
    if (b2.status !== 'BATCH_OK') throw new Error('Expected BATCH_OK');
    expect(b2.hasMore).toBe(false);
    expect(b2.nextPage).toBeNull();

    const preview = await mock.finalizePreview({
      endpoint: 'assignments',
      sourceTotal: b1.sourceTotal,
      pagesFetched: b1.pagesFetchedInBatch + b2.pagesFetchedInBatch,
      rowDigests: [...b1.rowDigests, ...b2.rowDigests],
      aggregateSummary: [...b1.aggregateSummary, ...b2.aggregateSummary],
      sampleCandidates: [...b1.sampleCandidates, ...b2.sampleCandidates],
    });
    expect(preview.status).toBe('READY');
    if (preview.status !== 'READY' || preview.previewMode !== 'EXTENDED_MINIMIZED') {
      throw new Error('Expected READY EXTENDED_MINIMIZED preview');
    }
    expect(preview.legacySnapshotPresent).toBe(true);
    expect(preview.legacySnapshotTab).toBe('RAssign_f010_20261119');

    const s1 = await mock.stageLargeDatasetBatch({
      endpoint: 'assignments',
      token: 'synthetic_token_for_assign_test',
      expectedFingerprint: preview.fingerprint,
      startPage: 1,
      batchPages: 10,
      pageSize: 100,
    });
    expect(s1.status).toBe('BATCH_STAGED');
    if (s1.status !== 'BATCH_STAGED') throw new Error('Expected BATCH_STAGED');
    expect(s1.stagingTabName).toMatch(/^_Stage_assignments_/);
    expect(s1.hasMore).toBe(true);

    const s2 = await mock.stageLargeDatasetBatch({
      endpoint: 'assignments',
      token: 'synthetic_token_for_assign_test',
      expectedFingerprint: preview.fingerprint,
      runId: s1.runId,
      startPage: 11,
      batchPages: 10,
      pageSize: 100,
    });
    expect(s2.status).toBe('BATCH_STAGED');
    if (s2.status !== 'BATCH_STAGED') throw new Error('Expected BATCH_STAGED');
    expect(s2.hasMore).toBe(false);

    const fin = await mock.finalizeLargeDatasetCommit({
      endpoint: 'assignments',
      expectedFingerprint: preview.fingerprint,
      runId: s1.runId,
    });
    expect(fin.status).toBe('COMMITTED_VERIFIED');
    if (fin.status === 'COMMITTED_VERIFIED') {
      expect(fin.readback.stagingTabCleaned).toBe(true);
    }

    // Reject malformed previewDatasetBatch payload
    const badBatchTransport = new GoogleScriptRunTransport(() =>
      createFakeRunner((onSuccess) => onSuccess({ ok: true, data: { status: 'BATCH_OK' } })),
    );
    await expect(
      badBatchTransport.previewDatasetBatch({
        endpoint: 'assignments',
        token: 'synthetic_token_for_assign_test',
        startPage: 1,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_RPC_RESPONSE' });
  });

  it('validates multi-batch resigned-volunteers (LOCALITY_MISMATCH + RResign_*) and volunteer-tenure (nullable fields + RTenure_* + STOP_BLOCKED) envelopes at the GasRpcTransport boundary', async () => {
    const legacyMock = new MockGasTransport({ scenario: 'sandbox-report-legacy' });

    // 1. resigned-volunteers: Preserve Source Locality (LOCALITY_MISMATCH) + RResign_* legacy + multi-batch staging
    const rb1 = await legacyMock.previewDatasetBatch({
      endpoint: 'resigned-volunteers',
      token: 'synthetic_token_for_resign_test',
      startPage: 1,
      batchPages: 10,
      pageSize: 100,
    });
    expect(rb1.status).toBe('BATCH_OK');
    if (rb1.status !== 'BATCH_OK') throw new Error('Expected BATCH_OK for resigned-volunteers');
    expect(rb1.hasMore).toBe(true);
    expect(rb1.totalPages).toBe(12);
    expect(rb1.sourceTotal).toBe(1152);
    expect(rb1.rowDigests[0].key).toMatch(/^h1_[a-f0-9]{64}$/);
    expect(rb1.rowDigests.some((entry) => entry.reviewReasons?.includes('LOCALITY_MISMATCH'))).toBe(
      true,
    );
    expect(JSON.stringify(rb1)).not.toMatch(/citizenId|firstName|lastName|osmCode/);

    const rb2 = await legacyMock.previewDatasetBatch({
      endpoint: 'resigned-volunteers',
      token: 'synthetic_token_for_resign_test',
      startPage: 11,
      batchPages: 10,
      pageSize: 100,
      expectedSourceTotal: rb1.sourceTotal,
    });
    expect(rb2.status).toBe('BATCH_OK');
    if (rb2.status !== 'BATCH_OK') throw new Error('Expected BATCH_OK batch 2');
    expect(rb2.hasMore).toBe(false);

    const resignPreview = await legacyMock.finalizePreview({
      endpoint: 'resigned-volunteers',
      sourceTotal: rb1.sourceTotal,
      pagesFetched: rb1.pagesFetchedInBatch + rb2.pagesFetchedInBatch,
      rowDigests: [...rb1.rowDigests, ...rb2.rowDigests],
      aggregateSummary: [...rb1.aggregateSummary, ...rb2.aggregateSummary],
      sampleCandidates: [...rb1.sampleCandidates, ...rb2.sampleCandidates],
    });
    expect(resignPreview.status).toBe('READY');
    if (resignPreview.status !== 'READY' || resignPreview.previewMode !== 'EXTENDED_MINIMIZED') {
      throw new Error('Expected READY EXTENDED_MINIMIZED for resigned-volunteers');
    }
    expect(resignPreview.destinationTab).toBe('ResignedVolunteers');
    expect(resignPreview.paginationProtocol).toBe('report');
    expect(resignPreview.legacySnapshotPresent).toBe(true);
    expect(resignPreview.legacySnapshotTab).toBe('RResign_f010_20261119');
    expect(resignPreview.reviewBreakdown.LOCALITY_MISMATCH).toBeGreaterThan(0);

    const rs1 = await legacyMock.stageLargeDatasetBatch({
      endpoint: 'resigned-volunteers',
      token: 'synthetic_token_for_resign_test',
      expectedFingerprint: resignPreview.fingerprint,
      startPage: 1,
      batchPages: 10,
      pageSize: 100,
    });
    expect(rs1.status).toBe('BATCH_STAGED');
    if (rs1.status !== 'BATCH_STAGED') throw new Error('Expected BATCH_STAGED');
    expect(rs1.stagingTabName).toMatch(/^_Stage_resigned-volunteers_/);

    const rFin = await legacyMock.finalizeLargeDatasetCommit({
      endpoint: 'resigned-volunteers',
      expectedFingerprint: resignPreview.fingerprint,
      runId: rs1.runId,
    });
    expect(rFin.status).toBe('COMMITTED_VERIFIED');
    if (rFin.status === 'COMMITTED_VERIFIED') {
      expect(rFin.destinationTab).toBe('ResignedVolunteers');
      // LOCALITY_MISMATCH is an incoming review reason and must not be double-counted in expectedRowCount
      expect(rFin.readback.expectedRowCount).toBe(resignPreview.sourceTotal);
      expect(rFin.readback.stagingTabCleaned).toBe(true);
    }

    // 2. volunteer-tenure: strict scope STOP_BLOCKED + READY nullable attributes + RTenure_* legacy
    const stopMock = new MockGasTransport({
      scenario: 'sandbox-report-legacy',
      previewOutcome: 'stop-blocked',
    });
    const tenureStop = await stopMock.previewDatasetBatch({
      endpoint: 'volunteer-tenure',
      token: 'synthetic_token_for_tenure_test',
      startPage: 1,
      batchPages: 10,
      pageSize: 100,
    });
    expect(tenureStop.status).toBe('STOP_BLOCKED');
    if (tenureStop.status === 'STOP_BLOCKED') {
      expect(tenureStop.diagnostics[0].code).toBe('OUT_OF_GEOGRAPHIC_SCOPE');
    }

    const tb1 = await legacyMock.previewDatasetBatch({
      endpoint: 'volunteer-tenure',
      token: 'synthetic_token_for_tenure_test',
      startPage: 1,
      batchPages: 10,
      pageSize: 100,
    });
    expect(tb1.status).toBe('BATCH_OK');
    if (tb1.status !== 'BATCH_OK') throw new Error('Expected BATCH_OK for volunteer-tenure');
    expect(tb1.sourceTotal).toBe(1571);
    expect(tb1.totalPages).toBe(16);

    const tenurePreview = await legacyMock.finalizePreview({
      endpoint: 'volunteer-tenure',
      sourceTotal: tb1.sourceTotal,
      pagesFetched: 16,
      rowDigests: tb1.rowDigests,
      aggregateSummary: tb1.aggregateSummary,
      sampleCandidates: tb1.sampleCandidates,
    });
    expect(tenurePreview.status).toBe('READY');
    if (tenurePreview.status !== 'READY' || tenurePreview.previewMode !== 'EXTENDED_MINIMIZED') {
      throw new Error('Expected READY EXTENDED_MINIMIZED for volunteer-tenure');
    }
    expect(tenurePreview.destinationTab).toBe('VolunteerTenure');
    expect(tenurePreview.legacySnapshotPresent).toBe(true);
    expect(tenurePreview.legacySnapshotTab).toBe('RTenure_f010_20261119');
    expect(
      tenurePreview.sampleRows.some((r) =>
        r.minimizedAttributes.some((a) => a.field === 'startYear' && a.value === null),
      ),
    ).toBe(true);

    // 3. GoogleScriptRunTransport rejects unknown reviewReasons inside rowDigests
    const badReasonTransport = new GoogleScriptRunTransport(() =>
      createFakeRunner((onSuccess) =>
        onSuccess({
          ok: true,
          data: {
            ...rb1,
            rowDigests: [
              {
                key: rb1.rowDigests[0].key,
                rowDigest: rb1.rowDigests[0].rowDigest,
                reviewReasons: ['INVENTED_REASON'],
              },
            ],
          },
        }),
      ),
    );
    await expect(
      badReasonTransport.previewDatasetBatch({
        endpoint: 'resigned-volunteers',
        token: 'synthetic_token_for_resign_test',
        startPage: 1,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_RPC_RESPONSE' });
  });
});
