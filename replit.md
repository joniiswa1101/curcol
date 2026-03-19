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
- **Dark/Light Mode**: Web app supports theme toggle via `useTheme` hook (`artifacts/corpchat-web/src/hooks/use-theme.ts`). Toggle button (Sun/Moon icons) in sidebar footer. Preference stored in `localStorage` key `curcol_theme` with OS preference fallback. CSS variables switch via `.dark` class on `<html>`. Mobile uses system preference.
- **Emoji Picker**: Mobile app (Expo) includes emoji picker modal (`artifacts/corpchat-mobile/components/EmojiPicker.tsx`) with 4 categories (Smileys, Gestures, Objects, Nature). Smile icon button in chat input row toggles picker, selecting emoji appends to text.
- **Performance Optimization**: Fast channel switching achieved with a single database query.
- **Security Hardening**: Rate limiting (10 auth/15min, 200 API/min), CORS whitelist, file upload filter (MIME whitelist + blocked extensions).
- **Current Version**: v1.1.0 (displayed in sidebar)

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