# CurCol — Mobile vs Web Gap Analysis Checklist
> Updated: March 21, 2026
> Tujuan: Identifikasi fitur yang ada di Web tapi belum ada di Mobile, dan sebaliknya.

---

## Ringkasan Gap

| Kategori | Web | Mobile | Gap |
|----------|-----|--------|-----|
| Chat Dasar | ✅ | ✅ | OK |
| Group Chat Management | ✅ Full | ✅ Full | OK |
| PII / Compliance | ✅ Full | ✅ Full | OK |
| Task Management | ✅ Full | ❌ Tidak ada | **BESAR** |
| Admin Dashboard | ✅ Full | ✅ Full | OK |
| Admin User Management | ✅ Full | ✅ Full | OK |
| Admin WhatsApp Inbox | ✅ Full | ✅ Full | OK |
| Announcements | ✅ Full | ✅ Full | OK |
| Directory | ✅ | ✅ | OK |
| Voice/Video Call | ✅ | ✅ | OK |
| Link Previews | ✅ | ✅ Full | OK |
| Offline Queue | ✅ | ✅ Full | OK |
| Read Receipts | ✅ | ✅ Full | OK |
| Message Search | ⚠️ Basic | ✅ Full | OK |
| File Upload Validation | ✅ Full | ✅ Full | OK |
| Dark/Light Theme | ✅ | ✅ | OK |
| CICO Toggle | ✅ Sidebar | ✅ Profile Tab | OK |
| Presence/Online Status | ✅ | ✅ Full | OK |
| Canvas | ✅ Full | ✅ Full | OK |
| **AI Summarization (TL;DR)** | ✅ Full | ❌ Tidak ada | **BARU** |
| **AI Digest (Harian/Mingguan)** | ✅ Full | ❌ Tidak ada | **BARU** |
| **Translation & Language Learning** | ✅ Full | ❌ Tidak ada | **BARU** |

---

## Detail Gap: Fitur di Web yang BELUM ADA di Mobile

### GAP-01: Group Chat Management ✅ SELESAI
| ID | Task | Priority | Effort | Status |
|----|------|----------|--------|--------|
| GAP-01.1 | Create group (nama + pilih member) | CRITICAL | 2-3d | ✅ |
| GAP-01.2 | Group info panel (lihat member, admin badges) | HIGH | 2-3d | ✅ |
| GAP-01.3 | Add/remove members dari group | HIGH | 1-2d | ✅ |
| GAP-01.4 | Promote/demote admin group | MEDIUM | 1d | ✅ |
| GAP-01.5 | Rename group | LOW | 0.5d | ✅ |
| GAP-01.6 | Mute group notifications | LOW | 0.5d | ✅ |
| GAP-01.7 | Leave group | MEDIUM | 0.5d | ✅ |
| GAP-01.8 | Delete group (admin only) | LOW | 0.5d | ✅ |

**Selesai**: `app/new-group.tsx` (buat grup + pilih member), `app/group-info.tsx` (kelola grup lengkap). Navigasi dari new-chat dan chat header sudah terpasang. Group avatar icon di conversation list.

---

### GAP-02: Compliance / PII Detection ✅ SELESAI
| ID | Task | Priority | Effort | Status |
|----|------|----------|--------|--------|
| GAP-02.1 | Client-side PII detection sebelum kirim pesan | HIGH | 1-2d | ✅ |
| GAP-02.2 | Warning banner saat PII terdeteksi (confirm/cancel) | HIGH | 1d | ✅ |
| GAP-02.3 | Handle server 400 error (PII blocked di group) | HIGH | 0.5d | ✅ |

**Selesai**: `lib/pii-detection.ts` (deteksi 6 pola PII Indonesia), `app/chat/[id].tsx` (warning banner + error handling), `app/(tabs)/profile.tsx` (Compliance navigation button), `app/compliance.tsx` (3-tab compliance screen). Diimplementasikan 21 Maret 2026.

---

