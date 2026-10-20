# ThaiPHC API #4 — Geo-management Health Services: Response Schema

> **ขอบเขต:** เอกสารนี้บันทึกเฉพาะโครงสร้าง API และชนิดข้อมูลที่สังเกตจาก JSON Response ที่ผู้ใช้ส่งมา (หน้าแรก 10 รายการ) ยังไม่ใช่ข้อกำหนดอย่างเป็นทางการของผู้ให้บริการ API และไม่ครอบคลุมข้อมูลที่ยังไม่ได้ส่งมาอีก 8 รายการ

## 1. Endpoint

- **HTTP Method:** `GET` (ตาม URL สำหรับเรียกอ่านข้อมูล)
- **Base URL:** `https://api-thaiphc.hss.moph.go.th`
- **Path:** `/api/v1/geo-management/health-services`
- **Content type ของตัวอย่าง Response:** JSON

### Query parameters ในคำขอตัวอย่าง

| Parameter | ค่าที่ได้รับ | ชนิดค่าที่ส่งใน URL | หมายเหตุ |
|---|---|---|---|
| `limit` | `10` | string (integer-formatted) | ขนาดหน้าตามคำขอ |
| `offset` | `0` | string (integer-formatted) | จุดเริ่มต้นของหน้า |
| `health_service_type_ids_exclude` | `7310dd94-0395-48cb-845b-803279a54f6c` | string (UUID) | เป็น Query Parameter ที่ระบุซ้ำ |
| `health_service_type_ids_exclude` | `96ca3348-49c2-4d89-903b-32939fd1c95c` | string (UUID) | เป็น Query Parameter ที่ระบุซ้ำ |
| `health_service_type_ids_exclude` | `f464d614-c20e-4391-84a9-4c8edb7982a9` | string (UUID) | เป็น Query Parameter ที่ระบุซ้ำ |
| `province_code` | `54` | string | รหัสจังหวัด |
| `district_code` | `5406` | string | รหัสอำเภอ |

**ข้อสังเกต:** ต้องรักษา `health_service_type_ids_exclude` ทั้ง 3 ค่าเป็นพารามิเตอร์ซ้ำ (ไม่ใช่คีย์เดียวที่เขียนทับกัน) เพื่อคงรูปแบบ Request ต้นทาง

## 2. Top-level Response

| JSON path | Observed type | ตัวอย่าง | คำอธิบายเชิงโครงสร้าง |
|---|---|---|---|
| `items` | `array<object>` | Array จำนวน 10 รายการ | รายการหน่วยบริการในหน้าที่ร้องขอ |
| `total` | `number` (integer) | `18` | จำนวนรวมที่ API รายงานสำหรับคำขอนี้ |
| `limit` | `number` (integer) | `10` | ขนาดหน้าที่ API ส่งกลับ |
| `offset` | `number` (integer) | `0` | จุดเริ่มต้นที่ API ส่งกลับ |

Response ตัวอย่างมี **10 รายการ** จาก `total = 18` และมีการแบ่งหน้าแบบ `limit` / `offset` ไม่มี `pages`, `page` หรือ `pagination` Object ในตัวอย่างที่ได้รับ

## 3. Schema ของ `items[]`

| Field | Observed type | Nullable ในตัวอย่าง | ตัวอย่าง / รูปแบบ |
|---|---|---|---|
| `health_service_code` | `string` | ไม่พบ `null` | `GA0006426` |
| `health_service_name_th` | `string` | ไม่พบ `null` | `โรงพยาบาลส่งเสริมสุขภาพตำบลแดนชุมพล` |
| `health_service_name_en` | `null` | พบ `null` ทั้ง 10 รายการ | `null` — ยังไม่ยืนยันชนิดเมื่อมีค่า |
| `legacy_5digit_code` | `string` | ไม่พบ `null` | `06426` (รักษาเลข 0 นำหน้า) |
| `legacy_9digit_code` | `string` | ไม่พบ `null` | `000642600` (รักษาเลข 0 นำหน้า) |
| `village_no` | `string` | ไม่พบ `null` | `"4"` |
| `latitude` | `number` | ไม่พบ `null` | `0` (จำนวนเต็มในชุดตัวอย่าง) |
| `longitude` | `number` | ไม่พบ `null` | `0` (จำนวนเต็มในชุดตัวอย่าง) |
| `health_service_type` | `object` | ไม่พบ `null` | ดู §4.1 |
| `province` | `object` | ไม่พบ `null` | ดู §4.2 |
| `district` | `object` | ไม่พบ `null` | ดู §4.3 |
| `subdistrict` | `object` | ไม่พบ `null` | ดู §4.4 |
| `service_areas` | `array<object>` | ไม่พบ `null` | ดู §4.5 |
| `created_at` | `string` (datetime) | ไม่พบ `null` | `2025-07-30T04:31:26.342131+00:00` |
| `updated_at` | `string` (datetime) | ไม่พบ `null` | `2025-07-30T04:31:26.342132+00:00` |
| `deleted_at` | `null` | พบ `null` ทั้ง 10 รายการ | `null` — ยังไม่ยืนยันชนิดเมื่อมีค่า |

## 4. Nested Schemas

### 4.1 `items[].health_service_type`

