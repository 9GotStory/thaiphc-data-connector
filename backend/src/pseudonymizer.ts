import type { DatasetEndpoint, SyncPlatform } from './types.ts';

/**
 * Exact canonical 32-byte standard Base64 pattern:
 * 32 bytes = 256 bits -> 42 chars (252 bits) + 1 char with top 4 bits used and bottom 2 bits zero
 * (alphabet indices divisible by 4: A,E,I,M,Q,U,Y,c,g,k,o,s,w,0,4,8) + '='.
 */
export const CANONICAL_HMAC_KEY_B64_PATTERN = /^[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=$/;
export const F010_PSEUDONYM_DERIVE_CONTEXT = 'THAIPHC_F010_PSEUDONYM_DERIVE_5406';
export const F010_REDACTED_REPORT_VERSION = 'THAIPHC_REDACTED_REPORT_V1';
export const PSEUDONYMOUS_KEY_PATTERN = /^h1_[a-f0-9]{64}$/;
export const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/;

export function bytesToHex(bytes: readonly number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    const unsigned = ((bytes[i] % 256) + 256) % 256;
    out += unsigned < 16 ? `0${unsigned.toString(16)}` : unsigned.toString(16);
  }
  return out;
}

export function isCanonicalHmacKeySyntax(raw: string | null): raw is string {
  return typeof raw === 'string' && CANONICAL_HMAC_KEY_B64_PATTERN.test(raw);
}

export type HmacCryptoPrimitives = Pick<
  SyncPlatform,
  'base64Decode' | 'base64Encode' | 'hmacSha256Bytes'
>;

export interface F010Pseudonymizer {
  deriveKey(endpoint: DatasetEndpoint, rawId: string): string;
}

export type PseudonymizerInitResult =
  | { ok: true; pseudonymizer: F010Pseudonymizer }
  | { ok: false; code: 'MISSING_HMAC_KEY'; message: string };

/**
 * Initializes the F010 two-step HMAC-SHA256 pseudonymizer from GAS Script Properties
 * (`THAIPHC_HMAC_KEY_B64`), failing closed if missing or malformed without echoing key material.
 *
 * Step 1: derivedKey = HMAC-SHA256(key = base64Decode(THAIPHC_HMAC_KEY_B64), msg = "THAIPHC_F010_PSEUDONYM_DERIVE_5406")
 * Step 2: h1_<hex>   = HMAC-SHA256(key = derivedKey, msg = "THAIPHC_REDACTED_REPORT_V1\0<endpoint>\0<id>")
 */
export function createF010Pseudonymizer(
  rawKeyB64: string | null,
  crypto: HmacCryptoPrimitives,
): PseudonymizerInitResult {
  if (!isCanonicalHmacKeySyntax(rawKeyB64)) {
    return {
      ok: false,
      code: 'MISSING_HMAC_KEY',
      message:
        'THAIPHC_HMAC_KEY_B64 is missing or malformed in Google Apps Script Properties (requires canonical 32-byte Base64).',
    };
  }

  let masterKeyBytes: number[];
  try {
    masterKeyBytes = crypto.base64Decode(rawKeyB64);
    if (
      !Array.isArray(masterKeyBytes) ||
      masterKeyBytes.length !== 32 ||
      crypto.base64Encode(masterKeyBytes) !== rawKeyB64
    ) {
      return {
        ok: false,
        code: 'MISSING_HMAC_KEY',
        message:
          'THAIPHC_HMAC_KEY_B64 failed canonical 32-byte Base64 verification in Google Apps Script Properties.',
      };
    }
  } catch {
    return {
      ok: false,
      code: 'MISSING_HMAC_KEY',
      message:
        'THAIPHC_HMAC_KEY_B64 could not be decoded as canonical 32-byte Base64 in Google Apps Script Properties.',
    };
  }

  // Step 1: derive domain-separated 32-byte pseudonym subkey once per execution
  const derivedKeyBytes = crypto.hmacSha256Bytes(F010_PSEUDONYM_DERIVE_CONTEXT, masterKeyBytes);
  if (!Array.isArray(derivedKeyBytes) || derivedKeyBytes.length !== 32) {
    return {
      ok: false,
      code: 'MISSING_HMAC_KEY',
      message: 'Failed to derive F010 pseudonym subkey from THAIPHC_HMAC_KEY_B64.',
    };
  }

  return {
    ok: true,
    pseudonymizer: {
      deriveKey(endpoint: DatasetEndpoint, rawId: string): string {
        const message = `${F010_REDACTED_REPORT_VERSION}\u0000${endpoint}\u0000${rawId}`;
        const mac = crypto.hmacSha256Bytes(message, derivedKeyBytes);
        return `h1_${bytesToHex(mac)}`;
      },
    },
  };
}
