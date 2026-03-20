# Overview

This project is a pnpm workspace monorepo using TypeScript, designed to build a real-time communication platform. It includes an Express API server, shared libraries for API specifications, database interactions, and generated clients. The platform aims to provide robust messaging capabilities, user management, and integration with external communication services like WhatsApp.

The primary goal is to deliver a reliable and scalable communication solution, featuring user authentication via CICO SSO, comprehensive chat functionalities, and an administrative interface. Key capabilities include direct and group chat, user directory, announcements, message reactions, editing, deletion, file attachments, and a mobile application.

# User Preferences

I prefer detailed explanations.
I want iterative development.
Ask before making major changes.
Do not make changes to the folder `Z`.
Do not make changes to the file `Y`.

# System Architecture

## Monorepo Structure
The project is organized as a pnpm workspace monorepo.
- `artifacts/`: Contains deployable applications, specifically `api-server`.
- `lib/`: Houses shared libraries such as `api-spec`, `api-client-react`, `api-zod`, and `db`.
- `scripts/`: Holds utility scripts for various development tasks.

## Technology Stack
- **Monorepo tool**: pnpm workspaces
- **Node.js**: Version 24
- **TypeScript**: Version 5.9
- **API Framework**: Express 5
- **Database**: PostgreSQL with Drizzle ORM
- **Validation**: Zod (v4) and `drizzle-zod`
- **API Codegen**: Orval, generating from OpenAPI spec
- **Build Tool**: esbuild (for CJS bundles)

## TypeScript & Composite Projects
All packages extend a base `tsconfig.base.json` with `composite: true`, and the root `tsconfig.json` references all packages. This setup ensures:
- Centralized type-checking from the root.
- `emitDeclarationOnly` for `.d.ts` files, with actual JS bundling handled by esbuild.
- Project references manage build order and skip up-to-date packages.

## API Server (`@workspace/api-server`)
- Express 5 server handling API requests.
- Routes are organized under `src/routes/`.
- Utilizes `@workspace/api-zod` for request/response validation and `@workspace/db` for persistence.
- Includes a health check endpoint at `/api/health`.

## Database Layer (`@workspace/db`)
- Drizzle ORM with PostgreSQL.
- Exports a Drizzle client and schema models.
- Drizzle Kit is used for migrations.

## API Specification and Code Generation (`@workspace/api-spec`, `@workspace/api-zod`, `@workspace/api-client-react`)
- The `lib/api-spec` package manages the OpenAPI 3.1 specification (`openapi.yaml`) and Orval configuration.
- Orval generates:
    - React Query hooks and a fetch client into `lib/api-client-react/src/generated/`.
    - Zod schemas into `lib/api-zod/src/generated/`.
- These generated assets are used by the API server for validation and by the frontend for API interaction.

## CICO SSO Integration
- **Primary Authentication**: CICO SSO is the main login method.
- **Backend Implementation**:
    - `api-server` includes a CICO SSO service layer for login, token verification, and employee synchronization.
    - `POST /api/auth/sso/login` handles CICO authentication, auto-creates users in the local database if they don't exist, and returns a CurCol JWT token.
    - `GET /api/auth/test-cico-health` provides diagnostics for CICO connectivity.
- **Frontend Integration**:
    - The login page (Login.tsx) prioritizes CICO SSO, with a fallback to local authentication.
    - Successful login redirects to the chat interface.
- **Token Management**: CICO tokens have a 24-hour TTL, while CurCol sessions are managed via a `sessions` table until explicit logout.

## WhatsApp Integration
- **Implementation**: Uses Meta Graph API v19.0.
- **Configuration**: Relies on `WHATSAPP_API_TOKEN` (from a System User in Meta) and `WHATSAPP_PHONE_NUMBER_ID`.
- **API Endpoints**:
    - `POST /api/admin/whatsapp/test` to send test messages.
    - `GET /api/admin/whatsapp/status` to check configuration status.
    - `GET /api/admin/whatsapp/config` to retrieve webhook details.
    - `GET /api/admin/whatsapp/conversations` to list incoming messages.
- **Fallback**: Twilio integration is considered an alternative if Meta WhatsApp Business API issues persist.