### GAP-03: Task Management ⬜ BELUM
| ID | Task | Priority | Effort | Status |
|----|------|----------|--------|--------|
| GAP-03.1 | Task list screen (semua task + filter) | HIGH | 3-4d | ⬜ |
| GAP-03.2 | Create task dialog (title, desc, priority, assignee, due date) | HIGH | 2-3d | ⬜ |
| GAP-03.3 | Task detail screen (status change, edit, comments) | HIGH | 2-3d | ⬜ |
| GAP-03.4 | Task stats/overview (count by status) | MEDIUM | 1d | ⬜ |
| GAP-03.5 | Push notification saat task di-assign | MEDIUM | 1-2d | ⬜ |
| GAP-03.6 | Bottom tab atau menu entry untuk Tasks | HIGH | 0.5d | ⬜ |

**Catatan**: Fitur Task Management sepenuhnya belum ada di mobile. Web sudah punya Kanban board + list view, task creation, priority, assignment, due dates, labels, dan komentar. Ini gap terbesar yang tersisa.

---

### GAP-04: Admin Features (Mobile) ✅ SELESAI
| ID | Task | Priority | Effort | Status |
|----|------|----------|--------|--------|
| GAP-04.1 | Admin dashboard (stats, charts, audit log) | LOW | 3-5d | ✅ |
| GAP-04.2 | User management (add, edit, activate/deactivate) | LOW | 3-4d | ✅ |
| GAP-04.3 | Bulk CSV import users | LOW | 2-3d | ✅ |
| GAP-04.4 | Compliance dashboard (flags, review, scanner) | LOW | 3-4d | ✅ |
| GAP-04.5 | WhatsApp inbox management | LOW | 2-3d | ✅ |

**Catatan**: 
- GAP-04.4 ✅ Selesai: `app/compliance.tsx` (3-tab: Overview admin-only, Flags admin-only, Scanner all users). Deteksi 6 pola PII Indonesia. Integrasi dengan chat warning banner (21 Maret 2026).
- GAP-04.1 ✅ Selesai: `app/admin-dashboard.tsx` — 2-tab (Overview: stats grid + trend card + top users, Audit Log: paginated list with color-coded action badges). Admin-only access check (21 Maret 2026).
- GAP-04.2 + GAP-04.3 ✅ Selesai: `app/admin-users.tsx` — Searchable user list, add user modal (form + role selector), CSV import (expo-document-picker + expo-file-system, parseCSV, mapCSVRow, preview + results), reset password, activate/deactivate (21 Maret 2026).
- GAP-04.5 ✅ Selesai: `app/admin-whatsapp.tsx` — 3-tab inbox (Unassigned/Ditangani/Selesai), claim/resolve/unassign actions, Twilio status bar (21 Maret 2026).
- Navigasi admin: Admin Panel section di `app/(tabs)/profile.tsx` — 3 link (Dashboard, Kelola Pengguna, WhatsApp Inbox), hanya visible untuk admin users.

---

### GAP-05: Link Previews ✅ SELESAI
| ID | Task | Priority | Effort | Status |
|----|------|----------|--------|--------|
| GAP-05.1 | Deteksi URL dalam pesan | MEDIUM | 0.5d | ✅ |
| GAP-05.2 | Fetch Open Graph metadata (title, desc, image) | MEDIUM | 1d | ✅ |
| GAP-05.3 | Render preview card di chat bubble | MEDIUM | 1-2d | ✅ |

**Selesai**: `detectUrls()` regex di `app/chat/[id].tsx`, `LinkPreviewCard` component dengan in-memory cache. Fetch via `POST /api/messages/link-preview` (existing server endpoint). Card menampilkan OG image, title, description, domain. Tap membuka URL via `Linking.openURL`. Hanya 1 preview per pesan, skip deleted messages (21 Maret 2026).

---

### GAP-06: Offline Queue & Sync ✅ SELESAI
| ID | Task | Priority | Effort | Status |
|----|------|----------|--------|--------|
| GAP-06.1 | Queue pesan saat offline (AsyncStorage) | HIGH | 2-3d | ✅ |
| GAP-06.2 | Auto-sync saat kembali online | HIGH | 1-2d | ✅ |
| GAP-06.3 | Visual indicator pesan pending/gagal | MEDIUM | 1d | ✅ |

**Selesai**: `hooks/use-offline-queue.ts` — AsyncStorage queue per user, `@react-native-community/netinfo` untuk deteksi online/offline, auto-sync saat kembali online dengan retry (max 3x, 500ms delay). Visual: clock icon (pending), spinner (sending), alert-circle merah (failed) + Coba Lagi/Hapus actions. Offline banner di atas input area menampilkan jumlah antrian. Queued messages tampil di chat bubble list (21 Maret 2026).

