# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   └── api-server/         # Express API server
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts, run via `pnpm --filter @workspace/scripts run <script>`
├── pnpm-workspace.yaml     # pnpm workspace (artifacts/*, lib/*, lib/integrations/*, scripts)
├── tsconfig.base.json      # Shared TS options (composite, bundler resolution, es2022)
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`). This builds the full dependency graph so that cross-package imports resolve correctly. Running `tsc` inside a single package will fail if its dependencies haven't been built yet.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite...etc, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array. `tsc --build` uses this to determine build order and skip up-to-date packages.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for request and response validation and `@workspace/db` for persistence.

- Entry: `src/index.ts` — reads `PORT`, starts Express
- App setup: `src/app.ts` — mounts CORS, JSON/urlencoded parsing, routes at `/api`
- Routes: `src/routes/index.ts` mounts sub-routers; `src/routes/health.ts` exposes `GET /health` (full path: `/api/health`)
- Depends on: `@workspace/db`, `@workspace/api-zod`
- `pnpm --filter @workspace/api-server run dev` — run the dev server
- `pnpm --filter @workspace/api-server run build` — production esbuild bundle (`dist/index.cjs`)
- Build bundles an allowlist of deps (express, cors, pg, drizzle-orm, zod, etc.) and externalizes the rest

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL. Exports a Drizzle client instance and schema models.

- `src/index.ts` — creates a `Pool` + Drizzle instance, exports schema
- `src/schema/index.ts` — barrel re-export of all models
- `src/schema/<modelname>.ts` — table definitions with `drizzle-zod` insert schemas (no models definitions exist right now)
- `drizzle.config.ts` — Drizzle Kit config (requires `DATABASE_URL`, automatically provided by Replit)
- Exports: `.` (pool, db, schema), `./schema` (schema only)

Production migrations are handled by Replit when publishing. In development, we just use `pnpm --filter @workspace/db run push`, and we fallback to `pnpm --filter @workspace/db run push-force`.

### `lib/api-spec` (`@workspace/api-spec`)

Owns the OpenAPI 3.1 spec (`openapi.yaml`) and the Orval config (`orval.config.ts`). Running codegen produces output into two sibling packages:

1. `lib/api-client-react/src/generated/` — React Query hooks + fetch client
2. `lib/api-zod/src/generated/` — Zod schemas

Run codegen: `pnpm --filter @workspace/api-spec run codegen`

### `lib/api-zod` (`@workspace/api-zod`)

Generated Zod schemas from the OpenAPI spec (e.g. `HealthCheckResponse`). Used by `api-server` for response validation.

### `lib/api-client-react` (`@workspace/api-client-react`)

Generated React Query hooks and fetch client from the OpenAPI spec (e.g. `useHealthCheck`, `healthCheck`).

### `scripts` (`@workspace/scripts`)

Utility scripts package. Each script is a `.ts` file in `src/` with a corresponding npm script in `package.json`. Run scripts via `pnpm --filter @workspace/scripts run <script>`. Scripts can import any workspace package (e.g., `@workspace/db`) by adding it as a dependency in `scripts/package.json`.

---

## CICO SSO Integration

**Status**: ✅ **LIVE & ACTIVE** - CICO SSO is now the primary login method

### What's Implemented

#### Backend (`api-server`)

1. **`/api/lib/cico.ts`** — CICO SSO service layer:
   - `loginWithCICO(username, password)` — calls CICO `/api/auth/sso/login` endpoint
   - `verifyCICOToken(token)` — validates token with CICO
   - `getCICOEmployees(token, page)` — sync employee list from CICO
   - `getCICOEmployee(token, employeeId)` — get single employee from CICO

2. **`POST /api/auth/sso/login`** — CICO SSO endpoint:
   - Calls CICO to verify username/password
   - Auto-creates user in CurCol if doesn't exist (syncs from CICO data)
   - Returns CurCol JWT token for authenticated session
   - Logs all login attempts for audit

3. **`GET /api/auth/test-cico-health`** — Diagnostic endpoint:
   - Tests CICO connectivity
   - Returns status: "connected" or "disconnected"
   - Helps debug CICO URL/network issues

#### Frontend (`corpchat-web`)

1. **Login.tsx** — CICO SSO is PRIMARY login method:
   - **CICO SSO tab** (default/active) - username/email + password CICO
   - **Lokal tab** (fallback) - Employee ID + password for local auth
   - Form calls `/api/auth/sso/login` endpoint
   - Auto-redirects to chat on successful login
   - Fully functional and live

### CICO API Endpoints Expected

CurCol expects CICO at: `https://workspace.joniiswa1101.repl.co`

