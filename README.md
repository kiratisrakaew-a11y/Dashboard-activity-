# Procurement Activity Dashboard

Web App (Google Apps Script) สำหรับ **HEAD ฝ่ายจัดซื้อ** ใช้ติดตามงานของ Buyer จาก Google Sheet
**"Buyer Procurement Activity — DB"** และให้ AI (OpenAI / Gemini / Claude เลือกได้) ตรวจว่าแต่ละ Activity เขียนครบตาม Criteria หรือไม่

> **แอปนี้อ่าน DB อย่างเดียว** ไม่มีการแก้ไขข้อมูลใน DB ส่วนผลตรวจจาก AI และการตั้งค่าจะเก็บไว้ในไฟล์แยกชื่อ **"Activity Dashboard — AI Store"**

## สิ่งที่ Dashboard ติดตาม

| หน้า | เนื้อหา |
|---|---|
| ภาพรวม | Case ที่เปิดอยู่, Next action ที่เลยกำหนด/ครบกำหนด, Case ที่นิ่ง, Case ที่สรุปผลแล้วแต่ยัง OPEN, Case ที่เลย Required Date, คะแนน AI, Savings, จำนวนวันจากรับงานถึง Activity แรก, กราฟแยกตาม Buyer/แผนก/Budget/ช่องทาง/ขั้นตอน และแนวโน้มรายสัปดาห์ |
| Buyer | **ผลการต่อรองราคารายคน**: ยอดที่ต่อรองได้ (บาท), % ลดลง (ถ่วงน้ำหนักด้วยยอดเงิน), % เฉลี่ยต่อ Case, ต่ำสุด–สูงสุด, เทียบราคาประมาณการ, รายการราย Case และแถวรวมทั้งทีม · workload, Case ที่นิ่ง, Activity ใน 7 วัน, งานที่เลยกำหนด, Next action ที่ลืมติ๊ก Done, คะแนน AI เฉลี่ย, ช่องทางที่ใช้ |
| Cases | ตารางกรองได้ (Buyer, แผนก, สถานะ, สัญญาณผิดปกติ) คลิกเพื่อดู timeline ของ Activity พร้อมผลตรวจ AI รายรายการ |
| AI ตรวจการเขียน | คะแนนแยกตามประเภท, เกณฑ์ที่ขาดบ่อย, รายการคะแนนต่ำ, รายการที่ประเภทไม่ตรงกับเนื้อหา, ปุ่มสั่งตรวจ, ประวัติการรัน |
| Data Health | ปัญหาคุณภาพข้อมูล พร้อมลิงก์ไปยังแถวนั้นใน Sheet เพื่อแก้เอง |
| ตั้งค่า | เลือก AI provider/model, ปรับเกณฑ์ต่างๆ, ดูเกณฑ์ที่ AI ใช้ตรวจ |

### AI ตรวจการเขียน
- **Criteria แยกตาม Method ของ Case** ระบบเลือกเกณฑ์ตามลำดับนี้ แล้วต่อท้ายด้วยเกณฑ์กลาง 3 ข้อ (ข้อมูลเฉพาะเจาะจง / เนื้อหาตรงกับประเภท / อ่านแล้วเข้าใจทันที)
  1. ชีต **`Criteria`** ใน AI Store ที่ตรงทั้ง `Method` และ `Activity_Type`
  2. hint ใน DB (`Config_Settings` แถว `HINT_ACTIVITY_<TYPE>`)
  3. `HINT_ACTIVITY_DEFAULT` ใน DB
- **NORMAL** (จัดซื้อปกติ) ใช้ hint ใน DB ตามเดิม ซึ่งรวมการเทียบราคาหลายราย ส่วน **SPECIAL** (กรณีพิเศษ เลือก Vendor รายเดียว) มีเกณฑ์ตั้งต้นในชีต Criteria
  ที่ตัดเรื่องคู่เทียบออก และเพิ่ม 2 เกณฑ์แทน: *เหตุผลที่ใช้ Vendor รายเดียว* และ *ราคาอ้างอิง* (ราคาเดิม / PO เก่า / ราคาประมาณการ / historical price)
