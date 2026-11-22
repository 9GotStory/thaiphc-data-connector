import { describe, expect, it } from 'vitest';
import { getDashboardStatusWithPlatform } from './dashboardService.ts';
import {
  finalizeLargeDatasetCommitWithPlatform,
  finalizePreviewWithPlatform,
  previewDatasetBatchWithPlatform,
  stageLargeDatasetBatchWithPlatform,
} from './largeKeyedSyncService.ts';
import {
  createFakeSyncPlatformEnv,
  jsonHttpResponse,
  TEST_REF_SHEET_ID,
  TEST_REPORT_SHEET_ID,
} from './testSyncPlatform.ts';
import type { SyncPlatform } from './types.ts';

const VALID_REF_SHEET_ID = TEST_REF_SHEET_ID;
const VALID_REPORT_SHEET_ID = TEST_REPORT_SHEET_ID;
const VALID_BEARER = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.synthetic_ticket07_token_888';

function makeFamilyRow(
  index: number,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const num = String(index).padStart(4, '0');
  const subCode = index % 2 === 1 ? '540601' : '540603';
  const subName = index % 2 === 1 ? 'บ้านหนุน' : 'ห้วยหม้าย';
  const villageNum = ((index - 1) % 9) + 1;
  return {
    // 12 ALLOW_ONLY_IF_DATASET_APPROVED columns
    provinceCode: '54',
    provinceName: 'แพร่',
    districtCode: '5406',
    districtName: 'สอง',
    subdistrictCode: subCode,
    subdistrictName: subName,
    villageCode: `${subCode}${String(villageNum).padStart(3, '0')}`,
    villageNo: String(villageNum),
    villageName: index % 2 === 1 ? 'หนุนเหนือ' : 'ห้วยหม้าย',
    gender: index % 3 === 0 ? 'male' : 'female',
    status: index % 3 === 0 ? 'spouse' : index % 3 === 1 ? 'volunteer' : 'child',
    statusLabel: index % 3 === 0 ? 'คู่สมรส' : index % 3 === 1 ? 'อสม.' : 'บุตร',
    // Exact 9 RESTRICTED_DEFAULT_OMIT direct personal identifiers (must NEVER leave GAS memory)
    osmCode: `9999000000${num}`,
    citizenId: `154060000${num}`,
    prefixName: index % 3 === 0 ? 'นาย' : 'นางสาว',
    firstName: `PRIVATE_FAMILY_FIRST_${num}`,
    lastName: `PRIVATE_FAMILY_LAST_${num}`,
    fullName: `นางสาว PRIVATE_FAMILY_FIRST_${num} PRIVATE_FAMILY_LAST_${num}`,
    address: `PRIVATE_ADDR_${num}/9 หมู่ ${villageNum}`,
    volunteerId: `SYNTHETIC-VOL-UUID-${num}`,
    volunteerName: `PRIVATE_VOL_NAME_${num}`,
    ...overrides,
  };
}

function makeReportPage(
  allRows: Record<string, unknown>[],
  page: number,
  pageSize: number,
  totalOverride?: number,
) {
  const total = totalOverride ?? allRows.length;
  const start = (page - 1) * pageSize;
  return {
    success: true,
    message: 'Success',
    items: allRows.slice(start, start + pageSize),
    total,
    page,
    pageSize,
  };
}

function runFullFamilyPreview(platform: SyncPlatform, pageSize = 2, batchPages = 1) {
  const allDigests: Array<{
    key: string;
    rowDigest: string;
    reviewReasons?: Array<
      'MISSING_IN_SOURCE' | 'LOCALITY_MISMATCH' | 'PLACEHOLDER_COORDS' | 'SMALL_CELL_SUPPRESSED'
    >;
  }> = [];
  const allAggs: Array<{
    groupCode: string;
    groupLabel: string;
    rowCount: number;
    reviewCount: number;
  }> = [];
  const allSamples: Array<{
    sourceKey: string;
    rowDigest: string;
    scopeLabel: string;
    minimizedAttributes: Array<{ field: string; value: string | null }>;
    reviewReasons: Array<
      'MISSING_IN_SOURCE' | 'LOCALITY_MISMATCH' | 'PLACEHOLDER_COORDS' | 'SMALL_CELL_SUPPRESSED'
    >;
  }> = [];
  let nextPage: number | null = 1;
  let sourceTotal = 0;
  let pagesFetched = 0;

  while (nextPage !== null) {
    const batchRes = previewDatasetBatchWithPlatform(
      {
        endpoint: 'volunteer-family',
        token: VALID_BEARER,
        startPage: nextPage,
        batchPages,
        pageSize,
        expectedSourceTotal: sourceTotal > 0 ? sourceTotal : undefined,
      },
      platform,
    );
    if (!batchRes.ok) throw new Error(`Batch RPC error: ${JSON.stringify(batchRes)}`);
    if (batchRes.data.status !== 'BATCH_OK') {
      return { blockedBatch: batchRes.data, preview: null };
    }
    sourceTotal = batchRes.data.sourceTotal;
    pagesFetched += batchRes.data.pagesFetchedInBatch;
    allDigests.push(...batchRes.data.rowDigests);
    allAggs.push(...batchRes.data.aggregateSummary);
    allSamples.push(...batchRes.data.sampleCandidates);
    nextPage = batchRes.data.hasMore ? batchRes.data.nextPage : null;
  }

  const preview = finalizePreviewWithPlatform(
    {
      endpoint: 'volunteer-family',
      sourceTotal,
      pagesFetched,
      rowDigests: allDigests,
      aggregateSummary: allAggs,
      sampleCandidates: allSamples,
    },
    platform,
  );
  return { blockedBatch: null, preview };
}