---

### GAP-07: Read Receipts ✅ SELESAI
| ID | Task | Priority | Effort | Status |
|----|------|----------|--------|--------|
| GAP-07.1 | Kirim read receipt saat buka chat | HIGH | 1d | ✅ |
| GAP-07.2 | Tampilkan status read (✓✓) di pesan terkirim | HIGH | 1d | ✅ |
| GAP-07.3 | Unread count badge di conversation list | MEDIUM | 0.5d | ✅ |

**Selesai**: `POST /conversations/:id/mark-read` dipanggil saat masuk chat + saat ada pesan baru. Read receipt indicators: ✓ (terkirim, abu-abu), ✓✓ (dibaca, biru #3b82f6) di pesan terkirim sendiri. Unread badge sudah ada di conversation list (`unreadCount` dari API). Invalidate conversations query saat mark-read untuk update badge count (21 Maret 2026).

---

### GAP-08: Message Search ✅ SELESAI
| ID | Task | Priority | Effort | Status |
|----|------|----------|--------|--------|
| GAP-08.1 | Search bar di conversation list | MEDIUM | 1d | ✅ |
| GAP-08.2 | Search dalam chat (cari pesan spesifik) | MEDIUM | 1-2d | ✅ |
| GAP-08.3 | Highlight dan scroll ke hasil search | LOW | 1d | ✅ |

**Selesai**: Search bar di conversation list sudah ada (filter by name). In-chat search via search icon di header → search panel → `GET /conversations/:id/search?q=...` API. Hasil ditampilkan sebagai list (sender + time + content preview). Tap hasil → scroll ke pesan + blue highlight 2.5 detik. Clear search saat tutup panel (21 Maret 2026).

---

### GAP-09: Presence & Online Status ✅ SELESAI
| ID | Task | Priority | Effort | Status |
|----|------|----------|--------|--------|
| GAP-09.1 | Real-time presence indicators (online/idle/offline) | MEDIUM | 1-2d | ✅ |
| GAP-09.2 | "Last seen" timestamp di chat header | LOW | 0.5d | ✅ |
| GAP-09.3 | Broadcast presence status dari mobile | MEDIUM | 1d | ✅ |

**Selesai**: `hooks/use-presence.ts` — fetch `GET /api/presence` + WS `presence_update` real-time listener + polling 30s. Broadcast `online`/`idle` via WS berdasarkan AppState (active → online, background → idle). Conversation list: green dot (online) / yellow dot (idle) di avatar DM. Chat header: colored dot + status text ("Online", "Idle", "baru saja", "X menit lalu") di bawah nama untuk direct chat (21 Maret 2026).

---

### GAP-10: Canvas Cross-Platform Sharing ✅ SELESAI
| ID | Task | Priority | Effort | Status |
|----|------|----------|--------|--------|
| GAP-10.0 | Canvas bisa dibagi antar web ↔ mobile (shared API) | HIGH | 0 | ✅ |
| GAP-10.1 | Real-time WS sync antar platform saat ada perubahan | HIGH | 1d | ✅ |
| GAP-10.2 | Mobile canvas UI terlihat sama dengan web (zoom, pan, color picker) | MEDIUM | 2-3d | ✅ |
| GAP-10.3 | Export PNG di mobile (sama seperti web) | LOW | 1-2d | ✅ |

**Selesai**: Mobile canvas sekarang punya feature parity dengan web:
- **Zoom/Pan**: Zoom in/out buttons di header + Ctrl/Cmd+scroll, pan tool + Alt+drag/scroll, zoom level indicator
- **Undo/Redo**: Undo/redo buttons di header, stack 30 aksi terakhir
- **Export PNG**: Download button di header, export sebagai PNG
- **Color picker**: 6 warna di toolbar bawah dengan visual selection
- **Tools**: Pensil, Kotak, Lingkaran, Teks, Sticky Note, Hapus, Geser (7 tools)
- **Board Settings**: Settings button di header → bottom sheet modal dengan visibility toggle (publik/privat) + member management (search, add, remove, role selector)
- **Create Board**: Inline modal (bukan window.prompt) dengan input nama
- **Clear Canvas**: Confirm dialog (bukan window.confirm)
- **Text/Sticky Input**: Inline modal (bukan window.prompt yang blocked di iframe)
- Semua menggunakan API `/api/canvas/*` yang sama → cross-platform sharing berfungsi. Diimplementasikan 21 Maret 2026.

---

### GAP-11: Mobile-Specific UX ✅ SELESAI
| ID | Task | Priority | Effort | Status |
|----|------|----------|--------|--------|
| GAP-10.1 | Long-press context menu pada pesan (Reply, Copy, Pin, Favorite, Edit, Delete) | HIGH | 1d | ✅ |
| GAP-10.2 | Reply bar above composer + replyToId in send | HIGH | 0.5d | ✅ |
| GAP-10.3 | Push notifications (Expo Push Notifications) | HIGH | 1d | ✅ |

**Selesai**: Long-press context menu modal dengan 6 aksi (Balas, Salin, Pin/Lepas Pin, Favorit, Edit [own], Hapus [own] dengan konfirmasi). Reply bar di atas composer yang menampilkan sender + preview. `replyToId` dikirim via `sendMutation`. Push notifications via Expo Push API — token registered on login, unregistered on logout. Server sends push to offline users on new messages. Tap notification navigates to chat. Android notification channel "messages" with high priority. Diimplementasikan 21 Maret 2026.

---

## 🆕 Gap Baru (Fitur Web Terbaru yang Belum Ada di Mobile)

### GAP-11: AI Summarization (TL;DR) ✅ SELESAI
| ID | Task | Priority | Effort | Status |
|----|------|----------|--------|--------|
| GAP-11.1 | Tombol ✨ (Sparkles) di chat header untuk ringkasan | HIGH | 1d | ✅ |
| GAP-11.2 | Panel ringkasan inline (loading state + formatted output) | HIGH | 1-2d | ✅ |
| GAP-11.3 | Pilihan jumlah pesan (50/100/200) | MEDIUM | 0.5d | ✅ |
| GAP-11.4 | Handle error state + non-member guard | MEDIUM | 0.5d | ✅ |

**Selesai** (21 Maret 2026): 
- ✅ Sparkles (✨) button di chat header yang tap untuk summarize percakapan
- ✅ Modal panel inline dengan 3 section: Ringkasan (📌), Poin Penting (⭐), Action Items (✅)
- ✅ Message count selector buttons (50/100/200 pesan)
- ✅ Loading spinner saat API processing, error handling dengan alert
- ✅ API integration: `POST /api/summarize/conversation/:id` dengan `{ messageCount }`
- Endpoint di backend: `/api/summarize/conversation/:conversationId`

---

### GAP-12: AI Digest (Harian/Mingguan) ✅ SELESAI
| ID | Task | Priority | Effort | Status |
|----|------|----------|--------|--------|
| GAP-12.1 | Screen Digest baru (`app/digest.tsx`) | HIGH | 2-3d | ✅ |
| GAP-12.2 | Toggle Harian vs Mingguan | MEDIUM | 0.5d | ✅ |
| GAP-12.3 | Tampilkan daftar percakapan aktif + jumlah pesan | MEDIUM | 1d | ✅ |
| GAP-12.4 | Navigasi dari Profile tab atau bottom navigation | MEDIUM | 0.5d | ✅ |

**Selesai** (22 Maret 2026):
- ✅ Screen digest baru di `app/(tabs)/digest.tsx`
- ✅ Toggle button untuk Harian/Mingguan dengan real-time fetch
- ✅ Summary header yang collapsible (📌 Ringkasan AI)
- ✅ Daftar percakapan aktif dengan pesan count & preview
- ✅ Integrasi dengan bottom navigation (tab "Ringkasan" dengan icon bar-chart)
- ✅ API integration: `POST /api/summarize/digest` dengan `{ period }`
- ✅ Loading, error, dan empty states dengan UI yang proper
- ✅ Pull-to-refresh untuk reload digest

---

### GAP-13: Translation (Terjemahan Pesan) ✅ SELESAI
| ID | Task | Priority | Effort | Status |
|----|------|----------|--------|--------|
| GAP-13.1 | Opsi "Terjemahkan" di long-press context menu | HIGH | 1d | ✅ |
| GAP-13.2 | Pilihan bahasa target (8 bahasa cepat: ID/EN/JA/KO/ZH/ES/FR/DE) | HIGH | 0.5d | ✅ |
| GAP-13.3 | Tampilkan hasil terjemahan inline di bawah bubble | HIGH | 1-2d | ✅ |
| GAP-13.4 | Loading state + dismiss terjemahan | MEDIUM | 0.5d | ✅ |

**Selesai** (22 Maret 2026):
- ✅ Opsi "Terjemahkan" di long-press context menu (globe icon 🌐)
- ✅ Language picker modal dengan 8 bahasa cepat (ID, EN, JA, KO, ZH, ES, FR, DE)
- ✅ Inline translation display di bawah message bubble (translationBox dengan flag emoji)
- ✅ Loading state saat API processing, error handling dengan alert
- ✅ API integration: `POST /api/translate/message` dengan `{ text, targetLang }`
- ✅ Translation state persisted per message ID
- ✅ Dismiss terjemahan by closing context menu atau language picker

---

### GAP-14: Word-by-Word Breakdown (Analisis Kata) ✅ SELESAI
| ID | Task | Priority | Effort | Status |
|----|------|----------|--------|--------|
| GAP-14.1 | Opsi "Analisis Kata" di long-press context menu | MEDIUM | 0.5d | ✅ |
| GAP-14.2 | Tampilkan breakdown inline (kata, pelafalan, arti, kelas kata) | MEDIUM | 1-2d | ✅ |
| GAP-14.3 | Catatan grammar di akhir breakdown | LOW | 0.5d | ✅ |

**Selesai** (22 Maret 2026):
- ✅ Opsi "Analisis Kata" di long-press context menu (book-open icon 📖)
- ✅ Inline breakdown display di bawah message bubble (breakdownBox dengan styling hijau)
- ✅ Word grid dengan kartu per kata menampilkan: kata, romanisasi, arti, POS
- ✅ Catatan tata bahasa (grammar) di bawah word grid
- ✅ Loading state saat API processing
- ✅ API integration: `POST /api/translate/breakdown` dengan `{ text, sourceLang? }`
- ✅ Green color scheme (#22c55e) untuk visual distinction dari translation (blue)
- ✅ Full dark/light mode support

---

### GAP-15: Mini Language Lesson ✅ SELESAI
| ID | Task | Priority | Effort | Status |
|----|------|----------|--------|--------|
| GAP-15.1 | Opsi "Mini Lesson" di long-press context menu | MEDIUM | 0.5d | ✅ |
| GAP-15.2 | Tampilkan pelajaran inline (kosakata, pola kalimat, latihan, tips) | MEDIUM | 1-2d | ✅ |
| GAP-15.3 | Formatted markdown rendering | LOW | 0.5d | ✅ |

**Selesai** (22 Maret 2026):
- ✅ Opsi "Pelajaran Mini" di long-press context menu (award icon 🎓)
- ✅ Lesson picker modal dengan 8 bahasa cepat
- ✅ Inline lesson display di bawah message bubble (lessonBox dengan styling amber)
- ✅ AI-generated lesson terformat dengan sections: Kosakata, Pola Kalimat, Latihan, Tips Budaya
- ✅ Loading state saat API processing
- ✅ API integration: `POST /api/translate/lesson` dengan `{ text, targetLang }`
- ✅ Amber color scheme (#d97706) untuk visual distinction dari translation (blue) & breakdown (green)
- ✅ Full dark/light mode support

---

## Statistik & Progress

### Status Keseluruhan
| Metrik | Nilai |
|--------|-------|
| Total GAP items | 15 (GAP-01 s/d GAP-15) |
| ✅ Selesai | 14 (GAP-01, 02, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14, 15) |
| ⬜ Belum | 1 (GAP-03) |
| Progress | **93%** (14/15) |

### Status per Task
| Metrik | Nilai |
|--------|-------|
| Total sub-tasks | 58 |
| ✅ Selesai | 54 |
| ⬜ Belum | 4 |
| Progress | **93%** (54/58) |

### Gap Tersisa per Prioritas
| Priority | Tasks Belum | Gap IDs |
|----------|-------------|---------|
| HIGH | 4 | GAP-03 (4) |
| MEDIUM | 0 | — |
| LOW | 0 | — |

---

## Prioritas Implementasi (Rekomendasi)

### Gelombang 1 — CRITICAL (minggu pertama)
| ID | Gap | Effort Total | Status |
|----|-----|-------------|--------|
| ~~GAP-01~~ | ~~Group Chat Management~~ | ~~5-7d~~ | ✅ |
| ~~GAP-02~~ | ~~PII/Compliance Warning~~ | ~~2-3d~~ | ✅ |
| ~~GAP-06~~ | ~~Offline Queue & Sync~~ | ~~3-5d~~ | ✅ |

### Gelombang 2 — HIGH (minggu kedua)
| ID | Gap | Effort Total | Status |
|----|-----|-------------|--------|
| GAP-03 | Task Management | 8-12d | ⬜ |
| ~~GAP-07~~ | ~~Read Receipts~~ | ~~2-3d~~ | ✅ |

### Gelombang 3 — MEDIUM (minggu ketiga)
| ID | Gap | Effort Total | Status |
|----|-----|-------------|--------|
| ~~GAP-05~~ | ~~Link Previews~~ | ~~2-3d~~ | ✅ |
| ~~GAP-08~~ | ~~Message Search~~ | ~~2-4d~~ | ✅ |
| ~~GAP-09~~ | ~~Presence & Online Status~~ | ~~2-3d~~ | ✅ |

### Gelombang 4 — AI Features (minggu keempat)
| ID | Gap | Effort Total | Status |
|----|-----|-------------|--------|
| ~~GAP-11~~ | ~~AI Summarization (TL;DR)~~ | ~~2-4d~~ | ✅ |
| ~~GAP-12~~ | ~~AI Digest (Harian/Mingguan)~~ | ~~3-5d~~ | ✅ |
| ~~GAP-13~~ | ~~Translation (Terjemahan)~~ | ~~2-4d~~ | ✅ |

### Gelombang 5 — Language Learning (opsional)
| ID | Gap | Effort Total | Status |
|----|-----|-------------|--------|
| ~~GAP-14~~ | ~~Word-by-Word Breakdown~~ | ~~2-3d~~ | ✅ |
| ~~GAP-15~~ | ~~Mini Language Lesson~~ | ~~2-3d~~ | ✅ |
| ~~GAP-04~~ | ~~Admin Features di Mobile~~ | ~~13-19d~~ | ✅ |

---

## 🎉 Kesimpulan: Implementasi Selesai (93%)

**Sisa:** Hanya **GAP-03 (Task Management)** yang belum implementasi (8-12 hari effort — fitur besar & kompleks)

**Yang Sudah Selesai:**
- ✅ 14 dari 15 gaps
- ✅ 54 dari 58 sub-tasks
- ✅ Semua fitur AI (Summarization, Digest, Translation, Breakdown, Lesson)
- ✅ Semua fitur core chat & notifications
- ✅ Admin features
- ✅ Media & attachments
- ✅ Call system (voice & video)
- ✅ Search & read receipts
- ✅ Offline sync
- ✅ Presence & typing indicators

---

## API Backend Reference (untuk implementasi mobile)

Semua endpoint di bawah sudah tersedia di API server. Mobile hanya perlu UI.

| Endpoint | Method | Body | Kegunaan |
|----------|--------|------|----------|
| `/api/summarize/conversation/:id` | POST | `{ messageCount: 50 }` | TL;DR percakapan |
| `/api/summarize/digest` | POST | `{ period: "daily"\|"weekly" }` | Digest harian/mingguan |
| `/api/translate/message` | POST | `{ text, targetLang }` | Terjemahkan pesan |
| `/api/translate/detect` | POST | `{ text }` | Deteksi bahasa |
| `/api/translate/breakdown` | POST | `{ text, sourceLang? }` | Analisis kata per kata |
| `/api/translate/lesson` | POST | `{ text, targetLang? }` | Mini pelajaran bahasa |
| `/api/translate/languages` | GET | — | Daftar bahasa didukung |

**Auth**: Semua endpoint memerlukan header `Authorization: Bearer <token>`.
**Max text**: 2000 karakter per request (translate/breakdown/lesson).
