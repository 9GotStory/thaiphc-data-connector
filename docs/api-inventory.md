# ThaiPHC API Inventory — observed response baseline

**Status:** Observation-only; based on examples supplied on 2026-10-20. Not an official contract.
**Scope:** Phrae province `54`, Song district `5406`.

| # | Method | Path | Observed response | Count reported |
|---|---|---|---|---:|
| 1 | GET | `/api/v1/dashboard/assignments` | `provinces[]`, `items[]`, `pagination{}` | 1,571 assignments |
| 2 | GET | `/api/v1/lookups/subdistricts` | `items[]` | 8 subdistricts |
| 3 | GET | `/api/v1/lookups/villages` | `items[]` | 85 villages |
| 4 | GET | `/api/v1/geo-management/health-services` | `items[]`, `total`, `limit`, `offset` | 18 health services; 10 seen |
| 5 | GET | `/api/v1/reports/volunteer-gender` | `success`, `message`, `items[]`, `total`, `page`, `pageSize` | 85 village rows |
| 6 | GET | `/api/v1/reports/volunteer-family` | same report envelope | 1,803 report rows |
| 7 | GET | `/api/v1/reports/resigned-volunteers` | same report envelope | 1,150 report rows |
| 8 | GET | `/api/v1/reports/volunteer-tenure` | same report envelope | 1,571 report rows |

Field-by-field observed types, nullability, and query parameters are recorded in `docs/schemas/*_schema.md`.

## Important limitations
- Totals are reported by the provided API responses, **not independently fetched/verified across all pages**.
- `assignments` was observed with a bearer Authorization header in a signed-in browser. Authentication behavior of each other endpoint is unverified.
- Query naming differs between endpoints (`provinceCode` vs `province` vs `province_code`).
- The family report sample contains inconsistent subdistrict/village codes. Do not silently correct source fields.
- `health-services` includes nested `service_areas[]`; do not flatten prematurely.
- User-provided reports contained personal data. **No unredacted response files belong in Git.**
