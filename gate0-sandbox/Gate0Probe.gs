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
const GATE0_TARGET_BATCH_MS = 60000;
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

function isNonEmptyString_(value) {
  return typeof value === 'string' && value.length > 0;
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

function inspectReportScope_(row, preserveSourceLocality, requiresVillageCode) {
  if (!isPlainRecord_(row)) {
    return { outOfScope: true, localityMismatch: false };
  }
  if (row.provinceCode !== GATE0_SCOPE.provinceCode || row.districtCode !== GATE0_SCOPE.districtCode) {
    return { outOfScope: true, localityMismatch: false };
  }
  const subMismatch =
    !hasOwn_(row, 'subdistrictCode') ||
    typeof row.subdistrictCode !== 'string' ||
    !GATE0_SUBDISTRICT_PATTERN.test(row.subdistrictCode);
  const villageMismatch =
    requiresVillageCode &&
    (!hasOwn_(row, 'villageCode') ||
      typeof row.villageCode !== 'string' ||
      !GATE0_VILLAGE_CODE_PATTERN.test(row.villageCode) ||
      (!subMismatch && row.villageCode.slice(0, 6) !== row.subdistrictCode));

  if (preserveSourceLocality) {
    return { outOfScope: false, localityMismatch: subMismatch || villageMismatch };
  }
  return { outOfScope: subMismatch || villageMismatch, localityMismatch: false };
}

function extractIdKey_(row) {
  return isPlainRecord_(row) && isNonEmptyString_(row.id) ? row.id : null;
}

function extractCodeKey_(row) {
  return isPlainRecord_(row) && isNonEmptyString_(row.code) ? row.code : null;
}

function buildReportQuery_(req, includeCamelScope) {
  const pairs = [
    ['page', String(req.page)],
    ['pageSize', String(req.pageSize)],
  ];
  if (includeCamelScope) {
    pairs.push(['provinceCode', GATE0_SCOPE.provinceCode]);
    pairs.push(['districtCode', GATE0_SCOPE.districtCode]);
  }
  pairs.push(['province', GATE0_SCOPE.provinceCode]);
  pairs.push(['district', GATE0_SCOPE.districtCode]);
  return pairs;
}

const GATE0_ENDPOINTS = Object.freeze({
  subdistricts: Object.freeze({
    path: '/api/v1/lookups/subdistricts',
    pagination: 'none',
    hasStableKey: true,
    buildQueryPairs: function () {
      return [['district_code', GATE0_SCOPE.districtCode]];
    },
    extractKey: extractCodeKey_,
    inspectScope: function (row) {
      if (!isPlainRecord_(row)) return { outOfScope: true, localityMismatch: false };
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
    },
  }),
  villages: Object.freeze({
    path: '/api/v1/lookups/villages',
    pagination: 'none',
    hasStableKey: true,
    buildQueryPairs: function () {
      return [
        ['province_code', GATE0_SCOPE.provinceCode],
        ['district_code', GATE0_SCOPE.districtCode],
      ];
    },
    extractKey: extractCodeKey_,
    inspectScope: function (row) {
      if (!isPlainRecord_(row)) return { outOfScope: true, localityMismatch: false };
      const valid =
        row.province_code === GATE0_SCOPE.provinceCode &&
        row.district_code === GATE0_SCOPE.districtCode &&
        typeof row.subdistrict_code === 'string' &&
        GATE0_SUBDISTRICT_PATTERN.test(row.subdistrict_code) &&
        typeof row.code === 'string' &&
        GATE0_VILLAGE_CODE_PATTERN.test(row.code) &&
        row.code.slice(0, 6) === row.subdistrict_code;
      return { outOfScope: !valid, localityMismatch: false };
    },
  }),
  'health-services': Object.freeze({
    path: '/api/v1/geo-management/health-services',
    pagination: 'offset',
    hasStableKey: true,
    buildQueryPairs: function (req) {
      const pairs = [
        ['limit', String(req.pageSize)],
        ['offset', String(req.offset)],
      ];
      for (let i = 0; i < GATE0_HEALTH_SERVICE_EXCLUSIONS.length; i++) {
        pairs.push(['health_service_type_ids_exclude', GATE0_HEALTH_SERVICE_EXCLUSIONS[i]]);
      }
      pairs.push(['province_code', GATE0_SCOPE.provinceCode]);
      pairs.push(['district_code', GATE0_SCOPE.districtCode]);
      return pairs;
    },
    extractKey: function (row) {
      return isPlainRecord_(row) && isNonEmptyString_(row.health_service_code)
        ? row.health_service_code
        : null;
    },
    inspectScope: function (row) {
      const valid =
        isPlainRecord_(row) &&
        isPlainRecord_(row.province) &&
        row.province.province_code === GATE0_SCOPE.provinceCode &&
        isPlainRecord_(row.district) &&
        row.district.district_code === GATE0_SCOPE.districtCode &&
        isPlainRecord_(row.subdistrict) &&
        typeof row.subdistrict.subdistrict_code === 'string' &&
        GATE0_SUBDISTRICT_PATTERN.test(row.subdistrict.subdistrict_code);
      return { outOfScope: !valid, localityMismatch: false };
    },
  }),
  assignments: Object.freeze({
    path: '/api/v1/dashboard/assignments',
    pagination: 'assignment',
    hasStableKey: true,
    buildQueryPairs: function (req) {
      return [
        ['page', String(req.page)],
        ['pageSize', String(req.pageSize)],
        ['provinceCode', GATE0_SCOPE.provinceCode],
        ['districtCode', GATE0_SCOPE.districtCode],
        ['osmStatus', ''],
        ['osm_status', ''],
        ['approval_status', 'approved'],
        ['order_by', 'approved_date'],
        ['sort_dir', 'desc'],
      ];
    },
    extractKey: extractIdKey_,
    inspectScope: function (row) {
      return inspectReportScope_(row, false, false);
    },
  }),
  'volunteer-gender': Object.freeze({
    path: '/api/v1/reports/volunteer-gender',
    pagination: 'report',
    hasStableKey: true,
    buildQueryPairs: function (req) {
      return buildReportQuery_(req, false);
    },
    extractKey: function (row) {
      if (
        isPlainRecord_(row) &&
        isNonEmptyString_(row.provinceCode) &&
        isNonEmptyString_(row.districtCode) &&
        isNonEmptyString_(row.villageCode)
      ) {
        return row.provinceCode + '\u0000' + row.districtCode + '\u0000' + row.villageCode;
      }
      return null;
    },
    inspectScope: function (row) {
      return inspectReportScope_(row, false, true);
    },
  }),
  'volunteer-family': Object.freeze({
    path: '/api/v1/reports/volunteer-family',
    pagination: 'report',
    hasStableKey: false,
    buildQueryPairs: function (req) {
      return buildReportQuery_(req, false);
    },
    extractKey: function () {
      return null;
    },
    inspectScope: function (row) {
      return inspectReportScope_(row, true, true);
    },
  }),
  'resigned-volunteers': Object.freeze({
    path: '/api/v1/reports/resigned-volunteers',
    pagination: 'report',
    hasStableKey: true,
    buildQueryPairs: function (req) {
      return buildReportQuery_(req, true);
    },
    extractKey: extractIdKey_,
    inspectScope: function (row) {
      return inspectReportScope_(row, true, true);
    },
  }),
  'volunteer-tenure': Object.freeze({
    path: '/api/v1/reports/volunteer-tenure',
    pagination: 'report',
    hasStableKey: true,
    buildQueryPairs: function (req) {
      return buildReportQuery_(req, true);
    },
    extractKey: extractIdKey_,
    inspectScope: function (row) {
      return inspectReportScope_(row, false, true);
    },
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
    haltRun: true,
  }),
});

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
    const validPages =
      p.total === 0 ? p.pages === 0 || p.pages === 1 : p.pages === Math.ceil(p.total / p.limit);
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
  if (!isPlainRecord_(options)) return { ok: false };

  const keys = Object.keys(options);
  for (let i = 0; i < keys.length; i++) {
    if (GATE0_ALLOWED_OPTION_KEYS.indexOf(keys[i]) === -1) return { ok: false };
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
      if (typeof ep !== 'string' || !hasOwn_(GATE0_ENDPOINTS, ep) || seen[ep]) return { ok: false };
      seen[ep] = true;
      endpoints.push(ep);
    }
  }

  let candidatePageSizes = GATE0_DEFAULT_PAGE_SIZES.slice();
  if (hasOwn_(options, 'candidatePageSizes')) {
    const rawSizes = options.candidatePageSizes;
    if (!Array.isArray(rawSizes) || rawSizes.length === 0 || rawSizes.length > 4) return { ok: false };
    const seenSizes = Object.create(null);
    candidatePageSizes = [];
    for (let i = 0; i < rawSizes.length; i++) {
      const size = rawSizes[i];
      if (!Number.isSafeInteger(size) || size < 1 || size > 100 || seenSizes[size]) return { ok: false };
      seenSizes[size] = true;
      candidatePageSizes.push(size);
    }
  }

  return { ok: true, endpoints: endpoints, candidatePageSizes: candidatePageSizes };
}

