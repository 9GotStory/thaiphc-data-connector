import { createHash, createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

const backendDir = fileURLToPath(new URL('..', import.meta.url));
const manifestPath = resolve(backendDir, 'appsscript.json');
const distCodePath = resolve(backendDir, 'dist/Code.js');
const distManifestPath = resolve(backendDir, 'dist/appsscript.json');
const distHtmlPath = resolve(backendDir, 'dist/index.html');
const buildScriptPath = resolve(backendDir, 'build.mjs');

const VALID_SHEET_ID = '1SMOKEdefGHIjklMNOpqrSTUvwxYZ01234567';
const VALID_HMAC_KEY = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';

describe('GAS Backend Bundle & Manifest Smoke Verification (node:vm)', () => {
  it('declares minimal OAuth scopes, Asia/Bangkok, V8, NONE exception logging, and MYSELF Web App access', () => {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    expect(manifest.timeZone).toBe('Asia/Bangkok');
    expect(manifest.runtimeVersion).toBe('V8');
    expect(manifest.exceptionLogging).toBe('NONE');
    expect(manifest.oauthScopes).toEqual([
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/script.storage',
      'https://www.googleapis.com/auth/script.external_request',
    ]);
    expect(manifest.webapp).toEqual({
      executeAs: 'USER_DEPLOYING',
      access: 'MYSELF',
    });
  });

  it('compiles to backend/dist/Code.js and executes doGet and getDashboardStatus cleanly inside node:vm', () => {
    execFileSync(process.execPath, [buildScriptPath], { cwd: backendDir, stdio: 'pipe' });

    expect(existsSync(distCodePath)).toBe(true);
    expect(existsSync(distManifestPath)).toBe(true);
    expect(existsSync(distHtmlPath)).toBe(true);

    const bundledHtml = readFileSync(distHtmlPath, 'utf8');
    expect(bundledHtml).toContain('<div id="root"></div>');
    expect(bundledHtml).toContain('<script type="module"');
    expect(bundledHtml).toMatch(/<style[\s>]/);

    const code = readFileSync(distCodePath, 'utf8');
    const propertyMutations: string[] = [];

    const properties: Record<string, string> = {
      THAIPHC_ENV: 'SANDBOX',
      THAIPHC_SPREADSHEET_ID: VALID_SHEET_ID,
      THAIPHC_SAME_WORKBOOK_APPROVAL: 'OWNER_ONLY_5406_APPROVED',
      THAIPHC_WRITE_ENABLED: 'false',
      THAIPHC_PERSON_DATA_WRITE_ENABLED: 'false',
      THAIPHC_HMAC_KEY_B64: VALID_HMAC_KEY,
    };

    const makeFakeSheet = (name: string, rows: unknown[][]) => {
      const state = {
        rows: rows.map((r) => [...r]),
        maxRows: Math.max(100, rows.length + 10),
        maxColumns: Math.max(26, ...rows.map((r) => r.length)),
        hidden: false,
      };
      return {
        getName: () => name,
        isSheetHidden: () => state.hidden,
        getLastRow: () => state.rows.length,
        getLastColumn: () => state.rows.reduce((max, r) => Math.max(max, r.length), 0),
        getMaxRows: () => state.maxRows,
        getMaxColumns: () => state.maxColumns,
        insertColumnsAfter: (_after: number, howMany: number) => {
          state.maxColumns += howMany;
        },
        insertRowsAfter: (_after: number, howMany: number) => {
          state.maxRows += howMany;
        },
        setFrozenRows: () => undefined,
        hideSheet: () => {
          state.hidden = true;
        },
        showSheet: () => {
          state.hidden = false;
        },
        getRange: (row: number, col: number, numRows: number, numCols: number) => ({
          getValues: () =>
            Array.from({ length: numRows }, (_, r) =>
              Array.from(
                { length: numCols },
                (_, c) => state.rows[row - 1 + r]?.[col - 1 + c] ?? '',
              ),
            ),
          setValues: (vals: unknown[][]) => {
            for (let r = 0; r < vals.length; r++) {
              const idx = row - 1 + r;
              while (state.rows.length <= idx) state.rows.push([]);
              for (let c = 0; c < vals[r].length; c++) {
                state.rows[idx][col - 1 + c] = vals[r][c];
              }
            }
          },
          setNumberFormat: () => undefined,
        }),
      };
    };

    const sheets = [
      makeFakeSheet('ชีต1', [['baseline-keep']]),
      makeFakeSheet('_ThaiPHCReportCurrent', [
        ['endpoint', 'run_id', 'snapshot_sheet', 'row_count', 'manifest_digest'],
        [
          'volunteer-family',
          'run_20261120_prior_vm',
          'RFamily_run_20261120_prior_vm',
          1,
          'a'.repeat(64),
        ],
      ]),
      makeFakeSheet('RFamily_run_20261120_prior_vm', [
        ['{"status":"PUBLISHED"}'],
        ['_source_key', 'provinceCode'],
        ['snapshot_run_20261120_prior_vm_00001', '54'],
      ]),
      makeFakeSheet('Subdistricts', [
        [
          'code',
          'id',
          'name_th',
          'name_en',
          'postal_code',
          'label',
          'district_code',
          'district_name_th',
          'district_name_en',
          'province_code',
          'province_name_th',
          'province_name_en',
          '_schema_version',
          '_sync_run_id',
          '_source_key',
          '_fetched_at_utc',
          '_quality_status',
          '_field_presence_json',
          '_last_seen_run_id',
          '_row_digest',
        ],
      ]),
      makeFakeSheet('_ThaiPHCSyncLog', [
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
          'run_20261121_0800',
          '2026-11-21T01:00:00.000Z',
          'SANDBOX',
          'subdistricts',
          'KEYED_UPSERT',
          'COMMITTED_VERIFIED',
          'abc',
          0,
          0,
          0,
          0,
          true,
        ],
      ]),
    ];

    const htmlCalls: Array<{
      filename: string;
      title?: string;
      metaTags: Array<[string, string]>;
      xFrameMode?: string;
    }> = [];

    const mockSubdistrictPayload = JSON.stringify({
      items: [
        {
          code: '540601',
          id: '540601',
          name_th: 'บ้านหนุน',
          name_en: 'Ban Nun',
          postal_code: '54120',
          label: 'บ้านหนุน / Ban Nun',
          district_code: '5406',
          district_name_th: 'สอง',
          district_name_en: 'Song',
          province_code: null,
          province_name_th: null,
          province_name_en: null,
        },
      ],
    });

    const mockGenderPayload = JSON.stringify({
      success: true,
      message: 'Success',
      items: [
        {
          provinceCode: '54',
          provinceName: 'แพร่',
          districtCode: '5406',
          districtName: 'สอง',
          subdistrictCode: '540601',
          subdistrictName: 'บ้านหนุน',
          villageCode: '540601001',
          villageNo: '1',
          villageName: 'หนุนเหนือ',
          total: 19,
          male: 3,
          female: 16,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 100,
    });

    const mockAssignmentsPayload = JSON.stringify({
      provinces: [
        { provinceCode: '54', provinceNameTh: 'แพร่', provinceNameEn: 'Phrae', osmCount: 1 },
      ],
      items: [
        {
          id: 'SYNTHETIC-UUID-0001',
          osmCode: '99990000000001',
          citizenId: '1540600000001',
          prefixNameTh: 'นางสาว',
          prefixNameEn: 'Miss',
          firstName: 'PRIVATE_VM_FIRST',
          lastName: 'PRIVATE_VM_LAST',
          fullName: 'นางสาว PRIVATE_VM_FIRST PRIVATE_VM_LAST',
          provinceCode: '54',
          provinceNameTh: 'แพร่',
          districtCode: '5406',
          districtNameTh: 'สอง',
          subdistrictCode: '540601',
          subdistrictNameTh: 'บ้านหนุน',
          villageNo: '1',
          villageName: null,
          isActive: true,
          status: 'ใช้งาน',
          osmStatus: '',
          osmShowbbody: '1',
          approvalStatus: 'approved',
          volunteerStatus: 'already_volunteer',
          createdAt: '2025-11-10T05:36:01.776457Z',
          requestDate: '2025-11-10T05:36:01.776457Z',
          updatedAt: '2026-10-12T13:07:33.846207Z',
        },
      ],
      pagination: { page: 1, limit: 100, total: 1, pages: 1 },
    });

    const mockResignedPayload = JSON.stringify({
      success: true,
      message: 'Success',
      items: [
        {
          id: 'SYNTHETIC-UUID-0001',
          citizenId: '1540600000001',
          firstName: 'PRIVATE_VM_RESIGN_FIRST',
          lastName: 'PRIVATE_VM_RESIGN_LAST',
          retirementDate: '2024-01-15',
          retirementReason: null,
          osmStatus: '0',
          volunteerStatus: 'already_volunteer',
          approvalStatus: 'approved',
          provinceCode: '54',
          provinceName: 'แพร่',
          districtCode: '5406',
          districtName: 'สอง',
          subdistrictCode: '540210',
          subdistrictName: 'ตำบลต้นทาง',
          villageCode: '540603006',
          villageNo: '6',
          villageName: 'บ้านตัวอย่าง',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 100,
    });

    const mockTenurePayload = JSON.stringify({
      success: true,
      message: 'Success',
      items: [
        {
          id: 'SYNTHETIC-UUID-0001',
          citizenId: '1540600000001',
          osmCode: '99990000000001',
          firstName: 'PRIVATE_VM_TENURE_FIRST',
          lastName: 'PRIVATE_VM_TENURE_LAST',
          startYear: 2569,
          tenureYears: 0,
          osmYear: null,
          approvalDate: null,
          retirementDate: null,
          retirementReason: null,
          osmStatus: '',
          provinceCode: '54',
          provinceName: 'แพร่',
          districtCode: '5406',
          districtName: 'สอง',
          subdistrictCode: '540601',
          subdistrictName: 'บ้านหนุน',
          villageCode: '540601001',
          villageNo: '1',
          villageName: 'หนุนเหนือ',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 100,
    });

    const mockFamilyPayload = JSON.stringify({
      success: true,
      message: 'Success',
      items: [
        {
          provinceCode: '54',
          provinceName: 'แพร่',
          districtCode: '5406',
          districtName: 'สอง',
          subdistrictCode: '540210',
          subdistrictName: 'ตำบลต้นทางนอกเขตย่อย',
          villageCode: '540603006',
          villageNo: '6',
          villageName: 'บ้านตัวอย่าง',
          osmCode: '99990000000099',
          citizenId: '1540600000099',
          prefixName: 'นางสาว',
          firstName: 'PRIVATE_VM_FAMILY_FIRST',
          lastName: 'PRIVATE_VM_FAMILY_LAST',
          fullName: 'นางสาว PRIVATE_VM_FAMILY_FIRST PRIVATE_VM_FAMILY_LAST',
          gender: 'female',
          address: 'PRIVATE_VM_ADDR_99/1',
          status: 'volunteer',
          statusLabel: 'อสม.',
          volunteerId: 'SYNTHETIC-VM-VOL-UUID',
          volunteerName: 'PRIVATE_VM_VOL_NAME',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 100,
    });

    const sandbox = {
      HtmlService: {
        XFrameOptionsMode: { DEFAULT: 'DEFAULT', ALLOWALL: 'ALLOWALL' },
        createHtmlOutputFromFile(filename: string) {
          const entry: {
            filename: string;
            title?: string;
            metaTags: Array<[string, string]>;
            xFrameMode?: string;
          } = { filename, metaTags: [] };
          htmlCalls.push(entry);
          const output = {
            setTitle(title: string) {
              entry.title = title;
              return output;
            },
            addMetaTag(name: string, content: string) {
              entry.metaTags.push([name, content]);
              return output;
            },
            setXFrameOptionsMode(mode: string) {
              entry.xFrameMode = mode;
              return output;
            },
          };
          return output;
        },
      },
      PropertiesService: {
        getScriptProperties: () => ({
          getProperty: (key: string) => properties[key] ?? null,
          setProperty: (key: string) => {
            propertyMutations.push(`set:${key}`);
          },
          deleteProperty: (key: string) => {
            propertyMutations.push(`delete:${key}`);
          },
        }),
      },
      SpreadsheetApp: {
        flush: () => undefined,
        openById: (id: string) => {
          if (id !== VALID_SHEET_ID) throw new Error('WRONG_ID');
          return {
            getId: () => id,
            getName: () => 'ThaiPHC VM Sandbox',
            getSheetByName: (name: string) => sheets.find((s) => s.getName() === name) ?? null,
            getSheets: () => sheets,
            insertSheet: (name: string) => {
              const s = makeFakeSheet(name, []);
              sheets.push(s);
              return s;
            },
            deleteSheet: (sheetToDelete: { getName: () => string }) => {
              const idx = sheets.findIndex((s) => s.getName() === sheetToDelete.getName());
              if (idx >= 0) sheets.splice(idx, 1);
            },
          };
        },
      },
      LockService: {
        getScriptLock: () => ({
          tryLock: () => true,
          releaseLock: () => undefined,
        }),
      },
      UrlFetchApp: {
        fetch: (url: string) => {
          const payload = url.includes('/dashboard/assignments')
            ? mockAssignmentsPayload
            : url.includes('/reports/volunteer-family')
              ? mockFamilyPayload
              : url.includes('/reports/resigned-volunteers')
                ? mockResignedPayload
                : url.includes('/reports/volunteer-tenure')
                  ? mockTenurePayload
                  : url.includes('/reports/volunteer-gender')
                    ? mockGenderPayload
                    : mockSubdistrictPayload;
          return {
            getResponseCode: () => 200,
            getAllHeaders: () => ({ 'Content-Type': 'application/json' }),
            getContent: () => Array.from(Buffer.from(payload, 'utf8')),
            getContentText: () => payload,
          };
        },
      },
      Utilities: {
        DigestAlgorithm: { SHA_256: 'SHA_256' },
        newBlob: (str: string) => ({
          getBytes: () => Array.from(Buffer.from(str, 'utf8'), (b) => (b > 127 ? b - 256 : b)),
        }),
        computeDigest: (_alg: string, bytes: number[]) =>
          Array.from(
            createHash('sha256')
              .update(Buffer.from(bytes.map((b) => ((b % 256) + 256) % 256)))
              .digest(),
            (b) => (b > 127 ? b - 256 : b),
          ),
        base64Decode: (b64: string) =>
          Array.from(Buffer.from(b64, 'base64'), (b) => (b > 127 ? b - 256 : b)),
        base64Encode: (bytes: number[]) =>
          Buffer.from(bytes.map((b) => ((b % 256) + 256) % 256)).toString('base64'),
        computeHmacSha256Signature: (valueBytes: number[], keyBytes: number[]) =>
          Array.from(
            createHmac('sha256', Buffer.from(keyBytes.map((b) => ((b % 256) + 256) % 256)))
              .update(Buffer.from(valueBytes.map((b) => ((b % 256) + 256) % 256)))
              .digest(),
            (b) => (b > 127 ? b - 256 : b),
          ),
        getUuid: () => '12345678-1234-1234-1234-1234567890ab',
      },
    };

    const context = vm.createContext(sandbox);
    vm.runInContext(code, context, { filename: 'Code.js', timeout: 2000 });

    expect(typeof context.doGet).toBe('function');
    expect(typeof context.getDashboardStatus).toBe('function');
    expect(typeof context.previewDataset).toBe('function');
    expect(typeof context.previewDatasetBatch).toBe('function');
    expect(typeof context.finalizePreview).toBe('function');
    expect(typeof context.commitSmallDataset).toBe('function');
    expect(typeof context.stageLargeDatasetBatch).toBe('function');
    expect(typeof context.finalizeLargeDatasetCommit).toBe('function');

    context.doGet();
    expect(htmlCalls).toHaveLength(1);
    expect(htmlCalls[0]).toEqual({
      filename: 'index',
      title: 'ThaiPHC Data Connector',
      metaTags: [['viewport', 'width=device-width, initial-scale=1']],
      xFrameMode: 'DEFAULT',
    });

    const result = JSON.parse(JSON.stringify(context.getDashboardStatus()));
    expect(result.ok).toBe(true);
    expect(result.data.env).toBe('SANDBOX');
    expect(result.data.guards.hmacKeyConfigured).toBe(true);
    expect(result.data.datasets).toHaveLength(8);
    expect(result.data.datasets[0]).toMatchObject({
      endpoint: 'subdistricts',
      rowCount: 0,
      lastRunId: 'run_20261121_0800',
      lastStatus: 'COMMITTED_VERIFIED',
    });

    // Smoke-verify bundled previewDataset + commitSmallDataset in node:vm
    properties.THAIPHC_WRITE_ENABLED = 'true';
    const previewRes = JSON.parse(
      JSON.stringify(
        context.previewDataset({
          endpoint: 'subdistricts',
          token: 'synthetic_vm_token_1234567890',
        }),
      ),
    );
    expect(previewRes.ok).toBe(true);
    expect(previewRes.data.status).toBe('READY');
    expect(previewRes.data.counts).toEqual({ insert: 1, update: 0, unchanged: 0, review: 0 });

    const commitRes = JSON.parse(
      JSON.stringify(
        context.commitSmallDataset({
          endpoint: 'subdistricts',
          token: 'synthetic_vm_token_1234567890',
          expectedFingerprint: previewRes.data.fingerprint,
        }),
      ),
    );
    expect(commitRes.ok).toBe(true);
    expect(commitRes.data.status).toBe('COMMITTED_VERIFIED');
    expect(commitRes.data.readback.verified).toBe(true);
    expect(commitRes.data.readback.unrelatedTabsPreserved).toBe(true);

    // Smoke-verify bundled volunteer-gender Mode B preview, person-data write guard, and Keyed Upsert commit in node:vm
    properties.THAIPHC_PERSON_DATA_WRITE_ENABLED = 'false';
    const vgPreviewBlockedGuard = JSON.parse(
      JSON.stringify(
        context.previewDataset({
          endpoint: 'volunteer-gender',
          token: 'synthetic_vm_token_1234567890',
        }),
      ),
    );
    expect(vgPreviewBlockedGuard.ok).toBe(true);
    expect(vgPreviewBlockedGuard.data.status).toBe('READY');
    expect(vgPreviewBlockedGuard.data.previewMode).toBe('EXTENDED_MINIMIZED');
    expect(vgPreviewBlockedGuard.data.writeAllowed).toBe(false);
    expect(vgPreviewBlockedGuard.data.blockedGuardReason).toBe('THAIPHC_PERSON_DATA_WRITE_ENABLED');
    expect(vgPreviewBlockedGuard.data.reviewBreakdown).toEqual({ SMALL_CELL_SUPPRESSED: 1 });

    properties.THAIPHC_PERSON_DATA_WRITE_ENABLED = 'true';
    const vgCommitRes = JSON.parse(
      JSON.stringify(
        context.commitSmallDataset({
          endpoint: 'volunteer-gender',
          token: 'synthetic_vm_token_1234567890',
          expectedFingerprint: vgPreviewBlockedGuard.data.fingerprint,
        }),
      ),
    );
    expect(vgCommitRes.ok).toBe(true);
    expect(vgCommitRes.data.status).toBe('COMMITTED_VERIFIED');
    expect(vgCommitRes.data.destinationTab).toBe('VolunteerGender');
    expect(vgCommitRes.data.readback.verified).toBe(true);

    // Smoke-verify bundled assignments Batched Preview + F010 h1_ parity + Hidden Staging Commit + cleanup in node:vm
    const assignBatch = JSON.parse(
      JSON.stringify(
        context.previewDatasetBatch({
          endpoint: 'assignments',
          token: 'synthetic_vm_token_1234567890',
          startPage: 1,
          batchPages: 10,
          pageSize: 100,
        }),
      ),
    );
    expect(assignBatch.ok).toBe(true);
    expect(assignBatch.data.status).toBe('BATCH_OK');
    expect(assignBatch.data.rowDigests[0].key).toBe(
      'h1_4f10838fd01347c17a887f30804cd7ec9096af7fca7e3a42e837654f96a31da0',
    );
    expect(JSON.stringify(assignBatch)).not.toMatch(
      /PRIVATE_VM_FIRST|1540600000001|99990000000001|SYNTHETIC-UUID-0001/,
    );

    const assignPreview = JSON.parse(
      JSON.stringify(
        context.finalizePreview({
          endpoint: 'assignments',
          sourceTotal: assignBatch.data.sourceTotal,
          pagesFetched: assignBatch.data.pagesFetchedInBatch,
          rowDigests: assignBatch.data.rowDigests,
          aggregateSummary: assignBatch.data.aggregateSummary,
          sampleCandidates: assignBatch.data.sampleCandidates,
        }),
      ),
    );
    expect(assignPreview.ok).toBe(true);
    expect(assignPreview.data.status).toBe('READY');
    expect(assignPreview.data.destinationTab).toBe('Assignments');

    const assignStage = JSON.parse(
      JSON.stringify(
        context.stageLargeDatasetBatch({
          endpoint: 'assignments',
          token: 'synthetic_vm_token_1234567890',
          expectedFingerprint: assignPreview.data.fingerprint,
          startPage: 1,
          batchPages: 10,
          pageSize: 100,
        }),
      ),
    );
    expect(assignStage.ok).toBe(true);
    expect(assignStage.data.status).toBe('BATCH_STAGED');
    const stageSheetObj = sheets.find((s) => s.getName() === assignStage.data.stagingTabName);
    expect(stageSheetObj).toBeDefined();
    expect(stageSheetObj!.isSheetHidden()).toBe(true);

    const assignCommit = JSON.parse(
      JSON.stringify(
        context.finalizeLargeDatasetCommit({
          endpoint: 'assignments',
          expectedFingerprint: assignPreview.data.fingerprint,
          runId: assignStage.data.runId,
        }),
      ),
    );
    expect(assignCommit.ok).toBe(true);
    expect(assignCommit.data.status).toBe('COMMITTED_VERIFIED');
    expect(assignCommit.data.destinationTab).toBe('Assignments');
    expect(assignCommit.data.readback.verified).toBe(true);
    expect(assignCommit.data.readback.stagingTabCleaned).toBe(true);
    expect(sheets.some((s) => s.getName() === assignStage.data.stagingTabName)).toBe(false);

    // Smoke-verify bundled resigned-volunteers (Preserve Source Locality -> LOCALITY_MISMATCH REVIEW + F010 h1_ parity + _Stage_* cleanup) in node:vm
    const resignBatch = JSON.parse(
      JSON.stringify(
        context.previewDatasetBatch({
          endpoint: 'resigned-volunteers',
          token: 'synthetic_vm_token_1234567890',
          startPage: 1,
          batchPages: 10,
          pageSize: 100,
        }),
      ),
    );
    expect(resignBatch.ok).toBe(true);
    expect(resignBatch.data.status).toBe('BATCH_OK');
    expect(resignBatch.data.rowDigests[0].key).toBe(
      'h1_94cbfd42e553f1f6601ffb2b901651695dd1ce7f0809229599e0e0ed0002125f',
    );
    expect(resignBatch.data.rowDigests[0].reviewReasons).toEqual(['LOCALITY_MISMATCH']);
    expect(JSON.stringify(resignBatch)).not.toMatch(
      /PRIVATE_VM_RESIGN_FIRST|1540600000001|SYNTHETIC-UUID-0001/,
    );

    const resignPreview = JSON.parse(
      JSON.stringify(
        context.finalizePreview({
          endpoint: 'resigned-volunteers',
          sourceTotal: resignBatch.data.sourceTotal,
          pagesFetched: resignBatch.data.pagesFetchedInBatch,
          rowDigests: resignBatch.data.rowDigests,
          aggregateSummary: resignBatch.data.aggregateSummary,
          sampleCandidates: resignBatch.data.sampleCandidates,
        }),
      ),
    );
    expect(resignPreview.ok).toBe(true);
    expect(resignPreview.data.status).toBe('READY');
    expect(resignPreview.data.reviewBreakdown).toEqual({ LOCALITY_MISMATCH: 1 });

    const resignStage = JSON.parse(
      JSON.stringify(
        context.stageLargeDatasetBatch({
          endpoint: 'resigned-volunteers',
          token: 'synthetic_vm_token_1234567890',
          expectedFingerprint: resignPreview.data.fingerprint,
          startPage: 1,
          batchPages: 10,
          pageSize: 100,
        }),
      ),
    );
    expect(resignStage.ok).toBe(true);
    expect(resignStage.data.status).toBe('BATCH_STAGED');

    const resignCommit = JSON.parse(
      JSON.stringify(
        context.finalizeLargeDatasetCommit({
          endpoint: 'resigned-volunteers',
          expectedFingerprint: resignPreview.data.fingerprint,
          runId: resignStage.data.runId,
        }),
      ),
    );
    expect(resignCommit.ok).toBe(true);
    expect(resignCommit.data.status).toBe('COMMITTED_VERIFIED');
    expect(resignCommit.data.destinationTab).toBe('ResignedVolunteers');
    expect(resignCommit.data.counts.review).toBe(1);
    expect(resignCommit.data.readback.verified).toBe(true);
    expect(resignCommit.data.readback.stagingTabCleaned).toBe(true);

    // Smoke-verify bundled volunteer-tenure (nullable integers/strings + F010 h1_ parity + _Stage_* cleanup) in node:vm
    const tenureBatch = JSON.parse(
      JSON.stringify(
        context.previewDatasetBatch({
          endpoint: 'volunteer-tenure',
          token: 'synthetic_vm_token_1234567890',
          startPage: 1,
          batchPages: 10,
          pageSize: 100,
        }),
      ),
    );
    expect(tenureBatch.ok).toBe(true);
    expect(tenureBatch.data.status).toBe('BATCH_OK');
    expect(tenureBatch.data.rowDigests[0].key).toBe(
      'h1_66126a00e8b2fc885553b574702c7b19f069a6455edaa9d650d62ff9b528b4b0',
    );
    expect(JSON.stringify(tenureBatch)).not.toMatch(
      /PRIVATE_VM_TENURE_FIRST|1540600000001|99990000000001|SYNTHETIC-UUID-0001/,
    );

    const tenurePreview = JSON.parse(
      JSON.stringify(
        context.finalizePreview({
          endpoint: 'volunteer-tenure',
          sourceTotal: tenureBatch.data.sourceTotal,
          pagesFetched: tenureBatch.data.pagesFetchedInBatch,
          rowDigests: tenureBatch.data.rowDigests,
          aggregateSummary: tenureBatch.data.aggregateSummary,
          sampleCandidates: tenureBatch.data.sampleCandidates,
        }),
      ),
    );
    expect(tenurePreview.ok).toBe(true);
    expect(tenurePreview.data.status).toBe('READY');

    const tenureStage = JSON.parse(
      JSON.stringify(
        context.stageLargeDatasetBatch({
          endpoint: 'volunteer-tenure',
          token: 'synthetic_vm_token_1234567890',
          expectedFingerprint: tenurePreview.data.fingerprint,
          startPage: 1,
          batchPages: 10,
          pageSize: 100,
        }),
      ),
    );
    expect(tenureStage.ok).toBe(true);
    expect(tenureStage.data.status).toBe('BATCH_STAGED');

    const tenureCommit = JSON.parse(
      JSON.stringify(
        context.finalizeLargeDatasetCommit({
          endpoint: 'volunteer-tenure',
          expectedFingerprint: tenurePreview.data.fingerprint,
          runId: tenureStage.data.runId,
        }),
      ),
    );
    expect(tenureCommit.ok).toBe(true);
    expect(tenureCommit.data.status).toBe('COMMITTED_VERIFIED');
    expect(tenureCommit.data.destinationTab).toBe('VolunteerTenure');
    expect(tenureCommit.data.readback.verified).toBe(true);
    expect(tenureCommit.data.readback.stagingTabCleaned).toBe(true);

    // Smoke-verify bundled volunteer-family Complete Snapshot (hidden RFamily_<runId> -> verified unhide -> _ThaiPHCReportCurrent pointer -> prior RFamily_* retained -> Dashboard reflects new pointer) in node:vm
    const famBatch = JSON.parse(
      JSON.stringify(
        context.previewDatasetBatch({
          endpoint: 'volunteer-family',
          token: 'synthetic_vm_token_1234567890',
          startPage: 1,
          batchPages: 10,
          pageSize: 100,
        }),
      ),
    );
    expect(famBatch.ok).toBe(true);
    expect(famBatch.data.status).toBe('BATCH_OK');
    expect(famBatch.data.rowDigests[0].key).toBe('snapshot_preview_00001');
    expect(famBatch.data.rowDigests[0].reviewReasons).toEqual(['LOCALITY_MISMATCH']);
    expect(JSON.stringify(famBatch)).not.toMatch(
      /PRIVATE_VM_FAMILY_FIRST|PRIVATE_VM_ADDR|1540600000099|99990000000099|SYNTHETIC-VM-VOL-UUID|PRIVATE_VM_VOL_NAME/,
    );

    const famPreview = JSON.parse(
      JSON.stringify(
        context.finalizePreview({
          endpoint: 'volunteer-family',
          sourceTotal: famBatch.data.sourceTotal,
          pagesFetched: famBatch.data.pagesFetchedInBatch,
          rowDigests: famBatch.data.rowDigests,
          aggregateSummary: famBatch.data.aggregateSummary,
          sampleCandidates: famBatch.data.sampleCandidates,
        }),
      ),
    );
    expect(famPreview.ok).toBe(true);
    expect(famPreview.data.status).toBe('READY');
    expect(famPreview.data.syncMode).toBe('COMPLETE_SNAPSHOT');
    expect(famPreview.data.activeSnapshotTab).toBe('RFamily_run_20261120_prior_vm');
    expect(famPreview.data.reviewBreakdown).toEqual({ LOCALITY_MISMATCH: 1 });

    const famStage = JSON.parse(
      JSON.stringify(
        context.stageLargeDatasetBatch({
          endpoint: 'volunteer-family',
          token: 'synthetic_vm_token_1234567890',
          expectedFingerprint: famPreview.data.fingerprint,
          startPage: 1,
          batchPages: 10,
          pageSize: 100,
        }),
      ),
    );
    expect(famStage.ok).toBe(true);
    expect(famStage.data.status).toBe('BATCH_STAGED');
    expect(famStage.data.stagingTabName).toMatch(/^RFamily_/);
    const famSheetObj = sheets.find((s) => s.getName() === famStage.data.stagingTabName);
    expect(famSheetObj).toBeDefined();
    expect(famSheetObj!.isSheetHidden()).toBe(true);

    const famCommit = JSON.parse(
      JSON.stringify(
        context.finalizeLargeDatasetCommit({
          endpoint: 'volunteer-family',
          expectedFingerprint: famPreview.data.fingerprint,
          runId: famStage.data.runId,
        }),
      ),
    );
    expect(famCommit.ok).toBe(true);
    expect(famCommit.data.status).toBe('COMMITTED_VERIFIED');
    expect(famCommit.data.syncMode).toBe('COMPLETE_SNAPSHOT');
    expect(famCommit.data.destinationTab).toBe(famStage.data.stagingTabName);
    expect(famCommit.data.readback.verified).toBe(true);
    expect(famCommit.data.readback.publicationPointerVerified).toBe(true);
    expect(famCommit.data.readback.stagingTabCleaned).toBeNull();
    expect(famSheetObj!.isSheetHidden()).toBe(false);
    // Prior RFamily_* snapshot and ชีต1 preserved untouched
    expect(sheets.some((s) => s.getName() === 'RFamily_run_20261120_prior_vm')).toBe(true);
    expect(sheets.some((s) => s.getName() === 'ชีต1')).toBe(true);

    const dashAfterFamily = JSON.parse(JSON.stringify(context.getDashboardStatus()));
    expect(dashAfterFamily.ok).toBe(true);
    const famDashRow = dashAfterFamily.data.datasets.find(
      (d: { endpoint: string }) => d.endpoint === 'volunteer-family',
    );
    expect(famDashRow).toMatchObject({
      endpoint: 'volunteer-family',
      destinationTab: famStage.data.stagingTabName,
      rowCount: 1,
      publicationPointerActive: true,
      lastStatus: 'COMMITTED_VERIFIED',
    });

    expect(propertyMutations).toEqual([]);
    expect(JSON.stringify(result)).not.toContain(VALID_HMAC_KEY);
    expect(JSON.stringify(commitRes)).not.toContain('synthetic_vm_token_1234567890');
    expect(JSON.stringify(vgCommitRes)).not.toContain('synthetic_vm_token_1234567890');
    expect(JSON.stringify(assignCommit)).not.toContain(VALID_HMAC_KEY);
    expect(JSON.stringify(assignCommit)).not.toContain('synthetic_vm_token_1234567890');
    expect(JSON.stringify(assignCommit)).not.toContain('PRIVATE_VM_FIRST');
    expect(JSON.stringify(resignCommit)).not.toContain('PRIVATE_VM_RESIGN_FIRST');
    expect(JSON.stringify(tenureCommit)).not.toContain('PRIVATE_VM_TENURE_FIRST');
    expect(JSON.stringify(famCommit)).not.toMatch(/PRIVATE_VM_FAMILY_FIRST|PRIVATE_VM_ADDR/);
  });
});
