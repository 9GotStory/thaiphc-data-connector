import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const PROBE_PATH = new URL('../gate0-sandbox/Gate0Probe.gs', import.meta.url);
const MANIFEST_PATH = new URL('../gate0-sandbox/appsscript.json', import.meta.url);
const RUNNER_PATH = new URL('../gate0-sandbox/Gate0Runner.html', import.meta.url);
const TARGETS_CONFIG = JSON.parse(readFileSync(new URL('../config/thaiphc-targets.json', import.meta.url), 'utf8'));

const VALID_TOKEN = 'TEST_GATE0_SYNTHETIC_TOKEN_0123456789abcdef';

function assertNoLegacyProductionIds(text) {
  for (const id of [TARGETS_CONFIG.scriptId, TARGETS_CONFIG.deploymentId, TARGETS_CONFIG.spreadsheetId]) {
    assert.equal(text.includes(id), false, 'must not contain production target identifier');
  }
}

function loadProbeHarness({ fetchImpl = () => { throw new Error('UNEXPECTED_NETWORK_CALL'); }, nowImpl } = {}) {
  const source = readFileSync(PROBE_PATH, 'utf8');
  const calls = [];
  const htmlOutputs = [];

  const services = {
    UrlFetchApp: {
      fetch(url, params) {
        calls.push({ url, params });
        return fetchImpl(url, params);
      },
    },
    HtmlService: {
      createHtmlOutputFromFile(filename) {
        const output = {
          filename,
          title: null,
          setTitle(title) {
            this.title = title;
            return this;
          },
        };
        htmlOutputs.push(output);
        return output;
      },
    },
  };

  if (typeof nowImpl === 'function') {
    const FakeDate = class extends Date {
      static now() {
        return nowImpl();
      }
    };
    services.Date = FakeDate;
  }

  const context = vm.createContext(services);
  vm.runInContext(source, context, { filename: 'Gate0Probe.gs', timeout: 2000 });
  return {
    source,
    calls,
    htmlOutputs,
    doGet: () => context.doGet(),
    runGate0Probe: (token, options) => JSON.parse(JSON.stringify(context.runGate0Probe(token, options))),
  };
}

test('Gate 0 manifest enforces minimal external_request scope, NONE logging, V8, Asia/Bangkok, and MYSELF access', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  assert.equal(manifest.timeZone, 'Asia/Bangkok');
  assert.equal(manifest.runtimeVersion, 'V8');
  assert.equal(manifest.exceptionLogging, 'NONE');
  assert.deepEqual(manifest.oauthScopes, ['https://www.googleapis.com/auth/script.external_request']);
  assert.deepEqual(manifest.webapp, {
    executeAs: 'USER_DEPLOYING',
    access: 'MYSELF',
  });
});

test('Gate 0 probe source never references Sheets, Properties, Cache, Drive, Logger, console, or production IDs', () => {
  const source = readFileSync(PROBE_PATH, 'utf8');
  assert.doesNotMatch(
    source,
    /\b(?:SpreadsheetApp|PropertiesService|CacheService|DriveApp|Logger|console)\b/,
  );
  assertNoLegacyProductionIds(source);
});

