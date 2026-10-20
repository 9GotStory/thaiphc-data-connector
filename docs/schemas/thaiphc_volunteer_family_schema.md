# ThaiPHC API #6 — Reports Volunteer Family: Response Schema

> **ข้อมูลต้นทาง:** URL และ JSON Response หน้าแรก 10 รายการที่ผู้ใช้ส่งมาเมื่อ 20 ตุลาคม 2569  
> **ขอบเขต:** จดบันทึกเฉพาะ Schema และข้อสังเกตที่ยืนยันได้จากตัวอย่าง ไม่ใช่ API Contract อย่างเป็นทางการ  
> **ความเป็นส่วนตัว:** ตัวอย่าง JSON ใช้ค่าปกปิดแทนชื่อ ที่อยู่ รหัส อสม. ที่ระบุตัวบุคคล และเลขประจำตัวประชาชนจริง

## 1. Endpoint และ Request

- **HTTP Method:** `GET` (ตามรูปแบบการอ่านข้อมูลใน URL ที่ให้มา)
- **Endpoint:** `https://api-thaiphc.hss.moph.go.th/api/v1/reports/volunteer-family`
- **Response format:** JSON (จากตัวอย่าง)
- **Authentication:** ไม่ปรากฏใน Response ตัวอย่างของ Endpoint นี้; ยังไม่ได้ยืนยันรูปแบบ Header สำหรับเส้นนี้โดยตรง

### Query Parameters จาก URL

| Parameter | ค่าที่ส่ง | ข้อสังเกต |
|---|---|---|
| `page` | `1` | หน้าที่ขอ |
| `pageSize` | `10` | รายการต่อหน้า |
| `province` | `54` | รหัสจังหวัด |
| `district` | `5406` | รหัสอำเภอ |

> Query string ส่งเป็นข้อความใน URL; ชนิดข้อมูลใน Response อาจแตกต่างกัน

## 2. Root Response Schema

| JSON path | Observed JSON type | ค่าที่พบหน้าแรก |
|---|---|---|
| `success` | boolean | `true` |
| `message` | string | `"Success"` |
| `items` | array<object> | 10 รายการ |
| `total` | integer | `1803` |
| `page` | integer | `1` |
| `pageSize` | integer | `10` |

- ค่า `total = 1803` เป็นตัวเลขที่เซิร์ฟเวอร์รายงานใน Response ตัวอย่าง **ยังไม่ได้ตรวจรายการทุกหน้า**
- `page` และ `pageSize` เป็น Field ที่ Root โดยตรง ไม่มี `pagination` Object ใน Response ตัวอย่าง
- ตัวอย่างไม่มี `pages` หรือ `hasNextPage`

## 3. Schema ของ `items[]` — 21 Fields

| Field | Observed JSON type | ตัวอย่างที่ไม่เปิดเผย PII | หมายเหตุ |
|---|---|---|---|
| `provinceCode` | `string` | "54" | รหัสจังหวัด; ค่าเป็นข้อความ |
| `provinceName` | `string` | "แพร่" | ชื่อจังหวัด |
| `districtCode` | `string` | "5406" | รหัสอำเภอ; ค่าเป็นข้อความ |
| `districtName` | `string` | "สอง" | ชื่ออำเภอ |
| `subdistrictCode` | `string` | "540601" | รหัสตำบล; ค่าเป็นข้อความ |
| `subdistrictName` | `string` | "บ้านหนุน" | ชื่อตำบล |
| `villageCode` | `string` | "540601001" | รหัสหมู่บ้าน 9 หลัก; ค่าเป็นข้อความ |
| `villageNo` | `string` | "1" | เลขหมู่เป็น string ไม่ใช่ integer |
| `villageName` | `string` | "หนุนเหนือ" | ชื่อหมู่บ้าน |
| `osmCode` | `string` | "[REDACTED_OSM_CODE]" | รหัสบุคคลในข้อมูลตัวอย่าง; ไม่เปิดเผยค่าจริง |
| `citizenId` | `string` | "[REDACTED_CITIZEN_ID]" | เลขประจำตัวประชาชน; ควรปกปิดในเอกสาร |
| `prefixName` | `string` | "นาย" | คำนำหน้าชื่อ; พบทั้งค่า `"ไม่ระบุ"` และค่าอื่น |
| `firstName` | `string` | "[REDACTED]" | ชื่อบุคคล |
| `lastName` | `string` | "[REDACTED]" | นามสกุลบุคคล |
| `fullName` | `string` | "[REDACTED]" | ชื่อเต็มบุคคล |
| `gender` | `string` | "female" | พบ `"other"`, `"male"`, `"female"` ใน 10 รายการ |
| `address` | `string` | "[REDACTED_ADDRESS]" | ที่อยู่/บ้านเลขที่ ซึ่งเป็นข้อมูลระบุตัวบุคคล |
| `status` | `string` | "volunteer" | พบ `"child"`, `"spouse"`, `"volunteer"` |
| `statusLabel` | `string` | "อสม." | คำอธิบายสถานะ เช่น `"บุตร"`, `"คู่สมรส"`, `"อสม."` |
| `volunteerId` | `string` | "[REDACTED_UUID]" | รูปแบบ UUID; ระบุอาสาสมัครที่เชื่อมกับรายการ |
| `volunteerName` | `string` | "[REDACTED]" | ชื่อ อสม. ที่เชื่อมโยง |

