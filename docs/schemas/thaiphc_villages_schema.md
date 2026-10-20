# ThaiPHC API Schema — Villages Lookup

> เอกสารนี้บันทึก **เฉพาะโครงสร้าง Schema** ที่สังเกตได้จาก JSON Response ที่ผู้ใช้ส่งให้ (20 ตุลาคม 2569) ไม่ใช่เอกสารสัญญา API ทางการของผู้ให้บริการ และไม่ได้ยืนยันพฤติกรรมในจังหวัด/อำเภออื่น

## Endpoint

- **Method:** `GET`
- **URL:** `https://api-thaiphc.hss.moph.go.th/api/v1/lookups/villages`
- **Query ที่ใช้:** `province_code=54&district_code=5406`
- **HTTP status / Authentication:** ไม่ปรากฏในข้อมูล JSON ตัวอย่าง จึงยังไม่ยืนยันสำหรับ Endpoint นี้

### Query Parameters ที่พบจาก URL

| Parameter | ค่าที่ใช้ | ชนิดที่ส่งใน URL | ข้อสังเกต |
|---|---|---|---|
| `province_code` | `54` | string | รหัสจังหวัดแพร่ |
| `district_code` | `5406` | string | รหัสอำเภอสอง |

## Response Envelope

```json
{
  "items": [
    { "...": "village item fields (see schema below)" }
  ]
}
```

- **Root:** JSON object
- **Root field:** `items` เป็น Array ของ Object
- **รายการในตัวอย่าง:** 85 รายการ, 20 Fields ต่อรายการ
- **Root fields ที่พบ:** `items` เท่านั้น; ไม่พบ `page`, `limit`, `total`, `pages` ในตัวอย่างนี้

## `items[]` — Field Schema

**ความหมายของ Null:** `ไม่พบ` หมายถึงทุกแถวในตัวอย่างมีค่า ไม่ได้แปลว่า API รับประกัน non-null; `ทั้งหมด (85/85)` หมายถึงข้อมูลตัวอย่างให้ `null` ทุกแถว จึง **ไม่ทราบชนิดจริงของค่าที่อาจปรากฏใน Response อื่น**

| Field | ชนิดที่พบใน JSON | Null ที่พบ | ตัวอย่างค่าจาก Response | ความหมาย |
|---|---|---:|---|---|
| `code` | string | ไม่พบ (0/85) | `540602005` | รหัสหมู่บ้าน 9 หลัก |
| `village_code_8digit` | string | ไม่พบ (0/85) | `54060205` | รหัสหมู่บ้าน 8 หลัก |
| `id` | string | ไม่พบ (0/85) | `540602005` | รหัสรายการ; ในตัวอย่างมีค่าเหมือน `code` |
| `name_th` | string | ไม่พบ (0/85) | `กลาง` | ชื่อหมู่บ้านภาษาไทย |
| `name_en` | null เท่านั้น (ชนิดอื่นยังไม่ทราบ) | ทั้งหมด (85/85) | `null` | ชื่อหมู่บ้านภาษาอังกฤษ (ตัวอย่างทั้งหมดเป็น `null`) |
| `village_no` | integer | ไม่พบ (0/85) | `5` | หมู่ที่ (จำนวนเต็ม) |
| `metro_status` | null เท่านั้น (ชนิดอื่นยังไม่ทราบ) | ทั้งหมด (85/85) | `null` | สถานะเขตเมือง (ตัวอย่างทั้งหมดเป็น `null`) |
| `label` | string | ไม่พบ (0/85) | `กลาง` | ชื่อแสดงผล |
| `subdistrict_code` | string | ไม่พบ (0/85) | `540602` | รหัสตำบล 6 หลัก |
| `subdistrict_name_th` | string | ไม่พบ (0/85) | `บ้านกลาง` | ชื่อตำบลภาษาไทย |
| `subdistrict_name_en` | string | ไม่พบ (0/85) | `Ban Klang` | ชื่อตำบลภาษาอังกฤษ |
| `district_code` | string | ไม่พบ (0/85) | `5406` | รหัสอำเภอ 4 หลัก |
| `district_name_th` | string | ไม่พบ (0/85) | `สอง` | ชื่ออำเภอภาษาไทย |
| `district_name_en` | string | ไม่พบ (0/85) | `Song` | ชื่ออำเภอภาษาอังกฤษ |
| `province_code` | string | ไม่พบ (0/85) | `54` | รหัสจังหวัด 2 หลัก |
| `province_name_th` | string | ไม่พบ (0/85) | `แพร่` | ชื่อจังหวัดภาษาไทย |
| `province_name_en` | string | ไม่พบ (0/85) | `Phrae` | ชื่อจังหวัดภาษาอังกฤษ |
| `health_service_code` | string / null | 75/85 | `GA0006419` | รหัสหน่วยบริการ (พบข้อมูลบางรายการ) |
| `health_service_name_th` | string / null | 75/85 | `โรงพยาบาลส่งเสริมสุขภาพตำบลเตาปูน` | ชื่อหน่วยบริการภาษาไทย (พบข้อมูลบางรายการ) |
| `health_service_name_en` | null เท่านั้น (ชนิดอื่นยังไม่ทราบ) | ทั้งหมด (85/85) | `null` | ชื่อหน่วยบริการภาษาอังกฤษ (ตัวอย่างทั้งหมดเป็น `null`) |

