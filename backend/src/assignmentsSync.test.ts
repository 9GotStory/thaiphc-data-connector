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

const VALID_REF_SHEET_ID = TEST_REF_SHEET_ID;
const VALID_REPORT_SHEET_ID = TEST_REPORT_SHEET_ID;
const VALID_BEARER = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.synthetic_assign_token_12345';
const VALID_HMAC_KEY = TEST_HMAC_KEY_B64;

const jsonResponse = jsonHttpResponse;
const createFakeAssignmentsEnv = createFakeSyncPlatformEnv;

function makeAssignmentRow(
  index: number,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const num = String(index).padStart(4, '0');
  return {
    // 8 RESTRICTED_DEFAULT_OMIT direct personal identifiers (must NEVER leave GAS memory)
    id: `SYNTHETIC-UUID-${num}`,
    osmCode: `9999000000${num}`,
    citizenId: `154060000${num}`,
    prefixNameTh: 'นางสาว',
    prefixNameEn: 'Miss',
    firstName: `PRIVATE_FIRST_${num}`,
    lastName: `PRIVATE_LAST_${num}`,
    fullName: `นางสาว PRIVATE_FIRST_${num} PRIVATE_LAST_${num}`,
    // 17 ALLOW_ONLY_IF_DATASET_APPROVED columns
    provinceCode: '54',
    provinceNameTh: 'แพร่',
    districtCode: '5406',
    districtNameTh: 'สอง',
    subdistrictCode: index % 2 === 1 ? '540601' : '540603',
    subdistrictNameTh: index % 2 === 1 ? 'บ้านหนุน' : 'ห้วยหม้าย',
    villageNo: String(((index - 1) % 12) + 1),
    villageName: index % 2 === 1 ? null : `หมู่บ้านตัวอย่าง_${num}`,
    isActive: true,
    status: 'ใช้งาน',
    osmStatus: '',
    osmShowbbody: '1',
    approvalStatus: 'approved',
    volunteerStatus: index % 2 === 1 ? 'already_volunteer' : 'not_interested',
    createdAt: '2025-11-10T05:36:01.776457Z',
    requestDate: '2025-11-10T05:36:01.776457Z',
    updatedAt: '2026-10-12T13:07:33.846207Z',
    ...overrides,
  };
}

function makeAssignmentPage(
  allRows: Record<string, unknown>[],
  page: number,
  pageSize: number,
  totalOverride?: number,
) {
  const total = totalOverride ?? allRows.length;
  const start = (page - 1) * pageSize;
  return {
    provinces: [
      {
        provinceCode: '54',
        provinceNameTh: 'แพร่',
        provinceNameEn: 'Phrae',
        osmCount: total,
      },
    ],
    items: allRows.slice(start, start + pageSize),
    pagination: {
      page,
      limit: pageSize,
      total,
      pages: total === 0 ? 0 : Math.ceil(total / pageSize),
    },
  };
}

