# CICO SSO API - TECHNICAL SPECIFICATION
## Untuk Integrasi dengan CurCol (Internal Messaging App)

**Document Date:** 17 Maret 2026  
**Status:** PRODUCTION READY ✅  
**API Version:** 1.0

---

## 1. VERIFIKASI URL & AKSES

### ✅ a) URL CICO yang Benar

**URL:** `https://workspace.joniiswa1101.repl.co`

**Status:** 
- ✅ **AKTIF & ONLINE** - Sudah dipublish ke production
- ✅ **ACCESSIBLE dari Internet** - Bisa diakses dari mana saja
- ✅ **LIVE Now** - Ready untuk integration

### ✅ b) CICO Sedang Online & Accessible

**Verifikasi:**
```
Test endpoint: https://workspace.joniiswa1101.repl.co/api/server-time
Expected response: { "timestamp": "ISO-8601-date" }
Status: 200 OK ✅
```

CICO server **ONLINE dan ACCESSIBLE** dari internet publik.

### ✅ c) Firewall / IP Whitelist

**Status:** **TIDAK ADA FIREWALL ATAU IP WHITELIST**

- CICO tidak menggunakan IP whitelist
- Semua CICO API endpoints bisa diakses dari IP mana pun (public internet)
- **Tidak perlu** setup firewall rules atau IP whitelist

---

## 2. API ENDPOINT SSO LOGIN

### ✅ a) Endpoint SSO Login - BENAR

**Endpoint yang benar:** ✅ **`/api/auth/sso/login`**

Sesuai dengan yang diminta CurCol.

### ✅ b) HTTP Method

**Method:** ✅ **`POST`**

### ✅ c) Request Body Format - BENAR

**Format request:**
```json
{
  "username": "john.doe",
  "password": "password123"
}
```

**Field yang dikirim:**
- ✅ `username` (String) - REQUIRED
  - Bisa pakai: username, email, atau NIK
  - Contoh: "john.doe" atau "john@company.com" atau "EMP001"
- ✅ `password` (String) - REQUIRED
  - Password user CICO

**Contoh request lengkap:**
```bash
curl -X POST https://workspace.joniiswa1101.repl.co/api/auth/sso/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "john.doe",
    "password": "password123"
  }'
```

### ✅ d) Response Saat Login BERHASIL (Status 200)

**Format response:** ✅ **SESUAI dengan yang diminta**

```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "email": "john@company.com",
    "username": "john.doe",
    "fullName": "John Doe",
    "department": "IT",
    "role": "employee",
    "companyId": "507f1f77bcf86cd799439010"
  }
}
```

**Field dalam `user` object:**
- ✅ `id` - MongoDB ObjectId (as string)
- ✅ `email` - Email employee
- ✅ `username` - Username login
- ✅ `fullName` - Full name (BUKAN "name", pakai "fullName")
- ✅ `department` - Department/divisi
- ✅ `role` - Role (employee, manager, supervisor, admin)
- ✅ `companyId` - Company ID

### ✅ e) Response Saat Login GAGAL (Status Error)

**Status & Format Error:**

#### 1. Invalid Credentials (Status 401)
```json
{
  "error": "Invalid credentials"
}
```
- Username tidak ditemukan atau password salah

#### 2. User Inactive (Status 403)
```json
{
  "error": "User account is inactive"
}
```
- User account sudah di-disable

#### 3. Missing Fields (Status 400)
```json
{
  "error": "Username and password required"
}
```
- Username atau password tidak dikirim

#### 4. Server Error (Status 500)
```json
{
  "error": "SSO login failed"
}
```
- Error di server side

---

## 3. ENDPOINT VERIFIKASI TOKEN

### ✅ a) Ada Endpoint Verifikasi Token

**URL:** ✅ **`POST /api/auth/sso/validate`**

Ya, endpoint ini tersedia untuk verifikasi token.

### ✅ b) Format Request dengan Bearer Token

