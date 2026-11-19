# ThaiPHC API #8 — Reports Volunteer Tenure: Response Schema

> **ข้อมูลต้นทาง:** URL และ JSON Response หน้าแรก 10 รายการที่ผู้ใช้ส่งมาเมื่อ 20 ตุลาคม 2569  
> **ขอบเขต:** จดบันทึกเฉพาะ Schema และข้อสังเกตที่ยืนยันได้จากตัวอย่าง ไม่ใช่ API Contract อย่างเป็นทางการ  
> **ความเป็นส่วนตัว:** ตัวอย่าง JSON ใช้ค่าปกปิดแทนชื่อ ที่อยู่ รหัส อสม. ที่ระบุตัวบุคคล และเลขประจำตัวประชาชนจริง

ผลตรวจต้นทางวันที่ 19 พฤศจิกายน 2569 อ่าน 158 หน้าและหยุดก่อนส่งข้อมูล พบ `null` ใน `startYear`, `tenureYears` และ `osmYear` ฟิลด์ละ 116 ค่า ใน `approvalDate` 94 ค่า และใน `osmStatus` 14 ค่า รวมถึงข้อความใน `retirementDate` 47 ค่าและ `retirementReason` 18 ค่า ตัวตรวจและตัวรับรองรับชนิดที่พบตามตาราง โดยคงเลขศูนย์ ข้อความว่าง และ `null` แยกกันในข้อมูลที่ใช้ตรวจความถูกต้อง

## 1. Endpoint และ Request

- **HTTP Method:** `GET` (ตามรูปแบบการอ่านข้อมูลใน URL ที่ให้มา)
- **Endpoint:** `https://api-thaiphc.hss.moph.go.th/api/v1/reports/volunteer-tenure`
- **Response format:** JSON (จากตัวอย่าง)
- **Authentication:** ไม่ปรากฏใน Response ตัวอย่างของ Endpoint นี้; ยังไม่ได้ยืนยันรูปแบบ Header สำหรับเส้นนี้โดยตรง

### Query Parameters จาก URL

| Parameter | ค่าที่ส่ง | ข้อสังเกต |
|---|---|---|
| `page` | `1` | หน้าที่ขอ |
| `pageSize` | `10` | รายการต่อหน้า |
| `provinceCode` | `54` | รหัสจังหวัด (camelCase) |
| `districtCode` | `5406` | รหัสอำเภอ (camelCase) |
| `province` | `54` | รหัสจังหวัดอีกชื่อ (อยู่ร่วมกันใน Request) |
| `district` | `5406` | รหัสอำเภออีกชื่อ (อยู่ร่วมกันใน Request) |

> Query string ส่งเป็นข้อความใน URL; ชนิดข้อมูลใน Response อาจแตกต่างกัน

## 2. Root Response Schema

| JSON path | Observed JSON type | ค่าที่พบหน้าแรก |
|---|---|---|
| `success` | boolean | `true` |
| `message` | string | `"Success"` |
| `items` | array<object> | 10 รายการ |
| `total` | integer | `1571` |
| `page` | integer | `1` |
| `pageSize` | integer | `10` |

- ค่า `total = 1571` เป็นตัวเลขที่เซิร์ฟเวอร์รายงานใน Response ตัวอย่าง **ยังไม่ได้ตรวจรายการทุกหน้า**
- `page` และ `pageSize` เป็น Field ที่ Root โดยตรง ไม่มี `pagination` Object ใน Response ตัวอย่าง
- ตัวอย่างไม่มี `pages` หรือ `hasNextPage`

## 3. Schema ของ `items[]` — 21 Fields

