# ThaiPHC API #1 — Dashboard Assignments: Response Schema

> **สถานะเอกสาร:** อัปเดตจากตัวอย่าง Response หน้าแรกครบ 10 รายการที่ผู้ใช้ส่งเมื่อ 20 ตุลาคม 2569  
> **ขอบเขต:** บันทึกเฉพาะ Endpoint, Query Parameters, โครงสร้าง Response และชนิดข้อมูลที่สังเกต **ไม่ใช่เอกสารสัญญา API อย่างเป็นทางการ**  
> **การคุ้มครองข้อมูล:** ต้นฉบับมีชื่อ-นามสกุลและเลขประจำตัวประชาชนจริง เอกสารนี้ **ไม่คัดลอกค่าระบุตัวบุคคล** ตัวอย่างด้านล่างใช้ข้อความแทนเท่านั้น

## 1. HTTP Endpoint และ Authentication

| รายการ | ค่า |
|---|---|
| Method | `GET` |
| URL | `https://api-thaiphc.hss.moph.go.th/api/v1/dashboard/assignments` |
| Request Authorization | Header `Authorization: Bearer <TOKEN>` (ยืนยันจาก Browser โดยผู้ใช้; ไม่บันทึก Token) |
| Content type ของ Response | JSON (ตามตัวอย่างข้อมูล) |

### Query Parameters ที่สังเกตจาก Request

| Parameter | ตัวอย่างค่าใน URL | ข้อสังเกต |
|---|---|---|
| `page` | `1` | เลขหน้าที่ร้องขอ |
| `pageSize` | `10` | จำนวนรายการต่อหน้าในคำขอ |
| `provinceCode` | `54` | รหัสจังหวัดแพร่ |
| `districtCode` | `5406` | รหัสอำเภอสอง |
| `osmStatus` | `""` | ส่งเป็นค่าว่างใน Query; พฤติกรรมตัวกรองยังไม่ยืนยัน |
| `osm_status` | `""` | ส่งเป็นค่าว่างอีกชื่อหนึ่ง; ความต่างจาก `osmStatus` ยังไม่ยืนยัน |
| `approval_status` | `approved` | ตัวกรองการอนุมัติที่ระบุใน Request |
| `order_by` | `approved_date` | ค่าที่ร้องขอให้เรียง; ไม่มีฟิลด์ `approved_date` ในรายการตัวอย่าง |
| `sort_dir` | `desc` | ทิศทางเรียงที่ร้องขอ |

> ค่าของ Query Parameters ใน URL เป็นข้อความเสมอ แม้บางค่าจะสื่อถึงตัวเลข

## 2. Root Response Schema (ยืนยันตำแหน่ง `pagination` แล้ว)

| JSON path | Observed type | ข้อมูลจากตัวอย่าง |
|---|---|---|
| `provinces` | array<object> | 1 รายการใน Response ที่ได้รับ |
| `items` | array<object> | 10 รายการในหน้าแรก |
| `pagination` | object | มี `page`, `limit`, `total`, `pages` |

### `pagination` — 4 Fields

| JSON path | Observed type | ค่าในตัวอย่าง |
|---|---|---:|
| `pagination.page` | integer | `1` |
| `pagination.limit` | integer | `10` |
| `pagination.total` | integer | `1571` |
| `pagination.pages` | integer | `158` |

- จำนวนหน้า `158` สอดคล้องกับ `ceil(1571 / 10)`
- `pageSize=10` ที่ Request สอดคล้องกับ `pagination.limit=10` ในตัวอย่างนี้
- `total` เป็นจำนวนที่ Server รายงาน ไม่ใช่ผลจากการตรวจสอบครบทุกหน้า
- ทั้ง `pagination.total` และ `provinces[0].osmCount` เท่ากับ `1571` **ยังไม่ยืนยันความหมายเชิงขอบเขตของจำนวนดังกล่าว** ว่าเป็นเฉพาะอำเภอสองหรือยอดสรุปในระดับจังหวัด

## 3. `provinces[]` — 4 Fields