**Request Headers:**
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json
```

**Contoh request lengkap:**
```bash
curl -X POST https://workspace.joniiswa1101.repl.co/api/auth/sso/validate \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json"
```

### ✅ c) Response Token Valid vs Invalid

#### Response Token VALID (Status 200)
```json
{
  "valid": true,
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "email": "john@company.com",
    "username": "john.doe",
    "fullName": "John Doe",
    "department": "IT",
    "role": "employee",
    "companyId": "507f1f77bcf86cd799439010"
  }
}
```

#### Response Token INVALID / EXPIRED (Status 401)
```json
{
  "error": "Token expired"
}
```
atau
```json
{
  "error": "Invalid token"
}
```
atau
```json
{
  "error": "User not found or inactive"
}
```

#### Response Token MISSING (Status 401)
```json
{
  "error": "Missing or invalid Authorization header"
}
```

---

## 4. ENDPOINT EMPLOYEE DATA

### ✅ a) Ada Endpoint untuk Ambil Data Employee

**Ada 3 endpoints:**

1. **Get All Employees** - `GET /api/sync/employees`
2. **Get Single Employee** - `GET /api/sync/employees/:employeeId`
3. **Get Changed Employees** - `GET /api/sync/employees/changes`

### ✅ b) Get All Employees - Format Request

**URL:** `GET /api/sync/employees?page=1&limit=50&filter=active`

**Headers (Pilih 1):**
```
Option A - Bearer Token:
Authorization: Bearer <JWT-token-dari-sso-login>

Option B - API Key:
X-API-Key: <api-key>
```

### ✅ c) Query Parameters

**Parameter yang tersedia:**
```
?page=1                    # Halaman (default: 1)
&limit=50                  # Jumlah per halaman (default: 50)
&filter=active             # Filter: "active" atau "all" (default: "all")
&department=IT             # Filter by department (optional)
&role=employee             # Filter by role (optional)
&location=<locationId>     # Filter by location ID (optional)
```

**Contoh lengkap:**
```
GET https://workspace.joniiswa1101.repl.co/api/sync/employees?page=1&limit=50&filter=active
Authorization: Bearer <token>
```

### ✅ d) Response Format (Pagination & Employee Fields)

```json
{
  "success": true,
  "source": "sso:john.doe",
  "sync_time": "2026-03-17T17:03:18.963Z",
  "pagination": {
    "page": 1,
    "limit": 50,
    "total_count": 100,
    "total_pages": 2,
    "has_next": true,
    "has_prev": false
  },
  "filters": {
    "active_only": true,
    "department": null,
    "role": null,
    "location": null
  },
  "employees": [
    {
      "employee_id": "EMP001",
      "user_id": "507f1f77bcf86cd799439011",
      "name": "John Doe",
      "email": "john@company.com",
      "username": "john.doe",
      "department": "IT",
      "role": "employee",
      "is_active": true,
      "timezone": "Asia/Jakarta",
      "hire_date": "2023-01-15T00:00:00.000Z",
      "last_updated": "2026-03-17T17:03:18.963Z",
      "assigned_locations": [
        {
          "id": "507f1f77bcf86cd799439012",
          "name": "Office A",
          "address": "Jl. A No. 1",
          "coordinates": {
            "lat": -6.2,
            "lng": 107.0
          }
        }
      ],
      "shift_profile": {
        "id": "507f1f77bcf86cd799439013",
        "name": "Regular (8am-5pm)",
        "start_time": "08:00",
        "end_time": "17:00"
      },
      "supervisor": {
        "id": "507f1f77bcf86cd799439014",
        "name": "Jane Manager",
        "email": "jane@company.com",
        "employee_id": "MGR001"
      }
    }
  ]
}
```

**Employee Fields:**
- `employee_id` - NIK / Employee ID
- `user_id` - MongoDB ObjectId
- `name` - Full name
- `email` - Email address
- `username` - Username login
- `department` - Department/divisi
- `role` - Role (employee, manager, supervisor, admin)
- `is_active` - Boolean (aktif/non-aktif)
- `timezone` - Timezone (e.g., "Asia/Jakarta")
- `hire_date` - Tanggal hire (ISO 8601)
- `last_updated` - Tanggal terakhir update
- `assigned_locations` - Array lokasi kerja
- `shift_profile` - Data shift
- `supervisor` - Data supervisor

### ✅ Endpoint Get Single Employee

**URL:** `GET /api/sync/employees/:employeeId`

**Contoh:**
```
GET https://workspace.joniiswa1101.repl.co/api/sync/employees/EMP001
Authorization: Bearer <token>
```

Parameter `:employeeId` bisa:
- NIK (e.g., "EMP001")
- MongoDB ID (e.g., "507f1f77bcf86cd799439011")

**Response:** Format sama seperti dalam array employees di endpoint get all.

### ✅ Endpoint Get Changed Employees (Incremental Sync)

**URL:** `GET /api/sync/employees/changes?since=2026-03-16T00:00:00Z`

**Query Parameter:**
```
?since=2026-03-16T00:00:00Z   # ISO 8601 timestamp
                               # Default: last 24 hours jika tidak ada