| Field | Observed JSON type | ตัวอย่างที่ไม่เปิดเผย PII | หมายเหตุ |
|---|---|---|---|
| `id` | `string` | "[REDACTED_UUID]" | UUID-formatted |
| `citizenId` | `string` | "[REDACTED_CITIZEN_ID]" | เลขประจำตัวประชาชน; ไม่เปิดเผยค่าจริง |
| `osmCode` | `string` | "[REDACTED_OSM_CODE]" | รหัส อสม. เป็นข้อความ |
| `firstName` | `string` | "[REDACTED]" | ชื่อบุคคล |
| `lastName` | `string` | "[REDACTED]" | นามสกุลบุคคล |
| `startYear` | `integer` หรือ `null` | 2545 | ปีเริ่มต้น ตัวอย่างใช้ปี พ.ศ. |
| `tenureYears` | `integer` หรือ `null` | 24 | อายุงาน (ปี) ที่ API คำนวณ |
| `osmYear` | `integer` หรือ `null` | 2545 | ปี อสม. ตัวอย่างใช้ปี พ.ศ. |
| `approvalDate` | `string` หรือ `null` | "2025-12-17" | วันอนุมัติ ตัวอย่างเป็นวันที่ YYYY-MM-DD |
| `retirementDate` | `string` หรือ `null` | `null` | หน้าแรกพบ `null` ทั้ง 10 รายการ ผลตรวจเพิ่มเติมพบข้อความ |
| `retirementReason` | `string` หรือ `null` | `null` | หน้าแรกพบ `null` ทั้ง 10 รายการ ผลตรวจเพิ่มเติมพบข้อความ |
| `osmStatus` | `string` หรือ `null` | "" | ค่าว่างและ `null` เป็นคนละค่า |
| `provinceCode` | `string` | "54" | รหัสจังหวัด; ค่าเป็นข้อความ |
| `provinceName` | `string` | "แพร่" | ชื่อจังหวัด |
| `districtCode` | `string` | "5406" | รหัสอำเภอ; ค่าเป็นข้อความ |
| `districtName` | `string` | "สอง" | ชื่ออำเภอ |
| `subdistrictCode` | `string` | "540601" | รหัสตำบล; ค่าเป็นข้อความ |
| `subdistrictName` | `string` | "บ้านหนุน" | ชื่อตำบล |
| `villageCode` | `string` | "540601001" | รหัสหมู่บ้าน 9 หลัก; ค่าเป็นข้อความ |
| `villageNo` | `string` | "1" | เลขหมู่เป็น string ไม่ใช่ integer |
| `villageName` | `string` | "หนุนเหนือ" | ชื่อหมู่บ้าน |

> ชนิดข้อมูลระบุจาก **10 รายการในหน้าแรก** เท่านั้น; หากพบ `null` ทั้งหน้า ยังไม่ทราบชนิดเมื่อ Field มีข้อมูลจริง และการไม่พบ `null` ไม่ใช่การรับประกัน Non-null

## 4. ตัวอย่าง Response Shape (ข้อมูลบุคคลถูกปกปิด)

ตัวอย่างต่อไปนี้แสดงหนึ่งรายการเพื่ออธิบายโครงสร้าง ไม่ใช่ Response ดิบ และไม่ใช่ข้อมูลที่ดึงเพิ่ม

```json
{
  "success": true,
  "message": "Success",
  "items": [
    {
      "id": "[REDACTED_UUID]",
      "citizenId": "[REDACTED_CITIZEN_ID]",
      "osmCode": "[REDACTED_OSM_CODE]",
      "firstName": "[REDACTED]",
      "lastName": "[REDACTED]",
      "startYear": 2545,
      "tenureYears": 24,
      "osmYear": 2545,
      "approvalDate": "2025-12-17",
      "retirementDate": null,
      "retirementReason": null,
      "osmStatus": "",
      "provinceCode": "54",
      "provinceName": "แพร่",
      "districtCode": "5406",
      "districtName": "สอง",
      "subdistrictCode": "540605",
      "subdistrictName": "หัวเมือง",
      "villageCode": "540605003",
      "villageNo": "3",
      "villageName": "ดงเจริญ"
    }
  ],
  "total": 1571,
  "page": 1,
  "pageSize": 10
}
```

## 5. ข้อสังเกต / ข้อจำกัดเชิง Schema

- Request ระบุคู่ Parameter ทั้งแบบ camelCase และแบบสั้น; ยังไม่ยืนยันว่าคู่ใดจำเป็นหรือมีลำดับความสำคัญ
- `startYear` และ `osmYear` เป็น integer ค่าตัวอย่าง เช่น `2545`, `2565` ซึ่งสื่อถึงปี พ.ศ.; `approvalDate` เป็นข้อความรูปแบบ YYYY-MM-DD ซึ่งเป็นคนละประเภทข้อมูล
- `retirementDate` และ `retirementReason` เป็น `null` ในทั้ง 10 แถว จึงยังไม่มีหลักฐานยืนยันชนิดเมื่อไม่เป็น `null` จาก Endpoint นี้
- `tenureYears` เป็นค่าที่ API ส่งมา (ตัวอย่างเช่น `24`, `13`); ยังไม่ได้ยืนยันสูตรการคำนวณและวันอ้างอิง
- `osmStatus` เป็น empty string ใน 10 รายการ ไม่ใช่ `null`
- ยังไม่มี OpenAPI Specification หรือเอกสารทางการมายืนยัน Required, Nullable, Enum และ Primary Key
- เอกสารนี้ไม่กำหนด Google Sheets Schema, Field Mapping หรือกระบวนการซิงก์ข้อมูล

**แหล่งข้อมูล:** Request URL และ JSON Response ที่ผู้ใช้ส่งในบทสนทนา โดยไม่ได้เรียก API เพิ่มในการจัดทำเอกสาร