- วิธีแก้เกณฑ์ในชีต `Criteria`: ใส่ 1 เกณฑ์ต่อ 1 บรรทัดในช่อง `Criteria` ถ้าต้องการกลับไปใช้ hint ใน DB ให้ตั้ง `Is_Active` = FALSE หรือลบแถวนั้น
  ถ้าเพิ่มแถว `NORMAL` ระบบจะใช้แถวนั้นแทน hint ใน DB สำหรับประเภทนั้น
- เมื่อแก้ hint ใน DB, แก้ชีต Criteria หรือ Case เปลี่ยน Method ระบบจะตรวจรายการที่เกี่ยวข้องใหม่ให้เองในรอบถัดไป
- Data Health จะเตือน *"เทียบราคาน้อยกว่าเกณฑ์"* เฉพาะงาน NORMAL ที่สรุปผลแล้วแต่ติดต่อ Vendor น้อยกว่า `MIN_QUOTES` ราย
- AI ประเมินทีละเกณฑ์เป็น `yes / partial / no` แล้ว**ระบบคำนวณคะแนนเอง** (yes=1, partial=0.5) ได้เกรด A ≥85, B ≥70, C ≥50, D <50
- AI จะให้คำแนะนำ ตัวอย่างการเขียนใหม่ บอกว่าประเภทไม่ตรงกับเนื้อหาหรือไม่ และดึงตัวเลขราคา (ราคาตั้งต้น / ราคาสุดท้าย / ราคาประมาณการ) ออกมาเพื่อคำนวณ **Savings**
- ตรวจซ้ำเฉพาะ Activity ใหม่ หรือที่ถูกแก้ไข (Version/ข้อความเปลี่ยน) จึงไม่เสียค่า API ซ้ำ ระบบตรวจอัตโนมัติทุกชั่วโมง รอบละ `BATCH_SIZE` รายการ

### AI ตรวจทั้ง Case
- นอกจากตรวจทีละ Activity แล้ว AI จะอ่าน **timeline ทั้ง Case** แล้วสรุปผลดังนี้
  - สรุปสถานะ 2–3 บรรทัด
  - ผลรายเกณฑ์ระดับ Case แยก NORMAL/SPECIAL
  - สิ่งที่ยังขาด
  - **ข้อมูลที่ขัดกันระหว่าง Activity** เช่น ราคาหรือชื่อ Vendor ไม่ตรงกัน
  - พร้อมปิด/ส่งอนุมัติหรือยัง, ขั้นตอนถัดไป และระดับความเสี่ยง
  - ตัวเลข Savings ของ Vendor ที่เลือก ซึ่ง Dashboard จะใช้เป็นค่าหลัก
- **ตรวจใหม่อัตโนมัติ**เมื่อ Case นั้นมี Activity ใหม่, Activity ถูกแก้ไขหรือลบ, เปลี่ยน Method หรือแก้เกณฑ์ระดับ Case แม้ Case นั้นเคยตรวจไปแล้ว
  Case ที่ไม่มีอะไรเปลี่ยนจะไม่ถูกตรวจซ้ำ และ Case ที่ยังไม่มี Activity จะถูกข้าม
- รันในรอบเดียวกับการตรวจราย Activity ทุกชั่วโมง ไม่เกิน `CASE_BATCH_SIZE` Case ต่อรอบ (ค่าเริ่มต้น 10) หรือกดปุ่ม **"ตรวจทั้ง Case ใหม่"** ในหน้ารายละเอียด Case
- เกณฑ์ระดับ Case อยู่ในชีต `Criteria` แถวที่ `Activity_Type = CASE` แยก NORMAL/SPECIAL แก้ได้เหมือนเกณฑ์อื่น
- ผลเก็บในชีต `Case_Reviews` ของ AI Store ระบบสร้างชีตให้อัตโนมัติ

## การป้องกันไม่ให้แก้ DB
1. `src/DbReader.gs` เป็นไฟล์เดียวที่เปิด DB และใช้แค่ `getValues()`
2. การเขียนทั้งหมดอยู่ใน `src/Store.gs` ซึ่งจะปฏิเสธถ้า `STORE_ID` เป็นไฟล์เดียวกับ DB
3. `scripts/check-readonly.sh` จะ fail ถ้าเจอคำสั่งเขียนใน DbReader หรือมีไฟล์อื่นเปิด DB (รันอัตโนมัติก่อน `npm run push`)
4. **แนะนำ:** ให้บัญชีที่ deploy มีสิทธิ์ **Viewer** บน DB เท่านั้น จะได้มีการป้องกันระดับ Google ด้วย

