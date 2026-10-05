# POSPRO V2

ระบบขายหน้าร้านสำหรับร้านอาหาร ใช้ได้บนแท็บเล็ตที่เคาน์เตอร์และมือถือพนักงาน
เป็นเว็บแบบไฟล์ล้วน ไม่ต้อง build ใช้ GitHub Pages ได้ หลังบ้านคือ Supabase (ฐานข้อมูล ระบบล็อกอิน และที่เก็บรูป)

## ติดตั้งครั้งแรก (ทำครั้งเดียว)

1. **สร้างโปรเจกต์ Supabase ใหม่สำหรับ POSPRO** ที่ supabase.com แนะนำให้แยกจาก TripExpense เพื่อไม่ให้ข้อมูลปนกัน
2. **รัน SQL:** เปิด Supabase → SQL Editor → New query → วางเนื้อหาไฟล์ `sql/001_pospro_v2_schema.sql` ทั้งไฟล์ → กด Run ต้องขึ้นว่า Success
3. **ตั้งค่าการล็อกอิน:** Authentication → URL Configuration → ใส่ Site URL เป็นที่อยู่เว็บของ POSPRO
   (เช่น `https://<ชื่อ GitHub>.github.io/pospro/`) และเพิ่มที่อยู่เดียวกันใน Redirect URLs
   ถ้าอยากให้สมัครแล้วใช้ได้ทันทีโดยไม่ต้องยืนยันอีเมล ให้ปิด “Confirm email” ใน Authentication → Providers → Email
4. **ใส่กุญแจ:** คัดลอก `assets/js/config.example.js` ไปเป็น `assets/js/config.js` แล้วใส่ Project URL กับ anon (publishable) key
   ที่ได้จาก Project Settings → API **ห้ามใส่ service_role key**
5. **อัปโหลดขึ้น GitHub:** ทุกไฟล์ในโฟลเดอร์นี้ไปไว้ใน repo ใหม่ เช่น `pospro` แล้วเปิด GitHub Pages (Settings → Pages → Branch: main)
   รอ 1–2 นาที แล้วเปิดเว็บ
6. **เริ่มใช้:** สมัครใช้งาน → “สร้างร้านใหม่” → ทำตามรายการ “ตั้งค่าร้านให้พร้อมขาย” ในหน้าแรก

> POSPRO เวอร์ชันเดิม (ไฟล์เดียว + Google Sheets) ยังใช้ต่อได้ตามปกติ เวอร์ชันนี้เป็นระบบใหม่แยกต่างหาก
> ใช้ตั้งค่าเมนูและพนักงานไว้ก่อน และจะใช้แทนของเดิมได้เมื่อหน้าขายเปิดใน V2.1

## อัปเดตเวอร์ชันถัดไป

- แตกไฟล์ zip ใหม่แล้วอัปโหลดทับ โดย zip **ไม่มี** `assets/js/config.js` กุญแจของคุณจึงไม่ถูกเขียนทับ
- ถ้าเวอร์ชันใหม่มีไฟล์ SQL เพิ่ม (`sql/002_...`) ให้รันใน SQL Editor ก่อนอัปโหลด
- หลังอัปโหลด กดรีเฟรชแรงๆ หนึ่งครั้ง ถ้าติดตั้งเป็นแอปไว้ ให้ปิดแอปแล้วเปิดใหม่

## หน้าที่ของแต่ละบทบาท

| บทบาท | ทำอะไรได้ |
|---|---|
| เจ้าของร้าน | ทุกอย่าง รวมถึงอนุมัติพนักงานและเปลี่ยนหน้าที่ |
| ผู้จัดการ | จัดการเมนู รูป โต๊ะ สถานีครัว และตั้งค่าร้าน |
| แคชเชียร์ | ขาย เช็คบิล และดูครัว (หน้าขายเปิดใน V2.1) |
| ครัว | เห็นเฉพาะจอครัว |

สิทธิ์ทั้งหมดบังคับในฐานข้อมูลด้วย (Row Level Security) ไม่ได้แค่ซ่อนปุ่ม

## รูปเมนู

เลือกรูปจากมือถือได้ทุกขนาด (สูงสุด 40 MB) แล้วเลื่อน/ซูมเลือกส่วนที่จะแสดง ระบบจะย่อเป็น 800×600 JPEG
ไม่เกิน 400 KB ก่อนอัปโหลด และเก็บเป็นไฟล์จริงใน Supabase Storage (bucket `pospro`) จึงไม่หายหลังรีเฟรช
รูป HEIC จาก iPhone เปิดได้บน Safari ถ้าเบราว์เซอร์อื่นเปิดไม่ได้ ระบบจะแจ้งให้เลือกรูปอื่น

## สำหรับนักพัฒนา

```
sql/001_pospro_v2_schema.sql   ตาราง + RLS + RPC + storage policy
js/core.js                     APP_VERSION, การเชื่อมต่อ, ตัวช่วย
js/image.js + js/cropper.js    ระบบรูป (ครอป ย่อ อัปโหลด)
js/shell.js                    เมนูหลัก, go()/goBack()
js/menu.js, tables.js, staff.js, profile.js, home.js   หน้าต่างๆ
tests/run_sql_tests.sh         ทดสอบ SQL กับ PostgreSQL 15+ ในเครื่อง (จำลองส่วนของ Supabase)
tests/ui_test.py               ทดสอบหน้าจอจริงใน Chromium (มือถือ 360px และแท็บเล็ต 1024px) ด้วย Supabase จำลอง
tools/bump_version.py          เลื่อนเวอร์ชัน: python3 tools/bump_version.py --root . --revision
tools/check_release.py         ตรวจก่อนแพ็ก: python3 tools/check_release.py --root . --syntax
```