> ชนิดข้อมูลระบุจาก **10 รายการในหน้าแรก** เท่านั้น; หากพบ `null` ทั้งหน้า ยังไม่ทราบชนิดเมื่อ Field มีข้อมูลจริง และการไม่พบ `null` ไม่ใช่การรับประกัน Non-null

## 4. ตัวอย่าง Response Shape (ข้อมูลบุคคลถูกปกปิด)

ตัวอย่างต่อไปนี้แสดงหนึ่งรายการเพื่ออธิบายโครงสร้าง ไม่ใช่ Response ดิบ และไม่ใช่ข้อมูลที่ดึงเพิ่ม

```json
{
  "success": true,
  "message": "Success",
  "items": [
    {
      "provinceCode": "54",
      "provinceName": "แพร่",
      "districtCode": "5406",
      "districtName": "สอง",
      "subdistrictCode": "540601",
      "subdistrictName": "บ้านหนุน",
      "villageCode": "540601001",
      "villageNo": "1",
      "villageName": "หนุนเหนือ",
      "osmCode": "[REDACTED_OSM_CODE]",
      "citizenId": "[REDACTED_CITIZEN_ID]",
      "prefixName": "นาย",
      "firstName": "[REDACTED]",
      "lastName": "[REDACTED]",
      "fullName": "[REDACTED]",
      "gender": "male",
      "address": "[REDACTED_ADDRESS]",
      "status": "volunteer",
      "statusLabel": "อสม.",
      "volunteerId": "[REDACTED_UUID]",
      "volunteerName": "[REDACTED]"
    }
  ],
  "total": 1803,
  "page": 1,
  "pageSize": 10
}
```

## 5. ข้อสังเกต / ข้อจำกัดเชิง Schema

- Response หน้าแรกมี `subdistrictCode` ค่า `"540210"` อยู่ในคำขอที่กรอง `district=5406`; ในแถวเดียวกัน `villageCode` เป็น `"540603006"` จึงมีรูปแบบรหัสพื้นที่ไม่สอดคล้องกันในตัวอย่าง **ให้เก็บตามต้นทาง**
- ยังพบ `subdistrictCode` เป็น `"540601"` แต่ `villageCode` เป็น `"540303004"` และ `"540405002"` ในตัวอย่างบางแถว; ยังไม่ทราบสาเหตุ
- รายการ `status` มีทั้งบทบาทครอบครัวและ `volunteer` จึงไม่ควรอนุมานว่า 1 แถวเท่ากับครอบครัวหนึ่งครอบครัว
- ตัวอย่างไม่มี Field `id` ของสมาชิกครอบครัวโดยตรง; `volunteerId` เป็นรหัส อสม. ที่เชื่อมโยง แต่ยังไม่ยืนยัน Unique Key ของแต่ละรายการ
- ข้อมูลนี้มี PII ได้แก่ ชื่อ, `citizenId`, `address`, `osmCode` และ `volunteerName` จึงใช้ค่าปกปิดในเอกสาร
- ยังไม่มี OpenAPI Specification หรือเอกสารทางการมายืนยัน Required, Nullable, Enum และ Primary Key
- เอกสารนี้ไม่กำหนด Google Sheets Schema, Field Mapping หรือกระบวนการซิงก์ข้อมูล

**แหล่งข้อมูล:** Request URL และ JSON Response ที่ผู้ใช้ส่งในบทสนทนา โดยไม่ได้เรียก API เพิ่มในการจัดทำเอกสาร