describe('Assignments Person-Level Sync — Batched Preview & F010 Pseudonymization (Backend GAS RPC Seam)', () => {
  it('fetches assignments sequentially across multiple batches with assignment pagination, derives byte-for-byte F010 h1_ pseudonyms matching legacy projection, strips all 8 restricted PII fields, preserves nullable villageName, writes zero Sheets, and detects LEGACY_F010_SNAPSHOT_PRESENT', async () => {
    const rows = [1, 2, 3, 4, 5].map((i) => makeAssignmentRow(i));

    const env = createFakeAssignmentsEnv({
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
                ['assignments', 'f010_20261119', 'RAssign_f010_20261119', 1571, 'b'.repeat(64)],
              ],
            },
            {
              name: 'RAssign_f010_20261119',
              rows: [['{"status":"PUBLISHED"}'], ['_source_key', 'provinceCode']],
            },
          ],
        },
      },
      fetchHandler: (url) => {
        const parsed = new URL(url);
        const page = Number(parsed.searchParams.get('page'));
        const pageSize = Number(parsed.searchParams.get('pageSize'));
        return jsonResponse(makeAssignmentPage(rows, page, pageSize));
      },
    });

    // Batch 1: pages 1..2 (pageSize=2, batchPages=2 -> 4 rows)
    const batch1 = previewDatasetBatchWithPlatform(
      {
        endpoint: 'assignments',
        token: VALID_BEARER,
        startPage: 1,
        batchPages: 2,
        pageSize: 2,
      },
      env.platform,
    );
    expect(batch1.ok).toBe(true);
    if (!batch1.ok || batch1.data.status !== 'BATCH_OK') {
      throw new Error(`Expected BATCH_OK on batch 1, got: ${JSON.stringify(batch1)}`);
    }
    expect(batch1.data.pagesFetchedInBatch).toBe(2);
    expect(batch1.data.lastPageFetched).toBe(2);
    expect(batch1.data.totalPages).toBe(3);
    expect(batch1.data.sourceTotal).toBe(5);
    expect(batch1.data.rowsInBatch).toBe(4);
    expect(batch1.data.hasMore).toBe(true);
    expect(batch1.data.nextPage).toBe(3);

    // Verify exact allowlisted assignment URL & GET no-redirect options
    expect(env.fetchCalls.map((c) => c.url)).toEqual([
      'https://api-thaiphc.hss.moph.go.th/api/v1/dashboard/assignments?page=1&pageSize=2&provinceCode=54&districtCode=5406&osmStatus=&osm_status=&approval_status=approved&order_by=approved_date&sort_dir=desc',
      'https://api-thaiphc.hss.moph.go.th/api/v1/dashboard/assignments?page=2&pageSize=2&provinceCode=54&districtCode=5406&osmStatus=&osm_status=&approval_status=approved&order_by=approved_date&sort_dir=desc',
    ]);
    expect(env.fetchCalls[0].options).toMatchObject({
      method: 'get',
      followRedirects: false,
      muteHttpExceptions: true,
    });

    // Batch 2: page 3 (1 remaining row)
    const batch2 = previewDatasetBatchWithPlatform(
      {
        endpoint: 'assignments',
        token: VALID_BEARER,
        startPage: 3,
        batchPages: 2,
        pageSize: 2,
        expectedSourceTotal: batch1.data.sourceTotal,
      },
      env.platform,
    );
    expect(batch2.ok).toBe(true);
    if (!batch2.ok || batch2.data.status !== 'BATCH_OK') {
      throw new Error(`Expected BATCH_OK on batch 2, got: ${JSON.stringify(batch2)}`);
    }
    expect(batch2.data.pagesFetchedInBatch).toBe(1);
    expect(batch2.data.lastPageFetched).toBe(3);
    expect(batch2.data.rowsInBatch).toBe(1);
    expect(batch2.data.hasMore).toBe(false);
    expect(batch2.data.nextPage).toBeNull();

    // ADR-0005 Full-Field Operator Mode: raw ThaiPHC id is used directly as _source_key (no HMAC required)
    expect(batch1.data.rowDigests[0].key).toBe('SYNTHETIC-UUID-0001');
    expect(batch1.data.rowDigests[1].key).toBe('SYNTHETIC-UUID-0002');
    const allBatchDigests = [...batch1.data.rowDigests, ...batch2.data.rowDigests];

    // Finalize read-only preview from accumulated batch outputs
    const preview = finalizePreviewWithPlatform(
      {
        endpoint: 'assignments',
        sourceTotal: 5,
        pagesFetched: 3,
        rowDigests: allBatchDigests,
        aggregateSummary: [...batch1.data.aggregateSummary, ...batch2.data.aggregateSummary],
        sampleCandidates: [...batch1.data.sampleCandidates, ...batch2.data.sampleCandidates],
      },
      env.platform,
    );
    expect(preview.ok).toBe(true);
    if (
      !preview.ok ||
      preview.data.status !== 'READY' ||
      preview.data.previewMode !== 'EXTENDED_MINIMIZED'
    ) {
      throw new Error(`Expected READY EXTENDED_MINIMIZED preview, got: ${JSON.stringify(preview)}`);
    }

    // Zero Google Sheets writes during entire Preview flow
    expect(env.workbookStates.get(VALID_REPORT_SHEET_ID)!.sheets.has('Assignments')).toBe(false);
    expect(env.getFlushCount()).toBe(0);

    // Diff counts, aggregate summary, nullable villageName, masked citizenId, and LEGACY_F010_SNAPSHOT_PRESENT
    expect(preview.data.paginationProtocol).toBe('assignment');
    expect(preview.data.destinationTab).toBe('Assignments');
    expect(preview.data.sourceTotal).toBe(5);
    expect(preview.data.pagesFetched).toBe(3);
    expect(preview.data.counts).toEqual({ insert: 5, update: 0, unchanged: 0, review: 0 });
    expect(preview.data.legacySnapshotPresent).toBe(true);
    expect(preview.data.legacySnapshotTab).toBe('RAssign_f010_20261119');
    expect(preview.data.aggregateSummary).toEqual([
      { groupCode: '540601', groupLabel: 'บ้านหนุน', rowCount: 3, reviewCount: 0 },
      { groupCode: '540603', groupLabel: 'ห้วยหม้าย', rowCount: 2, reviewCount: 0 },
    ]);

    // Operator-identifying fullName & osmCode shown; citizenId masked server-side; nullable villageName preserved
    const sample1 = preview.data.sampleRows.find((r) => r.sourceKey === 'SYNTHETIC-UUID-0001');
    const sample2 = preview.data.sampleRows.find((r) => r.sourceKey === 'SYNTHETIC-UUID-0002');
    expect(sample1?.minimizedAttributes.find((a) => a.field === 'villageName')?.value).toBeNull();
    expect(sample1?.minimizedAttributes.find((a) => a.field === 'citizenId')?.value).toBe(
      '1-5406-xxxxx-xx-x',
    );
    expect(sample1?.minimizedAttributes.find((a) => a.field === 'fullName')?.value).toBe(
      'นางสาว PRIVATE_FIRST_0001 PRIVATE_LAST_0001',
    );
    expect(sample2?.minimizedAttributes.find((a) => a.field === 'villageName')?.value).toBe(
      'หมู่บ้านตัวอย่าง_0002',
    );

    // Raw 13-digit citizenId, HMAC key, and Bearer Token must NEVER appear in Preview payloads
    const serializedAll = JSON.stringify({ batch1, batch2, preview });
    for (const secret of ['1540600000001', '1540600000002', VALID_HMAC_KEY, VALID_BEARER]) {
      expect(serializedAll).not.toContain(secret);
    }
  });

  it('permits read-only Preview without THAIPHC_HMAC_KEY_B64 while failing closed on THAIPHC_FULL_PII_WRITE_ENABLED=false, and hard-blocks strict Geographic Scope, nullable villageName type errors, formula injection, cross-batch duplicates, SOURCE_TOTAL_CHANGED, and HTTP_401', () => {
    const validRows = [makeAssignmentRow(1)];

    // 1. Preview succeeds without THAIPHC_HMAC_KEY_B64, and writeAllowed is false when THAIPHC_FULL_PII_WRITE_ENABLED=false
    const noHmacGuardOffEnv = createFakeAssignmentsEnv({
      properties: { THAIPHC_HMAC_KEY_B64: undefined, THAIPHC_FULL_PII_WRITE_ENABLED: 'false' },
      fetchHandler: () => jsonResponse(makeAssignmentPage(validRows, 1, 10)),
    });
    const noHmacBatch = previewDatasetBatchWithPlatform(
      { endpoint: 'assignments', token: VALID_BEARER, startPage: 1, pageSize: 10 },
      noHmacGuardOffEnv.platform,
    );
    expect(noHmacBatch.ok && noHmacBatch.data.status === 'BATCH_OK').toBe(true);
    if (noHmacBatch.ok && noHmacBatch.data.status === 'BATCH_OK') {
      const noHmacFin = finalizePreviewWithPlatform(
        {
          endpoint: 'assignments',
          sourceTotal: noHmacBatch.data.sourceTotal,
          pagesFetched: noHmacBatch.data.pagesFetchedInBatch,
          rowDigests: noHmacBatch.data.rowDigests,
          aggregateSummary: noHmacBatch.data.aggregateSummary,
          sampleCandidates: noHmacBatch.data.sampleCandidates,
        },
        noHmacGuardOffEnv.platform,
      );
      expect(noHmacFin.ok && noHmacFin.data.status === 'READY').toBe(true);
      if (noHmacFin.ok && noHmacFin.data.status === 'READY') {
        expect(noHmacFin.data.writeAllowed).toBe(false);
        expect(noHmacFin.data.blockedGuardReason).toBe('THAIPHC_FULL_PII_WRITE_ENABLED');
        const blockedStage = stageLargeDatasetBatchWithPlatform(
          {
            endpoint: 'assignments',
            token: VALID_BEARER,
            expectedFingerprint: noHmacFin.data.fingerprint,
            startPage: 1,
            pageSize: 10,
          },
          noHmacGuardOffEnv.platform,
        );
        expect(blockedStage.ok && blockedStage.data.status === 'FAILED_STOP').toBe(true);
        if (blockedStage.ok && blockedStage.data.status === 'FAILED_STOP') {
          expect(blockedStage.data.stopCode).toBe('FULL_PII_WRITE_DISABLED');
        }
      }
    }

    // 2. Strict Geographic Scope (54 / 5406): out-of-district and subdistrict mismatches -> STOP_BLOCKED
    for (const badScope of [
      { provinceCode: '50' },
      { districtCode: '5407' },
      { subdistrictCode: '540609' },
      { subdistrictCode: '540201' },
      { subdistrictCode: '' },
    ]) {
      const scopeEnv = createFakeAssignmentsEnv({
        fetchHandler: () =>
          jsonResponse(makeAssignmentPage([makeAssignmentRow(1, badScope)], 1, 10)),
      });
      const res = previewDatasetBatchWithPlatform(
        { endpoint: 'assignments', token: VALID_BEARER, startPage: 1, pageSize: 10 },
        scopeEnv.platform,
      );
      expect(res.ok && res.data.status === 'STOP_BLOCKED').toBe(true);
      if (res.ok && res.data.status === 'STOP_BLOCKED') {
        expect(res.data.diagnostics[0].code).toBe('OUT_OF_GEOGRAPHIC_SCOPE');
      }
    }

    // 2b. Opaque string villageNo (e.g. "0", "1-3") is permitted per F010, while non-string villageNo fails TYPE_MISMATCH, and unknown source field names are NEVER echoed
    const opaqueVillageEnv = createFakeAssignmentsEnv({
      fetchHandler: () =>
        jsonResponse(
          makeAssignmentPage(
            [makeAssignmentRow(1, { villageNo: '0' }), makeAssignmentRow(2, { villageNo: '1-3' })],
            1,
            10,
          ),
        ),
    });
    const opaqueRes = previewDatasetBatchWithPlatform(
      { endpoint: 'assignments', token: VALID_BEARER, startPage: 1, pageSize: 10 },
      opaqueVillageEnv.platform,
    );
    expect(opaqueRes.ok && opaqueRes.data.status === 'BATCH_OK').toBe(true);

    const numVillageEnv = createFakeAssignmentsEnv({
      fetchHandler: () =>
        jsonResponse(makeAssignmentPage([makeAssignmentRow(1, { villageNo: 7 })], 1, 10)),
    });
    const numVillageRes = previewDatasetBatchWithPlatform(
      { endpoint: 'assignments', token: VALID_BEARER, startPage: 1, pageSize: 10 },
      numVillageEnv.platform,
    );
    expect(numVillageRes.ok && numVillageRes.data.status === 'STOP_BLOCKED').toBe(true);
    if (numVillageRes.ok && numVillageRes.data.status === 'STOP_BLOCKED') {
      expect(numVillageRes.data.diagnostics[0].code).toBe('TYPE_MISMATCH');
    }

    const unknownFieldEnv = createFakeAssignmentsEnv({
      fetchHandler: () =>
        jsonResponse(
          makeAssignmentPage(
            [makeAssignmentRow(1, { secretUnknownField: 'TOP_SECRET_VALUE' })],
            1,
            10,
          ),
        ),
    });
    const unknownFieldRes = previewDatasetBatchWithPlatform(
      { endpoint: 'assignments', token: VALID_BEARER, startPage: 1, pageSize: 10 },
      unknownFieldEnv.platform,
    );
    expect(unknownFieldRes.ok && unknownFieldRes.data.status === 'STOP_BLOCKED').toBe(true);
    if (unknownFieldRes.ok && unknownFieldRes.data.status === 'STOP_BLOCKED') {
      expect(unknownFieldRes.data.diagnostics[0].code).toBe('UNEXPECTED_FIELD');
      expect(JSON.stringify(unknownFieldRes)).not.toContain('secretUnknownField');
      expect(JSON.stringify(unknownFieldRes)).not.toContain('TOP_SECRET_VALUE');
    }

    // 3. Invalid villageName types (number / boolean / formula injection) -> STOP_BLOCKED
    const badVillageTypes: Array<[unknown, string]> = [
      [123, 'TYPE_MISMATCH'],
      [true, 'TYPE_MISMATCH'],
      ['=HYPERLINK("http://evil")', 'FORMULA_INJECTION_DETECTED'],
    ];
    for (const [badVillageName, expectedCode] of badVillageTypes) {
      const vtEnv = createFakeAssignmentsEnv({
        fetchHandler: () =>
          jsonResponse(
            makeAssignmentPage([makeAssignmentRow(1, { villageName: badVillageName })], 1, 10),
          ),
      });
      const res = previewDatasetBatchWithPlatform(
        { endpoint: 'assignments', token: VALID_BEARER, startPage: 1, pageSize: 10 },
        vtEnv.platform,
      );
      expect(res.ok && res.data.status === 'STOP_BLOCKED').toBe(true);
      if (res.ok && res.data.status === 'STOP_BLOCKED') {
        expect(res.data.diagnostics[0].code).toBe(expectedCode);
        expect(JSON.stringify(res)).not.toContain('HYPERLINK');
      }
    }

    // 4. Cross-batch SOURCE_TOTAL_CHANGED when expectedSourceTotal differs
    const driftEnv = createFakeAssignmentsEnv({
      fetchHandler: () => jsonResponse(makeAssignmentPage([makeAssignmentRow(1)], 2, 1, 6)),
    });
    const driftRes = previewDatasetBatchWithPlatform(
      {
        endpoint: 'assignments',
        token: VALID_BEARER,
        startPage: 2,
        pageSize: 1,
        expectedSourceTotal: 5,
      },
      driftEnv.platform,
    );
    expect(driftRes.ok && driftRes.data.status === 'STOP_BLOCKED').toBe(true);
    if (driftRes.ok && driftRes.data.status === 'STOP_BLOCKED') {
      expect(driftRes.data.diagnostics[0].code).toBe('SOURCE_TOTAL_CHANGED');
    }

    // 5. Cross-batch duplicate source key detected in finalizePreview -> STOP_BLOCKED: DUPLICATE_SOURCE_KEY
    const dupEnv = createFakeAssignmentsEnv({
      fetchHandler: () => jsonResponse(makeAssignmentPage(validRows, 1, 10)),
    });
    const dupDigest = 'a'.repeat(64);
    const dupFin = finalizePreviewWithPlatform(
      {
        endpoint: 'assignments',
        sourceTotal: 2,
        pagesFetched: 2,
        rowDigests: [
          { key: 'SYNTHETIC-UUID-0001', rowDigest: dupDigest },
          { key: 'SYNTHETIC-UUID-0001', rowDigest: dupDigest },
        ],
        aggregateSummary: [],
        sampleCandidates: [],
      },
      dupEnv.platform,
    );
    expect(dupFin.ok && dupFin.data.status === 'STOP_BLOCKED').toBe(true);
    if (dupFin.ok && dupFin.data.status === 'STOP_BLOCKED') {
      expect(dupFin.data.diagnostics[0].code).toBe('DUPLICATE_SOURCE_KEY');
    }

    // 6. HTTP_401 returns RPC error without echoing token
    const authEnv = createFakeAssignmentsEnv({
      fetchHandler: () => jsonResponse({ error: 'unauthorized' }, 401),
    });
    const authRes = previewDatasetBatchWithPlatform(
      { endpoint: 'assignments', token: VALID_BEARER, startPage: 1, pageSize: 10 },
      authEnv.platform,
    );
    expect(authRes.ok).toBe(false);
    if (!authRes.ok) {
      expect(authRes.error.code).toBe('HTTP_401');
    }
    expect(JSON.stringify(authRes)).not.toContain(VALID_BEARER);
  });

  it('commits assignments via multi-batch hidden _Stage_assignments_<runId> tab, verifies under LockService, applies 25-column Keyed Upsert preserving legacy RAssign_* and ชีต1, cleans up _Stage_* only after Destination Readback passes, and supports repeatable INSERT/UPDATE/UNCHANGED/MISSING_IN_SOURCE', () => {
    let sourceRows = [1, 2, 3, 4, 5].map((i) => makeAssignmentRow(i));

    const env = createFakeAssignmentsEnv({
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
                ['assignments', 'f010_20261119', 'RAssign_f010_20261119', 1571, 'b'.repeat(64)],
              ],
            },
            {
              name: 'RAssign_f010_20261119',
              rows: [['{"status":"PUBLISHED"}'], ['_source_key', 'provinceCode']],
            },
          ],
        },
      },
      fetchHandler: (url) => {
        const parsed = new URL(url);
        const page = Number(parsed.searchParams.get('page'));
        const pageSize = Number(parsed.searchParams.get('pageSize'));
        return jsonResponse(makeAssignmentPage(sourceRows, page, pageSize));
      },
    });

    const runBatchedPreview = () => {
      const b1 = previewDatasetBatchWithPlatform(
        { endpoint: 'assignments', token: VALID_BEARER, startPage: 1, batchPages: 2, pageSize: 2 },
        env.platform,
      );
      if (!b1.ok || b1.data.status !== 'BATCH_OK') throw new Error('expected batch 1 ok');
      const allDigests = [...b1.data.rowDigests];
      const allAgg = [...b1.data.aggregateSummary];
      const allSamples = [...b1.data.sampleCandidates];
      let pagesFetched = b1.data.pagesFetchedInBatch;
      let nextPage = b1.data.nextPage;
      while (nextPage !== null) {
        const bn = previewDatasetBatchWithPlatform(
          {
            endpoint: 'assignments',
            token: VALID_BEARER,
            startPage: nextPage,
            batchPages: 2,
            pageSize: 2,
            expectedSourceTotal: b1.data.sourceTotal,
          },
          env.platform,
        );
        if (!bn.ok || bn.data.status !== 'BATCH_OK') throw new Error('expected batch n ok');
        allDigests.push(...bn.data.rowDigests);
        allAgg.push(...bn.data.aggregateSummary);
        allSamples.push(...bn.data.sampleCandidates);
        pagesFetched += bn.data.pagesFetchedInBatch;
        nextPage = bn.data.nextPage;
      }
      const fin = finalizePreviewWithPlatform(
        {
          endpoint: 'assignments',
          sourceTotal: b1.data.sourceTotal,
          pagesFetched,
          rowDigests: allDigests,
          aggregateSummary: allAgg,
          sampleCandidates: allSamples,
        },
        env.platform,
      );
      if (!fin.ok || fin.data.status !== 'READY') throw new Error('expected READY');
      return fin.data;
    };

    // --- Run 1: Initial 5 INSERTs through multi-batch hidden _Stage_assignments_<runId> ---
    const preview1 = runBatchedPreview();
    expect(preview1.counts).toEqual({ insert: 5, update: 0, unchanged: 0, review: 0 });
    expect(preview1.legacySnapshotPresent).toBe(true);

    const stage1 = stageLargeDatasetBatchWithPlatform(
      {
        endpoint: 'assignments',
        token: VALID_BEARER,
        expectedFingerprint: preview1.fingerprint,
        startPage: 1,
        batchPages: 2,
        pageSize: 2,
      },
      env.platform,
    );
    expect(stage1.ok).toBe(true);
    if (!stage1.ok || stage1.data.status !== 'BATCH_STAGED') {
      throw new Error(`Expected BATCH_STAGED on stage 1, got: ${JSON.stringify(stage1)}`);
    }
    expect(stage1.data.stagedRowCount).toBe(4);
    expect(stage1.data.hasMore).toBe(true);
    expect(stage1.data.nextPage).toBe(3);

    const reportWb = env.workbookStates.get(VALID_REPORT_SHEET_ID)!;
    const stageTabName = stage1.data.stagingTabName;
    expect(stageTabName).toMatch(/^_Stage_assignments_/);
    const stageSheet = reportWb.sheets.get(stageTabName);
    expect(stageSheet).toBeDefined();
    expect(stageSheet!.hidden).toBe(true);
    // Live Assignments tab NOT touched during staging
    expect(reportWb.sheets.has('Assignments')).toBe(false);
    // Staging tab persists Full-Field Operator Mode columns (including raw id & citizenId)
    expect(JSON.stringify(stageSheet!.rows)).toContain('SYNTHETIC-UUID-0001');
    expect(JSON.stringify(stageSheet!.rows)).toContain('1540600000001');

    const stage2 = stageLargeDatasetBatchWithPlatform(
      {
        endpoint: 'assignments',
        token: VALID_BEARER,
        expectedFingerprint: preview1.fingerprint,
        runId: stage1.data.runId,
        startPage: 3,
        batchPages: 2,
        pageSize: 2,
      },
      env.platform,
    );
    expect(stage2.ok).toBe(true);
    if (!stage2.ok || stage2.data.status !== 'BATCH_STAGED') {
      throw new Error(`Expected BATCH_STAGED on stage 2, got: ${JSON.stringify(stage2)}`);
    }
    expect(stage2.data.stagedRowCount).toBe(5);
    expect(stage2.data.hasMore).toBe(false);
    expect(stage2.data.nextPage).toBeNull();

    const commit1 = finalizeLargeDatasetCommitWithPlatform(
      {
        endpoint: 'assignments',
        expectedFingerprint: preview1.fingerprint,
        runId: stage1.data.runId,
      },
      env.platform,
    );
    expect(commit1.ok).toBe(true);
    if (!commit1.ok || commit1.data.status !== 'COMMITTED_VERIFIED') {
      throw new Error(`Expected COMMITTED_VERIFIED, got: ${JSON.stringify(commit1)}`);
    }
    expect(commit1.data.destinationTab).toBe('Assignments');
    expect(commit1.data.counts).toEqual({ insert: 5, update: 0, unchanged: 0, review: 0 });
    expect(commit1.data.readback.verified).toBe(true);
    expect(commit1.data.readback.stagingTabCleaned).toBe(true);
    expect(commit1.data.readback.unrelatedTabsPreserved).toBe(true);
    expect(commit1.data.syncLogStatus).toBe('COMMITTED_VERIFIED');

    // Ephemeral _Stage_* tab MUST be deleted after readback passes
    expect(reportWb.sheets.has(stageTabName)).toBe(false);

    // Legacy RAssign_* tab, _ThaiPHCReportCurrent, and ชีต1 preserved untouched
    expect(reportWb.sheets.has('RAssign_f010_20261119')).toBe(true);
    expect(reportWb.sheets.has('_ThaiPHCReportCurrent')).toBe(true);
    expect(reportWb.sheets.has('ชีต1')).toBe(true);

    // Verify Assignments tab has exact 33 columns (25 full-field source + 8 metadata), plain-text formats, native boolean isActive, null vs "" preserved
    const assignSheet = reportWb.sheets.get('Assignments')!;
    expect(assignSheet.rows).toHaveLength(6); // 1 header + 5 rows
    expect(assignSheet.rows[0]).toEqual([
      'id',
      'osmCode',
      'citizenId',
      'prefixNameTh',
      'prefixNameEn',
      'firstName',
      'lastName',
      'fullName',
      'provinceCode',
      'provinceNameTh',
      'districtCode',
      'districtNameTh',
      'subdistrictCode',
      'subdistrictNameTh',
      'villageNo',
      'villageName',
      'isActive',
      'status',
      'osmStatus',
      'osmShowbbody',
      'approvalStatus',
      'volunteerStatus',
      'createdAt',
      'requestDate',
      'updatedAt',
      '_schema_version',
      '_sync_run_id',
      '_source_key',
      '_fetched_at_utc',
      '_quality_status',
      '_field_presence_json',
      '_last_seen_run_id',
      '_row_digest',
    ]);
    // Row 1 (index 1): full-field identity cols + villageName=null -> cell '', presence.villageName='NULL'; osmStatus='' -> presence.osmStatus='VALUE'; isActive=true (boolean)
    expect(assignSheet.rows[1][0]).toBe('SYNTHETIC-UUID-0001');
    expect(assignSheet.rows[1][2]).toBe('1540600000001');
    expect(assignSheet.rows[1][7]).toBe('นางสาว PRIVATE_FIRST_0001 PRIVATE_LAST_0001');
    expect(assignSheet.rows[1][15]).toBe('');
    expect(assignSheet.rows[1][16]).toBe(true);
    expect(assignSheet.rows[1][27]).toBe('SYNTHETIC-UUID-0001');
    const presenceRow1 = JSON.parse(String(assignSheet.rows[1][30]));
    expect(presenceRow1.villageName).toBe('NULL');
    expect(presenceRow1.osmStatus).toBe('VALUE');
    expect(presenceRow1.citizenId).toBe('VALUE');
    // Row 2 (index 2): villageName='หมู่บ้านตัวอย่าง_0002' preserved
    expect(assignSheet.rows[2][15]).toBe('หมู่บ้านตัวอย่าง_0002');
    expect(assignSheet.rows[2][27]).toBe('SYNTHETIC-UUID-0002');
    // Plain-text '@' format on text & metadata columns (including citizenId C3), NOT on column 17 (isActive boolean)
    expect(assignSheet.numberFormats.get('C1')).toBe('@');
    expect(assignSheet.numberFormats.get('C3')).toBe('@');
    expect(assignSheet.numberFormats.get('C17')).toBeUndefined();
    expect(assignSheet.numberFormats.get('C28')).toBe('@');

    // --- Run 2: Repeatable Keyed Upsert (1 UPDATE, 1 INSERT, 3 UNCHANGED, 1 non-destructive MISSING_IN_SOURCE) ---
    sourceRows = [
      makeAssignmentRow(1, { villageName: 'หนุนเหนือ (อัปเดต)', isActive: false }), // UPDATE
      makeAssignmentRow(2), // UNCHANGED
      makeAssignmentRow(3), // UNCHANGED
      makeAssignmentRow(4), // UNCHANGED
      // Row 5 omitted -> MISSING_IN_SOURCE (REVIEW, never auto-deleted!)
      makeAssignmentRow(6), // INSERT
    ];

    const preview2 = runBatchedPreview();
    expect(preview2.legacySnapshotPresent).toBe(false); // Fixed Assignments tab now exists
    expect(preview2.counts).toEqual({ insert: 1, update: 1, unchanged: 3, review: 1 });
    expect(preview2.reviewBreakdown).toEqual({ MISSING_IN_SOURCE: 1 });

    const s2b1 = stageLargeDatasetBatchWithPlatform(
      {
        endpoint: 'assignments',
        token: VALID_BEARER,
        expectedFingerprint: preview2.fingerprint,
        startPage: 1,
        batchPages: 5,
        pageSize: 5,
      },
      env.platform,
    );
    if (!s2b1.ok || s2b1.data.status !== 'BATCH_STAGED') throw new Error('expected BATCH_STAGED');
    const commit2 = finalizeLargeDatasetCommitWithPlatform(
      {
        endpoint: 'assignments',
        expectedFingerprint: preview2.fingerprint,
        runId: s2b1.data.runId,
      },
      env.platform,
    );
    expect(commit2.ok && commit2.data.status === 'COMMITTED_VERIFIED').toBe(true);
    if (commit2.ok && commit2.data.status === 'COMMITTED_VERIFIED') {
      expect(commit2.data.counts).toEqual({ insert: 1, update: 1, unchanged: 3, review: 1 });
      expect(commit2.data.readback.expectedRowCount).toBe(6); // 5 + 1 insert (missing row 5 kept!)
      expect(commit2.data.readback.actualRowCount).toBe(6);
      expect(commit2.data.readback.stagingTabCleaned).toBe(true);
    }
    // Updated row 1 in-place, row 5 preserved, row 6 appended
    expect(assignSheet.rows).toHaveLength(7); // 1 header + 6 rows
    expect(assignSheet.rows[1][15]).toBe('หนุนเหนือ (อัปเดต)');
    expect(assignSheet.rows[1][16]).toBe(false);
    expect(reportWb.sheets.has(s2b1.data.stagingTabName)).toBe(false);
  });

  it('halts with PREVIEW_STALE_RECONFIRM_REQUIRED before live tab mutation on source or destination drift, and retains hidden _Stage_* tab on READBACK_MISMATCH and UNKNOWN_OUTCOME_STOP', () => {
    let sourceRows = [1, 2, 3].map((i) => makeAssignmentRow(i));

    const env = createFakeAssignmentsEnv({
      fetchHandler: (url) => {
        const parsed = new URL(url);
        const page = Number(parsed.searchParams.get('page'));
        const pageSize = Number(parsed.searchParams.get('pageSize'));
        return jsonResponse(makeAssignmentPage(sourceRows, page, pageSize));
      },
    });

    const b1 = previewDatasetBatchWithPlatform(
      { endpoint: 'assignments', token: VALID_BEARER, startPage: 1, batchPages: 5, pageSize: 10 },
      env.platform,
    );
    if (!b1.ok || b1.data.status !== 'BATCH_OK') throw new Error('expected BATCH_OK');
    const prev = finalizePreviewWithPlatform(
      {
        endpoint: 'assignments',
        sourceTotal: 3,
        pagesFetched: 1,
        rowDigests: b1.data.rowDigests,
        aggregateSummary: b1.data.aggregateSummary,
        sampleCandidates: b1.data.sampleCandidates,
      },
      env.platform,
    );
    if (!prev.ok || prev.data.status !== 'READY') throw new Error('expected READY');

    // 1. Source row content changes (same total=3) between Preview and Commit finalize -> PREVIEW_STALE_RECONFIRM_REQUIRED (SOURCE_CHANGED), zero live tab writes, _Stage_* retained hidden
    sourceRows = [
      makeAssignmentRow(1, { volunteerStatus: 'changed_after_preview' }),
      makeAssignmentRow(2),
      makeAssignmentRow(3),
    ];
    const stagedDrifted = stageLargeDatasetBatchWithPlatform(
      {
        endpoint: 'assignments',
        token: VALID_BEARER,
        expectedFingerprint: prev.data.fingerprint,
        startPage: 1,
        batchPages: 5,
        pageSize: 10,
      },
      env.platform,
    );
    expect(stagedDrifted.ok && stagedDrifted.data.status === 'BATCH_STAGED').toBe(true);
    if (!stagedDrifted.ok || stagedDrifted.data.status !== 'BATCH_STAGED')
      throw new Error('staged');

    const staleFinalize = finalizeLargeDatasetCommitWithPlatform(
      {
        endpoint: 'assignments',
        expectedFingerprint: prev.data.fingerprint,
        runId: stagedDrifted.data.runId,
      },
      env.platform,
    );
    expect(staleFinalize.ok).toBe(true);
    if (!staleFinalize.ok || staleFinalize.data.status !== 'PREVIEW_STALE_RECONFIRM_REQUIRED') {
      throw new Error(
        `Expected PREVIEW_STALE_RECONFIRM_REQUIRED, got: ${JSON.stringify(staleFinalize)}`,
      );
    }
    expect(staleFinalize.data.driftReason).toBe('SOURCE_CHANGED');
    const reportWb = env.workbookStates.get(VALID_REPORT_SHEET_ID)!;
    // Live Assignments tab was NEVER created or mutated; _ThaiPHCSyncLog was NOT polluted with STARTED; _Stage_* stays hidden
    expect(reportWb.sheets.has('Assignments')).toBe(false);
    expect(reportWb.sheets.has('_ThaiPHCSyncLog')).toBe(false);
    expect(reportWb.sheets.get(stagedDrifted.data.stagingTabName)?.hidden).toBe(true);

    // 2. UNKNOWN_OUTCOME_STOP when live Assignments write throws -> _ThaiPHCSyncLog stays STARTED and hidden _Stage_* is RETAINED
    const failWriteRows = [1, 2].map((i) => makeAssignmentRow(i));
    const failEnv = createFakeAssignmentsEnv({
      failWriteOnTab: 'Assignments',
      fetchHandler: () => jsonResponse(makeAssignmentPage(failWriteRows, 1, 10)),
    });
    const fb = previewDatasetBatchWithPlatform(
      { endpoint: 'assignments', token: VALID_BEARER, startPage: 1, pageSize: 10 },
      failEnv.platform,
    );
    if (!fb.ok || fb.data.status !== 'BATCH_OK') throw new Error('expected BATCH_OK');
    const fp = finalizePreviewWithPlatform(
      {
        endpoint: 'assignments',
        sourceTotal: 2,
        pagesFetched: 1,
        rowDigests: fb.data.rowDigests,
        aggregateSummary: fb.data.aggregateSummary,
        sampleCandidates: fb.data.sampleCandidates,
      },
      failEnv.platform,
    );
    if (!fp.ok || fp.data.status !== 'READY') throw new Error('expected READY');
    const fStage = stageLargeDatasetBatchWithPlatform(
      {
        endpoint: 'assignments',
        token: VALID_BEARER,
        expectedFingerprint: fp.data.fingerprint,
        startPage: 1,
        pageSize: 10,
      },
      failEnv.platform,
    );
    if (!fStage.ok || fStage.data.status !== 'BATCH_STAGED') throw new Error('expected staged');

    const unknownStop = finalizeLargeDatasetCommitWithPlatform(
      {
        endpoint: 'assignments',
        expectedFingerprint: fp.data.fingerprint,
        runId: fStage.data.runId,
      },
      failEnv.platform,
    );
    expect(unknownStop.ok).toBe(true);
    if (!unknownStop.ok || unknownStop.data.status !== 'UNKNOWN_OUTCOME_STOP') {
      throw new Error(`Expected UNKNOWN_OUTCOME_STOP, got: ${JSON.stringify(unknownStop)}`);
    }
    expect(unknownStop.data.syncLogStatus).toBe('STARTED');
    expect(unknownStop.data.stagingTabRetained).toBe(fStage.data.stagingTabName);
    const failWb = failEnv.workbookStates.get(VALID_REPORT_SHEET_ID)!;
    // Hidden staging tab MUST remain present for operator inspection
    expect(failWb.sheets.has(fStage.data.stagingTabName)).toBe(true);
    expect(failWb.sheets.get(fStage.data.stagingTabName)?.hidden).toBe(true);

    // 3. UNRESOLVED_PREVIOUS_RUN recovery: subsequent Preview surfaces unresolvedPreviousRun; Commit blocks until acknowledged
    const recoveryPreview = finalizePreviewWithPlatform(
      {
        endpoint: 'assignments',
        sourceTotal: 2,
        pagesFetched: 1,
        rowDigests: fb.data.rowDigests,
        aggregateSummary: fb.data.aggregateSummary,
        sampleCandidates: fb.data.sampleCandidates,
      },
      failEnv.platform,
    );
    expect(recoveryPreview.ok && recoveryPreview.data.status === 'READY').toBe(true);
    if (recoveryPreview.ok && recoveryPreview.data.status === 'READY') {
      expect(recoveryPreview.data.unresolvedPreviousRun?.runId).toBe(fStage.data.runId);
      const unackStage = stageLargeDatasetBatchWithPlatform(
        {
          endpoint: 'assignments',
          token: VALID_BEARER,
          expectedFingerprint: recoveryPreview.data.fingerprint,
          startPage: 1,
          pageSize: 10,
        },
        failEnv.platform,
      );
      expect(unackStage.ok && unackStage.data.status === 'FAILED_STOP').toBe(true);
      if (unackStage.ok && unackStage.data.status === 'FAILED_STOP') {
        expect(unackStage.data.stopCode).toBe('UNRESOLVED_PREVIOUS_RUN');
      }
    }

    // 4. READBACK_MISMATCH retains hidden _Stage_* tab and marks _ThaiPHCSyncLog FAILED_STOP
    const corruptReadbackEnv = createFakeAssignmentsEnv({
      fetchHandler: () => jsonResponse(makeAssignmentPage(failWriteRows, 1, 10)),
    });
    const cb = previewDatasetBatchWithPlatform(
      { endpoint: 'assignments', token: VALID_BEARER, startPage: 1, pageSize: 10 },
      corruptReadbackEnv.platform,
    );
    if (!cb.ok || cb.data.status !== 'BATCH_OK') throw new Error('expected BATCH_OK');
    const cp = finalizePreviewWithPlatform(
      {
        endpoint: 'assignments',
        sourceTotal: 2,
        pagesFetched: 1,
        rowDigests: cb.data.rowDigests,
        aggregateSummary: cb.data.aggregateSummary,
        sampleCandidates: cb.data.sampleCandidates,
      },
      corruptReadbackEnv.platform,
    );
    if (!cp.ok || cp.data.status !== 'READY') throw new Error('expected READY');
    const cStage = stageLargeDatasetBatchWithPlatform(
      {
        endpoint: 'assignments',
        token: VALID_BEARER,
        expectedFingerprint: cp.data.fingerprint,
        startPage: 1,
        pageSize: 10,
      },
      corruptReadbackEnv.platform,
    );
    if (!cStage.ok || cStage.data.status !== 'BATCH_STAGED') throw new Error('expected staged');

    // Simulate silent data corruption right after flushSpreadsheet inside finalize commit
    const origFlush = corruptReadbackEnv.platform.flushSpreadsheet;
    let flushIdx = 0;
    corruptReadbackEnv.platform.flushSpreadsheet = () => {
      flushIdx += 1;
      origFlush();
      // 2nd flush in finalize is right after Assignments write & right before Destination Readback
      if (flushIdx === 2) {
        const sheet = corruptReadbackEnv.workbookStates
          .get(VALID_REPORT_SHEET_ID)!
          .sheets.get('Assignments');
        if (sheet && sheet.rows[1]) {
          sheet.rows[1][24] = 'corrupted_digest';
        }
      }
    };

    const rbStop = finalizeLargeDatasetCommitWithPlatform(
      {
        endpoint: 'assignments',
        expectedFingerprint: cp.data.fingerprint,
        runId: cStage.data.runId,
      },
      corruptReadbackEnv.platform,
    );
    expect(rbStop.ok).toBe(true);
    if (!rbStop.ok || rbStop.data.status !== 'FAILED_STOP') {
      throw new Error(`Expected FAILED_STOP READBACK_MISMATCH, got: ${JSON.stringify(rbStop)}`);
    }
    expect(rbStop.data.stopCode).toBe('READBACK_MISMATCH');
    expect(rbStop.data.syncLogStatus).toBe('FAILED_STOP');
    expect(rbStop.data.stagingTabRetained).toBe(cStage.data.stagingTabName);
    const corruptWb = corruptReadbackEnv.workbookStates.get(VALID_REPORT_SHEET_ID)!;
    expect(corruptWb.sheets.has(cStage.data.stagingTabName)).toBe(true);
    expect(corruptWb.sheets.get(cStage.data.stagingTabName)?.hidden).toBe(true);
  });

  it('enforces Write Guards, PRODUCTION typed confirmation phrase, LockService busy rejection, and UNRESOLVED_PREVIOUS_RUN acknowledgment on assignments Commit', () => {
    const rows = [makeAssignmentRow(1)];
    const makeProdEnv = (
      overrides: Record<string, string | undefined> = {},
      lockAvailable = true,
    ) =>
      createFakeAssignmentsEnv({
        properties: {
          THAIPHC_ENV: 'PRODUCTION',
          THAIPHC_WRITE_ENABLED: 'true',
          THAIPHC_PERSON_DATA_WRITE_ENABLED: 'true',
          ...overrides,
        },
        workbooks: {
          [VALID_REF_SHEET_ID]: {
            name: 'ThaiPHC Reference Prod',
            initialSheets: [{ name: 'ชีต1', rows: [['keep']] }],
          },
          [VALID_REPORT_SHEET_ID]: {
            name: 'ThaiPHC Reports Prod',
            initialSheets: [
              { name: 'ชีต1', rows: [['keep']] },
              {
                name: '_ThaiPHCSyncLog',
                rows: [
                  [
                    'run_id',
                    'timestamp_utc',
                    'env',
                    'endpoint',
                    'sync_mode',
                    'status',
                    'preview_digest',
                    'inserted',
                    'updated',
                    'unchanged',
                    'review',
                    'readback_verified',
                  ],
                  [
                    'run_prev_stuck_01',
                    '2026-11-21T02:00:00.000Z',
                    'PRODUCTION',
                    'assignments',
                    'KEYED_UPSERT',
                    'STARTED',
                    'a'.repeat(64),
                    0,
                    0,
                    0,
                    0,
                    false,
                  ],
                ],
              },
            ],
          },
        },
        lockAvailable,
        fetchHandler: () => jsonResponse(makeAssignmentPage(rows, 1, 10)),
      });

    const prodEnv = makeProdEnv();
    const pb = previewDatasetBatchWithPlatform(
      { endpoint: 'assignments', token: VALID_BEARER, startPage: 1, pageSize: 10 },
      prodEnv.platform,
    );
    if (!pb.ok || pb.data.status !== 'BATCH_OK') throw new Error('expected BATCH_OK');
    const pf = finalizePreviewWithPlatform(
      {
        endpoint: 'assignments',
        sourceTotal: 1,
        pagesFetched: 1,
        rowDigests: pb.data.rowDigests,
        aggregateSummary: pb.data.aggregateSummary,
        sampleCandidates: pb.data.sampleCandidates,
      },
      prodEnv.platform,
    );
    if (!pf.ok || pf.data.status !== 'READY') throw new Error('expected READY');
    expect(pf.data.unresolvedPreviousRun?.runId).toBe('run_prev_stuck_01');

    // 1. Missing PRODUCTION typed confirmation phrase fails closed
    const badPhrase = stageLargeDatasetBatchWithPlatform(
      {
        endpoint: 'assignments',
        token: VALID_BEARER,
        expectedFingerprint: pf.data.fingerprint,
        confirmationPhrase: 'PRODUCTION 5406 volunteer-gender',
        acknowledgeUnresolvedRunId: 'run_prev_stuck_01',
        startPage: 1,
        pageSize: 10,
      },
      prodEnv.platform,
    );
    expect(badPhrase.ok && badPhrase.data.status === 'FAILED_STOP').toBe(true);
    if (badPhrase.ok && badPhrase.data.status === 'FAILED_STOP') {
      expect(badPhrase.data.stopCode).toBe('PRODUCTION_CONFIRMATION_REQUIRED');
    }

    // 2. LockService busy rejects cleanly
    const busyEnv = makeProdEnv({}, false);
    const busyRes = stageLargeDatasetBatchWithPlatform(
      {
        endpoint: 'assignments',
        token: VALID_BEARER,
        expectedFingerprint: pf.data.fingerprint,
        confirmationPhrase: 'PRODUCTION 5406 assignments',
        acknowledgeUnresolvedRunId: 'run_prev_stuck_01',
        startPage: 1,
        pageSize: 10,
      },
      busyEnv.platform,
    );
    expect(busyRes.ok && busyRes.data.status === 'FAILED_STOP').toBe(true);
    if (busyRes.ok && busyRes.data.status === 'FAILED_STOP') {
      expect(busyRes.data.stopCode).toBe('LOCK_BUSY');
    }

    // 3. Exact phrase + acknowledged unresolved run succeeds cleanly end-to-end
    const okStage = stageLargeDatasetBatchWithPlatform(
      {
        endpoint: 'assignments',
        token: VALID_BEARER,
        expectedFingerprint: pf.data.fingerprint,
        confirmationPhrase: 'PRODUCTION 5406 assignments',
        acknowledgeUnresolvedRunId: 'run_prev_stuck_01',
        startPage: 1,
        pageSize: 10,
      },
      prodEnv.platform,
    );
    expect(okStage.ok && okStage.data.status === 'BATCH_STAGED').toBe(true);
    if (!okStage.ok || okStage.data.status !== 'BATCH_STAGED') throw new Error('expected staged');

    const okCommit = finalizeLargeDatasetCommitWithPlatform(
      {
        endpoint: 'assignments',
        expectedFingerprint: pf.data.fingerprint,
        runId: okStage.data.runId,
        confirmationPhrase: 'PRODUCTION 5406 assignments',
        acknowledgeUnresolvedRunId: 'run_prev_stuck_01',
      },
      prodEnv.platform,
    );
    expect(okCommit.ok && okCommit.data.status === 'COMMITTED_VERIFIED').toBe(true);
    if (okCommit.ok && okCommit.data.status === 'COMMITTED_VERIFIED') {
      expect(okCommit.data.readback.verified).toBe(true);
      expect(okCommit.data.readback.stagingTabCleaned).toBe(true);
    }

    // 4. Write guard OFF blocks commit fail-closed
    const guardOffEnv = makeProdEnv({ THAIPHC_PERSON_DATA_WRITE_ENABLED: 'false' });
    const guardRes = stageLargeDatasetBatchWithPlatform(
      {
        endpoint: 'assignments',
        token: VALID_BEARER,
        expectedFingerprint: pf.data.fingerprint,
        confirmationPhrase: 'PRODUCTION 5406 assignments',
        acknowledgeUnresolvedRunId: 'run_prev_stuck_01',
        startPage: 1,
        pageSize: 10,
      },
      guardOffEnv.platform,
    );
    expect(guardRes.ok && guardRes.data.status === 'FAILED_STOP').toBe(true);
    if (guardRes.ok && guardRes.data.status === 'FAILED_STOP') {
      expect(guardRes.data.stopCode).toBe('PERSON_DATA_WRITE_DISABLED');
    }
  });

  it('catches DESTINATION_CHANGED before staging and at finalize, rejects STAGING_DIGEST_MISMATCH and disabled THAIPHC_FULL_PII_WRITE_ENABLED at finalize, and prioritizes REVIEW/UPDATE samples ahead of UNCHANGED rows', () => {
    // 1. Seed 56 committed rows so we can verify both destination-drift and 50-row sample prioritization
    let sourceRows = Array.from({ length: 56 }, (_, idx) => makeAssignmentRow(idx + 1));
    let fullPiiWriteValue: string | undefined = 'true';

    const env = createFakeAssignmentsEnv({
      fetchHandler: (url) => {
        const parsed = new URL(url);
        const page = Number(parsed.searchParams.get('page'));
        const pageSize = Number(parsed.searchParams.get('pageSize'));
        return jsonResponse(makeAssignmentPage(sourceRows, page, pageSize));
      },
    });
    const origGetProperty = env.platform.getProperty;
    env.platform.getProperty = (key: string) =>
      key === 'THAIPHC_FULL_PII_WRITE_ENABLED' ? (fullPiiWriteValue ?? null) : origGetProperty(key);

    const previewAll = () => {
      const b1 = previewDatasetBatchWithPlatform(
        { endpoint: 'assignments', token: VALID_BEARER, startPage: 1, batchPages: 5, pageSize: 60 },
        env.platform,
      );
      if (!b1.ok || b1.data.status !== 'BATCH_OK') throw new Error('expected BATCH_OK');
      const fin = finalizePreviewWithPlatform(
        {
          endpoint: 'assignments',
          sourceTotal: b1.data.sourceTotal,
          pagesFetched: b1.data.pagesFetchedInBatch,
          rowDigests: b1.data.rowDigests,
          aggregateSummary: b1.data.aggregateSummary,
          sampleCandidates: [
            ...b1.data.sampleCandidates,
            // Include row 55 candidate explicitly (simulating a multi-batch later-batch update)
            {
              sourceKey: b1.data.rowDigests[54].key,
              rowDigest: b1.data.rowDigests[54].rowDigest,
              scopeLabel: '54 / 5406 · 540601 บ้านหนุน · หมู่ 7',
              minimizedAttributes: [{ field: 'status', value: 'อัปเดต' }],
              reviewReasons: [],
            },
          ],
        },
        env.platform,
      );
      if (!fin.ok || fin.data.status !== 'READY' || fin.data.previewMode !== 'EXTENDED_MINIMIZED') {
        throw new Error('expected READY EXTENDED_MINIMIZED');
      }
      return fin.data;
    };

    // Initial commit of 56 rows
    const pInit = previewAll();
    const sInit = stageLargeDatasetBatchWithPlatform(
      {
        endpoint: 'assignments',
        token: VALID_BEARER,
        expectedFingerprint: pInit.fingerprint,
        startPage: 1,
        batchPages: 5,
        pageSize: 60,
      },
      env.platform,
    );
    if (!sInit.ok || sInit.data.status !== 'BATCH_STAGED') throw new Error('expected staged');
    const cInit = finalizeLargeDatasetCommitWithPlatform(
      {
        endpoint: 'assignments',
        expectedFingerprint: pInit.fingerprint,
        runId: sInit.data.runId,
      },
      env.platform,
    );
    expect(cInit.ok && cInit.data.status === 'COMMITTED_VERIFIED').toBe(true);

    // 2. Preview prioritization: 54 leading UNCHANGED + row 55 UPDATE + row 56 MISSING_IN_SOURCE (REVIEW)
    sourceRows = [
      ...Array.from({ length: 54 }, (_, idx) => makeAssignmentRow(idx + 1)),
      makeAssignmentRow(55, { status: 'อัปเดต' }),
    ];
    const pDiff = previewAll();
    expect(pDiff.counts).toEqual({ insert: 0, update: 1, unchanged: 54, review: 1 });
    expect(pDiff.sampleRows.some((r) => r.diffKind === 'REVIEW')).toBe(true);
    expect(pDiff.sampleRows.some((r) => r.diffKind === 'UPDATE')).toBe(true);

    const reportWb = env.workbookStates.get(VALID_REPORT_SHEET_ID)!;
    const assignSheet = reportWb.sheets.get('Assignments')!;

    // 3. Stage clean batch, then test FULL_PII_WRITE_DISABLED at finalize -> FAILED_STOP before live write
    const sNext = stageLargeDatasetBatchWithPlatform(
      {
        endpoint: 'assignments',
        token: VALID_BEARER,
        expectedFingerprint: pDiff.fingerprint,
        startPage: 1,
        batchPages: 5,
        pageSize: 60,
      },
      env.platform,
    );
    if (!sNext.ok || sNext.data.status !== 'BATCH_STAGED') throw new Error('expected staged');

    fullPiiWriteValue = 'false';
    const noFullPiiFin = finalizeLargeDatasetCommitWithPlatform(
      {
        endpoint: 'assignments',
        expectedFingerprint: pDiff.fingerprint,
        runId: sNext.data.runId,
      },
      env.platform,
    );
    expect(noFullPiiFin.ok && noFullPiiFin.data.status === 'FAILED_STOP').toBe(true);
    if (noFullPiiFin.ok && noFullPiiFin.data.status === 'FAILED_STOP') {
      expect(noFullPiiFin.data.stopCode).toBe('FULL_PII_WRITE_DISABLED');
    }
    expect(reportWb.sheets.has(sNext.data.stagingTabName)).toBe(true);
    fullPiiWriteValue = 'true';

    // 4. Tamper a cell in hidden _Stage_* tab -> STAGING_DIGEST_MISMATCH before live mutation, _Stage_* retained
    const stageSheet = reportWb.sheets.get(sNext.data.stagingTabName)!;
    const originalStagedVal = stageSheet.rows[2][18];
    stageSheet.rows[2][18] = 'TAMPERED_STATUS';
    const tamperedFin = finalizeLargeDatasetCommitWithPlatform(
      {
        endpoint: 'assignments',
        expectedFingerprint: pDiff.fingerprint,
        runId: sNext.data.runId,
      },
      env.platform,
    );
    expect(tamperedFin.ok && tamperedFin.data.status === 'FAILED_STOP').toBe(true);
    if (tamperedFin.ok && tamperedFin.data.status === 'FAILED_STOP') {
      expect(tamperedFin.data.stopCode).toBe('STAGING_DIGEST_MISMATCH');
      expect(tamperedFin.data.stagingTabRetained).toBe(sNext.data.stagingTabName);
    }
    expect(reportWb.sheets.has(sNext.data.stagingTabName)).toBe(true);
    stageSheet.rows[2][18] = originalStagedVal;

    // 5. External out-of-band edit to live Assignments tab between staging and finalize -> PREVIEW_STALE_RECONFIRM_REQUIRED (DESTINATION_CHANGED)
    assignSheet.rows[1][17] = 'EDITED_EXTERNALLY';
    const destDriftFin = finalizeLargeDatasetCommitWithPlatform(
      {
        endpoint: 'assignments',
        expectedFingerprint: pDiff.fingerprint,
        runId: sNext.data.runId,
      },
      env.platform,
    );
    expect(destDriftFin.ok && destDriftFin.data.status === 'PREVIEW_STALE_RECONFIRM_REQUIRED').toBe(
      true,
    );
    if (destDriftFin.ok && destDriftFin.data.status === 'PREVIEW_STALE_RECONFIRM_REQUIRED') {
      expect(destDriftFin.data.driftReason).toBe('DESTINATION_CHANGED');
    }
    // Live row 55 was NOT mutated
    expect(assignSheet.rows[55][17]).toBe('ใช้งาน');

    // 6. DESTINATION_CHANGED detected immediately on stage batch 1 -> stops BEFORE creating any new _Stage_* tab
    const sheetCountBefore = reportWb.sheets.size;
    const destDriftStage1 = stageLargeDatasetBatchWithPlatform(
      {
        endpoint: 'assignments',
        token: VALID_BEARER,
        expectedFingerprint: pDiff.fingerprint,
        startPage: 1,
        batchPages: 5,
        pageSize: 60,
      },
      env.platform,
    );
    expect(
      destDriftStage1.ok && destDriftStage1.data.status === 'PREVIEW_STALE_RECONFIRM_REQUIRED',
    ).toBe(true);
    if (destDriftStage1.ok && destDriftStage1.data.status === 'PREVIEW_STALE_RECONFIRM_REQUIRED') {
      expect(destDriftStage1.data.driftReason).toBe('DESTINATION_CHANGED');
    }
    expect(reportWb.sheets.size).toBe(sheetCountBefore);
  });
});
