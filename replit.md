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

**Status**: ✅ Backend endpoints implemented, Frontend login UI ready, **⚠️ CICO API connectivity pending verification**

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

1. **Login.tsx** — Updated with CICO SSO form:
   - Username/Email field (for CICO username or email)
   - Password field (CICO password)
   - "Masuk via CICO" button
   - Form calls `/api/auth/sso/login` endpoint
   - Auto-redirects to chat on successful login

### CICO API Endpoints Expected

CurCol expects CICO at: `https://workspace.joniiswa1101.repl.co`

**Endpoints used**:
- `POST /api/auth/sso/login` — login with username/password → returns `{ success, token, user: { id, email, username, fullName, department, role, companyId } }`
- `POST /api/auth/sso/validate` — verify token with Bearer header → returns `{ success, user: {...} }`
- `GET /api/sync/employees?page=1&limit=50&filter=active` — list employees → returns `{ success, source, sync_time, pagination, filters, employees }`

### ⚠️ CICO Connectivity Issue

**Status**: CICO API is not reachable from CurCol backend (error: "fetch failed")

**Possible causes:**
- URL `https://workspace.joniiswa1101.repl.co` is incorrect or has changed
- CICO is down or offline
- Network connectivity issue (firewall, VPN, Replit outbound restrictions)

**Workaround**: Use **Local Login** mode (tab in login page)
- Switch to "Lokal" tab on login page
- Use Employee ID: `EMP001`, Password: `EMP001` (or any seeded employee)
- Local login works immediately without depending on CICO

**How to test CICO connectivity:**
```bash
curl http://localhost:8080/api/auth/test-cico-health
```

Current response (disconnected):
```json
{ "status": "disconnected", "error": "fetch failed", "message": "Cannot reach CICO. Check URL and network connectivity." }
```

**To fix CICO SSO:**
1. **Verify CICO URL** — confirm if URL is still `https://workspace.joniiswa1101.repl.co` or if it has changed
2. **Test CICO directly** — `curl -X POST https://workspace.joniiswa1101.repl.co/api/auth/sso/login -H "Content-Type: application/json" -d '{"username":"test","password":"test"}'`
3. **Check network** — if CICO is behind firewall/VPN, ensure Replit can reach it (outbound HTTPS allowed)
4. **Update URL** — if CICO URL changed, update `CICO_API_URL` in `lib/api-server/src/lib/cico.ts`
5. **Once fixed**, restart API server: `restart_workflow artifacts/api-server: API Server`

### How SSO Works (Once CICO Connected)

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