## ข้อเท็จจริงระดับ Schema ที่ตรวจพบในตัวอย่าง

- รายการทั้ง 85 รายการมีชุดชื่อ Fields เหมือนกันครบ 20 Fields
- `code`, `id`, `village_code_8digit` มีค่าไม่ซ้ำกันในชุดข้อมูลที่ได้รับ และ `id` ตรงกับ `code` ทุกแถว **(ผลตรวจตัวอย่าง ไม่ใช่การยืนยันข้อบังคับจาก API)**
- รหัสที่ได้จากตัวอย่างเป็นข้อความ (JSON string) ไม่ใช่ตัวเลข ได้แก่ `code`, `village_code_8digit`, `subdistrict_code`, `district_code`, `province_code`; การนำไปจัดเก็บควรรักษาประเภทข้อความไว้
- `village_no` เป็น JSON integer ไม่ใช่ string
- `name_th` และ `label` **ไม่ใช่รหัสเอกลักษณ์** เพราะมีค่าซ้ำกันในหลายหมู่บ้าน
- ฟิลด์ `health_service_code` และ `health_service_name_th` พบค่า string จำนวน 10 จาก 85 แถว ที่เหลือ `null`; `health_service_name_en` เป็น `null` ทุกแถว
- ข้อมูลอ้างอิงตำบลใน Response ใช้ `subdistrict_code` ซึ่งสัมพันธ์กับฟิลด์ `code` ของ API `lookups/subdistricts` ที่ได้รับก่อนหน้า แต่เอกสารนี้ยังไม่กำหนด Foreign Key Constraint ของระบบปลายทาง

## ตัวอย่าง `items[0]` จาก Response ที่ได้รับ

```json
{
  "code": "540602005",
  "village_code_8digit": "54060205",
  "id": "540602005",
  "name_th": "กลาง",
  "name_en": null,
  "village_no": 5,
  "metro_status": null,
  "label": "กลาง",
  "subdistrict_code": "540602",
  "subdistrict_name_th": "บ้านกลาง",
  "subdistrict_name_en": "Ban Klang",
  "district_code": "5406",
  "district_name_th": "สอง",
  "district_name_en": "Song",
  "province_code": "54",
  "province_name_th": "แพร่",
  "province_name_en": "Phrae",
  "health_service_code": null,
  "health_service_name_th": null,
  "health_service_name_en": null
}
```

---

*Scope: Schema of `GET /api/v1/lookups/villages` only. No other endpoint schemas are included in this document.*