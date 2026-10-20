# ThaiPHC API #2 — Subdistricts Lookup: Response Schema

> **ขอบเขต:** เอกสารนี้บันทึกเฉพาะโครงสร้าง Schema จาก JSON Response ที่ผู้ใช้ส่งมาเมื่อ 20 ตุลาคม 2569 (8 รายการของอำเภอสอง จังหวัดแพร่) ไม่ใช่เอกสารสัญญา API อย่างเป็นทางการ และไม่ได้ทดสอบข้อมูลจากอำเภออื่น

## 1. Endpoint

- **HTTP method:** `GET` (ตามรูปแบบ URL ที่ผู้ใช้ให้)
- **URL:** `https://api-thaiphc.hss.moph.go.th/api/v1/lookups/subdistricts`
- **Query string:** `district_code=5406`
- **Authentication / HTTP status:** ไม่ปรากฏใน JSON Response ที่ส่งมา จึงยังไม่ยืนยันสำหรับ Endpoint นี้

| Query parameter | ค่าจาก URL | Type ใน URL | คำอธิบาย |
|---|---|---|---|
| `district_code` | `5406` | string | รหัสอำเภอสอง |

## 2. Response Envelope

```json
{
  "items": [
    { "code": "540607", "id": "540607", "name_th": "แดนชุมพล" }
  ]
}
```

> ตัวอย่าง `items[0]` ข้างต้นถูก **ตัดให้เหลือ 3 Fields เพื่อแสดงโครงสร้าง**; ไม่ใช่ Response ดั้งเดิมแบบครบ Fields

| JSON path | Observed type | ข้อสังเกต |
|---|---|---|
| `$` (root) | object | JSON object |
| `items` | `array<object>` | มี **8 รายการ** และแต่ละรายการมี 12 Fields |

- **Root Keys ที่ได้รับ:** `items` เท่านั้น
- **Pagination:** ไม่พบ `page`, `pages`, `limit`, `offset`, `total` หรือ Object Pagination ใน Response ตัวอย่าง

## 3. `items[]` — Field Schema

**คำอธิบาย Nullable:** `0/8` หมายถึงไม่พบค่า `null` ใน 8 รายการที่ได้รับ (ไม่ได้หมายความว่า API รับประกัน Non-null ตลอดไป) และ `8/8` หมายถึงพบเฉพาะ `null` จึงยังไม่ทราบชนิดจริงเมื่อมีค่าข้อมูล

| Field | Observed JSON type | Null ในตัวอย่าง | ตัวอย่างจากข้อมูลจริง | คำอธิบาย |
|---|---|---|---|---|
| `code` | string | 0/8 | `540607` | รหัสตำบล |
| `id` | string | 0/8 | `540607` | รหัสรายการ; มีค่าเท่ากับ `code` ในตัวอย่างทั้ง 8 รายการ |
| `name_th` | string | 0/8 | `แดนชุมพล` | ชื่อตำบลภาษาไทย |
| `name_en` | string | 0/8 | `Daen Chumphon` | ชื่อตำบลภาษาอังกฤษ |
| `postal_code` | string | 0/8 | `54120` | รหัสไปรษณีย์ เป็นข้อความ |
| `label` | string | 0/8 | `แดนชุมพล / Daen Chumphon` | ข้อความแสดงผล |
| `district_code` | string | 0/8 | `5406` | รหัสอำเภอ |
| `district_name_th` | string | 0/8 | `สอง` | ชื่ออำเภอภาษาไทย |
| `district_name_en` | string | 0/8 | `Song` | ชื่ออำเภอภาษาอังกฤษ |
| `province_code` | null only | 8/8 | `null` | ชนิดข้อมูลเมื่อไม่ใช่ `null` ยังไม่ทราบ |
| `province_name_th` | null only | 8/8 | `null` | ชนิดข้อมูลเมื่อไม่ใช่ `null` ยังไม่ทราบ |
| `province_name_en` | null only | 8/8 | `null` | ชนิดข้อมูลเมื่อไม่ใช่ `null` ยังไม่ทราบ |

## 4. รหัสและชื่อใน `items[]` ที่ได้รับ

ตารางนี้ใช้ยืนยันว่าข้อมูล Schema ครอบคลุมตำบลที่อยู่ใน Response ทุกรายการ โดยยังไม่มีการสร้าง Field Mapping ไปยังระบบอื่น

| `code` | `name_th` | `name_en` |
|---|---|---|
| `540601` | บ้านหนุน | Ban Nun |
| `540602` | บ้านกลาง | Ban Klang |
| `540603` | ห้วยหม้าย | Huai Mai |
| `540604` | เตาปูน | Tao Pun |
| `540605` | หัวเมือง | Hua Mueang |
| `540606` | สะเอียบ | Sa-iap |
| `540607` | แดนชุมพล | Daen Chumphon |
| `540608` | ทุ่งน้าว | Thung Nao |

## 5. ตัวอย่าง `items[0]` จาก Response

```json
{
  "code": "540607",
  "id": "540607",
  "name_th": "แดนชุมพล",
  "name_en": "Daen Chumphon",
  "postal_code": "54120",
  "label": "แดนชุมพล / Daen Chumphon",
  "district_code": "5406",
  "district_name_th": "สอง",
  "district_name_en": "Song",
  "province_code": null,
  "province_name_th": null,
  "province_name_en": null
}
```

## 6. ผลตรวจเชิงโครงสร้างและข้อจำกัด

- Response มี 8 รายการ และทุก Object ในชุดตัวอย่างมี Field ชุดเดียวกัน 12 Fields
- `code` และ `id` เป็น string และตรงกันในข้อมูลตัวอย่าง; `code` ทั้ง 8 ค่าไม่ซ้ำกัน
- `district_code` ทั้งหมดเป็น `"5406"`; `postal_code` ทั้งหมดเป็น `"54120"` ตามชุดข้อมูลที่ได้รับ
- `province_code`, `province_name_th`, `province_name_en` เป็น `null` ทุกแถว ต้อง **รักษา `null` ตามต้นทาง** ไม่เติมค่าเองใน Raw Schema
- Response ไม่มี Pagination ในตัวอย่างที่ได้รับ แต่ไม่อาจยืนยันพฤติกรรมของ Endpoint สำหรับอำเภออื่น
- API ไม่ได้ประกาศ Primary Key, Nullable Contract หรือ Relationship Constraint อย่างเป็นทางการใน JSON ตัวอย่าง

**Source:** URL และ JSON Response ที่ผู้ใช้ส่งมาในบทสนทนา; ไม่มีการร้องขอ API เพิ่มในขั้นตอนจัดทำเอกสาร