| Field | Observed JSON type | ตัวอย่าง | หมายเหตุ |
|---|---|---|---|
| `provinceCode` | string | `"54"` | รหัสจังหวัด |
| `provinceNameTh` | string | `"แพร่"` | ชื่อไทย |
| `provinceNameEn` | string | `"Phrae"` | ชื่ออังกฤษ |
| `osmCount` | integer | `1571` | จำนวน อสม. ตามสรุปที่ API คืนค่า; ยังไม่ยืนยันความหมายเชิงขอบเขต |

## 4. `items[]` — 25 Fields

> **ชนิดข้อมูลที่สังเกต:** อ้างอิง 10 รายการในหน้าแรกเท่านั้น ฟิลด์ที่ไม่พบ `null` ในตัวอย่าง **ไม่ได้หมายความว่า Non-null ตามสัญญา API**  
> **Nullable:** `villageName` มีค่า `null` ทุก 10 รายการ; ยังไม่ทราบชนิดเมื่อมีข้อมูล

| Field | Observed JSON type | รูปแบบ/ค่าที่ปลอดภัยสำหรับแสดง | ข้อสังเกต |
|---|---|---|---|
| `id` | string | UUID-formatted | ค่า ID ประจำรายการ; ยังไม่ได้ตรวจ uniqueness ทุกหน้า |
| `osmCode` | string | รหัสตัวเลขในรูปข้อความ | พบทั้งความยาว 14 และ 15 ตัวอักษร; ห้ามแปลงเป็น Number |
| `citizenId` | string | `[REDACTED]` | **ข้อมูลส่วนบุคคลอ่อนไหวในบริบทการใช้งาน**; ในตัวอย่างเป็นสตริงตัวเลข 13 หลัก ไม่เก็บค่าจริงในเอกสาร |
| `prefixNameTh` | string | `"นางสาว"`, `"นาง"`, `"นาย"` | พบหลายค่า |
| `prefixNameEn` | string | `"Miss"`, `"Mrs."`, `"Mr."` | พบหลายค่า |
| `firstName` | string | `[REDACTED]` | ชื่อบุคคล |
| `lastName` | string | `[REDACTED]` | นามสกุลบุคคล |
| `fullName` | string | `[REDACTED]` | ชื่อเต็มบุคคล |
| `provinceCode` | string | `"54"` | ตรงกับ Request ในทั้ง 10 รายการ |
| `provinceNameTh` | string | `"แพร่"` | ชื่อจังหวัด |
| `districtCode` | string | `"5406"` | ตรงกับ Request ในทั้ง 10 รายการ |
| `districtNameTh` | string | `"สอง"` | ชื่ออำเภอ |
| `subdistrictCode` | string | `"540603"` | รหัสตำบล 6 หลัก เป็นข้อความ |
| `subdistrictNameTh` | string | `"ห้วยหม้าย"` | ชื่อตำบล |
| `villageNo` | string | `"7"`, `"16"` | เลขหมู่ **เป็น string** แม้เป็นค่าตัวเลข |
| `villageName` | null (10/10) | `null` | ยังไม่ทราบชนิดเมื่อไม่เป็น `null` |
| `isActive` | boolean | `true` | พบ `true` ทั้ง 10 ตัวอย่าง; ยังไม่ยืนยันว่ามี `false` หรือไม่ |
| `status` | string | `"ใช้งาน"` | พบค่าเดียวในตัวอย่าง |
| `osmStatus` | string | `""` | เป็น empty string ไม่ใช่ `null`; พบค่าเดียวในตัวอย่าง |
| `osmShowbbody` | string | `"1"` | **ชื่อสะกดตาม API ต้นทางเป๊ะ** (รวม `bbody`); พบค่าเดียว |
| `approvalStatus` | string | `"approved"` | พบค่าเดียว สอดคล้องกับตัวกรอง |
| `volunteerStatus` | string | `"already_volunteer"`, `"not_interested"` | พบอย่างน้อยสองค่าในหน้าแรก |
| `createdAt` | string (ISO 8601 timestamp) | `2025-11-10T05:36:01.776457Z` | ค่าวันเวลา; เป็น string ใน JSON |
| `requestDate` | string (ISO 8601 timestamp) | `2025-11-10T05:36:01.776457Z` | ค่าวันเวลา; เป็น string ใน JSON |
| `updatedAt` | string (ISO 8601 timestamp) | `2026-10-12T13:07:33.846207Z` | ค่าวันเวลา; เป็น string ใน JSON |

