# ThaiPHC API #5 — Reports Volunteer Gender: Response Schema

> **ข้อมูลต้นทาง:** URL และ JSON Response หน้าแรก 10 รายการที่ผู้ใช้ส่งมาเมื่อ 20 ตุลาคม 2569  
> **ขอบเขต:** จดบันทึกเฉพาะ Schema และข้อสังเกตที่ยืนยันได้จากตัวอย่าง ไม่ใช่ API Contract อย่างเป็นทางการ  
> **ความเป็นส่วนตัว:** ตัวอย่าง JSON ใช้ค่าปกปิดแทนชื่อ ที่อยู่ รหัส อสม. ที่ระบุตัวบุคคล และเลขประจำตัวประชาชนจริง

## 1. Endpoint และ Request

- **HTTP Method:** `GET` (ตามรูปแบบการอ่านข้อมูลใน URL ที่ให้มา)
- **Endpoint:** `https://api-thaiphc.hss.moph.go.th/api/v1/reports/volunteer-gender`
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
| `total` | integer | `85` |
| `page` | integer | `1` |
| `pageSize` | integer | `10` |

- ค่า `total = 85` เป็นตัวเลขที่เซิร์ฟเวอร์รายงานใน Response ตัวอย่าง **ยังไม่ได้ตรวจรายการทุกหน้า**
- `page` และ `pageSize` เป็น Field ที่ Root โดยตรง ไม่มี `pagination` Object ใน Response ตัวอย่าง
- ตัวอย่างไม่มี `pages` หรือ `hasNextPage`

## 3. Schema ของ `items[]` — 12 Fields

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
| `total` | `integer` | 19 | จำนวนในแต่ละแถว (ระดับหมู่บ้าน) ไม่ใช่ Root `total` |
| `male` | `integer` | 3 | จำนวนเพศชาย |
| `female` | `integer` | 16 | จำนวนเพศหญิง |

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
      "total": 19,
      "male": 3,
      "female": 16
    }
  ],
  "total": 85,
  "page": 1,
  "pageSize": 10
}
```

## 5. ข้อสังเกต / ข้อจำกัดเชิง Schema

- `items[].total` (เช่น `19`) กับ Root `total` (`85`) อยู่คนละระดับของ JSON และมีความหมายต่างกันตามรูปแบบรายงาน
- ในตัวอย่าง 10 แถว `male + female = total` ของแต่ละแถว; ยังไม่ยืนยันว่าจะเป็นจริงสำหรับรายการทั้งหมด
- Response ตัวอย่างมี 10 หมู่บ้านในตำบลบ้านหนุน ไม่ใช่ข้อมูลครบทุกหมู่บ้านของอำเภอสอง
- ใช้รหัส `villageCode` / `subdistrictCode` เป็น string เพื่อคงจำนวนหลัก
- ยังไม่มี OpenAPI Specification หรือเอกสารทางการมายืนยัน Required, Nullable, Enum และ Primary Key
- เอกสารนี้ไม่กำหนด Google Sheets Schema, Field Mapping หรือกระบวนการซิงก์ข้อมูล

**แหล่งข้อมูล:** Request URL และ JSON Response ที่ผู้ใช้ส่งในบทสนทนา โดยไม่ได้เรียก API เพิ่มในการจัดทำเอกสาร