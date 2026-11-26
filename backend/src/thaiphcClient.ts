import { hasAsciiControlChar } from './cellValidation.ts';
import {
  ASSIGNMENTS_SCHEMA,
  LARGE_KEYED_SCHEMAS,
  VOLUNTEER_FAMILY_SCHEMA,
  VOLUNTEER_GENDER_SCHEMA,
} from './datasetCatalog.ts';
import type {
  HttpFetchOptions,
  HttpFetchResponse,
  LargeKeyedDatasetEndpoint,
  PreviewStopCode,
  ReferenceDatasetEndpoint,
  SmallKeyedDatasetEndpoint,
} from './types.ts';

export const THAIPHC_ALLOWED_ORIGIN = 'https://api-thaiphc.hss.moph.go.th';
export const GEO_SCOPE_PROVINCE = '54';
export const GEO_SCOPE_DISTRICT = '5406';
export const DEFAULT_PAGE_SIZE = 100;
export const DEFAULT_BATCH_PAGES = 10;
export const MAX_BATCH_PAGES = 20;
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
const MAX_OFFSET_PAGES = 15;
const MAX_REPORT_PAGES = 250;
const MAX_ASSIGNMENT_PAGES = 250;
const BEARER_TOKEN_PATTERN = /^[A-Za-z0-9._~+/-]+={0,}$/;

const HEALTH_SERVICE_TYPE_EXCLUSIONS = [
  '7310dd94-0395-48cb-845b-803279a54f6c',
  '96ca3348-49c2-4d89-903b-32939fd1c95c',
  'f464d614-c20e-4391-84a9-4c8edb7982a9',
] as const;

export type FetchUrlFn = (url: string, options: HttpFetchOptions) => HttpFetchResponse;

export type DatasetFetchResult =
  | {
      ok: true;
      items: unknown[];
      sourceTotal: number;
      pagesFetched: number;
    }
  | {
      ok: false;
      authFailed: true;
      code: 'HTTP_401';
      message: string;
      pagesFetched: number;
    }
  | {
      ok: false;
      authFailed: false;
      code: PreviewStopCode;
      message: string;
      pagesFetched: number;
      pageOffset?: number;
    };

export function isValidBearerToken(token: unknown): token is string {
  return (
    typeof token === 'string' &&
    token.length >= 16 &&
    token.length <= 8192 &&
    BEARER_TOKEN_PATTERN.test(token) &&
    !/^bearer\b/i.test(token)
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(obj: unknown, expected: readonly string[]): obj is Record<string, unknown> {
  if (!isPlainRecord(obj)) return false;
  const keys = Object.keys(obj);
  if (keys.length !== expected.length) return false;
  return expected.every((k) => Object.prototype.hasOwnProperty.call(obj, k));
}

function getHeaderCaseInsensitive(
  headers: Record<string, string | string[]>,
  targetName: string,
): string {
  const lower = targetName.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lower) {
      const value = headers[key];
      return Array.isArray(value) ? String(value[0] ?? '') : String(value ?? '');
    }
  }
  return '';
}

function encodePairs(pairs: ReadonlyArray<readonly [string, string]>): string {
  return pairs.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
}

