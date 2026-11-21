// Gate 0: Isolated read-only Sandbox UrlFetchApp connectivity & pagination probe.
// Never writes to Google Sheets, never persists or logs tokens, never returns raw rows.

const GATE0_PROBE_VERSION = 'gate0-v1';
const GATE0_ALLOWED_ORIGIN = 'https://api-thaiphc.hss.moph.go.th';
const GATE0_SCOPE = Object.freeze({ provinceCode: '54', districtCode: '5406' });
const GATE0_SUBDISTRICT_PATTERN = /^54060[1-8]$/;
const GATE0_VILLAGE_CODE_PATTERN = /^54060[1-8]\d{3}$/;
const GATE0_TOKEN_PATTERN = /^[A-Za-z0-9._~+/-]+={0,}$/;
const GATE0_MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
const GATE0_QUOTA_DAILY_CALLS = 20000;
const GATE0_QUOTA_MAX_BYTES_PER_CALL = 50 * 1024 * 1024;
const GATE0_QUOTA_MAX_EXECUTION_SECONDS = 360;
const GATE0_DEFAULT_ENDPOINTS = Object.freeze([
  'subdistricts',
  'health-services',
  'assignments',
  'volunteer-gender',
]);
const GATE0_DEFAULT_PAGE_SIZES = Object.freeze([10, 50, 100]);
const GATE0_ALLOWED_OPTION_KEYS = Object.freeze(['endpoints', 'candidatePageSizes']);
const GATE0_HEALTH_SERVICE_EXCLUSIONS = Object.freeze([
  '7310dd94-0395-48cb-845b-803279a54f6c',
  '96ca3348-49c2-4d89-903b-32939fd1c95c',
  'f464d614-c20e-4391-84a9-4c8edb7982a9',
]);

const GATE0_ENDPOINTS = Object.freeze({
  subdistricts: Object.freeze({
    path: '/api/v1/lookups/subdistricts',
    pagination: 'none',
    preserveSourceLocality: false,
    hasStableKey: true,
  }),
  villages: Object.freeze({
    path: '/api/v1/lookups/villages',
    pagination: 'none',
    preserveSourceLocality: false,
    hasStableKey: true,
  }),
  'health-services': Object.freeze({
    path: '/api/v1/geo-management/health-services',
    pagination: 'offset',
    preserveSourceLocality: false,
    hasStableKey: true,
  }),
  assignments: Object.freeze({
    path: '/api/v1/dashboard/assignments',
    pagination: 'assignment',
    preserveSourceLocality: false,
    hasStableKey: true,
  }),
  'volunteer-gender': Object.freeze({
    path: '/api/v1/reports/volunteer-gender',
    pagination: 'report',
    preserveSourceLocality: false,
    hasStableKey: true,
  }),
  'volunteer-family': Object.freeze({
    path: '/api/v1/reports/volunteer-family',
    pagination: 'report',
    preserveSourceLocality: true,
    hasStableKey: false,
  }),
  'resigned-volunteers': Object.freeze({
    path: '/api/v1/reports/resigned-volunteers',
    pagination: 'report',
    preserveSourceLocality: true,
    hasStableKey: true,
  }),
  'volunteer-tenure': Object.freeze({
    path: '/api/v1/reports/volunteer-tenure',
    pagination: 'report',
    preserveSourceLocality: false,
    hasStableKey: true,
  }),
});

const GATE0_FAILURE_OUTCOMES = Object.freeze({
  REDIRECT_REJECTED: Object.freeze({
    overallStatus: 'REDIRECT_REJECTED',
    recommendation: 'NO_GO_INVESTIGATE_BLOCK_OR_NETWORK',
    haltRun: true,
  }),
  HTTP_401: Object.freeze({
    overallStatus: 'AUTH_FAILED',
    recommendation: 'NO_GO_AUTH_RETRY_TOKEN',
    haltRun: true,
  }),
  HTTP_403: Object.freeze({
    overallStatus: 'BLOCKED_OR_WAF',
    recommendation: 'NO_GO_INVESTIGATE_BLOCK_OR_NETWORK',
    haltRun: true,
  }),
  FETCH_EXCEPTION: Object.freeze({
    overallStatus: 'BLOCKED_OR_WAF',
    recommendation: 'NO_GO_INVESTIGATE_BLOCK_OR_NETWORK',
    haltRun: true,
  }),
  UNEXPECTED_CONTENT_TYPE: Object.freeze({
    overallStatus: 'BLOCKED_OR_WAF',
    recommendation: 'NO_GO_INVESTIGATE_BLOCK_OR_NETWORK',
    haltRun: false,
  }),
});

