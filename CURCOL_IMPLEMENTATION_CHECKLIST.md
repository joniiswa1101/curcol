# CurCol — Implementation Checklist
> Last Updated: 21 Maret 2026

---

## Platform

| Platform | Status | Path |
|----------|--------|------|
| Web App (React + Vite) | ✅ | `artifacts/corpchat-web` |
| Mobile App (Expo React Native) | ✅ | `artifacts/corpchat-mobile` |
| API Server (Express 5) | ✅ | `artifacts/api-server` |
| Shared DB (Drizzle + PostgreSQL) | ✅ | `lib/db` |

---

## 1. Authentication & User Management

| Fitur | Web | Mobile | API | Status |
|-------|-----|--------|-----|--------|
| Login CICO SSO | ✅ | ✅ | ✅ | ✅ Selesai |
| Login Lokal (email/password) | ✅ | ✅ | ✅ | ✅ Selesai |
| Session management (token 24h TTL) | ✅ | ✅ | ✅ | ✅ Selesai |
| User directory (cari karyawan) | ✅ | ✅ | ✅ | ✅ Selesai |
| Profile settings | ✅ | ✅ | ✅ | ✅ Selesai |
| Dark/Light mode toggle | ✅ | ✅ | — | ✅ Selesai |
| Presence (online/idle/offline) | ✅ | ✅ | ✅ | ✅ Selesai |

---

## 2. Chat & Messaging

| Fitur | Web | Mobile | API | Status |
|-------|-----|--------|-----|--------|
| Direct chat (1:1) | ✅ | ✅ | ✅ | ✅ Selesai |
| Group chat (create, manage) | ✅ | ✅ | ✅ | ✅ Selesai |
| Group info panel (members, admin) | ✅ | ✅ | ✅ | ✅ Selesai |
| Add/remove group members | ✅ | ✅ | ✅ | ✅ Selesai |
| Promote/demote admin | ✅ | ✅ | ✅ | ✅ Selesai |
| Rename group | ✅ | ✅ | ✅ | ✅ Selesai |
| Mute group notifications | ✅ | ✅ | ✅ | ✅ Selesai |
| Leave/delete group | ✅ | ✅ | ✅ | ✅ Selesai |
| Send text messages | ✅ | ✅ | ✅ | ✅ Selesai |
| Message reactions (emoji) | ✅ | ✅ | ✅ | ✅ Selesai |
| Edit messages | ✅ | ✅ | ✅ | ✅ Selesai |
| Delete messages (soft delete) | ✅ | ✅ | ✅ | ✅ Selesai |
| Pin messages | ✅ | ✅ | ✅ | ✅ Selesai |
| Favorite messages | ✅ | ✅ | ✅ | ✅ Selesai |
| Reply (threading) | ✅ | ✅ | ✅ | ✅ Selesai |
| Typing indicators | ✅ | ✅ | ✅ | ✅ Selesai |
| Read receipts (✓✓) | ✅ | ✅ | ✅ | ✅ Selesai |
| Unread count badge | ✅ | ✅ | ✅ | ✅ Selesai |
| Message search (in-chat) | ✅ | ✅ | ✅ | ✅ Selesai |
| Link previews (Open Graph) | ✅ | ✅ | ✅ | ✅ Selesai |
| Emoji picker | ✅ | ✅ | — | ✅ Selesai |
| File attachments (upload) | ✅ | ✅ | ✅ | ✅ Selesai |
| Image compression (sharp) | — | — | ✅ | ✅ Selesai |
| Infinite scroll (pagination 50/batch) | ✅ | ✅ | ✅ | ✅ Selesai |
| Offline queue & auto-sync | ✅ | ✅ | — | ✅ Selesai |
| Optimistic UI (instant send) | ✅ | ✅ | — | ✅ Selesai |
| Long-press context menu | — | ✅ | — | ✅ Selesai |
| Chat from directory | ✅ | ✅ | ✅ | ✅ Selesai |

