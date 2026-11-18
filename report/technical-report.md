# Technical Security Scan Report — OWASP Juice Shop

**สำหรับ:** ทีมพัฒนา (Development Team) และทีมความปลอดภัย (Security Team)  
**เครื่องมือสแกน:** Snyk CLI `v1.1308.4` (`snyk code test` สำหรับ SAST และ `snyk test` สำหรับ SCA)  
**แหล่งข้อมูลอ้างอิง:**
- Fail Run (โค้ดหลัก `master`): [`results/fail/snyk-code.sarif`](../results/fail/snyk-code.sarif), [`results/fail/snyk-sca.json`](../results/fail/snyk-sca.json)
- Pass Run (Verification PR `test/pass-run`): [`results/pass/snyk-code.sarif`](../results/pass/snyk-code.sarif), [`results/pass/snyk-sca.json`](../results/pass/snyk-sca.json)

---

## 1. ตารางสรุปจำนวน Finding แยกตาม Severity และ Scanner

ตัวเลขด้านล่างดึงตรงจากไฟล์ผลสแกนจริงของ **Fail Run (`master`)** ในโฟลเดอร์ `results/fail/`:

| Scanner | Critical | High | Medium | Low | รวม |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Snyk Code (SAST)** (`snyk-code.sarif`) | 0 *(ไม่มีระดับนี้)* | 27 | 31 | 278 | **336** |
| **Snyk Open Source (SCA — Vulnerable Paths)** (`snyk-sca.json`) | 1 | 40 | 67 | 2 | **110** |
| **รวมทั้งหมด (อิงตาม Path — ตรงกับ Quality Gate Log)** | **1** | **67** | **98** | **280** | **446** |

> **หมายเหตุการนับตัวเลข:**
> - **Quality Gate Log:** นับช่องโหว่ระดับ High และ Critical รวมกันได้ `27 (SAST High) + 1 (SCA Critical) + 40 (SCA High) = 68 blocking findings`
> - **Snyk Code (SARIF):** Snyk Code แบ่งระดับความรุนแรงเป็น `High` (`level: "error"`), `Medium` (`level: "warning"`), และ `Low` (`level: "note"`) โดยไม่ใช้ระดับ `Critical`
> - **Snyk Open Source (SCA):** ในไฟล์ `snyk-sca.json` รายการ `.vulnerabilities[]` เก็บแยกตาม dependency path รวม **110 vulnerable paths** (หากนับแบบไม่ซ้ำ Vulnerability ID จะได้ **68 unique issues**: Critical 1, High 24, Medium 41, Low 2)
> - **ขอบเขตการสแกน:** สแกน SCA เฉพาะ root `package.json` (631 dependencies) ยังไม่รวม `frontend/package.json`
> - **Pass Run (`results/pass/`):** เมื่อทดสอบกับแอปตัวอย่างที่สะอาดบน PR ผ่าน Quality Gate พบ SAST `0` และ SCA `0`

---

## 2. Top Issues (รายการช่องโหว่สำคัญ 6 รายการ)