test('Gate 0 rejects invalid tokens before making any UrlFetchApp request and never echoes token text', () => {
  const badTokens = [
    undefined,
    null,
    '',
    'short',
    'Bearer ' + VALID_TOKEN,
    'bearer ' + VALID_TOKEN,
    'MOCK_ONLY_1234567890123456',
    VALID_TOKEN + ' space',
    VALID_TOKEN + '\r\nInjected: 1',
    'a'.repeat(8193),
  ];

  for (const token of badTokens) {
    const h = loadProbeHarness();
    const result = h.runGate0Probe(token);
    assert.equal(h.calls.length, 0);
    assert.equal(result.overallStatus, 'INVALID_TOKEN_FORMAT');
    assert.equal(result.totalRequests, 0);
    assert.equal(result.sheetsWrites, 0);
    assert.equal(result.rawRowsReturned, false);
    if (typeof token === 'string' && token.length >= 6) {
      assert.doesNotMatch(JSON.stringify(result), new RegExp(token.slice(0, 12).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
  }
});

test('Gate 0 rejects arbitrary URLs, unknown option keys, unallowlisted endpoints, and invalid page sizes before network', () => {
  const badOptions = [
    { url: 'https://evil.example/api' },
    { origin: 'https://evil.example' },
    { path: '/api/v1/admin' },
    { endpoints: ['../admin'] },
    { endpoints: [] },
    { endpoints: 'subdistricts' },
    { candidatePageSizes: [] },
    { candidatePageSizes: [0] },
    { candidatePageSizes: [101] },
    { candidatePageSizes: ['50'] },
    { candidatePageSizes: [10, 20, 30, 40, 50] },
    'not-an-object',
  ];

  for (const opts of badOptions) {
    const h = loadProbeHarness();
    const result = h.runGate0Probe(VALID_TOKEN, opts);
    assert.equal(h.calls.length, 0);
    assert.equal(result.overallStatus, 'INVALID_OPTIONS');
    assert.equal(result.totalRequests, 0);
    assert.equal(result.sheetsWrites, 0);
    assert.doesNotMatch(JSON.stringify(result), /evil\.example|TEST_GATE0_SYNTHETIC/);
  }
});

function makeHttpResponse(body, { status = 200, headers = { 'Content-Type': 'application/json; charset=utf-8' } } = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  const bytes = Array.from(Buffer.from(text, 'utf8'));
  return {
    getResponseCode: () => status,
    getAllHeaders: () => ({ ...headers }),
    getContentText: () => text,
    getContent: () => bytes,
  };
}

function makeSubdistrictRows() {
  return Array.from({ length: 8 }, (_, i) => {
    const code = '54060' + String(i + 1);
    return {
      code,
      id: code,
      name_th: 'SYNTHETIC_SUBDISTRICT_' + (i + 1),
      name_en: 'Synthetic ' + (i + 1),
      postal_code: '54120',
      label: 'SYNTHETIC_LABEL_' + (i + 1),
      district_code: '5406',
      district_name_th: 'สอง',
      district_name_en: 'Song',
      province_code: null,
      province_name_th: null,
      province_name_en: null,
    };
  });
}

test('Gate 0 probes unpaginated subdistricts with strict allowlisted URL, GET, followRedirects:false, muteHttpExceptions:true, byte size, latency, and zero row leakage', () => {
  const payload = { items: makeSubdistrictRows() };
  const expectedBytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
  const h = loadProbeHarness({
    fetchImpl: (url, params) => {
      assert.equal(url, 'https://api-thaiphc.hss.moph.go.th/api/v1/lookups/subdistricts?district_code=5406');
      assert.equal(params.method, 'get');
      assert.equal(params.followRedirects, false);
      assert.equal(params.muteHttpExceptions, true);
      assert.equal(params.headers.Accept, 'application/json');
      assert.equal(params.headers.Authorization, 'Bearer ' + VALID_TOKEN);
      return makeHttpResponse(payload);
    },
  });

  const result = h.runGate0Probe(VALID_TOKEN, { endpoints: ['subdistricts'] });
  assert.equal(h.calls.length, 1);
  assert.equal(result.overallStatus, 'PASS');
  assert.equal(result.goNoGoRecommendation, 'GO_CANDIDATE');
  assert.equal(result.totalRequests, 1);
  assert.equal(result.maxResponseBytes, expectedBytes);
  assert.equal(result.sheetsWrites, 0);
  assert.equal(result.rawRowsReturned, false);
  assert.equal(result.endpoints.length, 1);

  const ep = result.endpoints[0];
  assert.equal(ep.endpoint, 'subdistricts');
  assert.equal(ep.paginationProtocol, 'none');
  assert.equal(ep.status, 'PASS');
  assert.equal(ep.baselineCheck.httpStatus, 200);
  assert.equal(ep.baselineCheck.status, 'PASS');
  assert.equal(ep.baselineCheck.envelopeValid, true);
  assert.equal(ep.baselineCheck.itemsReturned, 8);
  assert.equal(ep.baselineCheck.responseBytes, expectedBytes);
  assert.ok(Number.isSafeInteger(ep.baselineCheck.elapsedMs) && ep.baselineCheck.elapsedMs >= 0);
  assert.equal(ep.baselineCheck.scopeStatus, 'PASS');
  assert.equal(ep.baselineCheck.outOfScopeCount, 0);
  assert.equal(ep.page2Check, null);
  assert.deepEqual(ep.pageSizeProbes, []);

  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /SYNTHETIC_SUBDISTRICT|SYNTHETIC_LABEL|TEST_GATE0_SYNTHETIC|Bearer/);
});

test('Gate 0 rejects out-of-scope subdistricts, duplicate codes, and unexpected root keys on unpaginated lookup', () => {
  const outOfDistrict = makeSubdistrictRows();
  outOfDistrict[0].district_code = '5407';

  const outOfSubdistrict = makeSubdistrictRows();
  outOfSubdistrict[0].code = '540609';
  outOfSubdistrict[0].id = '540609';

  const dupCode = makeSubdistrictRows();
  dupCode[1].code = dupCode[0].code;
  dupCode[1].id = dupCode[0].id;

  const cases = [
    [{ items: outOfDistrict }, 'OUT_OF_SCOPE'],
    [{ items: outOfSubdistrict }, 'OUT_OF_SCOPE'],
    [{ items: dupCode }, 'DUPLICATE_SOURCE_KEY'],
    [{ items: makeSubdistrictRows(), total: 8 }, 'INVALID_ENVELOPE'],
  ];

  for (const [body, expectedCheckStatus] of cases) {
    const h = loadProbeHarness({ fetchImpl: () => makeHttpResponse(body) });
    const result = h.runGate0Probe(VALID_TOKEN, { endpoints: ['subdistricts'] });
    assert.equal(result.overallStatus, 'FAILED');
    assert.equal(result.goNoGoRecommendation, 'NO_GO_CONTRACT_MISMATCH');
    assert.equal(result.endpoints[0].status, expectedCheckStatus);
    assert.equal(result.endpoints[0].baselineCheck.status, expectedCheckStatus);
  }
});

test('Gate 0 rejects HTTP 3xx redirects, stops immediately, and never leaks Location headers', () => {
  for (const status of [301, 302, 303, 307, 308]) {
    const h = loadProbeHarness({
      fetchImpl: () =>
        makeHttpResponse('<html>Redirecting</html>', {
          status,
          headers: {
            Location: 'https://evil-collector.example/steal?secret=1',
            'Content-Type': 'text/html',
          },
        }),
    });
    const result = h.runGate0Probe(VALID_TOKEN, { endpoints: ['subdistricts', 'villages'] });
    assert.equal(h.calls.length, 1);
    assert.equal(result.overallStatus, 'REDIRECT_REJECTED');
    assert.equal(result.goNoGoRecommendation, 'NO_GO_INVESTIGATE_BLOCK_OR_NETWORK');
    assert.equal(result.endpoints[0].status, 'REDIRECT_REJECTED');
    assert.equal(result.endpoints[0].baselineCheck.httpStatus, status);
    assert.doesNotMatch(JSON.stringify(result), /evil-collector|Redirecting|TEST_GATE0_SYNTHETIC/);
  }
});

test('Gate 0 handles HTTP 401 and HTTP 403 by halting immediately with safe diagnostics', () => {
  const h401 = loadProbeHarness({
    fetchImpl: () =>
      makeHttpResponse('{"error":"SENSITIVE_AUTH_DETAIL_' + VALID_TOKEN + '"}', { status: 401 }),
  });
  const r401 = h401.runGate0Probe(VALID_TOKEN, { endpoints: ['subdistricts', 'villages'] });
  assert.equal(h401.calls.length, 1);
  assert.equal(r401.overallStatus, 'AUTH_FAILED');
  assert.equal(r401.goNoGoRecommendation, 'NO_GO_AUTH_RETRY_TOKEN');
  assert.equal(r401.endpoints[0].status, 'HTTP_401');
  assert.equal(r401.endpoints[0].baselineCheck.httpStatus, 401);
  assert.doesNotMatch(JSON.stringify(r401), /SENSITIVE_AUTH_DETAIL|TEST_GATE0_SYNTHETIC/);

  const h403 = loadProbeHarness({
    fetchImpl: () => makeHttpResponse('<html>Cloudflare WAF Geo-Blocked</html>', { status: 403, headers: { 'Content-Type': 'text/html' } }),
  });
  const r403 = h403.runGate0Probe(VALID_TOKEN, { endpoints: ['subdistricts', 'villages'] });
  assert.equal(h403.calls.length, 1);
  assert.equal(r403.overallStatus, 'BLOCKED_OR_WAF');
  assert.equal(r403.goNoGoRecommendation, 'NO_GO_INVESTIGATE_BLOCK_OR_NETWORK');
  assert.equal(r403.endpoints[0].status, 'HTTP_403');
  assert.doesNotMatch(JSON.stringify(r403), /Cloudflare|Geo-Blocked|TEST_GATE0_SYNTHETIC/);
});

test('Gate 0 blocks HTML challenge responses, invalid JSON, oversized payloads, and sanitizes thrown UrlFetchApp exceptions', () => {
  const hHtml = loadProbeHarness({
    fetchImpl: () => makeHttpResponse('<html>WAF_CHALLENGE_SECRET</html>', { status: 200, headers: { 'Content-Type': 'text/html' } }),
  });
  const rHtml = hHtml.runGate0Probe(VALID_TOKEN, { endpoints: ['subdistricts'] });
  assert.equal(rHtml.overallStatus, 'BLOCKED_OR_WAF');
  assert.equal(rHtml.goNoGoRecommendation, 'NO_GO_INVESTIGATE_BLOCK_OR_NETWORK');
  assert.equal(rHtml.endpoints[0].status, 'UNEXPECTED_CONTENT_TYPE');
  assert.doesNotMatch(JSON.stringify(rHtml), /WAF_CHALLENGE_SECRET/);

  const hBadJson = loadProbeHarness({
    fetchImpl: () => makeHttpResponse('{not-valid-json SECRET_FRAGMENT', { status: 200 }),
  });
  const rBadJson = hBadJson.runGate0Probe(VALID_TOKEN, { endpoints: ['subdistricts'] });
  assert.equal(rBadJson.overallStatus, 'FAILED');
  assert.equal(rBadJson.endpoints[0].status, 'INVALID_JSON');
  assert.doesNotMatch(JSON.stringify(rBadJson), /SECRET_FRAGMENT/);

  const hOversized = loadProbeHarness({
    fetchImpl: () => ({
      getResponseCode: () => 200,
      getAllHeaders: () => ({ 'Content-Type': 'application/json' }),
      getContent: () => new Array(10 * 1024 * 1024 + 1),
      getContentText: () => {
        throw new Error('SHOULD_NOT_PARSE_OVERSIZED');
      },
    }),
  });
  const rOversized = hOversized.runGate0Probe(VALID_TOKEN, { endpoints: ['subdistricts'] });
  assert.equal(rOversized.overallStatus, 'FAILED');
  assert.equal(rOversized.endpoints[0].status, 'RESPONSE_TOO_LARGE');

  const hThrows = loadProbeHarness({
    fetchImpl: () => {
      throw new Error('DNS error with Bearer ' + VALID_TOKEN + ' internal host');
    },
  });
  const rThrows = hThrows.runGate0Probe(VALID_TOKEN, { endpoints: ['subdistricts', 'villages'] });
  assert.equal(hThrows.calls.length, 1);
  assert.equal(rThrows.overallStatus, 'BLOCKED_OR_WAF');
  assert.equal(rThrows.goNoGoRecommendation, 'NO_GO_INVESTIGATE_BLOCK_OR_NETWORK');
  assert.equal(rThrows.endpoints[0].status, 'FETCH_EXCEPTION');
  assert.doesNotMatch(JSON.stringify(rThrows), /DNS error|TEST_GATE0_SYNTHETIC|internal host/);
});

function makeHealthServiceRows(total = 18) {
  return Array.from({ length: total }, (_, i) => {
    const sub = '54060' + String((i % 8) + 1);
    return {
      health_service_code: 'SYNTH_HS_' + String(i + 1).padStart(3, '0'),
      health_service_name_th: 'SYNTHETIC_CLINIC_' + (i + 1),
      province: { province_code: '54', province_name_th: 'แพร่', province_name_en: 'Phrae' },
      district: { district_code: '5406', district_name_th: 'สอง', district_name_en: 'Song' },
      subdistrict: { subdistrict_code: sub, subdistrict_name_th: 'SYNTH', subdistrict_name_en: 'Synth' },
    };
  });
}

function makeAssignmentRows(total = 25) {
  return Array.from({ length: total }, (_, i) => {
    const sub = '54060' + String((i % 8) + 1);
    return {
      id: 'SYNTH_ASSIGN_UUID_' + String(i + 1).padStart(4, '0'),
      osmCode: '999999999999' + String(i + 1).padStart(2, '0'),
      citizenId: '1100100100' + String(i + 1).padStart(3, '0'),
      firstName: 'SECRET_FIRST_NAME_' + (i + 1),
      lastName: 'SECRET_LAST_NAME_' + (i + 1),
      fullName: 'SECRET_FULL_NAME_' + (i + 1),
      provinceCode: '54',
      districtCode: '5406',
      subdistrictCode: sub,
      villageNo: '1',
      villageName: null,
    };
  });
}

function makeVolunteerGenderRows(total = 85) {
  return Array.from({ length: total }, (_, i) => {
    const sub = '54060' + String((i % 8) + 1);
    const vCode = sub + String((i % 15) + 1).padStart(3, '0');
    return {
      provinceCode: '54',
      districtCode: '5406',
      subdistrictCode: sub,
      villageCode: vCode,
      villageNo: String((i % 15) + 1),
      villageName: 'SYNTH_VILLAGE_' + (i + 1),
      total: 10,
      male: 4,
      female: 6,
    };
  });
}

test('Gate 0 probes offset pagination (health-services) with exact repeated exclusions, page 2 continuation, and page-size calibration', () => {
  const rows = makeHealthServiceRows(18);
  const h = loadProbeHarness({
    fetchImpl: (url) => {
      const parsed = new URL(url);
      assert.equal(parsed.origin, 'https://api-thaiphc.hss.moph.go.th');
      assert.equal(parsed.pathname, '/api/v1/geo-management/health-services');
      assert.deepEqual(parsed.searchParams.getAll('health_service_type_ids_exclude'), [
        '7310dd94-0395-48cb-845b-803279a54f6c',
        '96ca3348-49c2-4d89-903b-32939fd1c95c',
        'f464d614-c20e-4391-84a9-4c8edb7982a9',
      ]);
      assert.equal(parsed.searchParams.get('province_code'), '54');
      assert.equal(parsed.searchParams.get('district_code'), '5406');

      const limit = Number(parsed.searchParams.get('limit'));
      const offset = Number(parsed.searchParams.get('offset'));
      if (limit === 100) {
        // Simulate server clamping limit=100 down to 50
        return makeHttpResponse({ items: rows.slice(0, 18), total: 18, limit: 50, offset: 0 });
      }
      return makeHttpResponse({
        items: rows.slice(offset, offset + limit),
        total: 18,
        limit,
        offset,
      });
    },
  });

  const result = h.runGate0Probe(VALID_TOKEN, {
    endpoints: ['health-services'],
    candidatePageSizes: [10, 50, 100],
  });

  assert.equal(h.calls.length, 4);
  assert.equal(result.overallStatus, 'PASS');
  const ep = result.endpoints[0];
  assert.equal(ep.paginationProtocol, 'offset');
  assert.equal(ep.status, 'PASS');
  assert.equal(ep.baselineCheck.reportedTotal, 18);
  assert.equal(ep.baselineCheck.itemsReturned, 10);
  assert.equal(ep.baselineCheck.effectivePageSize, 10);
  assert.equal(ep.page2Check.status, 'PASS');
  assert.equal(ep.page2Check.requestedOffset, 10);
  assert.equal(ep.page2Check.returnedOffset, 10);
  assert.equal(ep.page2Check.itemsReturned, 8);
  assert.equal(ep.page2Check.totalStable, true);
  assert.equal(ep.page2Check.duplicateKeysAcrossPages, 0);
  assert.deepEqual(
    ep.pageSizeProbes.map((p) => ({ req: p.requestedPageSize, behavior: p.behavior, eff: p.effectivePageSize })),
    [
      { req: 50, behavior: 'HONORED', eff: 50 },
      { req: 100, behavior: 'CLAMPED', eff: 50 },
    ],
  );
  assert.equal(ep.recommendedPageSize, 50);
  assert.doesNotMatch(JSON.stringify(result), /SYNTH_HS_|SYNTHETIC_CLINIC/);
});

test('Gate 0 probes assignment pagination (assignments) with nested pagination{}, detects cross-page duplicates, and leaks zero PII', () => {
  const rows = makeAssignmentRows(25);
  const h = loadProbeHarness({
    fetchImpl: (url) => {
      const parsed = new URL(url);
      assert.equal(parsed.pathname, '/api/v1/dashboard/assignments');
      assert.equal(parsed.searchParams.get('provinceCode'), '54');
      assert.equal(parsed.searchParams.get('districtCode'), '5406');
      assert.equal(parsed.searchParams.get('osmStatus'), '');
      assert.equal(parsed.searchParams.get('osm_status'), '');
      assert.equal(parsed.searchParams.get('approval_status'), 'approved');
      assert.equal(parsed.searchParams.get('order_by'), 'approved_date');
      assert.equal(parsed.searchParams.get('sort_dir'), 'desc');

      const page = Number(parsed.searchParams.get('page'));
      const pageSize = Number(parsed.searchParams.get('pageSize'));
      if (pageSize === 100) {
        return makeHttpResponse({ error: 'pageSize too large' }, { status: 400 });
      }
      if (pageSize === 50) {
        // Server echoes limit:50 but still only returns 10 items -> ROW_COUNT_MISMATCH
        return makeHttpResponse({
          provinces: [{ provinceCode: '54', osmCount: 25 }],
          items: rows.slice(0, 10),
          pagination: { page: 1, limit: 50, total: 25, pages: 1 },
        });
      }
      const start = (page - 1) * pageSize;
      return makeHttpResponse({
        provinces: [{ provinceCode: '54', osmCount: 25 }],
        items: rows.slice(start, start + pageSize),
        pagination: { page, limit: pageSize, total: 25, pages: Math.ceil(25 / pageSize) },
      });
    },
  });

  const result = h.runGate0Probe(VALID_TOKEN, {
    endpoints: ['assignments'],
    candidatePageSizes: [10, 50, 100],
  });

  assert.equal(result.overallStatus, 'PASS');
  const ep = result.endpoints[0];
  assert.equal(ep.paginationProtocol, 'assignment');
  assert.equal(ep.status, 'PASS');
  assert.equal(ep.baselineCheck.reportedTotal, 25);
  assert.equal(ep.page2Check.status, 'PASS');
  assert.equal(ep.page2Check.duplicateKeysAcrossPages, 0);
  assert.deepEqual(
    ep.pageSizeProbes.map((p) => ({ req: p.requestedPageSize, behavior: p.behavior })),
    [
      { req: 50, behavior: 'ROW_COUNT_MISMATCH' },
      { req: 100, behavior: 'HTTP_REJECTED' },
    ],
  );
  assert.equal(ep.recommendedPageSize, 10);

  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /SECRET_FIRST_NAME|SECRET_LAST_NAME|SECRET_FULL_NAME|1100100100|999999999999|SYNTH_ASSIGN_UUID/);

  // Cross-page duplicate key detection (e.g., if API ignored page=2 and returned page 1 rows again)
  const hDup = loadProbeHarness({
    fetchImpl: (url) => {
      const page = Number(new URL(url).searchParams.get('page'));
      return makeHttpResponse({
        provinces: [{ provinceCode: '54', osmCount: 25 }],
        items: rows.slice(0, 10),
        pagination: { page, limit: 10, total: 25, pages: 3 },
      });
    },
  });
  const rDup = hDup.runGate0Probe(VALID_TOKEN, { endpoints: ['assignments'], candidatePageSizes: [10] });
  assert.equal(rDup.overallStatus, 'FAILED');
  assert.equal(rDup.endpoints[0].status, 'DUPLICATE_KEYS_ACROSS_PAGES');
  assert.equal(rDup.endpoints[0].page2Check.duplicateKeysAcrossPages, 10);
});

test('Gate 0 probes report pagination (volunteer-gender), rejects cross-protocol envelopes, and detects mid-probe total drift', () => {
  const rows = makeVolunteerGenderRows(85);
  const h = loadProbeHarness({
    fetchImpl: (url) => {
      const parsed = new URL(url);
      assert.equal(parsed.pathname, '/api/v1/reports/volunteer-gender');
      assert.equal(parsed.searchParams.get('province'), '54');
      assert.equal(parsed.searchParams.get('district'), '5406');
      const page = Number(parsed.searchParams.get('page'));
      const pageSize = Number(parsed.searchParams.get('pageSize'));
      const start = (page - 1) * pageSize;
      return makeHttpResponse({
        success: true,
        message: 'Success',
        items: rows.slice(start, start + pageSize),
        total: 85,
        page,
        pageSize,
      });
    },
  });

  const result = h.runGate0Probe(VALID_TOKEN, {
    endpoints: ['volunteer-gender'],
    candidatePageSizes: [10, 50],
  });
  assert.equal(result.overallStatus, 'PASS');
  assert.equal(result.endpoints[0].paginationProtocol, 'report');
  assert.equal(result.endpoints[0].baselineCheck.reportedTotal, 85);
  assert.equal(result.endpoints[0].page2Check.status, 'PASS');
  assert.equal(result.endpoints[0].recommendedPageSize, 50);

  // Cross-protocol mismatch: returning offset envelope for report endpoint must fail
  const hWrongEnvelope = loadProbeHarness({
    fetchImpl: () => makeHttpResponse({ items: rows.slice(0, 10), total: 85, limit: 10, offset: 0 }),
  });
  const rWrong = hWrongEnvelope.runGate0Probe(VALID_TOKEN, { endpoints: ['volunteer-gender'], candidatePageSizes: [10] });
  assert.equal(rWrong.overallStatus, 'FAILED');
  assert.equal(rWrong.endpoints[0].status, 'INVALID_ENVELOPE');

  // Mid-probe total change on page 2 must fail
  let callNum = 0;
  const hDrift = loadProbeHarness({
    fetchImpl: (url) => {
      callNum += 1;
      const page = Number(new URL(url).searchParams.get('page'));
      const start = (page - 1) * 10;
      return makeHttpResponse({
        success: true,
        message: 'Success',
        items: rows.slice(start, start + 10),
        total: callNum === 1 ? 85 : 86,
        page,
        pageSize: 10,
      });
    },
  });
  const rDrift = hDrift.runGate0Probe(VALID_TOKEN, { endpoints: ['volunteer-gender'], candidatePageSizes: [10] });
  assert.equal(rDrift.overallStatus, 'FAILED');
  assert.equal(rDrift.endpoints[0].status, 'SOURCE_TOTAL_CHANGED');
});

test('Gate 0 default suite covers all four pagination protocols (none, offset, assignment, report) and computes quota summary', () => {
  const subRows = makeSubdistrictRows();
  const hsRows = makeHealthServiceRows(18);
  const assignRows = makeAssignmentRows(25);
  const genderRows = makeVolunteerGenderRows(85);

  const h = loadProbeHarness({
    fetchImpl: (url) => {
      const u = new URL(url);
      if (u.pathname === '/api/v1/lookups/subdistricts') {
        return makeHttpResponse({ items: subRows });
      }
      if (u.pathname === '/api/v1/geo-management/health-services') {
        const limit = Number(u.searchParams.get('limit'));
        const offset = Number(u.searchParams.get('offset'));
        return makeHttpResponse({ items: hsRows.slice(offset, offset + limit), total: 18, limit, offset });
      }
      if (u.pathname === '/api/v1/dashboard/assignments') {
        const page = Number(u.searchParams.get('page'));
        const pageSize = Number(u.searchParams.get('pageSize'));
        const start = (page - 1) * pageSize;
        return makeHttpResponse({
          provinces: [{ provinceCode: '54', osmCount: 25 }],
          items: assignRows.slice(start, start + pageSize),
          pagination: { page, limit: pageSize, total: 25, pages: Math.ceil(25 / pageSize) },
        });
      }
      if (u.pathname === '/api/v1/reports/volunteer-gender') {
        const page = Number(u.searchParams.get('page'));
        const pageSize = Number(u.searchParams.get('pageSize'));
        const start = (page - 1) * pageSize;
        return makeHttpResponse({
          success: true,
          message: 'Success',
          items: genderRows.slice(start, start + pageSize),
          total: 85,
          page,
          pageSize,
        });
      }
      throw new Error('UNEXPECTED_PATH:' + u.pathname);
    },
  });

  const result = h.runGate0Probe(VALID_TOKEN);
  assert.equal(result.overallStatus, 'PASS');
  assert.equal(result.goNoGoRecommendation, 'GO_CANDIDATE');
  assert.equal(result.totalRequests, 13);
  assert.deepEqual(
    result.endpoints.map((e) => [e.endpoint, e.paginationProtocol, e.status]),
    [
      ['subdistricts', 'none', 'PASS'],
      ['health-services', 'offset', 'PASS'],
      ['assignments', 'assignment', 'PASS'],
      ['volunteer-gender', 'report', 'PASS'],
    ],
  );
  assert.equal(result.quotaSummary.dailyUrlFetchLimit, 20000);
  assert.equal(result.quotaSummary.maxBytesPerCallLimit, 50 * 1024 * 1024);
  assert.equal(result.quotaSummary.maxExecutionSecondsLimit, 360);
  assert.ok(result.quotaSummary.suggestedSequentialBatchPages >= 5 && result.quotaSummary.suggestedSequentialBatchPages <= 50);
  assert.doesNotMatch(JSON.stringify(result), /SECRET_FIRST_NAME|SYNTH_HS_|SYNTHETIC_SUBDISTRICT|TEST_GATE0_SYNTHETIC/);
});

test('Gate 0 enforces Preserve Source Locality strictly on volunteer-family and resigned-volunteers, and hard-fails locality mismatch on volunteer-tenure and villages', () => {
  const familyRows = Array.from({ length: 12 }, (_, i) => ({
    provinceCode: '54',
    districtCode: '5406',
    subdistrictCode: i === 0 ? '540210' : '540601',
    villageCode: i === 0 ? '540303004' : '540601001',
    citizenId: '1100100999' + String(i + 1).padStart(3, '0'),
    fullName: 'SECRET_FAMILY_MEMBER_' + (i + 1),
    address: '999 SECRET ROAD',
    volunteerId: 'SHARED_VOLUNTEER_UUID',
    status: i % 2 === 0 ? 'volunteer' : 'child',
  }));

  const resignedRows = Array.from({ length: 12 }, (_, i) => ({
    id: 'SYNTH_RESIGNED_' + (i + 1),
    citizenId: '1100200999' + String(i + 1).padStart(3, '0'),
    firstName: 'SECRET_RESIGNED_FIRST_' + (i + 1),
    lastName: 'SECRET_RESIGNED_LAST_' + (i + 1),
    provinceCode: '54',
    districtCode: '5406',
    subdistrictCode: i === 1 ? '540210' : '540606',
    villageCode: i === 1 ? '540210001' : '540606009',
  }));

  const h = loadProbeHarness({
    fetchImpl: (url) => {
      const u = new URL(url);
      const page = Number(u.searchParams.get('page'));
      const pageSize = Number(u.searchParams.get('pageSize'));
      const start = (page - 1) * pageSize;
      if (u.pathname === '/api/v1/reports/volunteer-family') {
        assert.equal(u.searchParams.get('province'), '54');
        assert.equal(u.searchParams.get('district'), '5406');
        return makeHttpResponse({
          success: true,
          message: 'Success',
          items: familyRows.slice(start, start + pageSize),
          total: 12,
          page,
          pageSize,
        });
      }
      if (u.pathname === '/api/v1/reports/resigned-volunteers') {
        assert.equal(u.searchParams.get('provinceCode'), '54');
        assert.equal(u.searchParams.get('districtCode'), '5406');
        assert.equal(u.searchParams.get('province'), '54');
        assert.equal(u.searchParams.get('district'), '5406');
        return makeHttpResponse({
          success: true,
          message: 'Success',
          items: resignedRows.slice(start, start + pageSize),
          total: 12,
          page,
          pageSize,
        });
      }
      throw new Error('UNEXPECTED_PATH:' + u.pathname);
    },
  });

  const res = h.runGate0Probe(VALID_TOKEN, {
    endpoints: ['volunteer-family', 'resigned-volunteers'],
    candidatePageSizes: [10],
  });
  assert.equal(res.overallStatus, 'PASS');
  assert.equal(res.endpoints[0].status, 'PASS');
  assert.equal(res.endpoints[0].baselineCheck.localityMismatchCount, 1);
  assert.equal(res.endpoints[0].baselineCheck.outOfScopeCount, 0);
  assert.equal(res.endpoints[0].page2Check.duplicateKeysAcrossPages, null);
  assert.equal(res.endpoints[1].status, 'PASS');
  assert.equal(res.endpoints[1].baselineCheck.localityMismatchCount, 1);
  assert.equal(res.endpoints[1].page2Check.duplicateKeysAcrossPages, 0);
  assert.doesNotMatch(JSON.stringify(res), /SECRET_FAMILY_MEMBER|SECRET ROAD|SECRET_RESIGNED|SHARED_VOLUNTEER_UUID|SYNTH_RESIGNED/);

  // Hard district mismatch still fails even on Preserve Source Locality endpoints
  const badDistrictFamily = familyRows.map((r, i) => (i === 0 ? { ...r, districtCode: '5407' } : r));
  const hBadDist = loadProbeHarness({
    fetchImpl: () =>
      makeHttpResponse({
        success: true,
        message: 'Success',
        items: badDistrictFamily.slice(0, 10),
        total: 12,
        page: 1,
        pageSize: 10,
      }),
  });
  const rBadDist = hBadDist.runGate0Probe(VALID_TOKEN, { endpoints: ['volunteer-family'], candidatePageSizes: [10] });
  assert.equal(rBadDist.overallStatus, 'FAILED');
  assert.equal(rBadDist.endpoints[0].status, 'OUT_OF_SCOPE');

  // Strict locality on volunteer-tenure and villages (subdistrict mismatch must hard fail)
  const hTenure = loadProbeHarness({
    fetchImpl: (url) => {
      const u = new URL(url);
      assert.equal(u.searchParams.get('provinceCode'), '54');
      assert.equal(u.searchParams.get('districtCode'), '5406');
      assert.equal(u.searchParams.get('province'), '54');
      assert.equal(u.searchParams.get('district'), '5406');
      return makeHttpResponse({
        success: true,
        message: 'Success',
        items: [
          {
            id: 'SYNTH_TENURE_1',
            provinceCode: '54',
            districtCode: '5406',
            subdistrictCode: '540210',
            villageCode: '540210001',
          },
        ],
        total: 1,
        page: 1,
        pageSize: 10,
      });
    },
  });
  const rTenure = hTenure.runGate0Probe(VALID_TOKEN, { endpoints: ['volunteer-tenure'], candidatePageSizes: [10] });
  assert.equal(rTenure.overallStatus, 'FAILED');
  assert.equal(rTenure.endpoints[0].status, 'OUT_OF_SCOPE');

  const hVillages = loadProbeHarness({
    fetchImpl: (url) => {
      const u = new URL(url);
      assert.equal(u.pathname, '/api/v1/lookups/villages');
      assert.equal(u.searchParams.get('province_code'), '54');
      assert.equal(u.searchParams.get('district_code'), '5406');
      return makeHttpResponse({
        items: [
          {
            code: '540602005',
            subdistrict_code: '540601', // mismatched subdistrict prefix
            district_code: '5406',
            province_code: '54',
          },
        ],
      });
    },
  });
  const rVillages = hVillages.runGate0Probe(VALID_TOKEN, { endpoints: ['villages'] });
  assert.equal(rVillages.overallStatus, 'FAILED');
  assert.equal(rVillages.endpoints[0].status, 'OUT_OF_SCOPE');
});

test('Gate 0 skips page 2 when total fits in page 1 and halts immediately on 401 during page-size probe', () => {
  const hsRows = makeHealthServiceRows(5);
  const hSingle = loadProbeHarness({
    fetchImpl: (url) => {
      const u = new URL(url);
      const limit = Number(u.searchParams.get('limit'));
      return makeHttpResponse({ items: hsRows, total: 5, limit, offset: 0 });
    },
  });
  const rSingle = hSingle.runGate0Probe(VALID_TOKEN, {
    endpoints: ['health-services'],
    candidatePageSizes: [10, 50],
  });
  assert.equal(hSingle.calls.length, 2);
  assert.equal(rSingle.overallStatus, 'PASS');
  assert.equal(rSingle.endpoints[0].page2Check.status, 'SKIPPED_SINGLE_PAGE');
  assert.equal(rSingle.endpoints[0].recommendedPageSize, 50);

  let call = 0;
  const hProbe401 = loadProbeHarness({
    fetchImpl: (url) => {
      call += 1;
      const limit = Number(new URL(url).searchParams.get('limit'));
      if (call === 1) return makeHttpResponse({ items: hsRows, total: 5, limit, offset: 0 });
      return makeHttpResponse('{"error":"expired"}', { status: 401 });
    },
  });
  const rProbe401 = hProbe401.runGate0Probe(VALID_TOKEN, {
    endpoints: ['health-services', 'subdistricts'],
    candidatePageSizes: [10, 50, 100],
  });
  assert.equal(hProbe401.calls.length, 2);
  assert.equal(rProbe401.overallStatus, 'AUTH_FAILED');
  assert.equal(rProbe401.goNoGoRecommendation, 'NO_GO_AUTH_RETRY_TOKEN');
});

test('Gate 0 doGet serves isolated HtmlService runner with password-masked token input, zero browser persistence, and zero external requests', () => {
  const h = loadProbeHarness();
  const output = h.doGet();
  assert.equal(output.filename, 'Gate0Runner');
  assert.match(output.title, /Gate 0/i);

  const html = readFileSync(RUNNER_PATH, 'utf8');
  assert.match(html, /type="password"/);
  assert.match(html, /google\.script\.run/);
  assert.match(html, /HTTP_401/);
  assert.doesNotMatch(html, /\b(?:localStorage|sessionStorage|document\.cookie)\b/);
  assert.doesNotMatch(html, /<(?:script|link)[^>]+https?:\/\//i);
});

test('Gate 0 Sandbox execution checklist documents strict Sandbox isolation, Personal Gmail quotas, and Go/No-Go + batch-size recording', () => {
  const checklist = readFileSync(new URL('../docs/gate0-sandbox-checklist.md', import.meta.url), 'utf8');
  assert.match(checklist, /Sandbox/i);
  assert.match(checklist, /Production/i);
  assert.match(checklist, /20,000/);
  assert.match(checklist, /50 MB/);
  assert.match(checklist, /6 min|6 minutes|6 นาที/i);
  assert.match(checklist, /Go\/No-Go/i);
  assert.match(checklist, /batch size/i);
  assertNoLegacyProductionIds(checklist);
});

test('Gate 0 fails and halts on HTML WAF challenge, out-of-scope rows, or duplicate keys during page-size probes', () => {
  const hsRows = makeHealthServiceRows(18);

  // 200 HTML WAF challenge during pageSizeProbes must halt run and report BLOCKED_OR_WAF
  let callWaf = 0;
  const hWaf = loadProbeHarness({
    fetchImpl: (url) => {
      callWaf += 1;
      const u = new URL(url);
      const limit = Number(u.searchParams.get('limit'));
      const offset = Number(u.searchParams.get('offset'));
      if (callWaf <= 2) {
        return makeHttpResponse({ items: hsRows.slice(offset, offset + limit), total: 18, limit, offset });
      }
      return makeHttpResponse('<html>WAF_PROBE_BLOCK</html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
    },
  });
  const rWaf = hWaf.runGate0Probe(VALID_TOKEN, {
    endpoints: ['health-services', 'subdistricts'],
    candidatePageSizes: [10, 50, 100],
  });
  assert.equal(hWaf.calls.length, 3);
  assert.equal(rWaf.overallStatus, 'BLOCKED_OR_WAF');
  assert.equal(rWaf.goNoGoRecommendation, 'NO_GO_INVESTIGATE_BLOCK_OR_NETWORK');
  assert.equal(rWaf.endpoints[0].status, 'UNEXPECTED_CONTENT_TYPE');
  assert.doesNotMatch(JSON.stringify(rWaf), /WAF_PROBE_BLOCK/);

  // Out-of-scope row revealed at pageSize=50 must fail endpoint (never PASS / GO_CANDIDATE)
  const badRows = makeHealthServiceRows(18);
  badRows[15].district.district_code = '5407';
  const hScope = loadProbeHarness({
    fetchImpl: (url) => {
      const u = new URL(url);
      const limit = Number(u.searchParams.get('limit'));
      const offset = Number(u.searchParams.get('offset'));
      // Baseline + page 2 return clean rows; size=50 returns the bad row
      const slice = limit === 50 ? badRows : hsRows.slice(offset, offset + limit);
      return makeHttpResponse({ items: slice, total: 18, limit, offset });
    },
  });
  const rScope = hScope.runGate0Probe(VALID_TOKEN, {
    endpoints: ['health-services'],
    candidatePageSizes: [10, 50],
  });
  assert.equal(rScope.overallStatus, 'FAILED');
  assert.equal(rScope.endpoints[0].status, 'OUT_OF_SCOPE');
  assert.equal(rScope.endpoints[0].pageSizeProbes[0].behavior, 'SCOPE_FAILED');
  assert.equal(rScope.endpoints[0].recommendedPageSize, null);

  // Intra-page duplicate key at pageSize=50 must NOT be marked HONORED
  const dupRows = makeHealthServiceRows(18);
  dupRows[12].health_service_code = dupRows[0].health_service_code;
  const hDupSize = loadProbeHarness({
    fetchImpl: (url) => {
      const u = new URL(url);
      const limit = Number(u.searchParams.get('limit'));
      const offset = Number(u.searchParams.get('offset'));
      const slice = limit === 50 ? dupRows : hsRows.slice(offset, offset + limit);
      return makeHttpResponse({ items: slice, total: 18, limit, offset });
    },
  });
  const rDupSize = hDupSize.runGate0Probe(VALID_TOKEN, {
    endpoints: ['health-services'],
    candidatePageSizes: [10, 50],
  });
  assert.equal(rDupSize.overallStatus, 'FAILED');
  assert.equal(rDupSize.endpoints[0].status, 'DUPLICATE_SOURCE_KEY');
  assert.equal(rDupSize.endpoints[0].pageSizeProbes[0].behavior, 'DUPLICATE_SOURCE_KEY');
  assert.equal(rDupSize.endpoints[0].recommendedPageSize, null);
});

test('Gate 0 rejects missing stable keys, absent required locality fields, and sanitizes response read exceptions', () => {
  // Missing stable key (id: null on assignments) must fail with MISSING_SOURCE_KEY
  const missingKeyRows = makeAssignmentRows(5);
  missingKeyRows[0].id = null;
  const hMissingKey = loadProbeHarness({
    fetchImpl: () =>
      makeHttpResponse({
        provinces: [{ provinceCode: '54', osmCount: 5 }],
        items: missingKeyRows,
        pagination: { page: 1, limit: 10, total: 5, pages: 1 },
      }),
  });
  const rMissingKey = hMissingKey.runGate0Probe(VALID_TOKEN, {
    endpoints: ['assignments'],
    candidatePageSizes: [10],
  });
  assert.equal(rMissingKey.overallStatus, 'FAILED');
  assert.equal(rMissingKey.endpoints[0].status, 'MISSING_SOURCE_KEY');

  // Absent subdistrictCode on assignments must fail with OUT_OF_SCOPE
  const missingSubRows = makeAssignmentRows(5);
  delete missingSubRows[0].subdistrictCode;
  const hMissingSub = loadProbeHarness({
    fetchImpl: () =>
      makeHttpResponse({
        provinces: [{ provinceCode: '54', osmCount: 5 }],
        items: missingSubRows,
        pagination: { page: 1, limit: 10, total: 5, pages: 1 },
      }),
  });
  const rMissingSub = hMissingSub.runGate0Probe(VALID_TOKEN, {
    endpoints: ['assignments'],
    candidatePageSizes: [10],
  });
  assert.equal(rMissingSub.overallStatus, 'FAILED');
  assert.equal(rMissingSub.endpoints[0].status, 'OUT_OF_SCOPE');

  // Absent villageCode on volunteer-gender must fail with OUT_OF_SCOPE
  const missingVilRows = makeVolunteerGenderRows(5);
  delete missingVilRows[0].villageCode;
  const hMissingVil = loadProbeHarness({
    fetchImpl: () =>
      makeHttpResponse({
        success: true,
        message: 'Success',
        items: missingVilRows,
        total: 5,
        page: 1,
        pageSize: 10,
      }),
  });
  const rMissingVil = hMissingVil.runGate0Probe(VALID_TOKEN, {
    endpoints: ['volunteer-gender'],
    candidatePageSizes: [10],
  });
  assert.equal(rMissingVil.overallStatus, 'FAILED');
  assert.equal(rMissingVil.endpoints[0].status, 'OUT_OF_SCOPE');

  // Thrown exception inside response.getContentText must never leak raw error or token
  const hReadErr = loadProbeHarness({
    fetchImpl: () => ({
      getResponseCode: () => 200,
      getAllHeaders: () => ({ 'Content-Type': 'application/json' }),
      getContent: () => [123, 125],
      getContentText: () => {
        throw new Error('SECRET_RESPONSE_READ_CRASH ' + VALID_TOKEN);
      },
    }),
  });
  const rReadErr = hReadErr.runGate0Probe(VALID_TOKEN, { endpoints: ['subdistricts'] });
  assert.equal(rReadErr.overallStatus, 'FAILED');
  assert.equal(rReadErr.endpoints[0].status, 'RESPONSE_READ_ERROR');
  assert.doesNotMatch(JSON.stringify(rReadErr), /SECRET_RESPONSE_READ_CRASH|TEST_GATE0_SYNTHETIC/);
});

test('Gate 0 batch-size calibration scales down to 1..2 pages under high latency instead of over-committing past 6-min quota', () => {
  // Simulate 15,000 ms latency per request -> 60000 / (15000 * 2) = 2 pages
  let tick = 1000000;
  const hSlow = loadProbeHarness({
    nowImpl: () => tick,
    fetchImpl: () => {
      tick += 15000;
      return makeHttpResponse({ items: makeSubdistrictRows() });
    },
  });
  const rSlow = hSlow.runGate0Probe(VALID_TOKEN, { endpoints: ['subdistricts'] });
  assert.equal(rSlow.overallStatus, 'PASS');
  assert.equal(rSlow.endpoints[0].baselineCheck.elapsedMs, 15000);
  assert.equal(rSlow.quotaSummary.suggestedSequentialBatchPages, 2);

  // Simulate extreme 60,000 ms latency -> floor at 1 page (not 5)
  let tickExtreme = 2000000;
  const hExtreme = loadProbeHarness({
    nowImpl: () => tickExtreme,
    fetchImpl: () => {
      tickExtreme += 60000;
      return makeHttpResponse({ items: makeSubdistrictRows() });
    },
  });
  const rExtreme = hExtreme.runGate0Probe(VALID_TOKEN, { endpoints: ['subdistricts'] });
  assert.equal(rExtreme.overallStatus, 'PASS');
  assert.equal(rExtreme.quotaSummary.suggestedSequentialBatchPages, 1);
});