function buildAllowlistedUrl_(req) {
  const descriptor = GATE0_ENDPOINTS[req.endpoint];
  if (!descriptor) throw new Error('UNALLOWED_ENDPOINT');
  const pairs = descriptor.buildQueryPairs(req);
  const encoded = [];
  for (let i = 0; i < pairs.length; i++) {
    encoded.push(encodeURIComponent(pairs[i][0]) + '=' + encodeURIComponent(pairs[i][1]));
  }
  const url = GATE0_ALLOWED_ORIGIN + descriptor.path + '?' + encoded.join('&');
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

function finishFetch_(metrics, ok, status, httpStatus, elapsedMs, responseBytes, data) {
  metrics.totalRequests += 1;
  metrics.totalLatencyMs += elapsedMs;
  if (elapsedMs > metrics.maxLatencyMs) metrics.maxLatencyMs = elapsedMs;
  if (responseBytes > metrics.maxResponseBytes) metrics.maxResponseBytes = responseBytes;
  return {
    ok: ok,
    status: status,
    httpStatus: httpStatus,
    elapsedMs: elapsedMs,
    responseBytes: responseBytes,
    data: data,
  };
}

function executeAllowlistedGet_(req, token, metrics) {
  const url = buildAllowlistedUrl_(req);
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
    return finishFetch_(metrics, false, 'FETCH_EXCEPTION', null, Math.max(0, Date.now() - startedAt), 0, null);
  }

  const elapsedMs = Math.max(0, Date.now() - startedAt);
  let httpStatus;
  let headers;
  let rawBytes;
  try {
    httpStatus = response && typeof response.getResponseCode === 'function' ? response.getResponseCode() : null;
  } catch (_err) {
    return finishFetch_(metrics, false, 'RESPONSE_READ_ERROR', null, elapsedMs, 0, null);
  }

  if (!Number.isSafeInteger(httpStatus)) {
    return finishFetch_(metrics, false, 'INVALID_HTTP_RESPONSE', null, elapsedMs, 0, null);
  }
  if (httpStatus >= 300 && httpStatus < 400) {
    return finishFetch_(metrics, false, 'REDIRECT_REJECTED', httpStatus, elapsedMs, 0, null);
  }
  if (httpStatus === 401) return finishFetch_(metrics, false, 'HTTP_401', 401, elapsedMs, 0, null);
  if (httpStatus === 403) return finishFetch_(metrics, false, 'HTTP_403', 403, elapsedMs, 0, null);
  if (httpStatus !== 200) return finishFetch_(metrics, false, 'HTTP_ERROR', httpStatus, elapsedMs, 0, null);

  let text;
  let responseBytes;
  try {
    headers = typeof response.getAllHeaders === 'function' ? response.getAllHeaders() : {};
    const contentType = getHeaderCaseInsensitive_(headers, 'content-type').toLowerCase();
    if (!/^application\/(?:json|[a-z0-9.+-]+\+json)(?:\s*;|$)/.test(contentType)) {
      return finishFetch_(metrics, false, 'UNEXPECTED_CONTENT_TYPE', 200, elapsedMs, 0, null);
    }

    rawBytes = typeof response.getContent === 'function' ? response.getContent() : null;
    responseBytes = Array.isArray(rawBytes) ? rawBytes.length : null;
    if (responseBytes !== null && responseBytes > GATE0_MAX_RESPONSE_BYTES) {
      return finishFetch_(metrics, false, 'RESPONSE_TOO_LARGE', 200, elapsedMs, responseBytes, null);
    }

    text = typeof response.getContentText === 'function' ? response.getContentText('UTF-8') : '';
    if (responseBytes === null) responseBytes = utf8ByteLength_(text);
    if (responseBytes > GATE0_MAX_RESPONSE_BYTES) {
      return finishFetch_(metrics, false, 'RESPONSE_TOO_LARGE', 200, elapsedMs, responseBytes, null);
    }
  } catch (_err) {
    return finishFetch_(metrics, false, 'RESPONSE_READ_ERROR', 200, elapsedMs, 0, null);
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (_err) {
    return finishFetch_(metrics, false, 'INVALID_JSON', 200, elapsedMs, responseBytes, null);
  }
  return finishFetch_(metrics, true, 'PASS', 200, elapsedMs, responseBytes, parsed);
}

function inspectPageItems_(descriptor, items, priorKeys) {
  const pageKeys = Object.create(null);
  let outOfScopeCount = 0;
  let localityMismatchCount = 0;
  let missingKeyCount = 0;
  let intraPageDuplicateCount = 0;
  let crossPageDuplicateCount = 0;

  for (let i = 0; i < items.length; i++) {
    const row = items[i];
    const scopeCheck = descriptor.inspectScope(row);
    if (scopeCheck.outOfScope) outOfScopeCount += 1;
    if (scopeCheck.localityMismatch) localityMismatchCount += 1;

    if (descriptor.hasStableKey) {
      const key = descriptor.extractKey(row);
      if (key === null) {
        missingKeyCount += 1;
      } else {
        if (pageKeys[key]) intraPageDuplicateCount += 1;
        else pageKeys[key] = true;
        if (priorKeys && priorKeys[key]) crossPageDuplicateCount += 1;
      }
    }
  }

  return {
    outOfScopeCount: outOfScopeCount,
    localityMismatchCount: localityMismatchCount,
    missingKeyCount: missingKeyCount,
    intraPageDuplicateCount: intraPageDuplicateCount,
    crossPageDuplicateCount: descriptor.hasStableKey ? crossPageDuplicateCount : null,
    keys: pageKeys,
  };
}

function makeFailedBaselineCheck_(res, statusOverride) {
  return {
    httpStatus: res.httpStatus,
    status: statusOverride || res.status,
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

function makeFailedPage2Check_(res, statusOverride) {
  return {
    httpStatus: res.httpStatus,
    status: statusOverride || res.status,
    elapsedMs: res.elapsedMs,
    responseBytes: res.responseBytes,
    envelopeValid: false,
    itemsReturned: 0,
    reportedTotal: null,
    totalStable: false,
    duplicateKeysAcrossPages: null,
    scopeStatus: 'NOT_EVALUATED',
    outOfScopeCount: 0,
    localityMismatchCount: 0,
  };
}

function makeEndpointReport_(endpoint, protocol, status, baselineCheck, page2Check, pageSizeProbes, recommendedPageSize) {
  return {
    endpoint: endpoint,
    paginationProtocol: protocol,
    status: status,
    baselineCheck: baselineCheck,
    page2Check: page2Check,
    pageSizeProbes: pageSizeProbes,
    recommendedPageSize: recommendedPageSize,
  };
}

function classifyInspectionStatus_(inspection, checkCrossPage) {
  if (inspection.outOfScopeCount > 0) return { status: 'OUT_OF_SCOPE', scopeStatus: 'OUT_OF_SCOPE' };
  if (inspection.missingKeyCount > 0) return { status: 'MISSING_SOURCE_KEY', scopeStatus: 'PASS' };
  if (checkCrossPage && inspection.crossPageDuplicateCount > 0) {
    return { status: 'DUPLICATE_KEYS_ACROSS_PAGES', scopeStatus: 'PASS' };
  }
  if (inspection.intraPageDuplicateCount > 0) return { status: 'DUPLICATE_SOURCE_KEY', scopeStatus: 'PASS' };
  return { status: 'PASS', scopeStatus: 'PASS' };
}

function classifyGate0Failure_(status) {
  if (hasOwn_(GATE0_FAILURE_OUTCOMES, status)) return GATE0_FAILURE_OUTCOMES[status];
  return {
    overallStatus: 'FAILED',
    recommendation: 'NO_GO_CONTRACT_MISMATCH',
    haltRun: false,
  };
}

function probeUnpaginatedEndpoint_(endpoint, descriptor, token, metrics) {
  const res = executeAllowlistedGet_({ endpoint: endpoint }, token, metrics);
  if (!res.ok) {
    return makeEndpointReport_(endpoint, 'none', res.status, makeFailedBaselineCheck_(res), null, [], null);
  }
  if (!hasExactKeys_(res.data, ['items']) || !Array.isArray(res.data.items)) {
    return makeEndpointReport_(
      endpoint,
      'none',
      'INVALID_ENVELOPE',
      makeFailedBaselineCheck_(res, 'INVALID_ENVELOPE'),
      null,
      [],
      null,
    );
  }

  const inspection = inspectPageItems_(descriptor, res.data.items, null);
  const verdict = classifyInspectionStatus_(inspection, false);
  return makeEndpointReport_(
    endpoint,
    'none',
    verdict.status,
    {
      httpStatus: 200,
      status: verdict.status,
      elapsedMs: res.elapsedMs,
      responseBytes: res.responseBytes,
      envelopeValid: true,
      itemsReturned: res.data.items.length,
      reportedTotal: null,
      effectivePageSize: null,
      scopeStatus: verdict.scopeStatus,
      outOfScopeCount: inspection.outOfScopeCount,
      localityMismatchCount: inspection.localityMismatchCount,
    },
    null,
    [],
    null,
  );
}

function probePaginatedEndpoint_(endpoint, descriptor, token, candidatePageSizes, metrics) {
  const parser = GATE0_PAGINATION_PARSERS[descriptor.pagination];
  const isOffset = descriptor.pagination === 'offset';
  const baselineSize = candidatePageSizes.indexOf(10) !== -1 ? 10 : candidatePageSizes[0];
  const page1Cursor = isOffset ? 0 : 1;

  const baseRes = executeAllowlistedGet_(
    { endpoint: endpoint, page: 1, pageSize: baselineSize, offset: 0 },
    token,
    metrics,
  );
  if (!baseRes.ok) {
    return makeEndpointReport_(endpoint, descriptor.pagination, baseRes.status, makeFailedBaselineCheck_(baseRes), null, [], null);
  }

  const baseParsed = parser(baseRes.data);
  if (!baseParsed.ok) {
    return makeEndpointReport_(
      endpoint,
      descriptor.pagination,
      'INVALID_ENVELOPE',
      makeFailedBaselineCheck_(baseRes, 'INVALID_ENVELOPE'),
      null,
      [],
      null,
    );
  }

  const expectedBaseItems = Math.min(baseParsed.effectivePageSize, Math.max(0, baseParsed.reportedTotal));
  const baseInspect = inspectPageItems_(descriptor, baseParsed.items, null);
  let baseStatus = 'PASS';
  let baseScopeStatus = 'PASS';
  if (baseParsed.returnedCursor !== page1Cursor || baseParsed.effectivePageSize !== baselineSize) {
    baseStatus = 'INVALID_ENVELOPE';
  } else if (baseParsed.items.length !== expectedBaseItems) {
    baseStatus = 'ROW_COUNT_MISMATCH';
  } else {
    const verdict = classifyInspectionStatus_(baseInspect, false);
    baseStatus = verdict.status;
    baseScopeStatus = verdict.scopeStatus;
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
    return makeEndpointReport_(endpoint, descriptor.pagination, baseStatus, baselineCheck, null, [], null);
  }

  let page2Check;
  let endpointStatus = 'PASS';
  if (baseParsed.reportedTotal <= baseParsed.items.length) {
    page2Check = { status: 'SKIPPED_SINGLE_PAGE', reason: 'TOTAL_FITS_IN_PAGE_1' };
  } else {
    const reqPage = isOffset ? 1 : 2;
    const reqOffset = isOffset ? baselineSize : 0;
    const expectedCursor2 = isOffset ? baselineSize : 2;
    const p2Res = executeAllowlistedGet_(
      { endpoint: endpoint, page: reqPage, pageSize: baselineSize, offset: reqOffset },
      token,
      metrics,
    );

    if (!p2Res.ok) {
      endpointStatus = p2Res.status;
      page2Check = makeFailedPage2Check_(p2Res);
    } else {
      const p2Parsed = parser(p2Res.data);
      if (!p2Parsed.ok) {
        endpointStatus = 'INVALID_ENVELOPE';
        page2Check = makeFailedPage2Check_(p2Res, 'INVALID_ENVELOPE');
      } else {
        const totalStable = p2Parsed.reportedTotal === baseParsed.reportedTotal;
        const expectedP2Items = Math.min(baselineSize, Math.max(0, p2Parsed.reportedTotal - baselineSize));
        const p2Inspect = inspectPageItems_(descriptor, p2Parsed.items, baseInspect.keys);
        let p2Status = 'PASS';
        let p2ScopeStatus = 'PASS';
        if (!totalStable) {
          p2Status = 'SOURCE_TOTAL_CHANGED';
        } else if (p2Parsed.returnedCursor !== expectedCursor2 || p2Parsed.effectivePageSize !== baselineSize) {
          p2Status = 'INVALID_ENVELOPE';
        } else if (p2Parsed.items.length !== expectedP2Items) {
          p2Status = 'ROW_COUNT_MISMATCH';
        } else {
          const p2Verdict = classifyInspectionStatus_(p2Inspect, descriptor.hasStableKey);
          p2Status = p2Verdict.status;
          p2ScopeStatus = p2Verdict.scopeStatus;
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
    return makeEndpointReport_(endpoint, descriptor.pagination, endpointStatus, baselineCheck, page2Check, [], null);
  }

  const pageSizeProbes = [];
  let recommendedPageSize = baselineSize;

  for (let i = 0; i < candidatePageSizes.length; i++) {
    const reqSize = candidatePageSizes[i];
    if (reqSize === baselineSize) continue;

    const sizeRes = executeAllowlistedGet_(
      { endpoint: endpoint, page: 1, pageSize: reqSize, offset: 0 },
      token,
      metrics,
    );
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

    const sizeInspect = inspectPageItems_(descriptor, sizeParsed.items, null);
    const sizeVerdict = classifyInspectionStatus_(sizeInspect, false);
    const expectedCount = Math.min(sizeParsed.effectivePageSize, Math.max(0, sizeParsed.reportedTotal));
    let behavior;
    if (sizeVerdict.status === 'OUT_OF_SCOPE') {
      behavior = 'SCOPE_FAILED';
      endpointStatus = 'OUT_OF_SCOPE';
    } else if (sizeVerdict.status === 'MISSING_SOURCE_KEY') {
      behavior = 'MISSING_SOURCE_KEY';
      endpointStatus = 'MISSING_SOURCE_KEY';
    } else if (sizeVerdict.status === 'DUPLICATE_SOURCE_KEY') {
      behavior = 'DUPLICATE_SOURCE_KEY';
      endpointStatus = 'DUPLICATE_SOURCE_KEY';
    } else if (sizeParsed.items.length !== expectedCount) {
      behavior = 'ROW_COUNT_MISMATCH';
    } else if (sizeParsed.effectivePageSize === reqSize) {
      behavior = 'HONORED';
      if (reqSize > recommendedPageSize) recommendedPageSize = reqSize;
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
    if (endpointStatus !== 'PASS') break;
  }

  return makeEndpointReport_(
    endpoint,
    descriptor.pagination,
    endpointStatus,
    baselineCheck,
    page2Check,
    pageSizeProbes,
    endpointStatus === 'PASS' ? recommendedPageSize : null,
  );
}

function buildQuotaSummary_(metrics) {
  const avgLatencyMs = metrics.totalRequests > 0 ? Math.round(metrics.totalLatencyMs / metrics.totalRequests) : 0;
  const effectiveLatencyMs = Math.max(250, metrics.maxLatencyMs);
  const rawSuggested = Math.floor(GATE0_TARGET_BATCH_MS / (effectiveLatencyMs * 2));
  const suggestedSequentialBatchPages = Math.max(1, Math.min(50, rawSuggested));
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
  try {
    if (!isValidGate0Bearer_(token)) {
      return buildGate0ErrorReport_('INVALID_TOKEN_FORMAT', 'NO_GO_AUTH_RETRY_TOKEN');
    }
    const normalized = normalizeGate0Options_(options);
    if (!normalized.ok) {
      return buildGate0ErrorReport_('INVALID_OPTIONS', 'NO_GO_CONTRACT_MISMATCH');
    }

    const runStartedAt = Date.now();
    const metrics = { totalRequests: 0, totalLatencyMs: 0, maxLatencyMs: 0, maxResponseBytes: 0 };
    const endpointResults = [];
    let overallStatus = 'PASS';
    let goNoGoRecommendation = 'GO_CANDIDATE';

    for (let i = 0; i < normalized.endpoints.length; i++) {
      const endpoint = normalized.endpoints[i];
      const descriptor = GATE0_ENDPOINTS[endpoint];
      const epResult =
        descriptor.pagination === 'none'
          ? probeUnpaginatedEndpoint_(endpoint, descriptor, token, metrics)
          : probePaginatedEndpoint_(endpoint, descriptor, token, normalized.candidatePageSizes, metrics);
      endpointResults.push(epResult);

      if (epResult.status !== 'PASS') {
        const outcome = classifyGate0Failure_(epResult.status);
        if (overallStatus === 'PASS' || outcome.haltRun) {
          overallStatus = outcome.overallStatus;
          goNoGoRecommendation = outcome.recommendation;
        }
        if (outcome.haltRun) break;
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
  } catch (_err) {
    return buildGate0ErrorReport_('PROBE_ERROR', 'NO_GO_CONTRACT_MISMATCH');
  }
}
