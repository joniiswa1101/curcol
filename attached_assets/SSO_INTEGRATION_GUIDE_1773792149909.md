# CICO ↔ CurCol SSO (Single Sign-On) Integration Guide

## Overview
This guide explains how to integrate CICO (Check-In/Check-Out) with CurCol (Messaging App) using SSO authentication. Once integrated, users can login to CICO and seamlessly access CurCol with the same credentials.

---

## Architecture

```
┌─────────────────────────────────────────────┐
│          CICO (Attendance App)              │
│   - Employee Login                          │
│   - Clock In/Out Events                     │
│   - Shared MongoDB Database                 │
└──────────────────┬──────────────────────────┘
                   │
          ┌────────┴────────┐
          │                 │
          ▼                 ▼
    ┌──────────────┐  ┌──────────────┐
    │ JWT Token    │  │ Session Auth │
    │ (SSO)        │  │ (Passport)   │
    └──────────────┘  └──────────────┘
          │                 │
          └────────┬────────┘
                   │
         ┌─────────▼─────────┐
         │  CurCol (Messaging)│
         │  - Direct login   │
         │  - SSO validation │
         └───────────────────┘
```

---

## SSO Endpoints

### 1. Generate SSO Token (After CICO Login)

**Endpoint:** `POST /api/auth/sso/token`

**Authentication:** Requires valid CICO session (user must be logged in)

**Request:**
```bash
curl -X POST https://cico-domain.com/api/auth/sso/token \
  -H "Cookie: connect.sid=abc123..." \
  -H "Content-Type: application/json"
```

**Response (Success - 200):**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "email": "john.doe@company.com",
    "username": "johndoe",
    "fullName": "John Doe",
    "department": "Engineering",
    "role": "employee",
    "companyId": "507f1f77bcf86cd799439010"
  }
}
```

**Frontend Usage:**
```javascript
// After successful CICO login
const response = await fetch('/api/auth/sso/token', {
  method: 'POST',
  credentials: 'include' // Include session cookie
});

const { token, user } = await response.json();

// Store token and redirect to CurCol
localStorage.setItem('sso_token', token);
localStorage.setItem('user', JSON.stringify(user));

// Redirect to CurCol with token
window.location.href = `https://curcol-domain.com/auth/sso?token=${token}`;
```

---

### 2. Validate SSO Token (CurCol Backend)

**Endpoint:** `POST /api/auth/sso/validate`

**Authentication:** Bearer token in Authorization header

**Request:**
```bash
curl -X POST https://cico-domain.com/api/auth/sso/validate \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json"
```

**Response (Success - 200):**
```json
{
  "valid": true,
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "email": "john.doe@company.com",
    "username": "johndoe",
    "fullName": "John Doe",
    "department": "Engineering",
    "role": "employee",
    "companyId": "507f1f77bcf86cd799439010"
  }
}
```

**Response (Token Expired - 401):**
```json
{
  "error": "Token expired"
}
```

**Response (Invalid Token - 401):**
```json
{
  "error": "Invalid token"
}
```

---

### 3. Direct SSO Login (CurCol Only)

**Endpoint:** `POST /api/auth/sso/login`

**Authentication:** None (username/password in body)

**Request:**
```bash
curl -X POST https://cico-domain.com/api/auth/sso/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "johndoe",
    "password": "password123"
  }'
```

**Accepted Username Formats:**
- Username: `johndoe`
- Email: `john.doe@company.com`
- Employee ID (NIK): `2024001`

**Response (Success - 200):**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "email": "john.doe@company.com",
    "username": "johndoe",
    "fullName": "John Doe",
    "department": "Engineering",
    "role": "employee",
    "companyId": "507f1f77bcf86cd799439010"
  }
}
```

**Response (Invalid Credentials - 401):**
```json
{
  "error": "Invalid credentials"
}
```

**Response (User Inactive - 403):**
```json
{
  "error": "User account is inactive"
}
```

---

### 4. Refresh SSO Token

**Endpoint:** `POST /api/auth/sso/refresh`

**Authentication:** None (old token in body)

**Request:**
```bash
curl -X POST https://cico-domain.com/api/auth/sso/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }'
```

**Response (Success - 200):**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "email": "john.doe@company.com",
    "username": "johndoe",
    "fullName": "John Doe",
    "department": "Engineering",
    "role": "employee",
    "companyId": "507f1f77bcf86cd799439010"
  }
}
```

---

## Integration Steps for CurCol

### Step 1: Store SSO Token
After user logs in via CICO or direct SSO login, store the token:

```javascript
// client/src/lib/sso.ts
export const storeSSOToken = (token: string, user: UserType) => {
  localStorage.setItem('sso_token', token);
  localStorage.setItem('user_profile', JSON.stringify(user));
  localStorage.setItem('token_expiry', new Date(Date.now() + 24*60*60*1000).toISOString());
};

export const getSSOToken = () => {
  return localStorage.getItem('sso_token');
};