## ติดตั้ง

1. สร้างโปรเจกต์ Apps Script แบบ standalone ที่ https://script.google.com แล้วนำโค้ดใน `src/` ไปวาง
   (หรือใช้ [clasp](https://github.com/google/clasp): `cp .clasp.json.example .clasp.json` ใส่ scriptId แล้วรัน `npm run push`)
2. ไปที่ **Project Settings → Script Properties** แล้วเพิ่ม API key ของ provider ที่จะใช้ (ใส่แค่ตัวที่ใช้ก็พอ)
   - `ANTHROPIC_API_KEY` (Claude)
   - `OPENAI_API_KEY` (OpenAI)
   - `GEMINI_API_KEY` (Gemini)
   - (ไม่บังคับ) `DB_ID` ถ้าต้องการชี้ไปไฟล์ DB อื่น
3. เปิดไฟล์ `Triggers.gs` เลือกฟังก์ชัน **`setup`** แล้วกด Run ครั้งเดียวและอนุญาตสิทธิ์
   ระบบจะสร้างไฟล์ "Activity Dashboard — AI Store" เก็บ `STORE_ID` และติดตั้ง trigger รายชั่วโมง
4. (ไม่บังคับ) รัน `testAiProvider` เพื่อลองตรวจ Activity 1 รายการ ผลจะแสดงใน log เท่านั้น ไม่บันทึกลง Store
5. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone within planbmedia.co.th**
6. เปิด URL ของ Web App ระบบให้เข้าได้เฉพาะอีเมลที่มี `Role = HEAD` และ `Is_Active = TRUE` ในชีต `Users`

### สลับ AI provider
ไปที่หน้า **ตั้งค่า** แล้วเลือก provider และ model (ปล่อยว่าง = ใช้ค่าเริ่มต้น) หรือแก้ในชีต `Settings` ของ AI Store ได้เช่นกัน

| provider | ค่าเริ่มต้น | วิธีบังคับให้ตอบเป็น JSON |
|---|---|---|
| `claude` | `claude-opus-5-5` (effort `low`) | `output_config.format` json_schema + server-side fallback |
| `openai` | `gpt-4.1-mini` | `response_format` json_schema (strict) |
| `gemini` | `gemini-2.5-flash` | `responseMimeType` + `responseSchema` |

ถ้าต้องการลดค่าใช้จ่ายสามารถตั้ง model เป็นรุ่นที่เล็กกว่าได้ เช่น `claude-haiku-5-5` ส่วนชื่อ model ของ OpenAI/Gemini ให้ตรวจกับเอกสารของผู้ให้บริการก่อนใช้

## พัฒนา / ทดสอบ
```bash
npm test          # unit test (Node ≥ 20) ของ Metrics, DataHealth, AiReview, AiProvider
npm run check     # read-only guard + test
```

### โครงสร้าง
```
src/
  Config.gs      ค่าตั้ง (Script Properties + ชีต Settings ใน AI Store)
  Auth.gs        ตรวจสิทธิ์ HEAD
  DbReader.gs    อ่าน DB (READ-ONLY) + แคช
  Util.gs        helper ที่เป็น pure function
  Metrics.gs     คำนวณ KPI
  DataHealth.gs  กฎตรวจคุณภาพข้อมูล
  AiReview.gs    สร้าง prompt/เกณฑ์, ตรวจผล, batch job
  AiProvider.gs  adapter OpenAI / Gemini / Claude
  Store.gs       อ่าน/เขียน AI Store (ไฟล์แยก)
  Triggers.gs    setup(), trigger, testAiProvider()
  WebApp.gs      doGet() และ API ที่หน้าเว็บเรียก
  ui/            หน้าเว็บ (HTML Service + Chart.js)
tests/           unit test (ใช้ข้อมูลสมมติ)
scripts/check-readonly.sh
```