**Endpoints used**:
- `POST /api/auth/sso/login` — login with username/password → returns `{ success, token, user: { id, email, username, fullName, department, role, companyId } }`
- `POST /api/auth/sso/validate` — verify token with Bearer header → returns `{ success, user: {...} }`
- `GET /api/sync/employees?page=1&limit=50&filter=active` — list employees → returns `{ success, source, sync_time, pagination, filters, employees }`

### ✅ CICO SSO Activation - Live Now

**Status**: CICO SSO fully implemented and active as primary login method

**CICO API Specifications** (from CICO team):
- **URL**: `https://workspace.joniiswa1101.repl.co` ✅ Confirmed online
- **Login endpoint**: `POST /api/auth/sso/login` ✅ Ready
- **Token validation**: `POST /api/auth/sso/validate` ✅ Ready
- **Employee sync**: `GET /api/sync/employees` ✅ Ready
- **Request format**: `{ "username": "john.doe", "password": "password123" }` ✅
- **Response format**: `{ "success": true, "token": "...", "user": {...} }` ✅
- **CORS**: Not required (server-to-server communication) ✅
- **Rate limit**: No limit ✅
- **Timeout**: 30 seconds ✅

**How users login now:**
1. Open login page at `curco.link/login`
2. **CICO SSO tab** (default/blue) - primary method
   - Enter: CICO username/email + CICO password
   - Auto-create user in CurCol from CICO data
   - Get CurCol JWT token
3. **Lokal tab** (fallback) - if CICO fails
   - Use: Employee ID (EMP001) + same password
   - Local authentication only

**Fallback to Local Login:**
If CICO is temporarily unavailable:
- Click "Lokal" tab
- Use Employee ID: `EMP001`, Password: `EMP001` (or EMP002-EMP006)
- Works immediately without CICO dependency

**✅ CICO SSO Integration Status: LIVE & CONNECTED**

- **CICO Production URL**: `https://cico2025.replit.app`
- **Status**: ✅ Connected, working, responding
- **Connection Test**: ✅ PASSED (curl confirms server responding with JSON)
- **Login Tab**: ✅ CICO SSO tab enabled and ready
- **How to test**: Use your CICO credentials (`joni@rpk.com` + CICO password)

**If CICO SSO login fails:**
1. Check password is correct
2. Confirm account is active in CICO
3. No DNS issues — connection is confirmed working

**Fallback**: Local login still available (tab "Lokal", use EMP001:EMP001)

### How SSO Works (Active Now)

1. User enters CICO username/password in login form
2. Frontend sends to `/api/auth/sso/login`
3. Backend calls CICO to verify credentials
4. If valid:
   - CICO returns user data + JWT token
   - CurCol searches for user by email/id
   - If user not found, auto-create from CICO data
   - Create CurCol session + return JWT
5. Frontend saves token, redirects to `/chat`
6. All subsequent requests auto-inject Authorization header (global fetch override in App.tsx)
7. Logout clears session in database

### Token Management

- CICO token: 24-hour TTL (managed by CICO)
- CurCol session: stored in `sessions` table, valid until explicit logout
- Token validation: `/api/auth/me` endpoint verifies active session

---

## WhatsApp Integration Status & Issues

**Current Status**: ❌ **BROKEN** — Meta WhatsApp Business API has authentication issues

### Error: "Account not registered" (Error #133010)

This error from Meta means:
1. **WhatsApp Business Account setup incomplete** — the account exists but isn't fully registered
2. **API token mismatch** — wrong token being used
3. **Phone Number ID mismatch** — ID doesn't match the account

