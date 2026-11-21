import type {
  HttpFetchOptions,
  HttpFetchResponse,
  PreviewStopCode,
  ReferenceDatasetEndpoint,
} from './types.ts';

export const THAIPHC_ALLOWED_ORIGIN = 'https://api-thaiphc.hss.moph.go.th';
export const GEO_SCOPE_PROVINCE = '54';
export const GEO_SCOPE_DISTRICT = '5406';
export const DEFAULT_PAGE_SIZE = 100;
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
const MAX_OFFSET_PAGES = 15;
const BEARER_TOKEN_PATTERN = /^[A-Za-z0-9._~+/-]+={0,}$/;

const HEALTH_SERVICE_TYPE_EXCLUSIONS = [
  '7310dd94-0395-48cb-845b-803279a54f6c',
  '96ca3348-49c2-4d89-903b-32939fd1c95c',
  'f464d614-c20e-4391-84a9-4c8edb7982a9',
] as const;

export type FetchUrlFn = (url: string, options: HttpFetchOptions) => HttpFetchResponse;

export type ReferenceFetchResult =
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

export function buildReferenceRequestUrl(
  endpoint: ReferenceDatasetEndpoint,
  offset = 0,
  pageSize = DEFAULT_PAGE_SIZE,
): string {
  let path: string;
  let pairs: Array<readonly [string, string]>;

  if (endpoint === 'subdistricts') {
    path = '/api/v1/lookups/subdistricts';
    pairs = [['district_code', GEO_SCOPE_DISTRICT]];
  } else if (endpoint === 'villages') {
    path = '/api/v1/lookups/villages';
    pairs = [
      ['province_code', GEO_SCOPE_PROVINCE],
      ['district_code', GEO_SCOPE_DISTRICT],
    ];
  } else {
    path = '/api/v1/geo-management/health-services';
    pairs = [
      ['limit', String(pageSize)],
      ['offset', String(offset)],
      ...HEALTH_SERVICE_TYPE_EXCLUSIONS.map(
        (id) => ['health_service_type_ids_exclude', id] as const,
      ),
      ['province_code', GEO_SCOPE_PROVINCE],
      ['district_code', GEO_SCOPE_DISTRICT],
    ];
  }

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

export function fetchReferenceDataset(
  endpoint: ReferenceDatasetEndpoint,
  token: string,
  fetchUrl: FetchUrlFn,
  requestedPageSize = DEFAULT_PAGE_SIZE,
): ReferenceFetchResult {
  const pageSize =
    Number.isSafeInteger(requestedPageSize) && requestedPageSize >= 1 && requestedPageSize <= 100
      ? requestedPageSize
      : DEFAULT_PAGE_SIZE;

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