describe('Volunteer Family Complete Snapshot Sync (Backend GAS RPC Seam)', () => {
  it('fetches sequentially via report pagination, strips all 9 restricted PII fields without requiring HMAC key, enforces Preserve Source Locality (LOCALITY_MISMATCH -> REVIEW), binds Preview Fingerprint to active _ThaiPHCReportCurrent pointer, and writes zero Sheets during Preview', () => {
    const rows = [
      makeFamilyRow(1),
      makeFamilyRow(2, {
        subdistrictCode: '540210',
        subdistrictName: 'ตำบลต้นทางนอกเขตย่อย',
        villageCode: '540603006',
        villageNo: '6',
      }),
      makeFamilyRow(3, {
        subdistrictCode: '540601',
        subdistrictName: 'บ้านหนุน',
        villageCode: '540303004',
        villageNo: '10',
      }),
    ];

    const env = createFakeSyncPlatformEnv({
      properties: {
        // Deliberately omit THAIPHC_HMAC_KEY_B64 to prove volunteer-family uses run-scoped ordinals, not HMAC
        THAIPHC_HMAC_KEY_B64: undefined,
      },
      workbooks: {
        [VALID_REF_SHEET_ID]: {
          name: 'ThaiPHC Reference',
          initialSheets: [{ name: 'ชีต1', rows: [['keep-ref']] }],
        },
        [VALID_REPORT_SHEET_ID]: {
          name: 'ThaiPHC Reports',
          initialSheets: [
            { name: 'ชีต1', rows: [['keep-report']] },
            {
              name: '_ThaiPHCReportCurrent',
              rows: [
                ['endpoint', 'run_id', 'snapshot_sheet', 'row_count', 'manifest_digest'],
                [
                  'volunteer-family',
                  'run_20261120_prev_01',
                  'RFamily_run_20261120_prev_01',
                  2,
                  'a'.repeat(64),
                ],
              ],
            },
            {
              name: 'RFamily_run_20261120_prev_01',
              rows: [
                ['{"status":"PUBLISHED"}'],
                ['_source_key', 'provinceCode'],
                ['snapshot_run_20261120_prev_01_00001', '54'],
                ['snapshot_run_20261120_prev_01_00002', '54'],
              ],
            },
          ],
        },
      },
      fetchHandler: (url) => {
        const parsed = new URL(url);
        const page = Number(parsed.searchParams.get('page'));
        const pageSize = Number(parsed.searchParams.get('pageSize'));
        return jsonHttpResponse(makeReportPage(rows, page, pageSize));
      },
    });

    const { blockedBatch, preview } = runFullFamilyPreview(env.platform, 2, 1);
    expect(blockedBatch).toBeNull();
    expect(preview?.ok).toBe(true);
    if (!preview || !preview.ok || preview.data.status !== 'READY') {
      throw new Error(`Expected READY preview, got ${JSON.stringify(preview)}`);
    }

    // Verify exact observed ThaiPHC report URL (province & district only, GET, followRedirects: false)
    expect(env.fetchCalls).toHaveLength(2);
    expect(env.fetchCalls[0].url).toBe(
      'https://api-thaiphc.hss.moph.go.th/api/v1/reports/volunteer-family?page=1&pageSize=2&province=54&district=5406',
    );
    expect(env.fetchCalls[1].url).toBe(
      'https://api-thaiphc.hss.moph.go.th/api/v1/reports/volunteer-family?page=2&pageSize=2&province=54&district=5406',
    );
    for (const call of env.fetchCalls) {
      expect(call.options.method).toBe('get');
      expect(call.options.followRedirects).toBe(false);
      expect(call.options.muteHttpExceptions).toBe(true);
    }

    expect(preview.data.syncMode).toBe('COMPLETE_SNAPSHOT');
    expect(preview.data.paginationProtocol).toBe('report');
    expect(preview.data.destinationTab).toBe('RFamily_<runId>');
    expect(preview.data.activeSnapshotTab).toBe('RFamily_run_20261120_prev_01');
    expect(preview.data.previewMode).toBe('EXTENDED_MINIMIZED');
    expect(preview.data.legacySnapshotPresent).toBe(false);
    expect(preview.data.counts).toEqual({ insert: 3, update: 0, unchanged: 0, review: 2 });
    expect(preview.data.reviewBreakdown).toEqual({ LOCALITY_MISMATCH: 2 });

    if (preview.data.previewMode !== 'EXTENDED_MINIMIZED') {
      throw new Error('Expected EXTENDED_MINIMIZED');
    }
    const localitySamples = preview.data.sampleRows.filter((r) =>
      r.reviewReasons.includes('LOCALITY_MISMATCH'),
    );
    expect(localitySamples).toHaveLength(2);
    expect(localitySamples[0].scopeLabel).toContain('540210');
    expect(localitySamples[0].scopeLabel).toContain('540603006');
    expect(localitySamples[1].scopeLabel).toContain('540303004');
    expect(localitySamples[0].minimizedAttributes).toEqual([
      { field: 'gender', value: 'female' },
      { field: 'status', value: 'child' },
      { field: 'statusLabel', value: 'บุตร' },
    ]);

    // Zero raw PII from all 9 RESTRICTED_DEFAULT_OMIT fields & zero Bearer token in preview payload
    const serialized = JSON.stringify(preview);
    expect(serialized).not.toMatch(
      /9999000000|154060000|PRIVATE_FAMILY_FIRST|PRIVATE_FAMILY_LAST|PRIVATE_ADDR|SYNTHETIC-VOL-UUID|PRIVATE_VOL_NAME|นางสาว|นาย/,
    );
    expect(serialized).not.toContain(VALID_BEARER);

    // Deterministic Preview Fingerprint changes when active _ThaiPHCReportCurrent pointer drifts
    const fpBeforeDrift = preview.data.fingerprint;
    const reportWb = env.workbookStates.get(VALID_REPORT_SHEET_ID)!;
    reportWb.sheets.get('_ThaiPHCReportCurrent')!.rows[1][1] = 'run_20261121_other_02';
    reportWb.sheets.get('_ThaiPHCReportCurrent')!.rows[1][2] = 'RFamily_run_20261121_other_02';

    const afterDrift = runFullFamilyPreview(env.platform, 2, 1);
    if (
      !afterDrift.preview ||
      !afterDrift.preview.ok ||
      afterDrift.preview.data.status !== 'READY'
    ) {
      throw new Error('Expected READY preview after pointer drift');
    }
    expect(afterDrift.preview.data.fingerprint.datasetDigest).toBe(fpBeforeDrift.datasetDigest);
    expect(afterDrift.preview.data.fingerprint.sheetRevisionFingerprint).not.toBe(
      fpBeforeDrift.sheetRevisionFingerprint,
    );
    expect(afterDrift.preview.data.fingerprint.fingerprintDigest).not.toBe(
      fpBeforeDrift.fingerprintDigest,
    );

    // Zero Sheets writes during Preview
    expect(env.getFlushCount()).toBe(0);
    expect(reportWb.sheetOrder).toEqual([
      'ชีต1',
      '_ThaiPHCReportCurrent',
      'RFamily_run_20261120_prev_01',
    ]);
  });

  it('hard-blocks out-of-district/province scope, unexpected fields, type mismatches, formula injection, and ASCII control chars even on Preserve Source Locality columns', () => {
    const cases: Array<{
      label: string;
      rows: Record<string, unknown>[];
      expectedCode: string;
    }> = [
      {
        label: 'wrong provinceCode',
        rows: [makeFamilyRow(1, { provinceCode: '53' })],
        expectedCode: 'OUT_OF_GEOGRAPHIC_SCOPE',
      },
      {
        label: 'wrong districtCode',
        rows: [makeFamilyRow(1, { districtCode: '5401' })],
        expectedCode: 'OUT_OF_GEOGRAPHIC_SCOPE',
      },
      {
        label: 'unexpected source field (never echoed)',
        rows: [makeFamilyRow(1, { SECRET_EXTRA_FAMILY_FIELD: 'LEAK_VALUE' })],
        expectedCode: 'UNEXPECTED_FIELD',
      },
      {
        label: 'type mismatch on status (null not allowed)',
        rows: [makeFamilyRow(1, { status: null })],
        expectedCode: 'TYPE_MISMATCH',
      },
      {
        label: 'type mismatch on restricted field (non-string citizenId)',
        rows: [makeFamilyRow(1, { citizenId: 1540600000001 })],
        expectedCode: 'TYPE_MISMATCH',
      },
      {
        label: 'formula injection in preserved subdistrictCode',
        rows: [makeFamilyRow(1, { subdistrictCode: '=CMD|"/C calc"!A0' })],
        expectedCode: 'FORMULA_INJECTION_DETECTED',
      },
      {
        label: 'ASCII control char in statusLabel',
        rows: [makeFamilyRow(1, { statusLabel: 'อสม.\u0007' })],
        expectedCode: 'ASCII_CONTROL_CHAR',
      },
    ];

    for (const tc of cases) {
      const env = createFakeSyncPlatformEnv({
        properties: { THAIPHC_HMAC_KEY_B64: undefined },
        fetchHandler: () => jsonHttpResponse(makeReportPage(tc.rows, 1, 10)),
      });
      const res = previewDatasetBatchWithPlatform(
        {
          endpoint: 'volunteer-family',
          token: VALID_BEARER,
          startPage: 1,
          batchPages: 1,
          pageSize: 10,
        },
        env.platform,
      );
      expect(res.ok, tc.label).toBe(true);
      if (!res.ok) throw new Error(tc.label);
      expect(res.data.status, tc.label).toBe('STOP_BLOCKED');
      if (res.data.status === 'STOP_BLOCKED') {
        expect(res.data.diagnostics[0]?.code, tc.label).toBe(tc.expectedCode);
        expect(JSON.stringify(res.data)).not.toMatch(/SECRET_EXTRA_FAMILY_FIELD|LEAK_VALUE/);
      }
    }
  });

  it('stages multi-batch Complete Snapshot into hidden RFamily_<runId> with snapshot_<runId>_NNNNN ordinal keys, verifies cells & chunk SHA-256 digests under LockService, unhides and updates _ThaiPHCReportCurrent as the final write, preserves prior RFamily_* snapshots and ชีต1 untouched, and surfaces active pointer on Dashboard', () => {
    let sourceRows: Record<string, unknown>[] = [
      makeFamilyRow(1),
      makeFamilyRow(2, {
        subdistrictCode: '540210',
        subdistrictName: 'ตำบลต้นทางนอกเขตย่อย',
        villageCode: '540603006',
        villageNo: '6',
      }),
      makeFamilyRow(3),
    ];

    const env = createFakeSyncPlatformEnv({
      properties: { THAIPHC_HMAC_KEY_B64: undefined },
      workbooks: {
        [VALID_REF_SHEET_ID]: {
          name: 'ThaiPHC Reference',
          initialSheets: [{ name: 'ชีต1', rows: [['keep-ref']] }],
        },
        [VALID_REPORT_SHEET_ID]: {
          name: 'ThaiPHC Reports',
          initialSheets: [
            { name: 'ชีต1', rows: [['keep-report']] },
            {
              name: '_ThaiPHCReportCurrent',
              rows: [
                ['endpoint', 'run_id', 'snapshot_sheet', 'row_count', 'manifest_digest'],
                [
                  'volunteer-gender',
                  'f010_gender_keep',
                  'RGender_f010_gender_keep',
                  85,
                  'b'.repeat(64),
                ],
                [
                  'volunteer-family',
                  'run_20261120_prev_00',
                  'RFamily_run_20261120_prev_00',
                  2,
                  'a'.repeat(64),
                ],
              ],
            },
            {
              name: 'RFamily_run_20261120_prev_00',
              rows: [
                ['{"status":"PUBLISHED","runId":"run_20261120_prev_00"}'],
                ['_source_key', 'provinceCode'],
                ['snapshot_run_20261120_prev_00_00001', '54'],
                ['snapshot_run_20261120_prev_00_00002', '54'],
              ],
            },
          ],
        },
      },
      fetchHandler: (url) => {
        const parsed = new URL(url);
        const page = Number(parsed.searchParams.get('page'));
        const pageSize = Number(parsed.searchParams.get('pageSize'));
        return jsonHttpResponse(makeReportPage(sourceRows, page, pageSize));
      },
    });

    // Run 1: Preview -> Stage batch 1 (2 rows) -> Stage batch 2 (1 row) -> Finalize Complete Snapshot
    const run1Preview = runFullFamilyPreview(env.platform, 2, 1);
    if (
      !run1Preview.preview ||
      !run1Preview.preview.ok ||
      run1Preview.preview.data.status !== 'READY'
    ) {
      throw new Error(`Expected READY preview run 1, got ${JSON.stringify(run1Preview)}`);
    }
    const fp1 = run1Preview.preview.data.fingerprint;
    expect(fp1.counts).toEqual({ insert: 3, update: 0, unchanged: 0, review: 1 });

    const stage1 = stageLargeDatasetBatchWithPlatform(
      {
        endpoint: 'volunteer-family',
        token: VALID_BEARER,
        expectedFingerprint: fp1,
        startPage: 1,
        batchPages: 1,
        pageSize: 2,
      },
      env.platform,
    );
    expect(stage1.ok).toBe(true);
    if (!stage1.ok || stage1.data.status !== 'BATCH_STAGED') {
      throw new Error(`Expected BATCH_STAGED batch 1, got ${JSON.stringify(stage1)}`);
    }
    const run1Id = stage1.data.runId;
    const snapTab1 = `RFamily_${run1Id}`;
    expect(stage1.data.stagingTabName).toBe(snapTab1);
    expect(stage1.data.destinationTab).toBe(snapTab1);
    expect(stage1.data.hasMore).toBe(true);
    expect(stage1.data.nextPage).toBe(2);

    const reportWb = env.workbookStates.get(VALID_REPORT_SHEET_ID)!;
    // During staging, RFamily_<runId> MUST remain hidden and _ThaiPHCReportCurrent MUST still point to previous snapshot
    expect(reportWb.sheets.get(snapTab1)?.hidden).toBe(true);
    expect(reportWb.sheets.get('_ThaiPHCReportCurrent')!.rows[2][2]).toBe(
      'RFamily_run_20261120_prev_00',
    );

    const stage2 = stageLargeDatasetBatchWithPlatform(
      {
        endpoint: 'volunteer-family',
        token: VALID_BEARER,
        expectedFingerprint: fp1,
        runId: run1Id,
        startPage: 2,
        batchPages: 1,
        pageSize: 2,
      },
      env.platform,
    );
    expect(stage2.ok).toBe(true);
    if (!stage2.ok || stage2.data.status !== 'BATCH_STAGED') {
      throw new Error(`Expected BATCH_STAGED batch 2, got ${JSON.stringify(stage2)}`);
    }
    expect(stage2.data.hasMore).toBe(false);
    expect(stage2.data.stagedRowCount).toBe(3);
    expect(reportWb.sheets.get(snapTab1)?.hidden).toBe(true);

    const commit1 = finalizeLargeDatasetCommitWithPlatform(
      {
        endpoint: 'volunteer-family',
        expectedFingerprint: fp1,
        runId: run1Id,
      },
      env.platform,
    );
    expect(commit1.ok).toBe(true);
    if (!commit1.ok || commit1.data.status !== 'COMMITTED_VERIFIED') {
      throw new Error(`Expected COMMITTED_VERIFIED run 1, got ${JSON.stringify(commit1)}`);
    }

    expect(commit1.data.syncMode).toBe('COMPLETE_SNAPSHOT');
    expect(commit1.data.destinationTab).toBe(snapTab1);
    expect(commit1.data.counts).toEqual({ insert: 3, update: 0, unchanged: 0, review: 1 });
    expect(commit1.data.syncLogStatus).toBe('COMMITTED_VERIFIED');
    expect(commit1.data.readback).toMatchObject({
      verified: true,
      destinationTab: snapTab1,
      expectedRowCount: 3,
      actualRowCount: 3,
      uniqueKeysVerified: true,
      rowDigestsVerified: true,
      unrelatedTabsPreserved: true,
      stagingTabCleaned: null,
      publicationPointerVerified: true,
    });

    // RFamily_<run1Id> is now visible (unhidden), Row 1 is PUBLISHED, exact headers + run-scoped ordinal keys + Preserve Source Locality
    const snap1Sheet = reportWb.sheets.get(snapTab1)!;
    expect(snap1Sheet.hidden).toBe(false);
    expect(snap1Sheet.frozenRows).toBe(2);
    const meta1 = JSON.parse(String(snap1Sheet.rows[0][0]));
    expect(meta1.status).toBe('PUBLISHED');
    expect(meta1.manifestDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(snap1Sheet.rows[1]).toEqual([
      '_source_key',
      'provinceCode',
      'provinceName',
      'districtCode',
      'districtName',
      'subdistrictCode',
      'subdistrictName',
      'villageCode',
      'villageNo',
      'villageName',
      'gender',
      'status',
      'statusLabel',
      '_quality_status',
      '_field_presence_json',
      '_row_digest',
      '__chunk_ordinal',
    ]);
    expect(snap1Sheet.rows[2][0]).toBe(`snapshot_${run1Id}_00001`);
    expect(snap1Sheet.rows[2][13]).toBe('VALID');
    expect(snap1Sheet.rows[3][0]).toBe(`snapshot_${run1Id}_00002`);
    expect(snap1Sheet.rows[3][5]).toBe('540210'); // preserved unaltered
    expect(snap1Sheet.rows[3][7]).toBe('540603006'); // preserved unaltered
    expect(snap1Sheet.rows[3][13]).toBe('WARNING');
    expect(snap1Sheet.rows[4][0]).toBe(`snapshot_${run1Id}_00003`);

    // Zero restricted PII persisted anywhere in snapshot tab
    expect(JSON.stringify(snap1Sheet.rows)).not.toMatch(
      /9999000000|154060000|PRIVATE_FAMILY_FIRST|PRIVATE_FAMILY_LAST|PRIVATE_ADDR|SYNTHETIC-VOL-UUID|PRIVATE_VOL_NAME/,
    );

    // _ThaiPHCReportCurrent updated as final write while preserving other endpoints' pointers
    const pointerSheet = reportWb.sheets.get('_ThaiPHCReportCurrent')!;
    expect(pointerSheet.rows[1][0]).toBe('volunteer-gender');
    expect(pointerSheet.rows[1][2]).toBe('RGender_f010_gender_keep');
    expect(pointerSheet.rows[2]).toEqual([
      'volunteer-family',
      run1Id,
      snapTab1,
      3,
      meta1.manifestDigest,
    ]);
    // Verify showSheet happened BEFORE pointer update (final write ordering)
    expect(snap1Sheet.writeOps).toContain('showSheet');
    expect(pointerSheet.writeOps[pointerSheet.writeOps.length - 1]).toContain('setValues:R3C1:1x5');

    // Prior RFamily_* snapshot and ชีต1 preserved completely untouched (no auto-delete!)
    expect(reportWb.sheets.get('RFamily_run_20261120_prev_00')?.rows).toHaveLength(4);
    expect(reportWb.sheets.get('ชีต1')?.rows).toEqual([['keep-report']]);

    // _ThaiPHCSyncLog recorded exact COMPLETE_SNAPSHOT lifecycle
    const syncLog = reportWb.sheets.get('_ThaiPHCSyncLog')!;
    expect(syncLog.rows[1][0]).toBe(run1Id);
    expect(syncLog.rows[1][3]).toBe('volunteer-family');
    expect(syncLog.rows[1][4]).toBe('COMPLETE_SNAPSHOT');
    expect(syncLog.rows[1][5]).toBe('COMMITTED_VERIFIED');
    expect(syncLog.rows[1][7]).toBe(3);
    expect(syncLog.rows[1][10]).toBe(1);
    expect(syncLog.rows[1][11]).toBe(true);

    // Run 2: Publish second Complete Snapshot (4 rows) -> switches pointer to RFamily_<run2Id> while keeping BOTH prior RFamily_* tabs untouched
    sourceRows = [makeFamilyRow(1), makeFamilyRow(2), makeFamilyRow(3), makeFamilyRow(4)];
    const run2Preview = runFullFamilyPreview(env.platform, 10, 1);
    if (
      !run2Preview.preview ||
      !run2Preview.preview.ok ||
      run2Preview.preview.data.status !== 'READY'
    ) {
      throw new Error('Expected READY preview run 2');
    }
    expect(run2Preview.preview.data.activeSnapshotTab).toBe(snapTab1);
    const stageRun2 = stageLargeDatasetBatchWithPlatform(
      {
        endpoint: 'volunteer-family',
        token: VALID_BEARER,
        expectedFingerprint: run2Preview.preview.data.fingerprint,
        startPage: 1,
        batchPages: 1,
        pageSize: 10,
      },
      env.platform,
    );
    if (!stageRun2.ok || stageRun2.data.status !== 'BATCH_STAGED') {
      throw new Error('Expected BATCH_STAGED run 2');
    }
    const commit2 = finalizeLargeDatasetCommitWithPlatform(
      {
        endpoint: 'volunteer-family',
        expectedFingerprint: run2Preview.preview.data.fingerprint,
        runId: stageRun2.data.runId,
      },
      env.platform,
    );
    expect(commit2.ok).toBe(true);
    if (!commit2.ok || commit2.data.status !== 'COMMITTED_VERIFIED') {
      throw new Error(`Expected COMMITTED_VERIFIED run 2, got ${JSON.stringify(commit2)}`);
    }
    const snapTab2 = `RFamily_${stageRun2.data.runId}`;
    expect(commit2.data.destinationTab).toBe(snapTab2);
    expect(reportWb.sheets.has('RFamily_run_20261120_prev_00')).toBe(true);
    expect(reportWb.sheets.has(snapTab1)).toBe(true);
    expect(reportWb.sheets.has(snapTab2)).toBe(true);

    // Dashboard displays active RFamily_<run2Id> pointer tab, row count (4), and COMMITTED_VERIFIED
    const dash = getDashboardStatusWithPlatform(env.platform);
    expect(dash.ok).toBe(true);
    if (!dash.ok) throw new Error('Expected ok dashboard');
    const famDash = dash.data.datasets.find((d) => d.endpoint === 'volunteer-family');
    expect(famDash).toMatchObject({
      endpoint: 'volunteer-family',
      syncMode: 'COMPLETE_SNAPSHOT',
      destinationTab: snapTab2,
      rowCount: 4,
      lastRunId: stageRun2.data.runId,
      lastStatus: 'COMMITTED_VERIFIED',
      publicationPointerActive: true,
      legacySnapshotPresent: false,
    });
  });

  it('refuses incomplete staged snapshots, stops on cell or chunk SHA-256 digest mismatch, refuses pre-existing RFamily_<runId> tab collision, and stops on pointer or source drift with PREVIEW_STALE_RECONFIRM_REQUIRED without unhiding or updating _ThaiPHCReportCurrent', () => {
    const rows = [makeFamilyRow(1), makeFamilyRow(2), makeFamilyRow(3)];

    const makeBaseEnv = (extraSheets: Array<{ name: string; rows: unknown[][] }> = []) =>
      createFakeSyncPlatformEnv({
        properties: { THAIPHC_HMAC_KEY_B64: undefined },
        workbooks: {
          [VALID_REF_SHEET_ID]: {
            name: 'ThaiPHC Reference',
            initialSheets: [{ name: 'ชีต1', rows: [['keep-ref']] }],
          },
          [VALID_REPORT_SHEET_ID]: {
            name: 'ThaiPHC Reports',
            initialSheets: [
              { name: 'ชีต1', rows: [['keep-report']] },
              {
                name: '_ThaiPHCReportCurrent',
                rows: [
                  ['endpoint', 'run_id', 'snapshot_sheet', 'row_count', 'manifest_digest'],
                  [
                    'volunteer-family',
                    'run_20261120_prev_00',
                    'RFamily_run_20261120_prev_00',
                    2,
                    'a'.repeat(64),
                  ],
                ],
              },
              {
                name: 'RFamily_run_20261120_prev_00',
                rows: [['{"status":"PUBLISHED"}'], ['_source_key'], ['snap1'], ['snap2']],
              },
              ...extraSheets,
            ],
          },
        },
        fetchHandler: (url) => {
          const parsed = new URL(url);
          const page = Number(parsed.searchParams.get('page'));
          const pageSize = Number(parsed.searchParams.get('pageSize'));
          return jsonHttpResponse(makeReportPage(rows, page, pageSize));
        },
      });

    // 1. Incomplete-stage refusal: only batch 1 of 2 staged -> finalize MUST refuse with INCOMPLETE_SNAPSHOT
    const incEnv = makeBaseEnv();
    const incPreview = runFullFamilyPreview(incEnv.platform, 2, 1);
    if (
      !incPreview.preview ||
      !incPreview.preview.ok ||
      incPreview.preview.data.status !== 'READY'
    ) {
      throw new Error('Expected READY preview');
    }
    const incStage1 = stageLargeDatasetBatchWithPlatform(
      {
        endpoint: 'volunteer-family',
        token: VALID_BEARER,
        expectedFingerprint: incPreview.preview.data.fingerprint,
        startPage: 1,
        batchPages: 1,
        pageSize: 2,
      },
      incEnv.platform,
    );
    if (!incStage1.ok || incStage1.data.status !== 'BATCH_STAGED') {
      throw new Error('Expected BATCH_STAGED');
    }
    const incFin = finalizeLargeDatasetCommitWithPlatform(
      {
        endpoint: 'volunteer-family',
        expectedFingerprint: incPreview.preview.data.fingerprint,
        runId: incStage1.data.runId,
      },
      incEnv.platform,
    );
    expect(incFin.ok).toBe(true);
    if (!incFin.ok || incFin.data.status !== 'FAILED_STOP') {
      throw new Error(`Expected FAILED_STOP INCOMPLETE_SNAPSHOT, got ${JSON.stringify(incFin)}`);
    }
    expect(incFin.data.stopCode).toBe('INCOMPLETE_SNAPSHOT');
    expect(incFin.data.syncLogStatus).toBe('NOT_WRITTEN');
    expect(incFin.data.stagingTabRetained).toBe(incStage1.data.stagingTabName);
    const incWb = incEnv.workbookStates.get(VALID_REPORT_SHEET_ID)!;
    expect(incWb.sheets.get(incStage1.data.stagingTabName)?.hidden).toBe(true);
    expect(incWb.sheets.get('_ThaiPHCReportCurrent')!.rows[1][2]).toBe(
      'RFamily_run_20261120_prev_00',
    );
    expect(incWb.sheets.has('_ThaiPHCSyncLog')).toBe(false);

    // 2. Digest mismatch stop: tamper persisted cell in hidden RFamily_<runId> before finalize -> STAGING_DIGEST_MISMATCH
    const cellTamperEnv = makeBaseEnv();
    const ctPreview = runFullFamilyPreview(cellTamperEnv.platform, 10, 1);
    if (!ctPreview.preview || !ctPreview.preview.ok || ctPreview.preview.data.status !== 'READY') {
      throw new Error('Expected READY preview');
    }
    const ctStage = stageLargeDatasetBatchWithPlatform(
      {
        endpoint: 'volunteer-family',
        token: VALID_BEARER,
        expectedFingerprint: ctPreview.preview.data.fingerprint,
        startPage: 1,
        batchPages: 1,
        pageSize: 10,
      },
      cellTamperEnv.platform,
    );
    if (!ctStage.ok || ctStage.data.status !== 'BATCH_STAGED') {
      throw new Error('Expected BATCH_STAGED');
    }
    const ctWb = cellTamperEnv.workbookStates.get(VALID_REPORT_SHEET_ID)!;
    ctWb.sheets.get(ctStage.data.stagingTabName)!.rows[2][12] = 'TAMPERED_LABEL';

    const ctFin = finalizeLargeDatasetCommitWithPlatform(
      {
        endpoint: 'volunteer-family',
        expectedFingerprint: ctPreview.preview.data.fingerprint,
        runId: ctStage.data.runId,
      },
      cellTamperEnv.platform,
    );
    expect(ctFin.ok).toBe(true);
    if (!ctFin.ok || ctFin.data.status !== 'FAILED_STOP') {
      throw new Error(`Expected FAILED_STOP STAGING_DIGEST_MISMATCH, got ${JSON.stringify(ctFin)}`);
    }
    expect(ctFin.data.stopCode).toBe('STAGING_DIGEST_MISMATCH');
    expect(ctWb.sheets.get(ctStage.data.stagingTabName)?.hidden).toBe(true);
    expect(ctWb.sheets.get('_ThaiPHCReportCurrent')!.rows[1][2]).toBe(
      'RFamily_run_20261120_prev_00',
    );

    // 3. Chunk SHA-256 digest mismatch in Row 1 metadata -> STAGING_DIGEST_MISMATCH
    const chunkTamperEnv = makeBaseEnv();
    const chPreview = runFullFamilyPreview(chunkTamperEnv.platform, 10, 1);
    if (!chPreview.preview || !chPreview.preview.ok || chPreview.preview.data.status !== 'READY') {
      throw new Error('Expected READY preview');
    }
    const chStage = stageLargeDatasetBatchWithPlatform(
      {
        endpoint: 'volunteer-family',
        token: VALID_BEARER,
        expectedFingerprint: chPreview.preview.data.fingerprint,
        startPage: 1,
        batchPages: 1,
        pageSize: 10,
      },
      chunkTamperEnv.platform,
    );
    if (!chStage.ok || chStage.data.status !== 'BATCH_STAGED') {
      throw new Error('Expected BATCH_STAGED');
    }
    const chWb = chunkTamperEnv.workbookStates.get(VALID_REPORT_SHEET_ID)!;
    const chSheet = chWb.sheets.get(chStage.data.stagingTabName)!;
    const chMeta = JSON.parse(String(chSheet.rows[0][0]));
    chMeta.chunkDigests[0] = 'f'.repeat(64);
    chSheet.rows[0][0] = JSON.stringify(chMeta);

    const chFin = finalizeLargeDatasetCommitWithPlatform(
      {
        endpoint: 'volunteer-family',
        expectedFingerprint: chPreview.preview.data.fingerprint,
        runId: chStage.data.runId,
      },
      chunkTamperEnv.platform,
    );
    expect(chFin.ok).toBe(true);
    if (!chFin.ok || chFin.data.status !== 'FAILED_STOP') {
      throw new Error(`Expected FAILED_STOP chunk mismatch, got ${JSON.stringify(chFin)}`);
    }
    expect(chFin.data.stopCode).toBe('STAGING_DIGEST_MISMATCH');
    expect(chSheet.hidden).toBe(true);
    expect(chWb.sheets.get('_ThaiPHCReportCurrent')!.rows[1][2]).toBe(
      'RFamily_run_20261120_prev_00',
    );

    // 4. Pointer-drift PREVIEW_STALE_RECONFIRM_REQUIRED (both before batch 1 AND before finalize)
    const driftBeforeStageEnv = makeBaseEnv();
    const d1Preview = runFullFamilyPreview(driftBeforeStageEnv.platform, 10, 1);
    if (!d1Preview.preview || !d1Preview.preview.ok || d1Preview.preview.data.status !== 'READY') {
      throw new Error('Expected READY preview');
    }
    const d1Wb = driftBeforeStageEnv.workbookStates.get(VALID_REPORT_SHEET_ID)!;
    d1Wb.sheets.get('_ThaiPHCReportCurrent')!.rows[1][2] = 'RFamily_other_concurrent_run';
    const d1Stage = stageLargeDatasetBatchWithPlatform(
      {
        endpoint: 'volunteer-family',
        token: VALID_BEARER,
        expectedFingerprint: d1Preview.preview.data.fingerprint,
        startPage: 1,
        batchPages: 1,
        pageSize: 10,
      },
      driftBeforeStageEnv.platform,
    );
    expect(d1Stage.ok).toBe(true);
    if (!d1Stage.ok || d1Stage.data.status !== 'PREVIEW_STALE_RECONFIRM_REQUIRED') {
      throw new Error(`Expected PREVIEW_STALE before stage, got ${JSON.stringify(d1Stage)}`);
    }
    expect(d1Stage.data.driftReason).toBe('DESTINATION_CHANGED');
    // Zero new RFamily_* tab created when pointer already drifted before batch 1
    expect(d1Wb.sheetOrder).toEqual([
      'ชีต1',
      '_ThaiPHCReportCurrent',
      'RFamily_run_20261120_prev_00',
    ]);

    const driftBeforeFinEnv = makeBaseEnv();
    const d2Preview = runFullFamilyPreview(driftBeforeFinEnv.platform, 10, 1);
    if (!d2Preview.preview || !d2Preview.preview.ok || d2Preview.preview.data.status !== 'READY') {
      throw new Error('Expected READY preview');
    }
    const d2Stage = stageLargeDatasetBatchWithPlatform(
      {
        endpoint: 'volunteer-family',
        token: VALID_BEARER,
        expectedFingerprint: d2Preview.preview.data.fingerprint,
        startPage: 1,
        batchPages: 1,
        pageSize: 10,
      },
      driftBeforeFinEnv.platform,
    );
    if (!d2Stage.ok || d2Stage.data.status !== 'BATCH_STAGED') {
      throw new Error('Expected BATCH_STAGED');
    }
    const d2Wb = driftBeforeFinEnv.workbookStates.get(VALID_REPORT_SHEET_ID)!;
    d2Wb.sheets.get('_ThaiPHCReportCurrent')!.rows[1][2] = 'RFamily_concurrent_winner';
    const d2Fin = finalizeLargeDatasetCommitWithPlatform(
      {
        endpoint: 'volunteer-family',
        expectedFingerprint: d2Preview.preview.data.fingerprint,
        runId: d2Stage.data.runId,
      },
      driftBeforeFinEnv.platform,
    );
    expect(d2Fin.ok).toBe(true);
    if (!d2Fin.ok || d2Fin.data.status !== 'PREVIEW_STALE_RECONFIRM_REQUIRED') {
      throw new Error(`Expected PREVIEW_STALE before finalize, got ${JSON.stringify(d2Fin)}`);
    }
    expect(d2Fin.data.driftReason).toBe('DESTINATION_CHANGED');
    expect(d2Wb.sheets.get(d2Stage.data.stagingTabName)?.hidden).toBe(true);
    expect(d2Wb.sheets.get('_ThaiPHCReportCurrent')!.rows[1][2]).toBe('RFamily_concurrent_winner');

    // 5. Refusal when RFamily_<runId> tab already exists (never overwrites existing snapshot tab)
    const collidingTabName = 'RFamily_run_20261122_volunteerfam_01';
    const collideEnv = makeBaseEnv([{ name: collidingTabName, rows: [['existing-immutable']] }]);
    const colPreview = runFullFamilyPreview(collideEnv.platform, 10, 1);
    if (
      !colPreview.preview ||
      !colPreview.preview.ok ||
      colPreview.preview.data.status !== 'READY'
    ) {
      throw new Error('Expected READY preview');
    }
    const colStage = stageLargeDatasetBatchWithPlatform(
      {
        endpoint: 'volunteer-family',
        token: VALID_BEARER,
        expectedFingerprint: colPreview.preview.data.fingerprint,
        startPage: 1,
        batchPages: 1,
        pageSize: 10,
      },
      collideEnv.platform,
    );
    expect(colStage.ok).toBe(true);
    if (!colStage.ok || colStage.data.status !== 'FAILED_STOP') {
      throw new Error(
        `Expected FAILED_STOP on existing tab collision, got ${JSON.stringify(colStage)}`,
      );
    }
    expect(colStage.data.stopCode).toBe('STAGING_STATE_INVALID');
    expect(
      collideEnv.workbookStates.get(VALID_REPORT_SHEET_ID)!.sheets.get(collidingTabName)?.rows,
    ).toEqual([['existing-immutable']]);
  });

  it('enforces THAIPHC_WRITE_ENABLED, THAIPHC_PERSON_DATA_WRITE_ENABLED, OWNER_ONLY_5406_APPROVED for same-workbook reuse, PRODUCTION typed phrase, LOCK_BUSY, UNRESOLVED_PREVIOUS_RUN, creates _ThaiPHCReportCurrent on first publish, and returns UNKNOWN_OUTCOME_STOP with STARTED sync log on write failure', () => {
    const rows = [makeFamilyRow(1), makeFamilyRow(2)];
    const fetchHandler = (url: string) => {
      const parsed = new URL(url);
      const page = Number(parsed.searchParams.get('page'));
      const pageSize = Number(parsed.searchParams.get('pageSize'));
      return jsonHttpResponse(makeReportPage(rows, page, pageSize));
    };

    // 1. Write Guards: THAIPHC_WRITE_ENABLED=false, THAIPHC_PERSON_DATA_WRITE_ENABLED=false, unapproved same-workbook
    const guardCases: Array<{
      label: string;
      properties: Record<string, string | undefined>;
      expectedStopCode: string;
    }> = [
      {
        label: 'THAIPHC_WRITE_ENABLED OFF',
        properties: { THAIPHC_WRITE_ENABLED: 'false', THAIPHC_HMAC_KEY_B64: undefined },
        expectedStopCode: 'WRITE_DISABLED',
      },
      {
        label: 'THAIPHC_PERSON_DATA_WRITE_ENABLED OFF',
        properties: {
          THAIPHC_WRITE_ENABLED: 'true',
          THAIPHC_PERSON_DATA_WRITE_ENABLED: 'false',
          THAIPHC_HMAC_KEY_B64: undefined,
        },
        expectedStopCode: 'PERSON_DATA_WRITE_DISABLED',
      },
      {
        label: 'same-workbook without OWNER_ONLY_5406_APPROVED',
        properties: {
          THAIPHC_REPORT_SPREADSHEET_ID: undefined,
          THAIPHC_SAME_WORKBOOK_APPROVAL: undefined,
          THAIPHC_HMAC_KEY_B64: undefined,
        },
        expectedStopCode: 'SAME_WORKBOOK_UNAPPROVED',
      },
    ];

    for (const gc of guardCases) {
      const env = createFakeSyncPlatformEnv({ properties: gc.properties, fetchHandler });
      const prev = runFullFamilyPreview(env.platform, 10, 1);
      if (!prev.preview || !prev.preview.ok || prev.preview.data.status !== 'READY') {
        throw new Error(`Expected READY preview for ${gc.label}`);
      }
      expect(prev.preview.data.writeAllowed, gc.label).toBe(false);
      const res = stageLargeDatasetBatchWithPlatform(
        {
          endpoint: 'volunteer-family',
          token: VALID_BEARER,
          expectedFingerprint: prev.preview.data.fingerprint,
          startPage: 1,
          batchPages: 1,
          pageSize: 10,
        },
        env.platform,
      );
      expect(res.ok, gc.label).toBe(true);
      if (!res.ok || res.data.status !== 'FAILED_STOP') {
        throw new Error(`Expected FAILED_STOP for ${gc.label}`);
      }
      expect(res.data.stopCode, gc.label).toBe(gc.expectedStopCode);
    }

    // 2. Same-workbook WITH OWNER_ONLY_5406_APPROVED + fresh workbook (no _ThaiPHCReportCurrent yet) + PRODUCTION confirmation phrase
    const prodSameWbEnv = createFakeSyncPlatformEnv({
      properties: {
        THAIPHC_ENV: 'PRODUCTION',
        THAIPHC_REPORT_SPREADSHEET_ID: undefined,
        THAIPHC_SAME_WORKBOOK_APPROVAL: 'OWNER_ONLY_5406_APPROVED',
        THAIPHC_WRITE_ENABLED: 'true',
        THAIPHC_PERSON_DATA_WRITE_ENABLED: 'true',
        THAIPHC_HMAC_KEY_B64: undefined,
      },
      fetchHandler,
    });
    const prodPreview = runFullFamilyPreview(prodSameWbEnv.platform, 10, 1);
    if (
      !prodPreview.preview ||
      !prodPreview.preview.ok ||
      prodPreview.preview.data.status !== 'READY'
    ) {
      throw new Error('Expected READY prod preview');
    }
    expect(prodPreview.preview.data.activeSnapshotTab).toBeNull();
    expect(prodPreview.preview.data.writeAllowed).toBe(true);

    // Missing PRODUCTION phrase blocked
    const prodNoPhrase = stageLargeDatasetBatchWithPlatform(
      {
        endpoint: 'volunteer-family',
        token: VALID_BEARER,
        expectedFingerprint: prodPreview.preview.data.fingerprint,
        startPage: 1,
        batchPages: 1,
        pageSize: 10,
      },
      prodSameWbEnv.platform,
    );
    expect(prodNoPhrase.ok).toBe(true);
    if (!prodNoPhrase.ok || prodNoPhrase.data.status !== 'FAILED_STOP') {
      throw new Error('Expected FAILED_STOP for missing PRODUCTION phrase');
    }
    expect(prodNoPhrase.data.stopCode).toBe('PRODUCTION_CONFIRMATION_REQUIRED');

    // Exact PRODUCTION phrase succeeds and initializes _ThaiPHCReportCurrent in the approved reference workbook
    const prodStage = stageLargeDatasetBatchWithPlatform(
      {
        endpoint: 'volunteer-family',
        token: VALID_BEARER,
        expectedFingerprint: prodPreview.preview.data.fingerprint,
        confirmationPhrase: 'PRODUCTION 5406 volunteer-family',
        startPage: 1,
        batchPages: 1,
        pageSize: 10,
      },
      prodSameWbEnv.platform,
    );
    if (!prodStage.ok || prodStage.data.status !== 'BATCH_STAGED') {
      throw new Error(`Expected BATCH_STAGED in PRODUCTION, got ${JSON.stringify(prodStage)}`);
    }
    const prodCommit = finalizeLargeDatasetCommitWithPlatform(
      {
        endpoint: 'volunteer-family',
        expectedFingerprint: prodPreview.preview.data.fingerprint,
        confirmationPhrase: 'PRODUCTION 5406 volunteer-family',
        runId: prodStage.data.runId,
      },
      prodSameWbEnv.platform,
    );
    expect(prodCommit.ok).toBe(true);
    if (!prodCommit.ok || prodCommit.data.status !== 'COMMITTED_VERIFIED') {
      throw new Error(
        `Expected COMMITTED_VERIFIED in PRODUCTION, got ${JSON.stringify(prodCommit)}`,
      );
    }
    const refWb = prodSameWbEnv.workbookStates.get(VALID_REF_SHEET_ID)!;
    expect(refWb.sheets.get('_ThaiPHCReportCurrent')?.rows[0]).toEqual([
      'endpoint',
      'run_id',
      'snapshot_sheet',
      'row_count',
      'manifest_digest',
    ]);
    expect(refWb.sheets.get('_ThaiPHCReportCurrent')?.rows[1][2]).toBe(
      `RFamily_${prodStage.data.runId}`,
    );
    expect(refWb.sheets.get('ชีต1')?.rows).toEqual([['keep-ref']]);

    // 3. LockService busy -> LOCK_BUSY
    const lockBusyEnv = createFakeSyncPlatformEnv({
      properties: { THAIPHC_HMAC_KEY_B64: undefined },
      lockAvailable: false,
      fetchHandler,
    });
    const lockPrev = runFullFamilyPreview(lockBusyEnv.platform, 10, 1);
    if (!lockPrev.preview || !lockPrev.preview.ok || lockPrev.preview.data.status !== 'READY') {
      throw new Error('Expected READY preview');
    }
    const lockRes = stageLargeDatasetBatchWithPlatform(
      {
        endpoint: 'volunteer-family',
        token: VALID_BEARER,
        expectedFingerprint: lockPrev.preview.data.fingerprint,
        startPage: 1,
        batchPages: 1,
        pageSize: 10,
      },
      lockBusyEnv.platform,
    );
    expect(lockRes.ok).toBe(true);
    if (!lockRes.ok || lockRes.data.status !== 'FAILED_STOP') {
      throw new Error('Expected LOCK_BUSY');
    }
    expect(lockRes.data.stopCode).toBe('LOCK_BUSY');

    // 4. Write failure on _ThaiPHCReportCurrent -> UNKNOWN_OUTCOME_STOP (never auto-retry, STARTED in _ThaiPHCSyncLog -> UNRESOLVED_PREVIOUS_RUN)
    const unknownEnv = createFakeSyncPlatformEnv({
      properties: { THAIPHC_HMAC_KEY_B64: undefined },
      failWriteOnTab: '_ThaiPHCReportCurrent',
      workbooks: {
        [VALID_REF_SHEET_ID]: {
          name: 'ThaiPHC Reference',
          initialSheets: [{ name: 'ชีต1', rows: [['keep-ref']] }],
        },
        [VALID_REPORT_SHEET_ID]: {
          name: 'ThaiPHC Reports',
          initialSheets: [
            { name: 'ชีต1', rows: [['keep-report']] },
            {
              name: '_ThaiPHCReportCurrent',
              rows: [['endpoint', 'run_id', 'snapshot_sheet', 'row_count', 'manifest_digest']],
            },
          ],
        },
      },
      fetchHandler,
    });
    const unkPrev = runFullFamilyPreview(unknownEnv.platform, 10, 1);
    if (!unkPrev.preview || !unkPrev.preview.ok || unkPrev.preview.data.status !== 'READY') {
      throw new Error('Expected READY preview');
    }
    const unkStage = stageLargeDatasetBatchWithPlatform(
      {
        endpoint: 'volunteer-family',
        token: VALID_BEARER,
        expectedFingerprint: unkPrev.preview.data.fingerprint,
        startPage: 1,
        batchPages: 1,
        pageSize: 10,
      },
      unknownEnv.platform,
    );
    if (!unkStage.ok || unkStage.data.status !== 'BATCH_STAGED') {
      throw new Error('Expected BATCH_STAGED');
    }
    const unkFin = finalizeLargeDatasetCommitWithPlatform(
      {
        endpoint: 'volunteer-family',
        expectedFingerprint: unkPrev.preview.data.fingerprint,
        runId: unkStage.data.runId,
      },
      unknownEnv.platform,
    );
    expect(unkFin.ok).toBe(true);
    if (!unkFin.ok || unkFin.data.status !== 'UNKNOWN_OUTCOME_STOP') {
      throw new Error(`Expected UNKNOWN_OUTCOME_STOP, got ${JSON.stringify(unkFin)}`);
    }
    expect(unkFin.data.stopCode).toBe('WRITE_FAILED_UNKNOWN');
    expect(unkFin.data.syncLogStatus).toBe('STARTED');
    expect(unkFin.data.stagingTabRetained).toBe(unkStage.data.stagingTabName);

    // Dashboard now flags UNRESOLVED_PREVIOUS_RUN, and next staging requires explicit acknowledgeUnresolvedRunId
    const dashAfterFail = getDashboardStatusWithPlatform(unknownEnv.platform);
    expect(dashAfterFail.ok).toBe(true);
    if (dashAfterFail.ok) {
      expect(dashAfterFail.data.unresolvedRuns).toContainEqual(
        expect.objectContaining({
          endpoint: 'volunteer-family',
          runId: unkStage.data.runId,
          status: 'STARTED',
        }),
      );
    }

    const freshAfterUnk = runFullFamilyPreview(unknownEnv.platform, 10, 1);
    if (
      !freshAfterUnk.preview ||
      !freshAfterUnk.preview.ok ||
      freshAfterUnk.preview.data.status !== 'READY'
    ) {
      throw new Error('Expected READY preview');
    }
    const blockedUnresolved = stageLargeDatasetBatchWithPlatform(
      {
        endpoint: 'volunteer-family',
        token: VALID_BEARER,
        expectedFingerprint: freshAfterUnk.preview.data.fingerprint,
        startPage: 1,
        batchPages: 1,
        pageSize: 10,
      },
      unknownEnv.platform,
    );
    expect(blockedUnresolved.ok).toBe(true);
    if (!blockedUnresolved.ok || blockedUnresolved.data.status !== 'FAILED_STOP') {
      throw new Error('Expected UNRESOLVED_PREVIOUS_RUN');
    }
    expect(blockedUnresolved.data.stopCode).toBe('UNRESOLVED_PREVIOUS_RUN');
  });

  it('fails closed (STAGING_STATE_INVALID) if hidden RFamily_<runId> is unhidden mid-staging, and transitions _ThaiPHCSyncLog STARTED -> FAILED_STOP (READBACK_MISMATCH) on post-publish readback failure or unrelated pointer corruption', () => {
    const rows = [makeFamilyRow(1), makeFamilyRow(2), makeFamilyRow(3)];
    const fetchHandler = (url: string) => {
      const parsed = new URL(url);
      const page = Number(parsed.searchParams.get('page'));
      const pageSize = Number(parsed.searchParams.get('pageSize'));
      return jsonHttpResponse(makeReportPage(rows, page, pageSize));
    };

    // 1. Mid-staging unhidden RFamily_<runId> fails closed on continuation batch AND finalize
    const unhiddenEnv = createFakeSyncPlatformEnv({
      properties: { THAIPHC_HMAC_KEY_B64: undefined },
      workbooks: {
        [VALID_REF_SHEET_ID]: {
          name: 'ThaiPHC Reference',
          initialSheets: [{ name: 'ชีต1', rows: [['keep-ref']] }],
        },
        [VALID_REPORT_SHEET_ID]: {
          name: 'ThaiPHC Reports',
          initialSheets: [
            { name: 'ชีต1', rows: [['keep-report']] },
            {
              name: '_ThaiPHCReportCurrent',
              rows: [
                ['endpoint', 'run_id', 'snapshot_sheet', 'row_count', 'manifest_digest'],
                [
                  'volunteer-family',
                  'run_20261120_prev_00',
                  'RFamily_run_20261120_prev_00',
                  2,
                  'a'.repeat(64),
                ],
              ],
            },
          ],
        },
      },
      fetchHandler,
    });
    const unhPrev = runFullFamilyPreview(unhiddenEnv.platform, 2, 1);
    if (!unhPrev.preview || !unhPrev.preview.ok || unhPrev.preview.data.status !== 'READY') {
      throw new Error('Expected READY preview');
    }
    const unhStage1 = stageLargeDatasetBatchWithPlatform(
      {
        endpoint: 'volunteer-family',
        token: VALID_BEARER,
        expectedFingerprint: unhPrev.preview.data.fingerprint,
        startPage: 1,
        batchPages: 1,
        pageSize: 2,
      },
      unhiddenEnv.platform,
    );
    if (!unhStage1.ok || unhStage1.data.status !== 'BATCH_STAGED') {
      throw new Error('Expected BATCH_STAGED');
    }
    const unhWb = unhiddenEnv.workbookStates.get(VALID_REPORT_SHEET_ID)!;
    unhWb.sheets.get(unhStage1.data.stagingTabName)!.hidden = false;

    const unhStage2 = stageLargeDatasetBatchWithPlatform(
      {
        endpoint: 'volunteer-family',
        token: VALID_BEARER,
        expectedFingerprint: unhPrev.preview.data.fingerprint,
        runId: unhStage1.data.runId,
        startPage: 2,
        batchPages: 1,
        pageSize: 2,
      },
      unhiddenEnv.platform,
    );
    expect(unhStage2.ok).toBe(true);
    if (!unhStage2.ok || unhStage2.data.status !== 'FAILED_STOP') {
      throw new Error(
        `Expected FAILED_STOP on unhidden staging batch 2, got ${JSON.stringify(unhStage2)}`,
      );
    }
    expect(unhStage2.data.stopCode).toBe('STAGING_STATE_INVALID');
    expect(unhStage2.data.syncLogStatus).toBe('NOT_WRITTEN');

    const unhFin = finalizeLargeDatasetCommitWithPlatform(
      {
        endpoint: 'volunteer-family',
        expectedFingerprint: unhPrev.preview.data.fingerprint,
        runId: unhStage1.data.runId,
      },
      unhiddenEnv.platform,
    );
    expect(unhFin.ok).toBe(true);
    if (!unhFin.ok || unhFin.data.status !== 'FAILED_STOP') {
      throw new Error(`Expected FAILED_STOP on unhidden finalize, got ${JSON.stringify(unhFin)}`);
    }
    expect(unhFin.data.stopCode).toBe('STAGING_STATE_INVALID');
    expect(unhFin.data.syncLogStatus).toBe('NOT_WRITTEN');
    expect(unhWb.sheets.get('_ThaiPHCReportCurrent')!.rows[1][2]).toBe(
      'RFamily_run_20261120_prev_00',
    );
    expect(unhWb.sheets.has('_ThaiPHCSyncLog')).toBe(false);

    // 2. Post-publish Destination Readback failure (tampered published cell after pointer flush) -> STARTED -> FAILED_STOP (READBACK_MISMATCH, readback_verified = false)
    const runReadbackTamperCase = (mode: 'corrupt-snapshot-cell' | 'corrupt-other-pointer') => {
      const rbEnv = createFakeSyncPlatformEnv({
        properties: { THAIPHC_HMAC_KEY_B64: undefined },
        workbooks: {
          [VALID_REF_SHEET_ID]: {
            name: 'ThaiPHC Reference',
            initialSheets: [{ name: 'ชีต1', rows: [['keep-ref']] }],
          },
          [VALID_REPORT_SHEET_ID]: {
            name: 'ThaiPHC Reports',
            initialSheets: [
              { name: 'ชีต1', rows: [['keep-report']] },
              {
                name: '_ThaiPHCReportCurrent',
                rows: [
                  ['endpoint', 'run_id', 'snapshot_sheet', 'row_count', 'manifest_digest'],
                  [
                    'volunteer-gender',
                    'f010_gender_keep',
                    'RGender_f010_gender_keep',
                    85,
                    'b'.repeat(64),
                  ],
                ],
              },
            ],
          },
        },
        fetchHandler,
      });

      const rbPrev = runFullFamilyPreview(rbEnv.platform, 10, 1);
      if (!rbPrev.preview || !rbPrev.preview.ok || rbPrev.preview.data.status !== 'READY') {
        throw new Error('Expected READY preview');
      }
      const rbStage = stageLargeDatasetBatchWithPlatform(
        {
          endpoint: 'volunteer-family',
          token: VALID_BEARER,
          expectedFingerprint: rbPrev.preview.data.fingerprint,
          startPage: 1,
          batchPages: 1,
          pageSize: 10,
        },
        rbEnv.platform,
      );
      if (!rbStage.ok || rbStage.data.status !== 'BATCH_STAGED') {
        throw new Error('Expected BATCH_STAGED');
      }
      const stagedTabName = rbStage.data.stagingTabName;
      const stagedRunId = rbStage.data.runId;

      const rbWb = rbEnv.workbookStates.get(VALID_REPORT_SHEET_ID)!;
      const syncLogStatusesObserved: string[] = [];
      let flushSeq = 0;
      const interceptedPlatform: SyncPlatform = {
        ...rbEnv.platform,
        flushSpreadsheet: () => {
          rbEnv.platform.flushSpreadsheet();
          flushSeq += 1;
          const syncLogSheet = rbWb.sheets.get('_ThaiPHCSyncLog');
          if (syncLogSheet && syncLogSheet.rows[1]) {
            syncLogStatusesObserved.push(String(syncLogSheet.rows[1][5]));
          }
          // Flush 1 = STARTED log, Flush 2 = showSheet, Flush 3 = _ThaiPHCReportCurrent pointer write (right before Readback!)
          if (flushSeq === 3) {
            if (mode === 'corrupt-snapshot-cell') {
              rbWb.sheets.get(stagedTabName)!.rows[2][12] = 'READBACK_CORRUPTED';
            } else {
              rbWb.sheets.get('_ThaiPHCReportCurrent')!.rows[1][2] = 'RGender_TAMPERED';
            }
          }
        },
      };

      const rbFin = finalizeLargeDatasetCommitWithPlatform(
        {
          endpoint: 'volunteer-family',
          expectedFingerprint: rbPrev.preview.data.fingerprint,
          runId: stagedRunId,
        },
        interceptedPlatform,
      );
      expect(rbFin.ok, mode).toBe(true);
      if (!rbFin.ok || rbFin.data.status !== 'FAILED_STOP') {
        throw new Error(
          `Expected FAILED_STOP READBACK_MISMATCH (${mode}), got ${JSON.stringify(rbFin)}`,
        );
      }
      expect(rbFin.data.stopCode, mode).toBe('READBACK_MISMATCH');
      expect(rbFin.data.syncLogStatus, mode).toBe('FAILED_STOP');
      expect(rbFin.data.stagingTabRetained, mode).toBe(stagedTabName);
      // Verify exact _ThaiPHCSyncLog transition STARTED -> FAILED_STOP with readback_verified = false
      expect(syncLogStatusesObserved[0], mode).toBe('STARTED');
      expect(syncLogStatusesObserved[syncLogStatusesObserved.length - 1], mode).toBe('FAILED_STOP');
      const syncLogRow = rbWb.sheets.get('_ThaiPHCSyncLog')!.rows[1];
      expect(syncLogRow[0], mode).toBe(stagedRunId);
      expect(syncLogRow[4], mode).toBe('COMPLETE_SNAPSHOT');
      expect(syncLogRow[5], mode).toBe('FAILED_STOP');
      expect(syncLogRow[11], mode).toBe(false);
    };

    runReadbackTamperCase('corrupt-snapshot-cell');
    runReadbackTamperCase('corrupt-other-pointer');
  });
});