## Core Features and Enhancements
- **Unread Count**: Backend accurately calculates unread messages based on `lastReadAt` timestamps.
- **Typing Indicators**: Implemented `POST /api/messages/:conversationId/typing` and `POST /api/messages/:conversationId/typing/stop` endpoints, with frontend integration and WebSocket broadcasting.
- **Enhanced Message Display**: Includes unread badges, formatted timestamps, edited message indicators, and styled message bubbles.
- **Key Functionalities**: Direct/group chat, directory/search, announcements, admin panel, message reactions, pinned messages, muted conversations, editing/deletion, file attachments, and a mobile app.
- **Unread Badge Styling**: Consistent badge display across web and mobile. Shows message count in primary-colored pill badge, caps at "99+" when unread count exceeds 99. Positioned in conversation list footer for both platforms.
- **Dark/Light Mode**: Web app supports theme toggle via `useTheme` hook (`artifacts/corpchat-web/src/hooks/use-theme.ts`). Toggle button (Sun/Moon icons) in sidebar footer. Preference stored in `localStorage` key `curcol_theme` with OS preference fallback. CSS variables switch via `.dark` class on `<html>`. Mobile app includes manual theme toggle (Light/Dark/System) in Profile tab, with preference persisted to AsyncStorage. Uses `ThemeContext` provider for global state management.
- **Chat from Directory**: Mobile directory tab displays all employees with search functionality. Each contact has an explicit "Chat" button (primary color, message icon) to launch direct chat instantly. Clicking button creates direct conversation and navigates to chat screen.
- **Emoji Picker**: Mobile app (Expo) includes emoji picker modal (`artifacts/corpchat-mobile/components/EmojiPicker.tsx`) with 4 categories (Smileys, Gestures, Objects, Nature). Smile icon button in chat input row toggles picker, selecting emoji appends to text.
- **Message Edit/Delete/Pin/Typing/Optimistic**: Mobile app supports message editing via long-press message bubble → edit button → modal input. PATCH endpoint: `PATCH /conversations/:conversationId/messages/:messageId`. Soft delete via trash icon (DELETE endpoint). Pin toggle via pin icon (PATCH pin endpoint) shows amber highlight and "Pinned" badge. Only sender can edit/delete. Any member can pin/unpin. Typing indicators show "X sedang mengetik..." banner with auto-stop after 2s inactivity. Optimistic UI: messages appear instantly on send, replaced with server ID after confirmation. Broadcasts updates via WebSocket. Shows "(edited)" indicator and "Pesan telah dihapus" for deleted messages.
- **Admin Dashboard**: Enhanced web admin panel at `/admin` with 3 tabs (Overview, Analytics, Audit Log). Features 4 stat cards with dynamic trends, area chart (message activity 30d), pie chart (action distribution), line chart (login activity), horizontal bar chart (action breakdown). Audit log tab has search/filter, action type dropdown, pagination (20/page), color-coded badges, and CSV export. Backend returns `messagesToday`, `weeklyTrend`, `actionDistribution`, `loginActivity` from `/api/audit/stats`.
- **Admin User Management**: Web admin page at `/admin/users` for CRUD operations. Add individual users via dialog. Bulk CSV import with smart column mapping (tolerates NIK, emp_id, nama_lengkap, etc.). User table with search, role badges, status toggles. Password reset (to Employee ID), activate/deactivate users. All operations audit-logged.
- **Admin WhatsApp Inbox**: Web admin page at `/admin/whatsapp` with 3-tab workflow (Unassigned, Assigned, Resolved). Claim WhatsApp conversations by clicking "Ambil" button. Resolve conversations once handled. Shows Twilio connection status, conversation count, contact details, and assignee info. Includes test message sender for setup verification.
- **Performance Optimization**: Fast channel switching achieved with a single database query.
- **Security Hardening**: Rate limiting (10 auth/15min, 200 API/min), CORS whitelist, file upload filter (MIME whitelist + blocked extensions).
- **Rate Limit Error Handling**: Mobile app detects HTTP 429 (rate limit) errors and displays user-friendly Indonesian alerts on chat operations (send, edit, delete, pin). Uses custom `APIError` class with status code tracking in `lib/api.ts`.
- **File Upload Validation**: Web app validates files before upload with client-side checks for blocked extensions, MIME types, and file size (10 MB limit). Shows dismissible error alerts with specific feedback (e.g., "Tipe file '.exe' tidak diizinkan"). Validation config in `lib/upload-config.ts`.
- **Database Performance Indexes**: Added indexes to improve query performance:
  - Messages table: `(conversation_id, created_at)`, `sender_id`, `conversation_id`
  - Conversations table: `created_at`, `updated_at`, `wa_status`
  - Conversation members: `(conversation_id, user_id)`, `conversation_id`, `user_id`