### Issue #1: Arbitrary Code Injection ใน `marsdb`
- **Severity / Scanner:** `Critical` — Snyk Open Source (SCA)
- **Identifier:** `SNYK-JS-MARSDB-480405` (`CWE-94`)
- **ตำแหน่งที่พบ:** `marsdb@0.6.11` ใน [`package.json`](../package.json#L125) (`juice-shop@20.4.0-SNAPSHOT > marsdb@0.6.11`)
- **ผลกระทบ:** ช่องโหว่ในกลไก query/evaluation ของ `marsdb` อาจเปิดโอกาสให้ผู้โจมตีฉีดและรันคำสั่ง JavaScript อันตรายบนฝั่งเซิร์ฟเวอร์ (Remote Code Execution) หากส่ง input ที่ไม่ได้รับการตรวจสอบเข้าสู่ query โดยตรง
- **Remediation Steps:**
  - ปัจจุบัน **ไม่มี patch หรือเวอร์ชันที่แก้ไขแล้ว (`fixedIn: []`)** และโปรเจกต์ `marsdb` ขาดการดูแลต่อเนื่อง
  - **การแก้ไขระยะยาว:** ถอด `marsdb` ออกจาก `package.json` และย้ายการจัดเก็บข้อมูล/query ไปยัง engine ที่ยังได้รับการดูแลและรองรับ parameterized query เช่น SQLite ผ่าน Sequelize หรือ MongoDB driver เวอร์ชันล่าสุด
  - **การลดความเสี่ยงชั่วคราว:** จำกัดสิทธิ์และตรวจสอบชนิดข้อมูลของ input (strict schema validation เช่น `typeof === 'string'`) ก่อนส่งเข้า `db.reviewsCollection` / `db.ordersCollection`

---

### Issue #2: SQL Injection ในระบบ Login และ Search
- **Severity / Scanner:** `High` — Snyk Code (SAST: `javascript/Sqli`)
- **Identifier:** `CWE-89`
- **ตำแหน่งที่พบ:**
  - [`routes/login.ts`](../routes/login.ts#L34) (บรรทัดที่ 34)
  - [`routes/search.ts`](../routes/search.ts#L23) (บรรทัดที่ 23)
- **ผลกระทบ:** โค้ดนำค่า `req.body.email` และ `req.query.q` มาต่อ string เข้าคำสั่ง `models.sequelize.query(...)` โดยตรง ทำให้ผู้โจมตีสามารถใช้ SQL Injection เพื่อ **ข้ามการยืนยันตัวตน (Bypass Login เป็น Admin)** ใน `routes/login.ts` หรือใช้ `UNION SELECT` ดึงข้อมูลผู้ใช้และรหัสผ่านทั้งหมดจากฐานข้อมูลผ่าน `routes/search.ts`
- **Remediation Steps:**
  1. เปลี่ยนจากการต่อ string (template literal) เป็น **Parameterized Query** ด้วย `replacements` ของ Sequelize (หรือใช้ ORM method เช่น `UserModel.findOne({ where: ... })`)
  2. ตัวอย่างการแก้ใน `routes/login.ts`:
     ```ts
     models.sequelize.query(
       'SELECT * FROM Users WHERE email = :email AND password = :password AND deletedAt IS NULL',
       {
         replacements: {
           email: req.body.email || '',
           password: security.hash(req.body.password || '')
         },
         model: UserModel,
         plain: true
       }
     )
     ```
  3. ตัวอย่างการแก้ใน `routes/search.ts`: ใช้ `replacements: { pattern: `%${criteria}%` }` กับเงื่อนไข `LIKE :pattern`
  4. *(ข้อแนะนำเพิ่มเติม)* ปรับฟังก์ชัน `security.hash` ใน `lib/insecurity.ts` บรรทัดที่ 41 จาก MD5 ไปใช้ `bcrypt` หรือ `argon2` สำหรับจัดเก็บรหัสผ่าน

---

### Issue #3: Authorization & Authentication Bypass ใน JWT Libraries (`express-jwt`, `jsonwebtoken`)
- **Severity / Scanner:** `High` — Snyk Open Source (SCA)
- **Identifiers:**
  - `SNYK-JS-EXPRESSJWT-575022` (`CVE-2020-15084`, `CWE-285`)
  - `npm:jsonwebtoken:20150331` (`CVE-2015-9235`, `CWE-592`)
  - `SNYK-JS-JWS-14188253` (`CVE-2025-65945`, `CWE-347`) และ `npm:jws:20160726` (`CVE-2016-1000223`, `CWE-310`)
- **ตำแหน่งที่พบ:** `express-jwt@0.1.3` ([`package.json`](../package.json#L109)), `jsonwebtoken@0.4.0` ([`package.json`](../package.json#L123)), และ `jsonwebtoken@0.1.0` (transitive ใต้ `express-jwt@0.1.3`) — เรียกใช้งานใน [`lib/insecurity.ts`](../lib/insecurity.ts#L52-L56)
- **ผลกระทบ:** เวอร์ชันเก่าของ `express-jwt` และ `jsonwebtoken` มีปัญหาในการตรวจสอบ signature และ algorithm (เช่น algorithm confusion หรือการข้าม middleware `unless`) ทำให้ผู้โจมตีอาจปลอมแปลง JWT token เพื่อสวมสิทธิ์เป็นผู้ใช้งานอื่นหรือผู้ดูแลระบบได้
- **Remediation Steps:**
  1. อัปเกรดใน `package.json`:
     - `express-jwt@0.1.3` $\rightarrow$ `express-jwt@7.7.8` (แก้ไขตั้งแต่ `>= 6.0.0`)
     - `jsonwebtoken@0.4.0` $\rightarrow$ `jsonwebtoken@9.0.0` (แก้ไขตั้งแต่ `>= 4.2.2`)
  2. อัปเดต config ใน [`lib/insecurity.ts`](../lib/insecurity.ts#L52-L56) ให้กำหนด `algorithms: ['RS256']` อย่างชัดเจนทั้งใน `expressJwt(...)` และ `jwt.verify(...)` เพื่อป้องกัน algorithm downgrade/confusion attack

---

### Issue #4: Server-Side Request Forgery (SSRF) ในการอัปโหลดรูปโปรไฟล์จาก URL
- **Severity / Scanner:** `High` — Snyk Code (SAST: `javascript/Ssrf`)
- **Identifier:** `CWE-918`
- **ตำแหน่งที่พบ:** [`routes/profileImageUrlUpload.ts`](../routes/profileImageUrlUpload.ts#L24) (บรรทัดที่ 24)
- **ผลกระทบ:** Endpoint รับค่า `req.body.imageUrl` จากผู้ใช้แล้วส่งเข้า `await fetch(url)` โดยไม่มีการตรวจสอบ protocol, hostname, หรือ IP ปลายทาง ผู้โจมตีที่ล็อกอินแล้วสามารถสั่งให้เซิร์ฟเวอร์ยิง HTTP request ไปยังบริการภายใน (localhost / internal services / cloud metadata `169.254.169.254`) ได้
- **Remediation Steps:**
  1. Parse URL ด้วย `new URL(url)` และอนุญาตเฉพาะ `protocol === 'https:'`
  2. ทำ DNS resolution แล้วบล็อก private/loopback/link-local IP ranges (`127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `::1`) ก่อนเปิดการเชื่อมต่อ และปิด auto-redirect
  3. หากเป็นไปได้ให้จำกัดเฉพาะ domain allow-list ที่เชื่อถือได้

---

### Issue #5: Path Traversal ในการดาวน์โหลดและเขียนไฟล์
- **Severity / Scanner:** `High` — Snyk Code (SAST: `javascript/PT`)
- **Identifier:** `CWE-23`
- **ตำแหน่งที่พบ:**
  - [`routes/fileServer.ts`](../routes/fileServer.ts#L32) (บรรทัดที่ 32)
  - [`routes/profileImageUrlUpload.ts`](../routes/profileImageUrlUpload.ts#L29) (บรรทัดที่ 29)
- **ผลกระทบ:** ใน `routes/fileServer.ts` บรรทัดที่ 17 ตรวจสอบเพียง `!file.includes('/')` แล้วส่งเข้า `res.sendFile(path.resolve('ftp/', file))` ร่วมกับการตัด null-byte (`%00`) ซึ่งสามารถถูก bypass เพื่อเข้าถึงไฟล์นอกโฟลเดอร์ `ftp/` ได้ ส่วนใน `routes/profileImageUrlUpload.ts` นำ extension จาก URL มาต่อเป็นชื่อไฟล์เขียนลงดิสก์โดยตรง
- **Remediation Steps:**
  1. ใน `routes/fileServer.ts` ให้ระบุ option `root` หรือใช้ `path.basename` และตรวจ canonical path prefix:
     ```ts
     const baseDir = path.resolve('ftp')
     const safeName = path.basename(file)
     const resolvedPath = path.resolve(baseDir, safeName)
     if (!resolvedPath.startsWith(baseDir + path.sep)) {
       return res.status(403).json({ error: 'Forbidden' })
     }
     res.sendFile(resolvedPath)
     ```
  2. ใน `routes/profileImageUrlUpload.ts` ควร map extension จาก allow-list คงที่ (หรือตรวจจาก magic bytes/MIME type จริง) แทนการนำ substring จาก URL มาต่อเป็น path

---

### Issue #6: NoSQL Injection และ Hardcoded Private Key / Secrets
- **Severity / Scanner:** `High` — Snyk Code (SAST: `javascript/NoSqli`, `javascript/HardcodedSecret`, `javascript/HardcodedNonCryptoSecret`)
- **Identifier:** `CWE-943`, `CWE-547`
- **ตำแหน่งที่พบ:**
  - NoSQL Injection: [`routes/likeProductReviews.ts`](../routes/likeProductReviews.ts#L25) (บรรทัดที่ 25, 35, 43, 50) และ [`routes/updateProductReviews.ts`](../routes/updateProductReviews.ts#L17)
  - Hardcoded Secrets: [`lib/insecurity.ts`](../lib/insecurity.ts#L21) (RSA Private Key ฝังในซอร์สโค้ด) และ [`lib/insecurity.ts`](../lib/insecurity.ts#L42) (HMAC secret `'pa4qacea4VK9t9nGv7yZtwmj'`)
- **ผลกระทบ:**
  - ใน `likeProductReviews.ts` ค่า `req.body.id` ถูกส่งเข้า `db.reviewsCollection.findOne({ _id: id })` โดยไม่ตรวจชนิดข้อมูล ทำให้ผู้โจมตีส่ง JSON object (เช่น `{ "$ne": "" }`) เพื่อดัดแปลง query logic ได้
  - การฝัง RSA Private Key และ HMAC secret ในซอร์สโค้ดทำให้ผู้ที่อ่าน repository สามารถนำไปลงนาม/ปลอม JWT token หรือ HMAC ได้ทันที
- **Remediation Steps:**
  1. **NoSQLi:** ตรวจสอบชนิดข้อมูลก่อน query เสมอ (`if (typeof id !== 'string') return res.status(400).json({ error: 'Invalid id' })`)
  2. **Hardcoded Secrets:** ย้าย RSA Private Key และ HMAC secret ออกจากโค้ดไปอ่านจาก Environment Variables หรือ Secret Manager (เช่น `process.env.JWT_PRIVATE_KEY`) พร้อมสั่ง **revoke / rotate key** ชุดเดิมที่เคย commit ลง repository ทั้งหมด

---

## 3. ลำดับความสำคัญในการแก้ไข (Prioritization Strategy)

การจัดลำดับไม่ได้เรียงตาม Severity เพียงอย่างเดียว แต่พิจารณาจาก **โอกาสถูกโจมตีจากภายนอก (Exposure), ผลกระทบต่อระบบยืนยันตัวตน/ข้อมูลลูกค้า, และความพร้อมของวิธีแก้ (Patchability/Effort)**:

| ลำดับ | รายการที่ต้องแก้ | เหตุผลในการจัดลำดับ |
| :-: | :--- | :--- |
| **P0 (ด่วนที่สุด — ภายใน 1 สัปดาห์)** | 1. SQL Injection ใน `routes/login.ts` และ `routes/search.ts`<br>2. อัปเกรด `express-jwt` & `jsonwebtoken`<br>3. ลบ & Rotate Hardcoded Private Key/HMAC Secret<br>4. แก้ SSRF ใน `profileImageUrlUpload.ts` | เป็นจุดที่เปิดรับ input จากภายนอกโดยตรง กระทบการข้ามสิทธิ์ผู้ดูแลระบบและข้อมูลผู้ใช้ทั้งหมด **และมีทางแก้ที่ทำได้ทันที** (เปลี่ยน query / อัปเกรดเวอร์ชัน / ย้าย env var) โดยไม่ต้องรื้อโครงสร้างใหญ่ |
| **P1 (ระยะสั้น — ภายใน 1 เดือน)** | 1. วางแผนถอดเปลี่ยน `marsdb@0.6.11` (Critical)<br>2. แก้ Path Traversal (`fileServer.ts`) และ NoSQL Injection (`likeProductReviews.ts`, `updateProductReviews.ts`)<br>3. แก้ XSS (`routes/userProfile.ts`, `frontend/`) | แม้ `marsdb` จะเป็น Critical แต่ **ไม่มี patch ให้อัปเกรด** ต้องใช้เวลาในการทดสอบย้ายฐานข้อมูล/ORM จึงวาง input validation ป้องกันเบื้องต้นใน P0 แล้วดำเนินการเปลี่ยน library ให้เสร็จในรอบ Sprint ถัดไป |
| **P2 (Backlog / Hardening)** | 1. ช่องโหว่ระดับ Medium/Low (เช่น `sanitize-html`, `pdfkit`)<br>2. อัปเกรด/ทำความสะอาด `devDependencies` (เช่น `@cyclonedx/cyclonedx-npm`)<br>3. ขยาย SCA scope ให้ครอบคลุม `frontend/package.json` | ผลกระทบจำกัดกว่าหรือไม่ได้เปิดรับ input ใน production runtime โดยตรง เหมาะสำหรับทยอยอัปเกรดตามรอบบำรุงรักษา |

---

## 4. False-Positive / Lower-Risk Notes (การคัดกรองผลสแกนตามบริบทจริง)

จากการเปิดตรวจสอบโค้ดและไฟล์ตั้งค่าจริง พบกลุ่ม finding ที่ประเมินแล้วว่า **เป็น False Positive หรือมีความเสี่ยงต่ำกว่าที่เครื่องมือระบุ**:

### Note #1: ช่องโหว่ SQL Injection ใน `data/static/codefixes/*.ts` (Non-reachable Code)
- **Finding ที่เครื่องมือรายงาน:** Snyk Code แจ้ง **High (`javascript/Sqli`, `CWE-89`)** จำนวน 3 รายการ ได้แก่:
  - [`data/static/codefixes/dbSchemaChallenge_1.ts`](../data/static/codefixes/dbSchemaChallenge_1.ts#L5) (บรรทัดที่ 5)
  - `data/static/codefixes/unionSqlInjectionChallenge_1.ts` (บรรทัดที่ 6)
  - `data/static/codefixes/unionSqlInjectionChallenge_3.ts` (บรรทัดที่ 10)
- **เหตุผลที่ความเสี่ยงต่ำกว่าที่ระบุ / ไม่กระทบ Runtime:** ไฟล์ในโฟลเดอร์ `data/static/codefixes/` เป็นเพียง **ไฟล์ข้อมูลตัวอย่าง (static snippet files)** ที่ระบบใช้อ่านข้อความโค้ดไปแสดงใน UI โหมดฝึกแก้โจทย์ (Coding Challenges) ไม่ได้ถูก `server.ts` หรือ Express router เรียก execute กับฐานข้อมูลจริง การโจมตีจากผู้ใช้ภายนอกไม่สามารถเข้าถึงโค้ดส่วนนี้ได้
- **แนวทางจัดการ:** สามารถใส่ rule ยกเว้นโฟลเดอร์ข้อมูลตัวอย่าง (`data/static/codefixes/**`) ในไฟล์ `.snyk` policy เพื่อลด noise ในรายงาน โดยไม่ลดความปลอดภัยของ production code

### Note #2: ช่องโหว่ High ใน `@cyclonedx/cyclonedx-npm@4.2.1` และ Transitive Dependencies (`libxmljs2`, `uri-js`)
- **Finding ที่เครื่องมือรายงาน:** Snyk Open Source แจ้ง **High Severity** รวม 5 unique issues เช่น `Command Injection` (`CVE-2026-55849`, `CVE-2026-71538`), `Type Confusion` (`CVE-2024-34393`, `CVE-2024-34394` ใน `libxmljs2@0.37.0`), และ `Infinite loop` (`CVE-2026-93690` ใน `uri-js@4.4.1`)
- **เหตุผลที่ความเสี่ยงต่ำกว่าที่ระบุใน Production:** จากการตรวจสอบ [`package.json`](../package.json#L149-L150) พบว่า `@cyclonedx/cyclonedx-npm` ถูกประกาศอยู่ใน **`devDependencies`** และเรียกใช้เฉพาะคำสั่ง `npm run sbom` ([`package.json`](../package.json#L77)) สำหรับสร้างไฟล์ SBOM ตอนพัฒนา/build เท่านั้น **ไม่ได้ถูกติดตั้งหรือรันใน production runtime** และไม่ได้รับ untrusted input จากผู้ใช้ภายนอก
- **แนวทางจัดการ:** ใน CI สำหรับ production build ควรแยกสแกน `--omit=dev` (หรือ `--dev` แยกต่างหาก) เพื่อไม่ให้ dev-only tools บล็อก release production และทยอยอัปเกรด `@cyclonedx/cyclonedx-npm` เป็น `6.0.0` เพื่อสุขอนามัยของเครื่องมือนักพัฒนา

### Note #3 *(เพิ่มเติม)*: การแจ้งเตือน `HardcodedSecret` บน `publicKey`
- **Finding ที่เครื่องมือรายงาน:** Snyk Code แจ้ง **High (`javascript/HardcodedSecret`, `CWE-547`)** ที่ [`lib/insecurity.ts`](../lib/insecurity.ts#L20) (บรรทัดที่ 20)
- **เหตุผลที่ความเสี่ยงต่ำกว่าที่ระบุ (False Positive ในบรรทัดนี้):** บรรทัดที่ 20 คือตัวแปร `publicKey` ที่อ่านค่าจากไฟล์ `encryptionkeys/jwt.pub` โดยมี fallback string `'placeholder-public-key'` ซึ่ง **Public Key ไม่ใช่ข้อมูลความลับ** และไม่สร้างความเสี่ยงเหมือน Private Key (ต่างจากบรรทัดที่ 21 ที่เป็น `privateKey` จริง ซึ่งต้องแก้ไขตาม Issue #6)