function buildAllowlistedUrl(
  path: string,
  pairs: ReadonlyArray<readonly [string, string]>,
): string {
  const url = `${THAIPHC_ALLOWED_ORIGIN}${path}?${encodePairs(pairs)}`;
  if (
    !url.startsWith(`${THAIPHC_ALLOWED_ORIGIN}/api/v1/`) ||
    /[\s#@\\]/.test(url) ||
    url.includes('..')
  ) {
    throw new Error('REQUEST_SCOPE_REJECTED');
  }
  return url;
}

export function buildReferenceRequestUrl(
  endpoint: ReferenceDatasetEndpoint,
  offset = 0,
  pageSize = DEFAULT_PAGE_SIZE,
): string {
  if (endpoint === 'subdistricts') {
    return buildAllowlistedUrl('/api/v1/lookups/subdistricts', [
      ['district_code', GEO_SCOPE_DISTRICT],
    ]);
  }
  if (endpoint === 'villages') {
    return buildAllowlistedUrl('/api/v1/lookups/villages', [
      ['province_code', GEO_SCOPE_PROVINCE],
      ['district_code', GEO_SCOPE_DISTRICT],
    ]);
  }
  return buildAllowlistedUrl('/api/v1/geo-management/health-services', [
    ['limit', String(pageSize)],
    ['offset', String(offset)],
    ...HEALTH_SERVICE_TYPE_EXCLUSIONS.map((id) => ['health_service_type_ids_exclude', id] as const),
    ['province_code', GEO_SCOPE_PROVINCE],
    ['district_code', GEO_SCOPE_DISTRICT],
  ]);
}

export type ReportPaginatedEndpoint =
  'volunteer-gender' | 'volunteer-family' | 'resigned-volunteers' | 'volunteer-tenure';

export function buildReportRequestUrl(
  endpoint: ReportPaginatedEndpoint,
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
): string {
  const pairs: Array<readonly [string, string]> = [
    ['page', String(page)],
    ['pageSize', String(pageSize)],
  ];
  if (endpoint === 'resigned-volunteers' || endpoint === 'volunteer-tenure') {
    pairs.push(['provinceCode', GEO_SCOPE_PROVINCE], ['districtCode', GEO_SCOPE_DISTRICT]);
  }
  pairs.push(['province', GEO_SCOPE_PROVINCE], ['district', GEO_SCOPE_DISTRICT]);
  return buildAllowlistedUrl(`/api/v1/reports/${endpoint}`, pairs);
}

export function buildAssignmentRequestUrl(page = 1, pageSize = DEFAULT_PAGE_SIZE): string {
  return buildAllowlistedUrl('/api/v1/dashboard/assignments', [
    ['page', String(page)],
    ['pageSize', String(pageSize)],
    ['provinceCode', GEO_SCOPE_PROVINCE],
    ['districtCode', GEO_SCOPE_DISTRICT],
    ['osmStatus', ''],
    ['osm_status', ''],
    ['approval_status', 'approved'],
    ['order_by', 'approved_date'],
    ['sort_dir', 'desc'],
  ]);
}

export interface BatchFetchParams {
  token: string;
  fetchUrl: FetchUrlFn;
  startPage: number;
  batchPages?: number;
  pageSize?: number;
  expectedSourceTotal?: number | null;
  maxRows?: number;
}

export type LargeBatchFetchResult =
  | {
      ok: true;
      items: unknown[];
      startPage: number;
      lastPageFetched: number;
      pagesFetchedInBatch: number;
      totalPages: number;
      sourceTotal: number;
      hasMore: boolean;
      nextPage: number | null;
    }
  | {
      ok: false;
      authFailed: true;
      code: 'HTTP_401';
      message: string;
      pagesFetchedInBatch: number;
    }
  | {
      ok: false;
      authFailed: false;
      code: PreviewStopCode;
      message: string;
      pagesFetchedInBatch: number;
      pageOffset?: number;
      observedSourceTotal?: number;
    };

type PageEnvelopeValidationResult =
  | { ok: true; items: unknown[]; total: number; totalPages: number }
  | { ok: false; code: PreviewStopCode; message: string; observedSourceTotal?: number };

function validateAssignmentPageEnvelope(
  data: unknown,
  page: number,
  pageSize: number,
  maxRows: number,
  expectedTotal: number | null,
): PageEnvelopeValidationResult {
  const offset = (page - 1) * pageSize;
  if (
    !hasExactKeys(data, ['provinces', 'items', 'pagination']) ||
    !Array.isArray(data.provinces) ||
    !Array.isArray(data.items) ||
    !hasExactKeys(data.pagination, ['page', 'limit', 'total', 'pages'])
  ) {
    return {
      ok: false,
      code: 'INVALID_ENVELOPE',
      message:
        'ThaiPHC assignments pagination envelope did not match { provinces[], items[], pagination{ page, limit, total, pages } }.',
    };
  }

  const p = data.pagination;
  const pPage = p.page;
  const pLimit = p.limit;
  const pTotal = p.total;
  const pPages = p.pages;
  if (
    !Number.isSafeInteger(pPage) ||
    pPage !== page ||
    !Number.isSafeInteger(pLimit) ||
    pLimit !== pageSize ||
    !Number.isSafeInteger(pTotal) ||
    (pTotal as number) < 0 ||
    !Number.isSafeInteger(pPages) ||
    (pPages as number) < 0
  ) {
    return {
      ok: false,
      code: 'INVALID_ENVELOPE',
      message: 'ThaiPHC assignments pagination fields did not match requested page and pageSize.',
    };
  }

  const total = pTotal as number;
  const pages = pPages as number;
  const validPages =
    total === 0 ? pages === 0 || pages === 1 : pages === Math.ceil(total / pageSize);
  if (!validPages) {
    return {
      ok: false,
      code: 'INVALID_ENVELOPE',
      message: 'ThaiPHC assignments pagination.pages does not match ceil(total / limit).',
    };
  }

  if (total > maxRows) {
    return {
      ok: false,
      code: 'ROW_LIMIT_EXCEEDED',
      message: `ThaiPHC assignments total (${total}) exceeds maximum safe row limit (${maxRows}).`,
    };
  }

  if (expectedTotal !== null && total !== expectedTotal) {
    return {
      ok: false,
      code: 'SOURCE_TOTAL_CHANGED',
      message: 'ThaiPHC assignments source total changed mid-fetch between pages or batches.',
      observedSourceTotal: total,
    };
  }

  if (total === 0 || page > pages) {
    return {
      ok: false,
      code: 'INCOMPLETE_SNAPSHOT',
      message:
        'ThaiPHC assignments snapshot returned zero rows or requested page beyond total pages.',
    };
  }

  const expectedCount = Math.min(pageSize, Math.max(0, total - offset));
  if (data.items.length !== expectedCount) {
    return {
      ok: false,
      code: 'INCOMPLETE_SNAPSHOT',
      message: 'ThaiPHC assignments page item count did not match reported total and pageSize.',
    };
  }

  return { ok: true, items: data.items, total, totalPages: pages };
}

function fetchPaginatedBatch(
  params: BatchFetchParams,
  strategy: {
    endpointLabel: string;
    maxPages: number;
    defaultMaxRows: number;
    buildUrl: (page: number, pageSize: number) => string;
    validateEnvelope: (
      data: unknown,
      page: number,
      pageSize: number,
      maxRows: number,
      expectedTotal: number | null,
    ) => PageEnvelopeValidationResult;
  },
): LargeBatchFetchResult {
  const pageSize =
    params.pageSize !== undefined &&
    Number.isSafeInteger(params.pageSize) &&
    params.pageSize >= 1 &&
    params.pageSize <= 100
      ? params.pageSize
      : DEFAULT_PAGE_SIZE;
  const batchPages =
    params.batchPages !== undefined &&
    Number.isSafeInteger(params.batchPages) &&
    params.batchPages >= 1 &&
    params.batchPages <= MAX_BATCH_PAGES
      ? params.batchPages
      : DEFAULT_BATCH_PAGES;
  const maxRows = params.maxRows ?? strategy.defaultMaxRows;

  if (
    !Number.isSafeInteger(params.startPage) ||
    params.startPage < 1 ||
    params.startPage > strategy.maxPages
  ) {
    return {
      ok: false,
      authFailed: false,
      code: 'INCOMPLETE_SNAPSHOT',
      message: `Requested ${strategy.endpointLabel} startPage is out of valid range.`,
      pagesFetchedInBatch: 0,
    };
  }

  const items: unknown[] = [];
  let expectedTotal: number | null =
    params.expectedSourceTotal !== undefined && params.expectedSourceTotal !== null
      ? params.expectedSourceTotal
      : null;
  let totalPages = 0;
  let pagesFetchedInBatch = 0;
  let lastPageFetched = params.startPage - 1;
  const maxEndPage = Math.min(params.startPage + batchPages - 1, strategy.maxPages);

  for (let page = params.startPage; page <= maxEndPage; page++) {
    const offset = (page - 1) * pageSize;
    const url = strategy.buildUrl(page, pageSize);
    const res = executeAllowlistedGet(url, params.token, params.fetchUrl);
    pagesFetchedInBatch += 1;

    if (!res.ok) {
      if (res.authFailed) {
        return { ...res, pagesFetchedInBatch };
      }
      return { ...res, pagesFetchedInBatch, pageOffset: offset };
    }

    const validated = strategy.validateEnvelope(res.data, page, pageSize, maxRows, expectedTotal);
    if (!validated.ok) {
      return {
        ok: false,
        authFailed: false,
        code: validated.code,
        message: validated.message,
        pagesFetchedInBatch,
        pageOffset: offset,
        observedSourceTotal: validated.observedSourceTotal,
      };
    }

    expectedTotal = validated.total;
    totalPages = validated.totalPages;
    items.push(...validated.items);
    lastPageFetched = page;
    if (page >= totalPages) {
      break;
    }
  }

  if (expectedTotal === null || pagesFetchedInBatch === 0) {
    return {
      ok: false,
      authFailed: false,
      code: 'INCOMPLETE_SNAPSHOT',
      message: `ThaiPHC ${strategy.endpointLabel} batch ended without valid pagination metadata.`,
      pagesFetchedInBatch,
    };
  }

  const hasMore = lastPageFetched < totalPages;
  return {
    ok: true,
    items,
    startPage: params.startPage,
    lastPageFetched,
    pagesFetchedInBatch,
    totalPages,
    sourceTotal: expectedTotal,
    hasMore,
    nextPage: hasMore ? lastPageFetched + 1 : null,
  };
}

export function fetchAssignmentBatch(params: BatchFetchParams): LargeBatchFetchResult {
  return fetchPaginatedBatch(params, {
    endpointLabel: 'assignments',
    maxPages: MAX_ASSIGNMENT_PAGES,
    defaultMaxRows: ASSIGNMENTS_SCHEMA.maxRows,
    buildUrl: buildAssignmentRequestUrl,
    validateEnvelope: validateAssignmentPageEnvelope,
  });
}

type SingleGetOutcome =
  | { ok: true; data: unknown }
  | { ok: false; authFailed: true; code: 'HTTP_401'; message: string }
  | { ok: false; authFailed: false; code: PreviewStopCode; message: string };

function executeAllowlistedGet(url: string, token: string, fetchUrl: FetchUrlFn): SingleGetOutcome {
  if (!url.startsWith(`${THAIPHC_ALLOWED_ORIGIN}/api/v1/`)) {
    return {
      ok: false,
      authFailed: false,
      code: 'FETCH_EXCEPTION',
      message: 'Blocked request outside allowlisted ThaiPHC origin.',
    };
  }

  let response: HttpFetchResponse;
  try {
    response = fetchUrl(url, {
      method: 'get',
      followRedirects: false,
      muteHttpExceptions: true,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
  } catch {
    return {
      ok: false,
      authFailed: false,
      code: 'FETCH_EXCEPTION',
      message: 'ThaiPHC HTTP request failed before receiving a valid response.',
    };
  }

  const status = response.statusCode;
  if (!Number.isSafeInteger(status)) {
    return {
      ok: false,
      authFailed: false,
      code: 'HTTP_ERROR',
      message: 'Received an invalid HTTP status code from ThaiPHC.',
    };
  }
  if (status >= 300 && status < 400) {
    return {
      ok: false,
      authFailed: false,
      code: 'REDIRECT_REJECTED',
      message: `ThaiPHC returned HTTP ${status} redirect; redirects are forbidden to protect credentials.`,
    };
  }
  if (status === 401) {
    return {
      ok: false,
      authFailed: true,
      code: 'HTTP_401',
      message: 'ThaiPHC authentication failed (HTTP 401).',
    };
  }
  if (status === 403) {
    return {
      ok: false,
      authFailed: false,
      code: 'HTTP_403',
      message: 'ThaiPHC refused access (HTTP 403).',
    };
  }
  if (status !== 200) {
    return {
      ok: false,
      authFailed: false,
      code: 'HTTP_ERROR',
      message: `ThaiPHC returned unexpected HTTP status ${status}.`,
    };
  }

  const contentType = getHeaderCaseInsensitive(response.headers, 'content-type').toLowerCase();
  if (!/^application\/(?:json|[a-z0-9.+-]+\+json)(?:\s*;|$)/.test(contentType)) {
    return {
      ok: false,
      authFailed: false,
      code: 'UNEXPECTED_CONTENT_TYPE',
      message: 'ThaiPHC response Content-Type is not application/json.',
    };
  }

  if (response.byteLength > MAX_RESPONSE_BYTES) {
    return {
      ok: false,
      authFailed: false,
      code: 'RESPONSE_TOO_LARGE',
      message: 'ThaiPHC response exceeded maximum allowed payload size.',
    };
  }

  try {
    return { ok: true, data: JSON.parse(response.contentText) };
  } catch {
    return {
      ok: false,
      authFailed: false,
      code: 'INVALID_JSON',
      message: 'ThaiPHC response body is not valid JSON.',
    };
  }
}

function validateReportPageEnvelope(
  endpoint: ReportPaginatedEndpoint,
  data: unknown,
  page: number,
  pageSize: number,
  maxRows: number,
  expectedTotal: number | null,
):
  | { ok: true; items: unknown[]; total: number; totalPages: number }
  | { ok: false; code: PreviewStopCode; message: string; observedSourceTotal?: number } {
  const offset = (page - 1) * pageSize;
  if (
    !hasExactKeys(data, ['success', 'message', 'items', 'total', 'page', 'pageSize']) ||
    data.success !== true ||
    typeof data.message !== 'string' ||
    data.message.length > 256 ||
    hasAsciiControlChar(data.message) ||
    !Array.isArray(data.items) ||
    !Number.isSafeInteger(data.total) ||
    (data.total as number) < 0 ||
    !Number.isSafeInteger(data.page) ||
    data.page !== page ||
    !Number.isSafeInteger(data.pageSize) ||
    data.pageSize !== pageSize
  ) {
    return {
      ok: false,
      code: 'INVALID_ENVELOPE',
      message:
        'ThaiPHC report pagination envelope did not match { success: true, message, items, total, page, pageSize }.',
    };
  }

  const total = data.total as number;
  if (total > maxRows) {
    return {
      ok: false,
      code: 'ROW_LIMIT_EXCEEDED',
      message: `ThaiPHC report total (${total}) exceeds maximum safe row limit (${maxRows}) for ${endpoint}.`,
    };
  }

  if (expectedTotal !== null && total !== expectedTotal) {
    return {
      ok: false,
      code: 'SOURCE_TOTAL_CHANGED',
      message: `ThaiPHC ${endpoint} source total changed mid-fetch between pages or batches.`,
      observedSourceTotal: total,
    };
  }

  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  if (total === 0 || page > totalPages) {
    return {
      ok: false,
      code: 'INCOMPLETE_SNAPSHOT',
      message: `ThaiPHC report snapshot returned zero rows or requested page beyond total pages for ${endpoint}.`,
    };
  }

  const expectedCount = Math.min(pageSize, Math.max(0, total - offset));
  if (data.items.length !== expectedCount) {
    return {
      ok: false,
      code: 'INCOMPLETE_SNAPSHOT',
      message: 'ThaiPHC report page item count did not match reported total and pageSize.',
    };
  }

  return { ok: true, items: data.items, total, totalPages };
}

export function fetchReportBatch(
  params: BatchFetchParams & { endpoint: Exclude<ReportPaginatedEndpoint, 'volunteer-gender'> },
): LargeBatchFetchResult {
  return fetchPaginatedBatch(params, {
    endpointLabel: params.endpoint,
    maxPages: MAX_REPORT_PAGES,
    defaultMaxRows: 2500,
    buildUrl: (page, pageSize) => buildReportRequestUrl(params.endpoint, page, pageSize),
    validateEnvelope: (data, page, pageSize, maxRows, expectedTotal) =>
      validateReportPageEnvelope(params.endpoint, data, page, pageSize, maxRows, expectedTotal),
  });
}

export function fetchLargeKeyedBatch(
  params: BatchFetchParams & { endpoint: LargeKeyedDatasetEndpoint },
): LargeBatchFetchResult {
  const maxRows = params.maxRows ?? LARGE_KEYED_SCHEMAS[params.endpoint].maxRows;
  if (params.endpoint === 'assignments') {
    return fetchAssignmentBatch({ ...params, maxRows });
  }
  return fetchReportBatch({ ...params, endpoint: params.endpoint, maxRows });
}

export function fetchVolunteerFamilyBatch(params: BatchFetchParams): LargeBatchFetchResult {
  return fetchReportBatch({
    ...params,
    endpoint: 'volunteer-family',
    maxRows: params.maxRows ?? VOLUNTEER_FAMILY_SCHEMA.maxRows,
  });
}

function fetchReportPaginatedDataset(
  endpoint: 'volunteer-gender',
  token: string,
  fetchUrl: FetchUrlFn,
  pageSize: number,
  maxRows: number,
): DatasetFetchResult {
  const items: unknown[] = [];
  let expectedTotal: number | null = null;
  let pagesFetched = 0;

  for (let page = 1; page <= MAX_REPORT_PAGES; page++) {
    const offset = (page - 1) * pageSize;
    const url = buildReportRequestUrl(endpoint, page, pageSize);
    const res = executeAllowlistedGet(url, token, fetchUrl);
    pagesFetched += 1;

    if (!res.ok) {
      if (res.authFailed) {
        return { ...res, pagesFetched };
      }
      return { ...res, pagesFetched, pageOffset: offset };
    }

    const validated = validateReportPageEnvelope(
      endpoint,
      res.data,
      page,
      pageSize,
      maxRows,
      expectedTotal,
    );
    if (!validated.ok) {
      return {
        ok: false,
        authFailed: false,
        code: validated.code,
        message: validated.message,
        pagesFetched,
        pageOffset: offset,
      };
    }

    expectedTotal = validated.total;
    items.push(...validated.items);
    if (items.length >= expectedTotal) {
      break;
    }
  }

  if (expectedTotal === null || items.length === 0 || items.length !== expectedTotal) {
    return {
      ok: false,
      authFailed: false,
      code: 'INCOMPLETE_SNAPSHOT',
      message: 'ThaiPHC report pagination ended before collecting the complete snapshot.',
      pagesFetched,
    };
  }

  return {
    ok: true,
    items,
    sourceTotal: expectedTotal,
    pagesFetched,
  };
}

export function fetchSmallKeyedDataset(
  endpoint: SmallKeyedDatasetEndpoint,
  token: string,
  fetchUrl: FetchUrlFn,
  requestedPageSize = DEFAULT_PAGE_SIZE,
): DatasetFetchResult {
  const pageSize =
    Number.isSafeInteger(requestedPageSize) && requestedPageSize >= 1 && requestedPageSize <= 100
      ? requestedPageSize
      : DEFAULT_PAGE_SIZE;

  if (endpoint === 'volunteer-gender') {
    return fetchReportPaginatedDataset(
      endpoint,
      token,
      fetchUrl,
      pageSize,
      VOLUNTEER_GENDER_SCHEMA.maxRows,
    );
  }

  if (endpoint === 'subdistricts' || endpoint === 'villages') {
    const url = buildReferenceRequestUrl(endpoint);
    const res = executeAllowlistedGet(url, token, fetchUrl);
    if (!res.ok) {
      return { ...res, pagesFetched: 1 };
    }
    if (!hasExactKeys(res.data, ['items']) || !Array.isArray(res.data.items)) {
      return {
        ok: false,
        authFailed: false,
        code: 'INVALID_ENVELOPE',
        message: 'ThaiPHC lookup response did not match expected { items } envelope.',
        pagesFetched: 1,
      };
    }
    if (res.data.items.length === 0) {
      return {
        ok: false,
        authFailed: false,
        code: 'INCOMPLETE_PAGINATION',
        message: 'ThaiPHC lookup response returned zero records.',
        pagesFetched: 1,
      };
    }
    return {
      ok: true,
      items: res.data.items,
      sourceTotal: res.data.items.length,
      pagesFetched: 1,
    };
  }

  // Offset pagination for health-services
  const items: unknown[] = [];
  let expectedTotal: number | null = null;
  let pagesFetched = 0;

  for (let page = 0; page < MAX_OFFSET_PAGES; page++) {
    const offset = page * pageSize;
    const url = buildReferenceRequestUrl('health-services', offset, pageSize);
    const res = executeAllowlistedGet(url, token, fetchUrl);
    pagesFetched += 1;

    if (!res.ok) {
      if (res.authFailed) {
        return { ...res, pagesFetched };
      }
      return { ...res, pagesFetched, pageOffset: offset };
    }

    const data = res.data;
    if (
      !hasExactKeys(data, ['items', 'total', 'limit', 'offset']) ||
      !Array.isArray(data.items) ||
      !Number.isSafeInteger(data.total) ||
      (data.total as number) < 0 ||
      !Number.isSafeInteger(data.limit) ||
      data.limit !== pageSize ||
      !Number.isSafeInteger(data.offset) ||
      data.offset !== offset
    ) {
      return {
        ok: false,
        authFailed: false,
        code: 'INVALID_ENVELOPE',
        message:
          'ThaiPHC offset pagination envelope did not match { items, total, limit, offset }.',
        pagesFetched,
        pageOffset: offset,
      };
    }

    const total = data.total as number;
    if (expectedTotal !== null && total !== expectedTotal) {
      return {
        ok: false,
        authFailed: false,
        code: 'SOURCE_TOTAL_DRIFT',
        message: 'ThaiPHC source total changed between pagination requests.',
        pagesFetched,
        pageOffset: offset,
      };
    }
    expectedTotal = total;

    const expectedCount = Math.min(pageSize, Math.max(0, total - offset));
    if (data.items.length !== expectedCount) {
      return {
        ok: false,
        authFailed: false,
        code: 'INCOMPLETE_PAGINATION',
        message: 'ThaiPHC page item count did not match reported total and offset.',
        pagesFetched,
        pageOffset: offset,
      };
    }

    items.push(...data.items);
    if (items.length >= total) {
      break;
    }
  }

  if (expectedTotal === null || items.length === 0 || items.length !== expectedTotal) {
    return {
      ok: false,
      authFailed: false,
      code: 'INCOMPLETE_PAGINATION',
      message: 'ThaiPHC offset pagination ended before reaching reported source total.',
      pagesFetched,
    };
  }

  return {
    ok: true,
    items,
    sourceTotal: expectedTotal,
    pagesFetched,
  };
}