```

**Response:**
```json
{
  "success": true,
  "source": "sso:john.doe",
  "sync_time": "2026-03-17T17:03:18.963Z",
  "pagination": {
    "page": 1,
    "limit": 50,
    "total_count": 10,
    "total_pages": 1,
    "has_next": false,
    "has_prev": false
  },
  "employees": [
    {
      "employee_id": "EMP001",
      "user_id": "507f1f77bcf86cd799439011",
      "name": "John Doe",
      "email": "john@company.com",
      "department": "IT",
      "role": "employee",
      "is_active": true,
      "last_updated": "2026-03-17T17:03:18.963Z",
      "change_type": "updated"    // "updated" atau "created"
    }
  ]
}
```

---

## 5. AUTHENTICATION & SECURITY

### ✅ a) API Key / Secret Needed

**Untuk `/api/auth/sso/login`:**
- ✅ **TIDAK perlu API Key**
- Hanya butuh `username` dan `password`

**Untuk `/api/sync/employees`, `/api/sync/employees/changes`, dll:**
- ✅ **Butuh AUTH** (Pilih 1):
  - **Option A:** Bearer token dari `/api/auth/sso/login`
  - **Option B:** X-API-Key header (untuk backend-to-backend integration)

**Rekomendasi:**
- Pakai Bearer token hasil login untuk request employee data
- Atau minta API Key ke admin CICO untuk backend integration

### ✅ b) CORS Status

**CORS:** ⚠️ **TIDAK EXPLICITLY ENABLED** 

**Solusi:**

**Option A (Recommended - Aman):**
- CurCol **backend** call CICO **backend** (server-to-server)
- **TIDAK perlu CORS** karena server-to-server communication
- **Lebih aman** - API key dan token tidak terekspos di frontend

**Option B (Frontend Direct):**
- Jika CurCol frontend mau call langsung, CORS perlu di-enable
- Hubungi CICO admin untuk enable CORS headers

**Rekomendasi:** Pakai Option A (server-to-server).

### ✅ c) Rate Limit

**Rate Limit:** ⚠️ **TIDAK ADA RATE LIMIT** saat ini

- Tidak ada pembatasan request per second
- Tidak ada quota per API key
- Unlimited requests allowed
- **Namun:** Gunakan secara bijak (jangan spam)

### ✅ d) Timeout

**Timeout:** **30 detik** (default Express.js)

- Request akan timeout jika > 30 detik tanpa response
- Biasanya response CICO < 1 detik

---

## 6. TEST CREDENTIALS

### ✅ a) Test Account untuk Testing

**Status:** Test accounts ada di database CICO

**Cara Mendapatkan:**
1. Hubungi CICO Admin
2. Minta **test employee account** dengan akses ke API testing

**Format Contoh:**
```
Username: testemployee
Email: testemployee@company.com
Password: TestPassword123!
NIK: TEST001
```

**ATAU Pakai akun real employee untuk testing.**

### ✅ b) Sample Username/Password

**Contoh Login:**
```bash
curl -X POST https://workspace.joniiswa1101.repl.co/api/auth/sso/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testemployee",
    "password": "TestPassword123!"
  }'