---

## 3. Announcements

| Fitur | Web | Mobile | API | Status |
|-------|-----|--------|-----|--------|
| Announcement list | ✅ | ✅ | ✅ | ✅ Selesai |
| Create announcement (admin) | ✅ | ✅ | ✅ | ✅ Selesai |
| Priority levels (normal/important/urgent) | ✅ | ✅ | ✅ | ✅ Selesai |

---

## 4. Voice & Video Call

| Fitur | Web | Mobile | API | Status |
|-------|-----|--------|-----|--------|
| WebRTC 1:1 video call | ✅ | ✅ | ✅ (WS signaling) | ✅ Selesai |
| WebRTC 1:1 voice call | ✅ | ✅ | ✅ (WS signaling) | ✅ Selesai |
| Call offer/answer/reject | ✅ | ✅ | ✅ | ✅ Selesai |
| ICE/TURN servers (openrelay) | ✅ | ✅ | — | ✅ Selesai |
| In-call controls (mute, camera, end) | ✅ | ✅ | — | ✅ Selesai |

---

## 5. Real-Time Collaboration Canvas

| Fitur | Web | Mobile | API | Status |
|-------|-----|--------|-----|--------|
| Canvas board CRUD | ✅ | ✅ | ✅ | ✅ Selesai |
| **Public board** (semua bisa akses) | ✅ | ✅ | ✅ | ✅ Selesai |
| **Private board** (hanya member) | ✅ | ✅ | ✅ | ✅ Selesai |
| Board visibility toggle (public/private) | ✅ | — | ✅ | ✅ Selesai |
| **Member management** (add/remove/role) | ✅ | — | ✅ | ✅ Selesai |
| Role-based access (admin/editor/viewer) | ✅ | — | ✅ | ✅ Selesai |
| Freehand drawing | ✅ | ✅ | ✅ | ✅ Selesai |
| Shapes (rectangle, ellipse, line, arrow) | ✅ | ✅ | ✅ | ✅ Selesai |
| Text tool | ✅ | ✅ | ✅ | ✅ Selesai |
| Sticky notes | ✅ | ✅ | ✅ | ✅ Selesai |
| Eraser | ✅ | ✅ | — | ✅ Selesai |
| Color picker | ✅ | ✅ | — | ✅ Selesai |
| Undo/Redo | ✅ | ✅ | — | ✅ Selesai |
| Zoom/Pan | ✅ | ✅ | — | ✅ Selesai |
| Export PNG | ✅ | ✅ | — | ✅ Selesai |
| Real-time sync (WebSocket) | ✅ | ✅ | ✅ | ✅ Selesai |
| Remote cursor display | ✅ | ✅ | ✅ | ✅ Selesai |
| WS access control (join + mutation gate) | — | — | ✅ | ✅ Selesai |
| Board settings dialog (UI) | ✅ | ⬜ | — | 🔧 Sebagian |

---

## 6. Task Management

| Fitur | Web | Mobile | API | Status |
|-------|-----|--------|-----|--------|
| Task list + filter | ✅ | ⬜ | ✅ | 🔧 Web only |
| Create task (title, desc, priority, assignee, due) | ✅ | ⬜ | ✅ | 🔧 Web only |
| Task detail (status, edit, comments) | ✅ | ⬜ | ✅ | 🔧 Web only |
| Task stats/overview | ✅ | ⬜ | ✅ | 🔧 Web only |
| Push notification saat task di-assign | — | ⬜ | ⬜ | ⬜ Belum |
| Mobile tab/entry untuk Tasks | — | ⬜ | — | ⬜ Belum |

---

## 7. Admin Features