export const clearSSO = () => {
  localStorage.removeItem('sso_token');
  localStorage.removeItem('user_profile');
  localStorage.removeItem('token_expiry');
};
```

### Step 2: Use Token for API Requests
Include the token in all API requests to CICO:

```javascript
// client/src/lib/api.ts
export const apiRequest = async (method: string, path: string, body?: any) => {
  const token = getSSOToken();
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${CICO_API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (response.status === 401) {
    // Token invalid, clear and redirect to login
    clearSSO();
    window.location.href = '/login';
  }

  return response.json();
};
```

### Step 3: Add SSO Login Page (CurCol)

```typescript
// client/src/pages/sso-login-page.tsx
import { useState } from 'react';
import { useNavigate, useLocation } from 'wouter';

export function SSOLoginPage() {
  const [, navigate] = useLocation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSSO = async (token: string) => {
    try {
      setLoading(true);
      
      // Validate token on CICO
      const response = await fetch(`${CICO_API_URL}/api/auth/sso/validate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Invalid SSO token');
      }

      const data = await response.json();
      
      // Store token and user
      storeSSOToken(token, data.user);
      
      // Redirect to CurCol home
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'SSO failed');
    } finally {
      setLoading(false);
    }
  };

  // Check for token in URL query parameter
  const url = new URL(window.location);
  const token = url.searchParams.get('token');

  if (token) {
    handleSSO(token);
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-4">Authenticating...</h1>
        {error && <p className="text-red-500">{error}</p>}
        {loading && <p className="text-gray-500">Validating SSO token...</p>}
      </div>
    </div>
  );
}
```

### Step 4: Add Login Redirect
In CICO after successful login:

```typescript
// In login form submission
const handleLogin = async (credentials) => {
  const response = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
    credentials: 'include'
  });

  if (response.ok) {
    // Generate SSO token
    const tokenResponse = await fetch('/api/auth/sso/token', {
      method: 'POST',
      credentials: 'include'
    });

    const { token } = await tokenResponse.json();

    // Check if redirecting to CurCol
    const curcolRedirect = new URL(window.location).searchParams.get('redirect_to');
    if (curcolRedirect === 'curcol') {
      window.location.href = `https://curcol-domain.com/auth/sso?token=${token}`;
    } else {
      // Normal CICO redirect
      navigate('/dashboard');
    }
  }
};
```

---

## Employee Data Endpoint

To sync active employees from CICO to CurCol:

**Endpoint:** `GET /api/integrations/curcol/employees`

**Authentication:** API Key in header

**Request:**
```bash
curl -X GET https://cico-domain.com/api/integrations/curcol/employees \
  -H "X-API-Key: curcol_abc123def456..."
```

**Response:**
```json
[
  {
    "employee_id": "2024001",
    "name": "John Doe",
    "email": "john.doe@company.com",
    "department": "Engineering",
    "position": "Senior Engineer"
  },
  {
    "employee_id": "2024002",
    "name": "Jane Smith",
    "email": "jane.smith@company.com",
    "department": "Product",
    "position": "Product Manager"
  }
]
```

To get API Key:
1. Login as CICO Admin
2. Go to Settings → CurCol Integration
3. Click "Generate API Key"
4. Share with CurCol team

---

## Token Details

**Token Payload:**
```json
{
  "userId": "507f1f77bcf86cd799439011",
  "email": "john.doe@company.com",
  "username": "johndoe",
  "fullName": "John Doe",
  "companyId": "507f1f77bcf86cd799439010",
  "role": "employee",
  "isActive": true,
  "iat": 1684756800,
  "exp": 1684843200
}
```

**Token Lifetime:** 24 hours

**Secret Key:** Uses `JWT_SECRET` env var (fallback to `SESSION_SECRET`)

---

## Security Considerations

1. **Token Storage:**
   - Store in `localStorage` or secure cookie (HttpOnly preferred in production)
   - Never expose in console logs

2. **HTTPS:**
   - Always use HTTPS in production
   - Set `secure: true` in cookie options

3. **Token Refresh:**
   - Before expiry, call refresh endpoint
   - Implement auto-refresh on token near expiry

4. **CORS:**
   - Configure CORS headers to allow CurCol domain
   - Whitelist trusted origins only

5. **Rate Limiting:**
   - Implement rate limiting on login/SSO endpoints
   - Prevent brute force attacks

---

## Troubleshooting

### "Missing or invalid Authorization header"
- Ensure token is in format: `Authorization: Bearer <token>`
- Token should start with `eyJ` (Base64 encoded JWT)

### "Token expired"
- Call `/api/auth/sso/refresh` with expired token
- Store new token and retry request

### "Invalid credentials"
- Check username/email/NIK is correct
- Verify password is accurate
- Ensure user account is active

### CORS Issues
Add to CICO server:
```javascript
app.use(cors({
  origin: ['https://curcol-domain.com', 'http://localhost:3000'],
  credentials: true
}));
```

---

## Example: Full Login Flow

```javascript
// 1. User submits login form in CICO
const loginResponse = await fetch('https://cico-domain.com/api/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'johndoe', password: 'pass123' }),
  credentials: 'include'
});

// 2. Get SSO token
const tokenResponse = await fetch('https://cico-domain.com/api/auth/sso/token', {
  method: 'POST',
  credentials: 'include'
});
const { token, user } = await tokenResponse.json();

// 3. Store token locally
localStorage.setItem('sso_token', token);
localStorage.setItem('user', JSON.stringify(user));

// 4. Redirect to CurCol with SSO token
window.location.href = `https://curcol-domain.com/auth/sso?token=${token}`;

// 5. CurCol validates token
const validateResponse = await fetch('https://cico-domain.com/api/auth/sso/validate', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` }
});

// 6. User is authenticated in CurCol
```

---

## Support

For questions or issues, contact:
- CICO Admin: admin@cico.local
- CurCol Integration: integration@curcol.local