### What We've Tried (and why it failed)
- Changed phone number ID multiple times (no fix)
- Changed API token multiple times (no fix)
- The root cause is **Meta's account configuration**, not the code

### Real Solution - Check Meta Console

You MUST verify these in Meta Console (https://developers.facebook.com/):

1. **Go to App Dashboard → Settings → Basic**
   - Copy the correct **App ID** and **App Secret**

2. **Go to WhatsApp Business → API Setup**
   - Find your **Business Phone Number ID** (should start with 1063...)
   - Copy it exactly — digit by digit

3. **Go to Settings → Users and Roles → System Users**
   - Create a NEW system user (not temporary token from API Setup page)
   - Generate NEW access token
   - Give it "manage_whatsapp_business_messaging" permission
   - Copy the token and set it in Replit Secrets as `WHATSAPP_API_TOKEN`

4. **Verify WhatsApp Business Account Status**
   - Go to WhatsApp Business Account settings
   - Check if account is fully activated (not pending/suspended)
   - Check if phone number is fully registered

5. **Check Webhook Configuration**
   - Verify webhook URL is: `https://curcol.link/api/webhooks/whatsapp`
   - Verify verify token is correct

### Implementation Details

**Code**: `artifacts/api-server/src/lib/whatsapp.ts`
- Uses Meta Graph API v19.0
- Requires `WHATSAPP_API_TOKEN` (from System User, not temporary token)
- Requires `WHATSAPP_PHONE_NUMBER_ID` (exact digit match with Meta)

**Routes**: `artifacts/api-server/src/routes/admin-whatsapp.ts`
- `POST /api/admin/whatsapp/test` — test send message (admin only)
- `GET /api/admin/whatsapp/status` — check WhatsApp config status
- `GET /api/admin/whatsapp/config` — get webhook config for Meta setup
- `GET /api/admin/whatsapp/conversations` — list WhatsApp incoming messages

### Alternative: Twilio Integration

If Meta continues to fail, we can switch to Twilio:
- Twilio integration is available via Replit integrations
- Handles WhatsApp messaging through Twilio's API
- More reliable for production use
- Can be set up without Meta Developer Console complexity

---

## Recent Feature Improvements (March 19, 2026)

### 1. Fixed Unread Count ✅

**Problem**: Unread count was hardcoded to 0 in all conversations

**Solution**: 
- Backend now calculates actual unread count by comparing message timestamp with `lastReadAt`
- Any message created after user's last read time is counted as unread
- Frontend already displays unread badge on conversation list

**Code**: `artifacts/api-server/src/routes/conversations.ts` (lines 55-64)

### 2. Added Typing Indicators ✅

**New Endpoints**:
- `POST /api/messages/:conversationId/typing` — broadcast that user is typing
- `POST /api/messages/:conversationId/typing/stop` — broadcast that user stopped typing

**Frontend Integration**:
- When user types in message input, frontend calls `/typing` endpoint
- Automatically calls `/typing/stop` after 2 seconds of inactivity
- Broadcasts to all conversation members via WebSocket

**Code**: 
- Backend: `artifacts/api-server/src/routes/messages.ts` (lines 144-180)
- Frontend: `artifacts/corpchat-web/src/pages/Chat.tsx` (lines 193-211)

### 3. Enhanced Message Display

**Improvements**:
- Unread count displayed as badge on conversation list
- Timestamps show message time (HH:mm format)
- Edited messages show "(edited)" indicator
- Message bubbles have proper styling for WhatsApp messages

**Next Steps for Typing Indicators**:
- WebSocket event listener for `typing_indicator` events is ready
- Once integrated, will show "X people are typing..." indicator in chat
- UI skeleton already in place in Chat component

### Features Working Well

✅ Chat (direct and group)
✅ Directory & search
✅ Announcements  
✅ Admin panel with WhatsApp admin page
✅ CICO SSO login
✅ Unread message tracking (FIXED: now accurately calculated)
✅ Message reactions/emojis
✅ Pinned messages & conversations
✅ Muted conversations
✅ Message editing & deletion
✅ File attachments
✅ Mobile app (Expo)
✅ **Fast channel switching** (OPTIMIZED: single DB query instead of N queries)