| Fitur | Web | Mobile | API | Status |
|-------|-----|--------|-----|--------|
| Admin dashboard (stats, charts) | ✅ | ✅ | ✅ | ✅ Selesai |
| Audit log (search, filter, export CSV) | ✅ | ✅ | ✅ | ✅ Selesai |
| User management (add/edit/deactivate) | ✅ | ✅ | ✅ | ✅ Selesai |
| Bulk CSV import users | ✅ | ✅ | ✅ | ✅ Selesai |
| WhatsApp inbox management | ✅ | ✅ | ✅ | ✅ Selesai |
| Compliance dashboard (PII) | ✅ | ✅ | ✅ | ✅ Selesai |

---

## 8. Compliance & Security

| Fitur | Web | Mobile | API | Status |
|-------|-----|--------|-----|--------|
| PII detection (6 pola Indonesia) | ✅ | ✅ | ✅ | ✅ Selesai |
| PII warning banner (confirm/cancel) | ✅ | ✅ | — | ✅ Selesai |
| PII block di group chat | — | ✅ | ✅ | ✅ Selesai |
| File upload validation (type, size) | ✅ | ✅ | ✅ | ✅ Selesai |
| GDPR data export (JSON/CSV) | ✅ | — | ✅ | ✅ Selesai |
| Database backup (daily, 30-day retention) | — | — | ✅ | ✅ Selesai |

---

## 9. WhatsApp Integration

| Fitur | Web | Mobile | API | Status |
|-------|-----|--------|-----|--------|
| WhatsApp Business API (Meta Graph API) | — | — | ✅ | ✅ Selesai |
| Twilio fallback | — | — | ✅ | ✅ Selesai |
| Send WhatsApp from admin | ✅ | ✅ | ✅ | ✅ Selesai |
| WhatsApp inbox (claim/resolve) | ✅ | ✅ | ✅ | ✅ Selesai |

---

## 10. Push Notifications

| Fitur | Web | Mobile | API | Status |
|-------|-----|--------|-----|--------|
| Expo Push Notifications | — | ✅ | ✅ | ✅ Selesai |
| Push token register/unregister | — | ✅ | ✅ | ✅ Selesai |
| Push to offline users on new message | — | ✅ | ✅ | ✅ Selesai |
| Tap notification → navigate to chat | — | ✅ | — | ✅ Selesai |
| Stale token auto-cleanup | — | — | ✅ | ✅ Selesai |

---

## 11. Infrastructure

| Fitur | Status |
|-------|--------|
| pnpm workspace monorepo | ✅ |
| TypeScript 5.9 + composite projects | ✅ |
| PostgreSQL + Drizzle ORM | ✅ |
| WebSocket (real-time messaging, presence, canvas, calls) | ✅ |
| Express 5 API server | ✅ |
| Vite dev server (web) | ✅ |
| Expo dev server (mobile) | ✅ |
| Image compression (sharp) | ✅ |
| Rate limiting (express-rate-limit) | ✅ |
| CORS configuration | ✅ |

---

## Ringkasan Status

| Kategori | Selesai | Sebagian | Belum |
|----------|---------|----------|-------|
| Auth & User | 7/7 | 0 | 0 |
| Chat & Messaging | 28/28 | 0 | 0 |
| Announcements | 3/3 | 0 | 0 |
| Voice/Video Call | 5/5 | 0 | 0 |
| Canvas | 17/18 | 1 | 0 |
| Task Management | 0/6 | 4 | 2 |
| Admin | 6/6 | 0 | 0 |
| Compliance | 6/6 | 0 | 0 |
| WhatsApp | 4/4 | 0 | 0 |
| Push Notifications | 5/5 | 0 | 0 |
| **Total** | **81/88** | **5** | **2** |

---

## Remaining Work

### Priority 1 — GAP-03: Task Management Mobile
- Task list screen + filter (⬜)
- Create task dialog (⬜)
- Task detail screen (⬜)
- Task stats/overview (⬜)
- Push notification saat task di-assign (⬜)
- Bottom tab/menu entry untuk Tasks (⬜)

### Priority 2 — Canvas Mobile Board Settings
- Board settings dialog di mobile (toggle public/private, manage members) (⬜)