```

**Testing endpoints bisa**:
1. Login dengan test account → dapat token
2. Pakai token di header `Authorization: Bearer <token>`
3. Call employee data endpoints untuk testing
4. Verify response format sesuai spec

---

## 7. DOCUMENTATION

### ✅ a) API Documentation

**Documentation tersedia:**

1. **CICO SSO Integration Guide** - `SSO_INTEGRATION_GUIDE.md`
   - Lengkap penjelasan flow integration
   - Code examples untuk berbagai bahasa

2. **CICO SSO API Reference** - `SSO_API_REFERENCE.md`
   - Referensi endpoint lengkap
   - Request/response format detail

3. **CICO Sync Implementation** - `SYNC_IMPLEMENTATION_EXAMPLE.md`
   - Contoh implementasi employee sync
   - Incremental sync logic

4. **Integration Summary** - `INTEGRATION_SUMMARY.md`
   - Ringkas semua endpoints
   - Quick reference

5. **CurCol Example** - `CURCOL_SSO_EXAMPLE.md`
   - Contoh khusus untuk CurCol
   - Code snippet siap pakai

### ✅ b) Postman Collection

**Status:** Postman collection tersedia

**Download/Request:**
- Hubungi CICO team untuk Postman collection JSON
- Atau import endpoints manual dari documentation

**Contoh Postman setup:**
```
Collection: CICO SSO API
Environment: 
  - base_url: https://workspace.joniiswa1101.repl.co
  - token: (obtained from login)
  - api_key: (if using API key auth)

Requests:
  1. POST /api/auth/sso/login
  2. POST /api/auth/sso/validate
  3. POST /api/auth/sso/refresh
  4. GET /api/sync/employees
  5. GET /api/sync/employees/changes
  6. GET /api/sync/employees/:employeeId
```

### ✅ c) Swagger / OpenAPI

**Status:** ⚠️ Swagger documentation tidak auto-generated saat ini

**Alternatif:**
- Gunakan Postman collection (lebih praktis)
- Atau referensi markdown documentation
- API endpoints sudah stable dan tested

---

## 📋 QUICK REFERENCE TABLE

| Item | Value | Status |
|------|-------|--------|
| **API URL** | https://workspace.joniiswa1101.repl.co | ✅ Live |
| **Login Endpoint** | POST /api/auth/sso/login | ✅ Ready |
| **Validate Endpoint** | POST /api/auth/sso/validate | ✅ Ready |
| **Refresh Endpoint** | POST /api/auth/sso/refresh | ✅ Ready |
| **List Employees** | GET /api/sync/employees | ✅ Ready |
| **Get Single Employee** | GET /api/sync/employees/:id | ✅ Ready |
| **Changed Employees** | GET /api/sync/employees/changes | ✅ Ready |
| **CORS** | Not enabled (use server-to-server) | ⚠️ Warning |
| **Rate Limit** | None (unlimited) | ℹ️ Info |
| **Token TTL** | 24 hours | ✅ Fixed |
| **Authentication** | Bearer token or API Key | ✅ Ready |
| **IP Whitelist** | None (public access) | ✅ Open |

---

## 🔧 INTEGRATION CHECKLIST

- [ ] Verify CICO URL accessible
- [ ] Test `/api/auth/sso/login` dengan test credentials
- [ ] Verify JWT token format
- [ ] Test `/api/auth/sso/validate` dengan token
- [ ] Test `/api/sync/employees` dengan authentication
- [ ] Verify employee data fields
- [ ] Test `/api/sync/employees/changes` dengan since parameter
- [ ] Setup token refresh logic
- [ ] Handle token expiration (24 hours)
- [ ] Setup error handling untuk semua status codes
- [ ] Document integration di CurCol

---

## 📞 SUPPORT & CONTACT

**Untuk pertanyaan lebih lanjut:**
- Hubungi CICO Development Team
- Email: contact@cico.internal
- Slack: #cico-integration

**Issue atau bug:**
- Report di CICO issue tracker
- Provide endpoint, request, dan error response

---

**Document Version:** 1.0  
**Last Updated:** 17 Maret 2026  
**Status:** APPROVED FOR PRODUCTION ✅