function hasOwn_(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function isPlainRecord_(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonNegativeInt_(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function isPositiveInt_(value) {
  return Number.isSafeInteger(value) && value >= 1;
}

function hasExactKeys_(obj, expectedKeys) {
  if (!isPlainRecord_(obj)) return false;
  const keys = Object.keys(obj);
  if (keys.length !== expectedKeys.length) return false;
  for (let i = 0; i < expectedKeys.length; i++) {
    if (!hasOwn_(obj, expectedKeys[i])) return false;
  }
  return true;
}

function isValidGate0Bearer_(value) {
  return (
    typeof value === 'string' &&
    value.length >= 16 &&
    value.length <= 8192 &&
    GATE0_TOKEN_PATTERN.test(value) &&
    !/^bearer\b/i.test(value) &&
    value.indexOf('MOCK_ONLY_') !== 0
  );
}

function normalizeGate0Options_(options) {
  if (options === undefined || options === null) {
    return {
      ok: true,
      endpoints: GATE0_DEFAULT_ENDPOINTS.slice(),
      candidatePageSizes: GATE0_DEFAULT_PAGE_SIZES.slice(),
    };
  }
  if (!isPlainRecord_(options)) {
    return { ok: false };
  }
  const keys = Object.keys(options);
  for (let i = 0; i < keys.length; i++) {
    if (GATE0_ALLOWED_OPTION_KEYS.indexOf(keys[i]) === -1) {
      return { ok: false };
    }
  }

  let endpoints = GATE0_DEFAULT_ENDPOINTS.slice();
  if (hasOwn_(options, 'endpoints')) {
    if (!Array.isArray(options.endpoints) || options.endpoints.length === 0 || options.endpoints.length > 8) {
      return { ok: false };
    }
    const seen = Object.create(null);
    endpoints = [];
    for (let i = 0; i < options.endpoints.length; i++) {
      const ep = options.endpoints[i];
      if (typeof ep !== 'string' || !hasOwn_(GATE0_ENDPOINTS, ep) || seen[ep]) {
        return { ok: false };
      }
      seen[ep] = true;
      endpoints.push(ep);
    }
  }

  let candidatePageSizes = GATE0_DEFAULT_PAGE_SIZES.slice();
  if (hasOwn_(options, 'candidatePageSizes')) {
    const rawSizes = options.candidatePageSizes;
    if (!Array.isArray(rawSizes) || rawSizes.length === 0 || rawSizes.length > 4) {
      return { ok: false };
    }
    const seenSizes = Object.create(null);
    candidatePageSizes = [];
    for (let i = 0; i < rawSizes.length; i++) {
      const size = rawSizes[i];
      if (!Number.isSafeInteger(size) || size < 1 || size > 100 || seenSizes[size]) {
        return { ok: false };
      }
      seenSizes[size] = true;
      candidatePageSizes.push(size);
    }
  }

  return { ok: true, endpoints: endpoints, candidatePageSizes: candidatePageSizes };
}

function buildAllowlistedQuery_(endpoint, page, pageSize, offset) {
  const descriptor = GATE0_ENDPOINTS[endpoint];
  if (!descriptor) {
    throw new Error('UNALLOWED_ENDPOINT');
  }
  const pairs = [];
  if (descriptor.pagination === 'none') {
    if (endpoint === 'subdistricts') {
      pairs.push(['district_code', GATE0_SCOPE.districtCode]);
    } else {
      pairs.push(['province_code', GATE0_SCOPE.provinceCode]);
      pairs.push(['district_code', GATE0_SCOPE.districtCode]);
    }
  } else if (descriptor.pagination === 'offset') {
    pairs.push(['limit', String(pageSize)]);
    pairs.push(['offset', String(offset)]);
    for (let i = 0; i < GATE0_HEALTH_SERVICE_EXCLUSIONS.length; i++) {
      pairs.push(['health_service_type_ids_exclude', GATE0_HEALTH_SERVICE_EXCLUSIONS[i]]);
    }
    pairs.push(['province_code', GATE0_SCOPE.provinceCode]);
    pairs.push(['district_code', GATE0_SCOPE.districtCode]);
  } else if (descriptor.pagination === 'assignment') {
    pairs.push(['page', String(page)]);
    pairs.push(['pageSize', String(pageSize)]);
    pairs.push(['provinceCode', GATE0_SCOPE.provinceCode]);
    pairs.push(['districtCode', GATE0_SCOPE.districtCode]);
    pairs.push(['osmStatus', '']);
    pairs.push(['osm_status', '']);
    pairs.push(['approval_status', 'approved']);
    pairs.push(['order_by', 'approved_date']);
    pairs.push(['sort_dir', 'desc']);
  } else {
    pairs.push(['page', String(page)]);
    pairs.push(['pageSize', String(pageSize)]);
    if (endpoint === 'resigned-volunteers' || endpoint === 'volunteer-tenure') {
      pairs.push(['provinceCode', GATE0_SCOPE.provinceCode]);
      pairs.push(['districtCode', GATE0_SCOPE.districtCode]);
    }
    pairs.push(['province', GATE0_SCOPE.provinceCode]);
    pairs.push(['district', GATE0_SCOPE.districtCode]);
  }

  const encoded = [];
  for (let i = 0; i < pairs.length; i++) {
    encoded.push(encodeURIComponent(pairs[i][0]) + '=' + encodeURIComponent(pairs[i][1]));
  }
  return encoded.join('&');
}

function buildAllowlistedUrl_(endpoint, page, pageSize, offset) {
  const descriptor = GATE0_ENDPOINTS[endpoint];
  if (!descriptor) {
    throw new Error('UNALLOWED_ENDPOINT');
  }
  const query = buildAllowlistedQuery_(endpoint, page, pageSize, offset);
  const url = GATE0_ALLOWED_ORIGIN + descriptor.path + '?' + query;
  if (
    url.indexOf(GATE0_ALLOWED_ORIGIN + '/api/v1/') !== 0 ||
    /[\s#@\\]/.test(url) ||
    url.indexOf('..') !== -1
  ) {
    throw new Error('REQUEST_SCOPE_REJECTED');
  }
  return url;
}

function getHeaderCaseInsensitive_(headers, targetName) {
  if (!isPlainRecord_(headers)) return '';
  const lowerTarget = targetName.toLowerCase();
  const keys = Object.keys(headers);
  for (let i = 0; i < keys.length; i++) {
    if (keys[i].toLowerCase() === lowerTarget) {
      const value = headers[keys[i]];
      return Array.isArray(value) ? String(value[0] || '') : String(value || '');
    }
  }
  return '';
}

function utf8ByteLength_(text) {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      bytes += 4;
      i += 1;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

function recordRequestMetrics_(metrics, res) {
  metrics.totalRequests += 1;
  metrics.totalLatencyMs += res.elapsedMs;
  if (res.elapsedMs > metrics.maxLatencyMs) metrics.maxLatencyMs = res.elapsedMs;
  if (res.responseBytes > metrics.maxResponseBytes) metrics.maxResponseBytes = res.responseBytes;
}

function executeAllowlistedGet_(endpoint, token, page, pageSize, offset, metrics) {
  const url = buildAllowlistedUrl_(endpoint, page, pageSize, offset);
  const startedAt = Date.now();
  let response;
  try {
    response = UrlFetchApp.fetch(url, {
      method: 'get',
      followRedirects: false,
      muteHttpExceptions: true,
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer ' + token,
      },
    });
  } catch (_err) {
    const failed = {
      ok: false,
      status: 'FETCH_EXCEPTION',
      httpStatus: null,
      elapsedMs: Math.max(0, Date.now() - startedAt),
      responseBytes: 0,
      data: null,
    };
    recordRequestMetrics_(metrics, failed);
    return failed;
  }

  const elapsedMs = Math.max(0, Date.now() - startedAt);
  const httpStatus = response && typeof response.getResponseCode === 'function'
    ? response.getResponseCode()
    : null;
  if (!Number.isSafeInteger(httpStatus)) {
    const invalid = {
      ok: false,
      status: 'INVALID_HTTP_RESPONSE',
      httpStatus: null,
      elapsedMs: elapsedMs,
      responseBytes: 0,
      data: null,
    };
    recordRequestMetrics_(metrics, invalid);
    return invalid;
  }

  let status = null;
  if (httpStatus >= 300 && httpStatus < 400) status = 'REDIRECT_REJECTED';
  else if (httpStatus === 401) status = 'HTTP_401';
  else if (httpStatus === 403) status = 'HTTP_403';
  else if (httpStatus !== 200) status = 'HTTP_ERROR';

  if (status !== null) {
    const nonOk = {
      ok: false,
      status: status,
      httpStatus: httpStatus,
      elapsedMs: elapsedMs,
      responseBytes: 0,
      data: null,
    };
    recordRequestMetrics_(metrics, nonOk);
    return nonOk;
  }

  const headers = typeof response.getAllHeaders === 'function' ? response.getAllHeaders() : {};
  const contentType = getHeaderCaseInsensitive_(headers, 'content-type').toLowerCase();
  if (!/^application\/(?:json|[a-z0-9.+-]+\+json)(?:\s*;|$)/.test(contentType)) {
    const badType = {
      ok: false,
      status: 'UNEXPECTED_CONTENT_TYPE',
      httpStatus: 200,
      elapsedMs: elapsedMs,
      responseBytes: 0,
      data: null,
    };
    recordRequestMetrics_(metrics, badType);
    return badType;
  }

  const rawBytes = typeof response.getContent === 'function' ? response.getContent() : null;
  let responseBytes = Array.isArray(rawBytes) ? rawBytes.length : null;
  if (responseBytes !== null && responseBytes > GATE0_MAX_RESPONSE_BYTES) {
    const tooLarge = {
      ok: false,
      status: 'RESPONSE_TOO_LARGE',
      httpStatus: 200,
      elapsedMs: elapsedMs,
      responseBytes: responseBytes,
      data: null,
    };
    recordRequestMetrics_(metrics, tooLarge);
    return tooLarge;
  }

  const text = typeof response.getContentText === 'function' ? response.getContentText('UTF-8') : '';
  if (responseBytes === null) {
    responseBytes = utf8ByteLength_(text);
  }
  if (responseBytes > GATE0_MAX_RESPONSE_BYTES) {
    const tooLargeText = {
      ok: false,
      status: 'RESPONSE_TOO_LARGE',
      httpStatus: 200,
      elapsedMs: elapsedMs,
      responseBytes: responseBytes,
      data: null,
    };
    recordRequestMetrics_(metrics, tooLargeText);
    return tooLargeText;
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (_err) {
    const badJson = {
      ok: false,
      status: 'INVALID_JSON',
      httpStatus: 200,
      elapsedMs: elapsedMs,
      responseBytes: responseBytes,
      data: null,
    };
    recordRequestMetrics_(metrics, badJson);
    return badJson;
  }

  const okResult = {
    ok: true,
    status: 'PASS',
    httpStatus: 200,
    elapsedMs: elapsedMs,
    responseBytes: responseBytes,
    data: parsed,
  };
  recordRequestMetrics_(metrics, okResult);
  return okResult;
}

const GATE0_PAGINATION_PARSERS = Object.freeze({
  offset: function (data) {
    if (
      !hasExactKeys_(data, ['items', 'total', 'limit', 'offset']) ||
      !Array.isArray(data.items) ||
      !isNonNegativeInt_(data.total) ||
      !isPositiveInt_(data.limit) ||
      !isNonNegativeInt_(data.offset)
    ) {
      return { ok: false };
    }
    return {
      ok: true,
      items: data.items,
      reportedTotal: data.total,
      effectivePageSize: data.limit,
      returnedCursor: data.offset,
    };
  },
  assignment: function (data) {
    if (
      !hasExactKeys_(data, ['provinces', 'items', 'pagination']) ||
      !Array.isArray(data.provinces) ||
      !Array.isArray(data.items) ||
      !hasExactKeys_(data.pagination, ['page', 'limit', 'total', 'pages'])
    ) {
      return { ok: false };
    }
    const p = data.pagination;
    if (
      !isPositiveInt_(p.page) ||
      !isPositiveInt_(p.limit) ||
      !isNonNegativeInt_(p.total) ||
      !isNonNegativeInt_(p.pages)
    ) {
      return { ok: false };
    }
    const validPages = p.total === 0 ? p.pages === 0 || p.pages === 1 : p.pages === Math.ceil(p.total / p.limit);
    if (!validPages) {
      return { ok: false };
    }
    return {
      ok: true,
      items: data.items,
      reportedTotal: p.total,
      effectivePageSize: p.limit,
      returnedCursor: p.page,
    };
  },
  report: function (data) {
    if (
      !hasExactKeys_(data, ['success', 'message', 'items', 'total', 'page', 'pageSize']) ||
      data.success !== true ||
      typeof data.message !== 'string' ||
      !Array.isArray(data.items) ||
      !isNonNegativeInt_(data.total) ||
      !isPositiveInt_(data.page) ||
      !isPositiveInt_(data.pageSize)
    ) {
      return { ok: false };
    }
    return {
      ok: true,
      items: data.items,
      reportedTotal: data.total,
      effectivePageSize: data.pageSize,
      returnedCursor: data.page,
    };
  },
});

function extractRowKey_(endpoint, row) {
  if (!isPlainRecord_(row)) return null;
  if (endpoint === 'subdistricts' || endpoint === 'villages') {
    return typeof row.code === 'string' && row.code.length > 0 ? row.code : null;
  }
  if (endpoint === 'health-services') {
    return typeof row.health_service_code === 'string' && row.health_service_code.length > 0
      ? row.health_service_code
      : null;
  }
  if (endpoint === 'volunteer-gender') {
    if (
      typeof row.provinceCode === 'string' &&
      typeof row.districtCode === 'string' &&
      typeof row.villageCode === 'string' &&
      row.villageCode.length > 0
    ) {
      return row.provinceCode + '\u0000' + row.districtCode + '\u0000' + row.villageCode;
    }
    return null;
  }
  if (endpoint === 'assignments' || endpoint === 'resigned-volunteers' || endpoint === 'volunteer-tenure') {
    return typeof row.id === 'string' && row.id.length > 0 ? row.id : null;
  }
  return null;
}

function inspectRowScope_(endpoint, descriptor, row) {
  if (!isPlainRecord_(row)) {
    return { outOfScope: true, localityMismatch: false };
  }
  if (endpoint === 'subdistricts') {
    const validProvince =
      row.province_code === null ||
      row.province_code === undefined ||
      row.province_code === GATE0_SCOPE.provinceCode;
    const valid =
      validProvince &&
      row.district_code === GATE0_SCOPE.districtCode &&
      typeof row.code === 'string' &&
      GATE0_SUBDISTRICT_PATTERN.test(row.code);
    return { outOfScope: !valid, localityMismatch: false };
  }
  if (endpoint === 'villages') {
    const valid =
      row.province_code === GATE0_SCOPE.provinceCode &&
      row.district_code === GATE0_SCOPE.districtCode &&
      typeof row.subdistrict_code === 'string' &&
      GATE0_SUBDISTRICT_PATTERN.test(row.subdistrict_code) &&
      typeof row.code === 'string' &&
      GATE0_VILLAGE_CODE_PATTERN.test(row.code) &&
      row.code.slice(0, 6) === row.subdistrict_code;
    return { outOfScope: !valid, localityMismatch: false };
  }
  if (endpoint === 'health-services') {
    const valid =
      isPlainRecord_(row.province) &&
      row.province.province_code === GATE0_SCOPE.provinceCode &&
      isPlainRecord_(row.district) &&
      row.district.district_code === GATE0_SCOPE.districtCode &&
      isPlainRecord_(row.subdistrict) &&
      typeof row.subdistrict.subdistrict_code === 'string' &&
      GATE0_SUBDISTRICT_PATTERN.test(row.subdistrict.subdistrict_code);
    return { outOfScope: !valid, localityMismatch: false };
  }

  if (row.provinceCode !== GATE0_SCOPE.provinceCode || row.districtCode !== GATE0_SCOPE.districtCode) {
    return { outOfScope: true, localityMismatch: false };
  }
  const subMismatch =
    hasOwn_(row, 'subdistrictCode') &&
    (typeof row.subdistrictCode !== 'string' || !GATE0_SUBDISTRICT_PATTERN.test(row.subdistrictCode));
  const villageMismatch =
    hasOwn_(row, 'villageCode') &&
    (typeof row.villageCode !== 'string' ||
      !GATE0_VILLAGE_CODE_PATTERN.test(row.villageCode) ||
      (hasOwn_(row, 'subdistrictCode') && row.villageCode.slice(0, 6) !== row.subdistrictCode));

  if (descriptor.preserveSourceLocality) {
    return { outOfScope: false, localityMismatch: subMismatch || villageMismatch };
  }
  return { outOfScope: subMismatch || villageMismatch, localityMismatch: false };
}

function inspectPageItems_(endpoint, descriptor, items, priorKeys) {
  const pageKeys = Object.create(null);
  let outOfScopeCount = 0;
  let localityMismatchCount = 0;
  let intraPageDuplicateCount = 0;
  let crossPageDuplicateCount = 0;

  for (let i = 0; i < items.length; i++) {
    const row = items[i];
    const scopeCheck = inspectRowScope_(endpoint, descriptor, row);
    if (scopeCheck.outOfScope) outOfScopeCount += 1;
    if (scopeCheck.localityMismatch) localityMismatchCount += 1;

    if (descriptor.hasStableKey) {
      const key = extractRowKey_(endpoint, row);
      if (key !== null) {
        if (pageKeys[key]) {
          intraPageDuplicateCount += 1;
        } else {
          pageKeys[key] = true;
        }
        if (priorKeys && priorKeys[key]) {
          crossPageDuplicateCount += 1;
        }
      }
    }
  }

  return {
    outOfScopeCount: outOfScopeCount,
    localityMismatchCount: localityMismatchCount,
    intraPageDuplicateCount: intraPageDuplicateCount,
    crossPageDuplicateCount: descriptor.hasStableKey ? crossPageDuplicateCount : null,
    keys: pageKeys,
  };
}

function makeFailedBaselineCheck_(res) {
  return {
    httpStatus: res.httpStatus,
    status: res.status,
    elapsedMs: res.elapsedMs,
    responseBytes: res.responseBytes,
    envelopeValid: false,
    itemsReturned: 0,
    reportedTotal: null,
    effectivePageSize: null,
    scopeStatus: 'NOT_EVALUATED',
    outOfScopeCount: 0,
    localityMismatchCount: 0,
  };
}

function probeUnpaginatedEndpoint_(endpoint, descriptor, token, metrics) {
  const res = executeAllowlistedGet_(endpoint, token, 1, 10, 0, metrics);
  if (!res.ok) {
    return {
      endpoint: endpoint,
      paginationProtocol: 'none',
      status: res.status,
      baselineCheck: makeFailedBaselineCheck_(res),
      page2Check: null,
      pageSizeProbes: [],
      recommendedPageSize: null,
    };
  }

  const envelopeValid = hasExactKeys_(res.data, ['items']) && Array.isArray(res.data.items);
  if (!envelopeValid) {
    return {
      endpoint: endpoint,
      paginationProtocol: 'none',
      status: 'INVALID_ENVELOPE',
      baselineCheck: {
        httpStatus: 200,
        status: 'INVALID_ENVELOPE',
        elapsedMs: res.elapsedMs,
        responseBytes: res.responseBytes,
        envelopeValid: false,
        itemsReturned: 0,
        reportedTotal: null,
        effectivePageSize: null,
        scopeStatus: 'NOT_EVALUATED',
        outOfScopeCount: 0,
        localityMismatchCount: 0,
      },
      page2Check: null,
      pageSizeProbes: [],
      recommendedPageSize: null,
    };
  }

  const inspection = inspectPageItems_(endpoint, descriptor, res.data.items, null);
  let checkStatus = 'PASS';
  let scopeStatus = 'PASS';
  if (inspection.outOfScopeCount > 0) {
    checkStatus = 'OUT_OF_SCOPE';
    scopeStatus = 'OUT_OF_SCOPE';
  } else if (inspection.intraPageDuplicateCount > 0) {
    checkStatus = 'DUPLICATE_SOURCE_KEY';
  }

  return {
    endpoint: endpoint,
    paginationProtocol: 'none',
    status: checkStatus,
    baselineCheck: {
      httpStatus: 200,
      status: checkStatus,
      elapsedMs: res.elapsedMs,
      responseBytes: res.responseBytes,
      envelopeValid: true,
      itemsReturned: res.data.items.length,
      reportedTotal: null,
      effectivePageSize: null,
      scopeStatus: scopeStatus,
      outOfScopeCount: inspection.outOfScopeCount,
      localityMismatchCount: inspection.localityMismatchCount,
    },
    page2Check: null,
    pageSizeProbes: [],
    recommendedPageSize: null,
  };
}

function classifyGate0Failure_(status) {
  if (hasOwn_(GATE0_FAILURE_OUTCOMES, status)) {
    return GATE0_FAILURE_OUTCOMES[status];
  }
  return {
    overallStatus: 'FAILED',
    recommendation: 'NO_GO_CONTRACT_MISMATCH',
    haltRun: false,
  };
}

function probePaginatedEndpoint_(endpoint, descriptor, token, candidatePageSizes, metrics) {
  const parser = GATE0_PAGINATION_PARSERS[descriptor.pagination];
  const isOffset = descriptor.pagination === 'offset';
  const baselineSize = candidatePageSizes.indexOf(10) !== -1 ? 10 : candidatePageSizes[0];
  const page1Cursor = isOffset ? 0 : 1;

  const baseRes = executeAllowlistedGet_(endpoint, token, 1, baselineSize, 0, metrics);
  if (!baseRes.ok) {
    return {
      endpoint: endpoint,
      paginationProtocol: descriptor.pagination,
      status: baseRes.status,
      baselineCheck: makeFailedBaselineCheck_(baseRes),
      page2Check: null,
      pageSizeProbes: [],
      recommendedPageSize: null,
    };
  }

  const baseParsed = parser(baseRes.data);
  if (!baseParsed.ok) {
    return {
      endpoint: endpoint,
      paginationProtocol: descriptor.pagination,
      status: 'INVALID_ENVELOPE',
      baselineCheck: {
        httpStatus: 200,
        status: 'INVALID_ENVELOPE',
        elapsedMs: baseRes.elapsedMs,
        responseBytes: baseRes.responseBytes,
        envelopeValid: false,
        itemsReturned: 0,
        reportedTotal: null,
        effectivePageSize: null,
        scopeStatus: 'NOT_EVALUATED',
        outOfScopeCount: 0,
        localityMismatchCount: 0,
      },
      page2Check: null,
      pageSizeProbes: [],
      recommendedPageSize: null,
    };
  }

  const expectedBaseItems = Math.min(baseParsed.effectivePageSize, Math.max(0, baseParsed.reportedTotal));
  const baseInspect = inspectPageItems_(endpoint, descriptor, baseParsed.items, null);
  let baseStatus = 'PASS';
  let baseScopeStatus = 'PASS';
  if (baseParsed.returnedCursor !== page1Cursor || baseParsed.effectivePageSize !== baselineSize) {
    baseStatus = 'INVALID_ENVELOPE';
  } else if (baseParsed.items.length !== expectedBaseItems) {
    baseStatus = 'ROW_COUNT_MISMATCH';
  } else if (baseInspect.outOfScopeCount > 0) {
    baseStatus = 'OUT_OF_SCOPE';
    baseScopeStatus = 'OUT_OF_SCOPE';
  } else if (baseInspect.intraPageDuplicateCount > 0) {
    baseStatus = 'DUPLICATE_SOURCE_KEY';
  }

  const baselineCheck = {
    httpStatus: 200,
    status: baseStatus,
    elapsedMs: baseRes.elapsedMs,
    responseBytes: baseRes.responseBytes,
    envelopeValid: baseStatus !== 'INVALID_ENVELOPE',
    itemsReturned: baseParsed.items.length,
    reportedTotal: baseParsed.reportedTotal,
    effectivePageSize: baseParsed.effectivePageSize,
    scopeStatus: baseScopeStatus,
    outOfScopeCount: baseInspect.outOfScopeCount,
    localityMismatchCount: baseInspect.localityMismatchCount,
  };

  if (baseStatus !== 'PASS') {
    return {
      endpoint: endpoint,
      paginationProtocol: descriptor.pagination,
      status: baseStatus,
      baselineCheck: baselineCheck,
      page2Check: null,
      pageSizeProbes: [],
      recommendedPageSize: null,
    };
  }

  // Page 2 continuation check
  let page2Check;
  let endpointStatus = 'PASS';
  if (baseParsed.reportedTotal <= baseParsed.items.length) {
    page2Check = {
      status: 'SKIPPED_SINGLE_PAGE',
      reason: 'TOTAL_FITS_IN_PAGE_1',
    };
  } else {
    const reqPage = isOffset ? 1 : 2;
    const reqOffset = isOffset ? baselineSize : 0;
    const expectedCursor2 = isOffset ? baselineSize : 2;
    const p2Res = executeAllowlistedGet_(endpoint, token, reqPage, baselineSize, reqOffset, metrics);

    if (!p2Res.ok) {
      endpointStatus = p2Res.status;
      page2Check = {
        httpStatus: p2Res.httpStatus,
        status: p2Res.status,
        elapsedMs: p2Res.elapsedMs,
        responseBytes: p2Res.responseBytes,
        envelopeValid: false,
        itemsReturned: 0,
        reportedTotal: null,
        totalStable: false,
        duplicateKeysAcrossPages: null,
        scopeStatus: 'NOT_EVALUATED',
        outOfScopeCount: 0,
        localityMismatchCount: 0,
      };
    } else {
      const p2Parsed = parser(p2Res.data);
      if (!p2Parsed.ok) {
        endpointStatus = 'INVALID_ENVELOPE';
        page2Check = {
          httpStatus: 200,
          status: 'INVALID_ENVELOPE',
          elapsedMs: p2Res.elapsedMs,
          responseBytes: p2Res.responseBytes,
          envelopeValid: false,
          itemsReturned: 0,
          reportedTotal: null,
          totalStable: false,
          duplicateKeysAcrossPages: null,
          scopeStatus: 'NOT_EVALUATED',
          outOfScopeCount: 0,
          localityMismatchCount: 0,
        };
      } else {
        const totalStable = p2Parsed.reportedTotal === baseParsed.reportedTotal;
        const expectedP2Items = Math.min(baselineSize, Math.max(0, p2Parsed.reportedTotal - baselineSize));
        const p2Inspect = inspectPageItems_(endpoint, descriptor, p2Parsed.items, baseInspect.keys);
        let p2Status = 'PASS';
        let p2ScopeStatus = 'PASS';
        if (!totalStable) {
          p2Status = 'SOURCE_TOTAL_CHANGED';
        } else if (p2Parsed.returnedCursor !== expectedCursor2 || p2Parsed.effectivePageSize !== baselineSize) {
          p2Status = 'INVALID_ENVELOPE';
        } else if (p2Parsed.items.length !== expectedP2Items) {
          p2Status = 'ROW_COUNT_MISMATCH';
        } else if (p2Inspect.outOfScopeCount > 0) {
          p2Status = 'OUT_OF_SCOPE';
          p2ScopeStatus = 'OUT_OF_SCOPE';
        } else if (descriptor.hasStableKey && p2Inspect.crossPageDuplicateCount > 0) {
          p2Status = 'DUPLICATE_KEYS_ACROSS_PAGES';
        } else if (p2Inspect.intraPageDuplicateCount > 0) {
          p2Status = 'DUPLICATE_SOURCE_KEY';
        }

        endpointStatus = p2Status;
        page2Check = {
          httpStatus: 200,
          status: p2Status,
          elapsedMs: p2Res.elapsedMs,
          responseBytes: p2Res.responseBytes,
          envelopeValid: p2Status !== 'INVALID_ENVELOPE',
          itemsReturned: p2Parsed.items.length,
          reportedTotal: p2Parsed.reportedTotal,
          totalStable: totalStable,
          duplicateKeysAcrossPages: p2Inspect.crossPageDuplicateCount,
          scopeStatus: p2ScopeStatus,
          outOfScopeCount: p2Inspect.outOfScopeCount,
          localityMismatchCount: p2Inspect.localityMismatchCount,
        };
        if (isOffset) {
          page2Check.requestedOffset = reqOffset;
          page2Check.returnedOffset = p2Parsed.returnedCursor;
        } else {
          page2Check.requestedPage = reqPage;
          page2Check.returnedPage = p2Parsed.returnedCursor;
        }
      }
    }
  }

  if (endpointStatus !== 'PASS') {
    return {
      endpoint: endpoint,
      paginationProtocol: descriptor.pagination,
      status: endpointStatus,
      baselineCheck: baselineCheck,
      page2Check: page2Check,
      pageSizeProbes: [],
      recommendedPageSize: null,
    };
  }

  // Page-size calibration probes (test alternative page sizes separately without failing connectivity if rejected/clamped)
  const pageSizeProbes = [];
  let recommendedPageSize = baselineSize;

  for (let i = 0; i < candidatePageSizes.length; i++) {
    const reqSize = candidatePageSizes[i];
    if (reqSize === baselineSize) continue;

    const sizeRes = executeAllowlistedGet_(endpoint, token, 1, reqSize, 0, metrics);
    if (!sizeRes.ok) {
      const outcome = classifyGate0Failure_(sizeRes.status);
      const behavior = sizeRes.status === 'HTTP_ERROR' ? 'HTTP_REJECTED' : sizeRes.status;
      pageSizeProbes.push({
        requestedPageSize: reqSize,
        httpStatus: sizeRes.httpStatus,
        behavior: behavior,
        elapsedMs: sizeRes.elapsedMs,
        responseBytes: sizeRes.responseBytes,
        effectivePageSize: null,
        itemsReturned: 0,
        reportedTotal: null,
      });
      if (outcome.haltRun) {
        endpointStatus = sizeRes.status;
        break;
      }
      continue;
    }

    const sizeParsed = parser(sizeRes.data);
    if (!sizeParsed.ok || sizeParsed.returnedCursor !== page1Cursor) {
      pageSizeProbes.push({
        requestedPageSize: reqSize,
        httpStatus: 200,
        behavior: 'ENVELOPE_MISMATCH',
        elapsedMs: sizeRes.elapsedMs,
        responseBytes: sizeRes.responseBytes,
        effectivePageSize: null,
        itemsReturned: 0,
        reportedTotal: null,
      });
      continue;
    }

    const sizeInspect = inspectPageItems_(endpoint, descriptor, sizeParsed.items, null);
    const expectedCount = Math.min(sizeParsed.effectivePageSize, Math.max(0, sizeParsed.reportedTotal));
    let behavior;
    if (sizeInspect.outOfScopeCount > 0) {
      behavior = 'SCOPE_FAILED';
    } else if (sizeParsed.items.length !== expectedCount) {
      behavior = 'ROW_COUNT_MISMATCH';
    } else if (sizeParsed.effectivePageSize === reqSize) {
      behavior = 'HONORED';
      if (reqSize > recommendedPageSize) {
        recommendedPageSize = reqSize;
      }
    } else {
      behavior = 'CLAMPED';
    }

    pageSizeProbes.push({
      requestedPageSize: reqSize,
      httpStatus: 200,
      behavior: behavior,
      elapsedMs: sizeRes.elapsedMs,
      responseBytes: sizeRes.responseBytes,
      effectivePageSize: sizeParsed.effectivePageSize,
      itemsReturned: sizeParsed.items.length,
      reportedTotal: sizeParsed.reportedTotal,
    });
  }

  return {
    endpoint: endpoint,
    paginationProtocol: descriptor.pagination,
    status: endpointStatus,
    baselineCheck: baselineCheck,
    page2Check: page2Check,
    pageSizeProbes: pageSizeProbes,
    recommendedPageSize: endpointStatus === 'PASS' ? recommendedPageSize : null,
  };
}

function buildQuotaSummary_(metrics) {
  const avgLatencyMs = metrics.totalRequests > 0
    ? Math.round(metrics.totalLatencyMs / metrics.totalRequests)
    : 0;
  const effectiveLatencyMs = Math.max(250, metrics.maxLatencyMs);
  const rawSuggested = Math.floor(60000 / (effectiveLatencyMs * 2));
  const suggestedSequentialBatchPages = Math.max(5, Math.min(50, rawSuggested));
  const percentOf50MB =
    Math.round((metrics.maxResponseBytes / GATE0_QUOTA_MAX_BYTES_PER_CALL) * 10000) / 100;

  return {
    dailyUrlFetchLimit: GATE0_QUOTA_DAILY_CALLS,
    maxBytesPerCallLimit: GATE0_QUOTA_MAX_BYTES_PER_CALL,
    maxExecutionSecondsLimit: GATE0_QUOTA_MAX_EXECUTION_SECONDS,
    estimatedMaxResponsePercentOf50MB: percentOf50MB,
    observedAvgLatencyMs: avgLatencyMs,
    suggestedSequentialBatchPages: suggestedSequentialBatchPages,
  };
}

function buildGate0ErrorReport_(overallStatus, recommendation) {
  return {
    probeVersion: GATE0_PROBE_VERSION,
    mode: 'SANDBOX_READ_ONLY_GATE0',
    scope: { provinceCode: GATE0_SCOPE.provinceCode, districtCode: GATE0_SCOPE.districtCode },
    origin: GATE0_ALLOWED_ORIGIN,
    overallStatus: overallStatus,
    goNoGoRecommendation: recommendation,
    executedAtUtc: new Date().toISOString(),
    totalRequests: 0,
    totalElapsedMs: 0,
    maxResponseBytes: 0,
    sheetsWrites: 0,
    rawRowsReturned: false,
    quotaSummary: null,
    endpoints: [],
  };
}

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Gate0Runner').setTitle(
    'ThaiPHC Gate 0 — Sandbox Connectivity Probe',
  );
}

function runGate0Probe(token, options) {
  if (!isValidGate0Bearer_(token)) {
    return buildGate0ErrorReport_('INVALID_TOKEN_FORMAT', 'NO_GO_AUTH_RETRY_TOKEN');
  }
  const normalized = normalizeGate0Options_(options);
  if (!normalized.ok) {
    return buildGate0ErrorReport_('INVALID_OPTIONS', 'NO_GO_CONTRACT_MISMATCH');
  }

  const runStartedAt = Date.now();
  const metrics = {
    totalRequests: 0,
    totalLatencyMs: 0,
    maxLatencyMs: 0,
    maxResponseBytes: 0,
  };
  const endpointResults = [];
  let overallStatus = 'PASS';
  let goNoGoRecommendation = 'GO_CANDIDATE';

  for (let i = 0; i < normalized.endpoints.length; i++) {
    const endpoint = normalized.endpoints[i];
    const descriptor = GATE0_ENDPOINTS[endpoint];
    const epResult = descriptor.pagination === 'none'
      ? probeUnpaginatedEndpoint_(endpoint, descriptor, token, metrics)
      : probePaginatedEndpoint_(endpoint, descriptor, token, normalized.candidatePageSizes, metrics);
    endpointResults.push(epResult);

    if (epResult.status !== 'PASS') {
      const outcome = classifyGate0Failure_(epResult.status);
      if (overallStatus === 'PASS' || outcome.haltRun) {
        overallStatus = outcome.overallStatus;
        goNoGoRecommendation = outcome.recommendation;
      }
      if (outcome.haltRun) {
        break;
      }
    }
  }

  return {
    probeVersion: GATE0_PROBE_VERSION,
    mode: 'SANDBOX_READ_ONLY_GATE0',
    scope: { provinceCode: GATE0_SCOPE.provinceCode, districtCode: GATE0_SCOPE.districtCode },
    origin: GATE0_ALLOWED_ORIGIN,
    overallStatus: overallStatus,
    goNoGoRecommendation: goNoGoRecommendation,
    executedAtUtc: new Date().toISOString(),
    totalRequests: metrics.totalRequests,
    totalElapsedMs: Math.max(0, Date.now() - runStartedAt),
    maxResponseBytes: metrics.maxResponseBytes,
    sheetsWrites: 0,
    rawRowsReturned: false,
    quotaSummary: buildQuotaSummary_(metrics),
    endpoints: endpointResults,
  };
}