| Field | Observed type | ตัวอย่าง |
|---|---|---|
| `id` | `string` (UUID-formatted) | `e785b7c3-cc92-4695-acc7-63c309c05958` |
| `name_th` | `string` | `ศูนย์บริการสาธารณสุข อปท.` |
| `name_en` | `string` | `Local Government Health Service Center` |

### 4.2 `items[].province`

| Field | Observed type | ตัวอย่าง |
|---|---|---|
| `province_code` | `string` | `54` |
| `province_name_th` | `string` | `แพร่` |
| `province_name_en` | `string` | `Phrae` |

### 4.3 `items[].district`

| Field | Observed type | ตัวอย่าง |
|---|---|---|
| `district_code` | `string` | `5406` |
| `district_name_th` | `string` | `สอง` |
| `district_name_en` | `string` | `Song` |

### 4.4 `items[].subdistrict`

| Field | Observed type | ตัวอย่าง |
|---|---|---|
| `subdistrict_code` | `string` | `540607` |
| `subdistrict_name_th` | `string` | `แดนชุมพล` |
| `subdistrict_name_en` | `string` | `Daen Chumphon` |

### 4.5 `items[].service_areas[]`

| Field | Observed type | ตัวอย่าง |
|---|---|---|
| `id` | `string` (UUID-formatted) | `8942128a-a947-4cb2-9c7e-27909a224e57` |
| `subdistrict_code` | `string` | `540607` |
| `subdistrict_name_th` | `string` | `แดนชุมพล` |
| `village_nos` | `array<string>` | `["4"]` |
| `is_primary` | `boolean` | `true` |

**ขนาด Array ที่สังเกต:** ในข้อมูล 10 รายการที่ส่งมา ทุก `service_areas` มีหนึ่ง Object และทุก `village_nos` มีหนึ่ง String แต่ยังยืนยันไม่ได้ว่า API จำกัดให้มีหนึ่งรายการเสมอไป

## 5. ตัวอย่างรูปทรง JSON (ย่อจาก Response จริง)

```json
{
  "items": [
    {
      "health_service_code": "GA0006426",
      "health_service_name_th": "โรงพยาบาลส่งเสริมสุขภาพตำบลแดนชุมพล",
      "health_service_name_en": null,
      "legacy_5digit_code": "06426",
      "legacy_9digit_code": "000642600",
      "village_no": "4",
      "latitude": 0,
      "longitude": 0,
      "health_service_type": {
        "id": "e785b7c3-cc92-4695-acc7-63c309c05958",
        "name_th": "ศูนย์บริการสาธารณสุข อปท.",
        "name_en": "Local Government Health Service Center"
      },
      "province": {
        "province_code": "54",
        "province_name_th": "แพร่",
        "province_name_en": "Phrae"
      },
      "district": {
        "district_code": "5406",
        "district_name_th": "สอง",
        "district_name_en": "Song"
      },
      "subdistrict": {
        "subdistrict_code": "540607",
        "subdistrict_name_th": "แดนชุมพล",
        "subdistrict_name_en": "Daen Chumphon"
      },
      "service_areas": [
        {
          "id": "8942128a-a947-4cb2-9c7e-27909a224e57",
          "subdistrict_code": "540607",
          "subdistrict_name_th": "แดนชุมพล",
          "village_nos": ["4"],
          "is_primary": true
        }
      ],
      "created_at": "2025-07-30T04:31:26.342131+00:00",
      "updated_at": "2025-07-30T04:31:26.342132+00:00",
      "deleted_at": null
    }
  ],
  "total": 18,
  "limit": 10,
  "offset": 0
}
```

> ตัวอย่างนี้แสดงเพียง **หนึ่ง Object ใน `items`** เพื่ออธิบาย Schema จึงไม่ใช่ Response เต็ม 10 รายการ

## 6. ขอบเขตการยืนยัน Schema

- ตรวจสอบจาก **Response หน้าแรก (`limit=10`, `offset=0`) เท่านั้น**; ค่า `total=18` เป็นข้อมูลที่ API รายงาน ไม่ใช่จำนวนรายการที่ได้รับครบแล้ว
- `health_service_code` ไม่ซ้ำกันใน 10 รายการที่เห็น แต่ Response ไม่ประกาศข้อกำหนด Primary Key หรือ Unique Constraint อย่างเป็นทางการ
- `latitude` / `longitude` มีค่า `0` ทั้ง 10 รายการ จึงไม่ใช่หลักฐานว่าพิกัดมีความแม่นยำหรือตั้งอยู่ที่ `(0, 0)` จริง
- ประเภทของฟิลด์ที่พบแต่ `null` เช่น `health_service_name_en` และ `deleted_at` ยังต้องยืนยันจาก Response อื่นหรือเอกสาร API
- ตัวเลขรหัสที่อยู่ใน JSON เป็น `string` ต้องไม่แปลงเป็น `number` โดยอัตโนมัติ
- เอกสารนี้ไม่มีการออกแบบ Google Sheets, Field Mapping, Validation Rule หรือระบบ Sync

**Source:** JSON Response ที่ผู้ใช้แนบสำหรับ `GET /api/v1/geo-management/health-services` (หน้าแรก 10 รายการ)