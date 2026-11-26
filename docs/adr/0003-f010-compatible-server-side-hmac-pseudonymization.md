# Retain F010 Two-Step HMAC Pseudonymization Key in GAS Script Properties

Status: accepted

Retiring the Node.js CLI and Windows DPAPI removes the need for HMAC authentication on HTTP requests between Node and GAS, which could tempt a redesign to drop `THAIPHC_HMAC_KEY_B64` or switch to raw source IDs. We decided to keep `THAIPHC_HMAC_KEY_B64` in GAS Script Properties and compute the exact F010 two-step domain-separated pseudonym (`THAIPHC_F010_PSEUDONYM_DERIVE_5406` → `h1_<HMAC-SHA256>`) server-side via `Utilities.computeHmacSha256Signature` for `assignments`, `resigned-volunteers`, and `volunteer-tenure`. This preserves byte-for-byte key compatibility with any prior F010 records, prevents duplicate person rows across repeatable syncs, and ensures direct PII and secret keys never reach Google Sheets or the React client.

## Consequences

- Before migrating a workbook that already contains F010 records, the operator must verify that `THAIPHC_HMAC_KEY_B64` in the new GAS project matches the existing key; rotating the key would cause existing pseudonymized rows to mismatch and duplicate.
- Raw PII fields (`RESTRICTED_DEFAULT_OMIT`) and `THAIPHC_HMAC_KEY_B64` are strictly confined to GAS server execution memory and must never be returned to React or logged (`exceptionLogging: "NONE"`).
