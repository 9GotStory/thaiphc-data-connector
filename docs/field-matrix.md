# Cross-Endpoint Field Matrix — ThaiPHC T002

> This is an **observed sample matrix**, transcribed from the eight T001 schema documents. Types and null observations are **not** guaranteed API contracts. All references are from user-provided examples on 2026-10-20; no live API calls were made.

### Coverage

| API | Observed `items[]` / nested paths | Notes |
|---|---:|---|
| `assignments` | 25 | Root pagination and Query Parameters are in each source schema document |
| `subdistricts` | 12 | Root pagination and Query Parameters are in each source schema document |
| `villages` | 20 | Root pagination and Query Parameters are in each source schema document |
| `health-services` | 33 | Root pagination and Query Parameters are in each source schema document |
| `volunteer-gender` | 12 | Root pagination and Query Parameters are in each source schema document |
| `volunteer-family` | 21 | Root pagination and Query Parameters are in each source schema document |
| `resigned-volunteers` | 18 | Root pagination and Query Parameters are in each source schema document |
| `volunteer-tenure` | 21 | Root pagination and Query Parameters are in each source schema document |

### Field-by-field inventory

| API | JSON path | Observed JSON type | Sample note / nullable evidence |
|---|---|---|---|
| `assignments` | `items[].id` | string | UUID-formatted · ค่า ID ประจำรายการ; ยังไม่ได้ตรวจ uniqueness ทุกหน้า |
| `assignments` | `items[].osmCode` | string | รหัสตัวเลขในรูปข้อความ · พบทั้งความยาว 14 และ 15 ตัวอักษร; ห้ามแปลงเป็น Number |
| `assignments` | `items[].citizenId` | string | `[REDACTED]` · **ข้อมูลส่วนบุคคลอ่อนไหวในบริบทการใช้งาน**; ในตัวอย่างเป็นสตริงตัวเลข 13 หลัก ไม่เก็บค่าจริงในเอกสาร |
| `assignments` | `items[].prefixNameTh` | string | `"นางสาว"`, `"นาง"`, `"นาย"` · พบหลายค่า |
| `assignments` | `items[].prefixNameEn` | string | `"Miss"`, `"Mrs."`, `"Mr."` · พบหลายค่า |
| `assignments` | `items[].firstName` | string | `[REDACTED]` · ชื่อบุคคล |
| `assignments` | `items[].lastName` | string | `[REDACTED]` · นามสกุลบุคคล |
| `assignments` | `items[].fullName` | string | `[REDACTED]` · ชื่อเต็มบุคคล |
| `assignments` | `items[].provinceCode` | string | `"54"` · ตรงกับ Request ในทั้ง 10 รายการ |
| `assignments` | `items[].provinceNameTh` | string | `"แพร่"` · ชื่อจังหวัด |
| `assignments` | `items[].districtCode` | string | `"5406"` · ตรงกับ Request ในทั้ง 10 รายการ |
| `assignments` | `items[].districtNameTh` | string | `"สอง"` · ชื่ออำเภอ |
| `assignments` | `items[].subdistrictCode` | string | `"540603"` · รหัสตำบล 6 หลัก เป็นข้อความ |
| `assignments` | `items[].subdistrictNameTh` | string | `"ห้วยหม้าย"` · ชื่อตำบล |
| `assignments` | `items[].villageNo` | string | `"7"`, `"16"` · เลขหมู่ **เป็น string** แม้เป็นค่าตัวเลข |
| `assignments` | `items[].villageName` | null (10/10) | `null` · ยังไม่ทราบชนิดเมื่อไม่เป็น `null` |
| `assignments` | `items[].isActive` | boolean | `true` · พบ `true` ทั้ง 10 ตัวอย่าง; ยังไม่ยืนยันว่ามี `false` หรือไม่ |
| `assignments` | `items[].status` | string | `"ใช้งาน"` · พบค่าเดียวในตัวอย่าง |
| `assignments` | `items[].osmStatus` | string | `""` · เป็น empty string ไม่ใช่ `null`; พบค่าเดียวในตัวอย่าง |
| `assignments` | `items[].osmShowbbody` | string | `"1"` · **ชื่อสะกดตาม API ต้นทางเป๊ะ** (รวม `bbody`); พบค่าเดียว |
| `assignments` | `items[].approvalStatus` | string | `"approved"` · พบค่าเดียว สอดคล้องกับตัวกรอง |
| `assignments` | `items[].volunteerStatus` | string | `"already_volunteer"`, `"not_interested"` · พบอย่างน้อยสองค่าในหน้าแรก |
| `assignments` | `items[].createdAt` | string (ISO 8601 timestamp) | `2025-11-10T05:36:01.776457Z` · ค่าวันเวลา; เป็น string ใน JSON |
| `assignments` | `items[].requestDate` | string (ISO 8601 timestamp) | `2025-11-10T05:36:01.776457Z` · ค่าวันเวลา; เป็น string ใน JSON |
| `assignments` | `items[].updatedAt` | string (ISO 8601 timestamp) | `2026-10-12T13:07:33.846207Z` · ค่าวันเวลา; เป็น string ใน JSON |
| `subdistricts` | `items[].code` | string | 0/8 · `540607` |
| `subdistricts` | `items[].id` | string | 0/8 · `540607` |
| `subdistricts` | `items[].name_th` | string | 0/8 · `แดนชุมพล` |
| `subdistricts` | `items[].name_en` | string | 0/8 · `Daen Chumphon` |
| `subdistricts` | `items[].postal_code` | string | 0/8 · `54120` |
| `subdistricts` | `items[].label` | string | 0/8 · `แดนชุมพล / Daen Chumphon` |
| `subdistricts` | `items[].district_code` | string | 0/8 · `5406` |
| `subdistricts` | `items[].district_name_th` | string | 0/8 · `สอง` |
| `subdistricts` | `items[].district_name_en` | string | 0/8 · `Song` |
| `subdistricts` | `items[].province_code` | null only | 8/8 · `null` |
| `subdistricts` | `items[].province_name_th` | null only | 8/8 · `null` |
| `subdistricts` | `items[].province_name_en` | null only | 8/8 · `null` |
| `villages` | `items[].code` | string | ไม่พบ (0/85) · `540602005` |
| `villages` | `items[].village_code_8digit` | string | ไม่พบ (0/85) · `54060205` |
| `villages` | `items[].id` | string | ไม่พบ (0/85) · `540602005` |
| `villages` | `items[].name_th` | string | ไม่พบ (0/85) · `กลาง` |
| `villages` | `items[].name_en` | null เท่านั้น (ชนิดอื่นยังไม่ทราบ) | ทั้งหมด (85/85) · `null` |
| `villages` | `items[].village_no` | integer | ไม่พบ (0/85) · `5` |
| `villages` | `items[].metro_status` | null เท่านั้น (ชนิดอื่นยังไม่ทราบ) | ทั้งหมด (85/85) · `null` |
| `villages` | `items[].label` | string | ไม่พบ (0/85) · `กลาง` |
| `villages` | `items[].subdistrict_code` | string | ไม่พบ (0/85) · `540602` |
| `villages` | `items[].subdistrict_name_th` | string | ไม่พบ (0/85) · `บ้านกลาง` |
| `villages` | `items[].subdistrict_name_en` | string | ไม่พบ (0/85) · `Ban Klang` |
| `villages` | `items[].district_code` | string | ไม่พบ (0/85) · `5406` |
| `villages` | `items[].district_name_th` | string | ไม่พบ (0/85) · `สอง` |
| `villages` | `items[].district_name_en` | string | ไม่พบ (0/85) · `Song` |
| `villages` | `items[].province_code` | string | ไม่พบ (0/85) · `54` |
| `villages` | `items[].province_name_th` | string | ไม่พบ (0/85) · `แพร่` |
| `villages` | `items[].province_name_en` | string | ไม่พบ (0/85) · `Phrae` |
| `villages` | `items[].health_service_code` | string / null | 75/85 · `GA0006419` |
| `villages` | `items[].health_service_name_th` | string / null | 75/85 · `โรงพยาบาลส่งเสริมสุขภาพตำบลเตาปูน` |
| `villages` | `items[].health_service_name_en` | null เท่านั้น (ชนิดอื่นยังไม่ทราบ) | ทั้งหมด (85/85) · `null` |
| `health-services` | `items[].health_service_code` | string | ไม่พบ `null` · `GA0006426` |
| `health-services` | `items[].health_service_name_th` | string | ไม่พบ `null` · `โรงพยาบาลส่งเสริมสุขภาพตำบลแดนชุมพล` |
| `health-services` | `items[].health_service_name_en` | null | พบ `null` ทั้ง 10 รายการ · `null` — ยังไม่ยืนยันชนิดเมื่อมีค่า |
| `health-services` | `items[].legacy_5digit_code` | string | ไม่พบ `null` · `06426` (รักษาเลข 0 นำหน้า) |
| `health-services` | `items[].legacy_9digit_code` | string | ไม่พบ `null` · `000642600` (รักษาเลข 0 นำหน้า) |
| `health-services` | `items[].village_no` | string | ไม่พบ `null` · `"4"` |
| `health-services` | `items[].latitude` | number | ไม่พบ `null` · `0` (จำนวนเต็มในชุดตัวอย่าง) |
| `health-services` | `items[].longitude` | number | ไม่พบ `null` · `0` (จำนวนเต็มในชุดตัวอย่าง) |
| `health-services` | `items[].health_service_type` | object | ไม่พบ `null` · ดู §4.1 |
| `health-services` | `items[].province` | object | ไม่พบ `null` · ดู §4.2 |
| `health-services` | `items[].district` | object | ไม่พบ `null` · ดู §4.3 |
| `health-services` | `items[].subdistrict` | object | ไม่พบ `null` · ดู §4.4 |
| `health-services` | `items[].service_areas` | array<object> | ไม่พบ `null` · ดู §4.5 |
| `health-services` | `items[].created_at` | string (datetime) | ไม่พบ `null` · `2025-07-30T04:31:26.342131+00:00` |
| `health-services` | `items[].updated_at` | string (datetime) | ไม่พบ `null` · `2025-07-30T04:31:26.342132+00:00` |
| `health-services` | `items[].deleted_at` | null | พบ `null` ทั้ง 10 รายการ · `null` — ยังไม่ยืนยันชนิดเมื่อมีค่า |
| `health-services` | `items[].health_service_type.id` | string (UUID-formatted) | `e785b7c3-cc92-4695-acc7-63c309c05958` |
| `health-services` | `items[].health_service_type.name_th` | string | `ศูนย์บริการสาธารณสุข อปท.` |
| `health-services` | `items[].health_service_type.name_en` | string | `Local Government Health Service Center` |
| `health-services` | `items[].province.province_code` | string | `54` |
| `health-services` | `items[].province.province_name_th` | string | `แพร่` |
| `health-services` | `items[].province.province_name_en` | string | `Phrae` |
| `health-services` | `items[].district.district_code` | string | `5406` |
| `health-services` | `items[].district.district_name_th` | string | `สอง` |
| `health-services` | `items[].district.district_name_en` | string | `Song` |
| `health-services` | `items[].subdistrict.subdistrict_code` | string | `540607` |
| `health-services` | `items[].subdistrict.subdistrict_name_th` | string | `แดนชุมพล` |
| `health-services` | `items[].subdistrict.subdistrict_name_en` | string | `Daen Chumphon` |
| `health-services` | `items[].service_areas[].id` | string (UUID-formatted) | `8942128a-a947-4cb2-9c7e-27909a224e57` |
| `health-services` | `items[].service_areas[].subdistrict_code` | string | `540607` |
| `health-services` | `items[].service_areas[].subdistrict_name_th` | string | `แดนชุมพล` |
| `health-services` | `items[].service_areas[].village_nos` | array<string> | `["4"]` |
| `health-services` | `items[].service_areas[].is_primary` | boolean | `true` |
| `volunteer-gender` | `items[].provinceCode` | string | "54" · รหัสจังหวัด; ค่าเป็นข้อความ |
| `volunteer-gender` | `items[].provinceName` | string | "แพร่" · ชื่อจังหวัด |
| `volunteer-gender` | `items[].districtCode` | string | "5406" · รหัสอำเภอ; ค่าเป็นข้อความ |
| `volunteer-gender` | `items[].districtName` | string | "สอง" · ชื่ออำเภอ |
| `volunteer-gender` | `items[].subdistrictCode` | string | "540601" · รหัสตำบล; ค่าเป็นข้อความ |
| `volunteer-gender` | `items[].subdistrictName` | string | "บ้านหนุน" · ชื่อตำบล |
| `volunteer-gender` | `items[].villageCode` | string | "540601001" · รหัสหมู่บ้าน 9 หลัก; ค่าเป็นข้อความ |
| `volunteer-gender` | `items[].villageNo` | string | "1" · เลขหมู่เป็น string ไม่ใช่ integer |
| `volunteer-gender` | `items[].villageName` | string | "หนุนเหนือ" · ชื่อหมู่บ้าน |
| `volunteer-gender` | `items[].total` | integer | 19 · จำนวนในแต่ละแถว (ระดับหมู่บ้าน) ไม่ใช่ Root `total` |
| `volunteer-gender` | `items[].male` | integer | 3 · จำนวนเพศชาย |
| `volunteer-gender` | `items[].female` | integer | 16 · จำนวนเพศหญิง |
| `volunteer-family` | `items[].provinceCode` | string | "54" · รหัสจังหวัด; ค่าเป็นข้อความ |
| `volunteer-family` | `items[].provinceName` | string | "แพร่" · ชื่อจังหวัด |
| `volunteer-family` | `items[].districtCode` | string | "5406" · รหัสอำเภอ; ค่าเป็นข้อความ |
| `volunteer-family` | `items[].districtName` | string | "สอง" · ชื่ออำเภอ |
| `volunteer-family` | `items[].subdistrictCode` | string | "540601" · รหัสตำบล; ค่าเป็นข้อความ |
| `volunteer-family` | `items[].subdistrictName` | string | "บ้านหนุน" · ชื่อตำบล |
| `volunteer-family` | `items[].villageCode` | string | "540601001" · รหัสหมู่บ้าน 9 หลัก; ค่าเป็นข้อความ |
| `volunteer-family` | `items[].villageNo` | string | "1" · เลขหมู่เป็น string ไม่ใช่ integer |
| `volunteer-family` | `items[].villageName` | string | "หนุนเหนือ" · ชื่อหมู่บ้าน |
| `volunteer-family` | `items[].osmCode` | string | "[REDACTED]" · รหัสบุคคลในข้อมูลตัวอย่าง; ไม่เปิดเผยค่าจริง |
| `volunteer-family` | `items[].citizenId` | string | "[REDACTED]" · เลขประจำตัวประชาชน; ควรปกปิดในเอกสาร |
| `volunteer-family` | `items[].prefixName` | string | "นาย" · คำนำหน้าชื่อ; พบทั้งค่า `"ไม่ระบุ"` และค่าอื่น |
| `volunteer-family` | `items[].firstName` | string | "[REDACTED]" · ชื่อบุคคล |
| `volunteer-family` | `items[].lastName` | string | "[REDACTED]" · นามสกุลบุคคล |
| `volunteer-family` | `items[].fullName` | string | "[REDACTED]" · ชื่อเต็มบุคคล |
| `volunteer-family` | `items[].gender` | string | "female" · พบ `"other"`, `"male"`, `"female"` ใน 10 รายการ |
| `volunteer-family` | `items[].address` | string | "[REDACTED]" · ที่อยู่/บ้านเลขที่ ซึ่งเป็นข้อมูลระบุตัวบุคคล |
| `volunteer-family` | `items[].status` | string | "volunteer" · พบ `"child"`, `"spouse"`, `"volunteer"` |
| `volunteer-family` | `items[].statusLabel` | string | "อสม." · คำอธิบายสถานะ เช่น `"บุตร"`, `"คู่สมรส"`, `"อสม."` |
| `volunteer-family` | `items[].volunteerId` | string | "[REDACTED]" · รูปแบบ UUID; ระบุอาสาสมัครที่เชื่อมกับรายการ |
| `volunteer-family` | `items[].volunteerName` | string | "[REDACTED]" · ชื่อ อสม. ที่เชื่อมโยง |
| `resigned-volunteers` | `items[].id` | string | "[REDACTED]" · รูปแบบ UUID; ระเบียนบุคคล |
| `resigned-volunteers` | `items[].citizenId` | string | "[REDACTED]" · เลขประจำตัวประชาชน; ไม่เปิดเผยค่าจริง |
| `resigned-volunteers` | `items[].firstName` | string | "[REDACTED]" · ชื่อบุคคล |
| `resigned-volunteers` | `items[].lastName` | string | "[REDACTED]" · นามสกุลบุคคล |
| `resigned-volunteers` | `items[].retirementDate` | string (date YYYY-MM-DD) | "2019-06-01" · วันพ้นสภาพ ไม่ใช่ Timestamp |
| `resigned-volunteers` | `items[].retirementReason` | string | "resigned" · พบ `"resigned"` และ `"died"` |
| `resigned-volunteers` | `items[].osmStatus` | string | "0" · สถานะเป็น **string** แม้มีหน้าตาเป็นเลข |
| `resigned-volunteers` | `items[].volunteerStatus` | string | "already_volunteer" · ค่าที่พบในหน้าแรก |
| `resigned-volunteers` | `items[].approvalStatus` | string | "approved" · ค่าที่พบในหน้าแรก |
| `resigned-volunteers` | `items[].provinceCode` | string | "54" · รหัสจังหวัด; ค่าเป็นข้อความ |
| `resigned-volunteers` | `items[].provinceName` | string | "แพร่" · ชื่อจังหวัด |
| `resigned-volunteers` | `items[].districtCode` | string | "5406" · รหัสอำเภอ; ค่าเป็นข้อความ |
| `resigned-volunteers` | `items[].districtName` | string | "สอง" · ชื่ออำเภอ |
| `resigned-volunteers` | `items[].subdistrictCode` | string | "540601" · รหัสตำบล; ค่าเป็นข้อความ |
| `resigned-volunteers` | `items[].subdistrictName` | string | "บ้านหนุน" · ชื่อตำบล |
| `resigned-volunteers` | `items[].villageCode` | string | "540601001" · รหัสหมู่บ้าน 9 หลัก; ค่าเป็นข้อความ |
| `resigned-volunteers` | `items[].villageNo` | string | "1" · เลขหมู่เป็น string ไม่ใช่ integer |
| `resigned-volunteers` | `items[].villageName` | string | "หนุนเหนือ" · ชื่อหมู่บ้าน |
| `volunteer-tenure` | `items[].id` | string | "[REDACTED]" · UUID-formatted |
| `volunteer-tenure` | `items[].citizenId` | string | "[REDACTED]" · เลขประจำตัวประชาชน; ไม่เปิดเผยค่าจริง |
| `volunteer-tenure` | `items[].osmCode` | string | "[REDACTED]" · รหัส อสม. เป็นข้อความ |
| `volunteer-tenure` | `items[].firstName` | string | "[REDACTED]" · ชื่อบุคคล |
| `volunteer-tenure` | `items[].lastName` | string | "[REDACTED]" · นามสกุลบุคคล |
| `volunteer-tenure` | `items[].startYear` | integer | 2545 · ปีเริ่มต้นเป็นจำนวนเต็ม; ตัวอย่างใช้ปี พ.ศ. |
| `volunteer-tenure` | `items[].tenureYears` | integer | 24 · อายุงาน (ปี); ค่าที่ API คำนวณมาให้ |
| `volunteer-tenure` | `items[].osmYear` | integer | 2545 · ปี อสม. เป็นจำนวนเต็ม; ตัวอย่างใช้ปี พ.ศ. |
| `volunteer-tenure` | `items[].approvalDate` | string (date YYYY-MM-DD) | "2025-12-17" · วันอนุมัติในรูปแบบวันที่ |
| `volunteer-tenure` | `items[].retirementDate` | null only | `null` · ทั้ง 10 รายการเป็น `null`; ยังไม่ทราบชนิดเมื่อมีค่า |
| `volunteer-tenure` | `items[].retirementReason` | null only | `null` · ทั้ง 10 รายการเป็น `null`; ยังไม่ทราบชนิดเมื่อมีค่า |
| `volunteer-tenure` | `items[].osmStatus` | string | "" · เป็น empty string ไม่ใช่ `null` |
| `volunteer-tenure` | `items[].provinceCode` | string | "54" · รหัสจังหวัด; ค่าเป็นข้อความ |
| `volunteer-tenure` | `items[].provinceName` | string | "แพร่" · ชื่อจังหวัด |
| `volunteer-tenure` | `items[].districtCode` | string | "5406" · รหัสอำเภอ; ค่าเป็นข้อความ |
| `volunteer-tenure` | `items[].districtName` | string | "สอง" · ชื่ออำเภอ |
| `volunteer-tenure` | `items[].subdistrictCode` | string | "540601" · รหัสตำบล; ค่าเป็นข้อความ |
| `volunteer-tenure` | `items[].subdistrictName` | string | "บ้านหนุน" · ชื่อตำบล |
| `volunteer-tenure` | `items[].villageCode` | string | "540601001" · รหัสหมู่บ้าน 9 หลัก; ค่าเป็นข้อความ |
| `volunteer-tenure` | `items[].villageNo` | string | "1" · เลขหมู่เป็น string ไม่ใช่ integer |
| `volunteer-tenure` | `items[].villageName` | string | "หนุนเหนือ" · ชื่อหมู่บ้าน |

### Cross-API type hazards

- Village lookup `items[].village_no` is an **integer**, while `villageNo` in assignments/report rows and `health-services.village_no` are **strings**. Compare safely, preserve original serialization.
- All province, district, subdistrict, village, health service, legacy code and postal code **identifiers remain strings**, including leading zeros.
- `null`-only fields do **not** establish the non-null type. An omitted field, `null`, and empty string `""` are distinct.
- `health-services.items[].service_areas[]` and `village_nos[]` must not be flattened or treated as complete geographic catchment from these examples.
- See [Schema Review](schema-review.md) for observed join checks, counts, anomalies and outstanding confirmation steps.