**ข้อควรระวังเกี่ยวกับ Field Names**

- ใช้ **camelCase** ใน `items[]` และ `provinces[]` แต่ Query บางตัวใช้ **snake_case**
- `osmShowbbody` ต้องรักษาชื่อที่สะกดผิดตาม Response จริงไว้ใน Raw Schema; อย่าเปลี่ยนเป็น `osmShowbody` โดยอัตโนมัติ
- `villageNo` เป็น `string` ใน API นี้ ขณะที่ `village_no` ของ `lookups/villages` เป็น integer จากตัวอย่างก่อนหน้า
- สถานะ `""` และ `null` ไม่ใช่ค่าเดียวกัน

## 5. ตัวอย่าง Response Shape (ปกปิดข้อมูลระบุตัวบุคคล)

> ตัวอย่างนี้ใช้รายการสมมติ 1 รายการเพื่ออธิบาย Shape; **ไม่ใช่การคัดลอกระเบียนจริงหรือผล Fetch ใหม่**

```json
{
  "provinces": [
    {
      "provinceCode": "54",
      "provinceNameTh": "แพร่",
      "provinceNameEn": "Phrae",
      "osmCount": 1571
    }
  ],
  "items": [
    {
      "id": "[REDACTED_UUID]",
      "osmCode": "[REDACTED_OSM_CODE]",
      "citizenId": "[REDACTED_CITIZEN_ID]",
      "prefixNameTh": "นางสาว",
      "prefixNameEn": "Miss",
      "firstName": "[REDACTED]",
      "lastName": "[REDACTED]",
      "fullName": "[REDACTED]",
      "provinceCode": "54",
      "provinceNameTh": "แพร่",
      "districtCode": "5406",
      "districtNameTh": "สอง",
      "subdistrictCode": "540603",
      "subdistrictNameTh": "ห้วยหม้าย",
      "villageNo": "7",
      "villageName": null,
      "isActive": true,
      "status": "ใช้งาน",
      "osmStatus": "",
      "osmShowbbody": "1",
      "approvalStatus": "approved",
      "volunteerStatus": "already_volunteer",
      "createdAt": "2025-11-10T05:36:01.776457Z",
      "requestDate": "2025-11-10T05:36:01.776457Z",
      "updatedAt": "2026-10-12T13:07:33.846207Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 1571,
    "pages": 158
  }
}
```

## 6. ขอบเขตที่ยังตรวจสอบไม่ได้

1. ตัวอย่างหน้าแรกครบ 10 รายการแล้ว แต่ **ยังไม่มี Response ของหน้า 2–158** และยังไม่ได้ตรวจ `total=1571` โดยดึงครบทุกหน้า
2. ยังไม่ยืนยันการทำงานของตัวกรองทั้งหมดบน Server และลำดับการ Sort จริง
3. ยังไม่ยืนยัน Nullable / Optionality ของ Fields ในข้อมูลทั้งชุด เพราะตัวอย่างมีเพียง 10 รายการ
4. ยังไม่มีคำอธิบายอย่างเป็นทางการของ `osmShowbbody`, `osmStatus` และ `volunteerStatus` ทุกค่า
5. ยังไม่ยืนยัน Primary Key / Unique Constraint อย่างเป็นทางการของ `id`, `osmCode` จาก API ต้นทาง

**แหล่งข้อมูล:** URL, Request Header ที่ผู้ใช้รายงาน และ JSON Response หน้า 1 (10 รายการ พร้อม Pagination) ที่ผู้ใช้ส่งในแชท ไม่มีการเรียก API เพิ่มเพื่อจัดทำเอกสารนี้