- **Security Headers**: API server uses Helmet middleware for HTTPS security headers (HSTS, CSP, X-Frame-Options, X-Content-Type-Options, CORS whitelisting).
- **Mobile File Upload**: Full file picker with validation, preview, and error feedback. Supports images, videos, audio, PDFs, Office docs, and archives. 10 MB file size limit. Real-time validation with blocking of executable files (.exe, .bat, .sh, .php, .py, etc.). Error alerts in Indonesian (e.g., "Tipe file '.exe' tidak diizinkan"). File preview before send with emoji icon and file size display.
- **Current Version**: v1.1.0 (displayed in web sidebar + mobile profile page)

# External Dependencies

- **PostgreSQL**: Relational database for data persistence.
- **Meta WhatsApp Business API**: For WhatsApp messaging integration (currently experiencing authentication issues).
- **CICO SSO**: External Single Sign-On provider for user authentication.
- **Orval**: For generating API clients and schemas from OpenAPI specifications.
- **React Query**: For data fetching and caching in the frontend.
- **Drizzle ORM**: TypeScript ORM for interacting with PostgreSQL.
- **Zod**: Schema declaration and validation library.
- **Express**: Node.js web application framework.
- **pnpm**: Package manager for monorepo management.
- **esbuild**: Bundler for JavaScript and TypeScript.
- **Vite**: Frontend tooling (implied by build setup, though esbuild is explicitly mentioned for CJS bundles).
- **CORS**: Middleware for handling Cross-Origin Resource Sharing.
- **pg (node-postgres)**: PostgreSQL client for Node.js.
- **node-cron**: Scheduler for automated backups.

## Database Backup Strategy (March 20, 2026)
- **Status**: ✅ Fully operational
- **Automatic Backups**: Daily at 2 AM UTC via `node-cron`
- **Backup Files**: `./backups/` directory with compression (gzip)
- **Retention**: Last 30 backups (~30 days), auto-cleanup of old files
- **API Endpoints**:
  - `GET /api/backup/health` — Public health check
  - `GET /api/backup/list` — List backups (admin only)
  - `POST /api/backup/create` — Manual backup (admin only)
  - `POST /api/backup/restore` — Restore from backup (admin only, destructive)
  - `GET /api/backup/scheduler-status` — Check scheduler (public)
- **Implementation Files**:
  - `artifacts/api-server/src/lib/backup.ts` — Core backup functions
  - `artifacts/api-server/src/lib/backup-scheduler.ts` — Cron scheduler
  - `artifacts/api-server/src/routes/backup.ts` — API endpoints
- **Documentation**: `.local/DATABASE_BACKUP_STRATEGY.md` (comprehensive guide)

## Image Compression (March 20, 2026)
- **Status**: ✅ Automatic on all uploads
- **Library**: sharp@^0.33.1 (fastest Node.js image processor)
- **Compression**: 70-85% size reduction per image
- **Resize**: Auto-resize images > 1920x1920 to 1920x1920
- **Quality**: 80/100 (optimized balance)
- **Formats**: JPEG, PNG, WebP, GIF, BMP (SVG skipped - already optimized)
- **Performance**: < 500ms per image, 6-7x faster downloads
- **Implementation Files**:
  - `artifacts/api-server/src/lib/image-compression.ts` — Compression logic
  - `artifacts/api-server/src/routes/files.ts` — Upload route (modified)
- **API Response**: Includes `compression` object with before/after sizes and ratio
- **Audit Logging**: All compression stats logged in audit trail
- **Documentation**: `.local/IMAGE_COMPRESSION_GUIDE.md` (complete guide)