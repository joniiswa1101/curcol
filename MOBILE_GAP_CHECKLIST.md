# CurCol — Mobile vs Web Gap Analysis Checklist
> Generated: March 21, 2026
> Tujuan: Identifikasi fitur yang ada di Web tapi belum ada di Mobile, dan sebaliknya.

---

## Ringkasan Gap

| Kategori | Web | Mobile | Gap |
|----------|-----|--------|-----|
| Chat Dasar | ✅ | ✅ | Minimal |
| Group Chat Management | ✅ Full | ✅ Full | OK |
| PII / Compliance | ✅ Full | ❌ Tidak ada | **BESAR** |
| Task Management | ✅ Full | ❌ Tidak ada | **BESAR** |
| Admin Dashboard | ✅ Full | ❌ Tidak ada | **BESAR** |
| Admin User Management | ✅ Full | ❌ Tidak ada | **BESAR** |
| Admin WhatsApp Inbox | ✅ Full | ❌ Tidak ada | **SEDANG** |
| Announcements | ✅ Full | ✅ Full | OK |
| Directory | ✅ | ✅ | OK |
| Voice/Video Call | ✅ | ✅ | OK |
| Link Previews | ✅ | ❌ Tidak ada | **SEDANG** |
| Offline Queue | ✅ | ❌ Tidak ada | **SEDANG** |
| Read Receipts | ✅ | ❌ Tidak ada | **SEDANG** |
| Message Search | ⚠️ Basic | ❌ Tidak ada | **KECIL** |
| File Upload Validation | ✅ Full | ✅ Full | OK |
| Dark/Light Theme | ✅ | ✅ | OK |
| CICO Toggle | ✅ Sidebar | ✅ Profile Tab | OK |
| Presence/Online Status | ✅ | ⚠️ Partial | **KECIL** |

---

## Detail Gap: Fitur di Web yang TIDAK ADA di Mobile

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

### GAP-02: Compliance / PII Detection
| ID | Task | Priority | Effort | Status |
|----|------|----------|--------|--------|
| GAP-02.1 | Client-side PII detection sebelum kirim pesan | HIGH | 1-2d | ⬜ |
| GAP-02.2 | Warning banner saat PII terdeteksi (confirm/cancel) | HIGH | 1d | ⬜ |
| GAP-02.3 | Handle server 400 error (PII blocked di group) | HIGH | 0.5d | ⬜ |

**Catatan**: Server-side blocking sudah aktif, tapi mobile tidak menampilkan warning atau error message yang user-friendly.

---

### GAP-03: Task Management
| ID | Task | Priority | Effort | Status |
|----|------|----------|--------|--------|
| GAP-03.1 | Task list screen (semua task + filter) | HIGH | 3-4d | ⬜ |
| GAP-03.2 | Create task dialog (title, desc, priority, assignee, due date) | HIGH | 2-3d | ⬜ |
| GAP-03.3 | Task detail screen (status change, edit, comments) | HIGH | 2-3d | ⬜ |
| GAP-03.4 | Task stats/overview (count by status) | MEDIUM | 1d | ⬜ |
| GAP-03.5 | Push notification saat task di-assign | MEDIUM | 1-2d | ⬜ |
| GAP-03.6 | Bottom tab atau menu entry untuk Tasks | HIGH | 0.5d | ⬜ |

**Catatan**: Fitur Task Management sepenuhnya belum ada di mobile. Ini fitur besar yang mencakup Kanban board, komentar, dan notifikasi.

---

### GAP-04: Admin Features
| ID | Task | Priority | Effort | Status |
|----|------|----------|--------|--------|
| GAP-04.1 | Admin dashboard (stats, charts, audit log) | LOW | 3-5d | ⬜ |
| GAP-04.2 | User management (add, edit, activate/deactivate) | LOW | 3-4d | ⬜ |
| GAP-04.3 | Bulk CSV import users | LOW | 2-3d | ⬜ |
| GAP-04.4 | Compliance dashboard (flags, review, scanner) | LOW | 3-4d | ⬜ |
| GAP-04.5 | WhatsApp inbox management | LOW | 2-3d | ⬜ |

**Catatan**: Admin features umumnya lebih cocok di desktop/web. Ini prioritas rendah untuk mobile kecuali user secara eksplisit meminta.

---

### GAP-05: Link Previews
| ID | Task | Priority | Effort | Status |
|----|------|----------|--------|--------|
| GAP-05.1 | Deteksi URL dalam pesan | MEDIUM | 0.5d | ⬜ |
| GAP-05.2 | Fetch Open Graph metadata (title, desc, image) | MEDIUM | 1d | ⬜ |
| GAP-05.3 | Render preview card di chat bubble | MEDIUM | 1-2d | ⬜ |

---

### GAP-06: Offline Queue & Sync
| ID | Task | Priority | Effort | Status |
|----|------|----------|--------|--------|
| GAP-06.1 | Queue pesan saat offline (AsyncStorage) | HIGH | 2-3d | ⬜ |
| GAP-06.2 | Auto-sync saat kembali online | HIGH | 1-2d | ⬜ |
| GAP-06.3 | Visual indicator pesan pending/gagal | MEDIUM | 1d | ⬜ |

**Catatan**: Mobile sangat butuh offline support karena koneksi sering tidak stabil.

---

### GAP-07: Read Receipts
| ID | Task | Priority | Effort | Status |
|----|------|----------|--------|--------|
| GAP-07.1 | Kirim read receipt saat buka chat | HIGH | 1d | ⬜ |
| GAP-07.2 | Tampilkan status read (✓✓) di pesan terkirim | HIGH | 1d | ⬜ |
| GAP-07.3 | Unread count badge di conversation list | MEDIUM | 0.5d | ⬜ |

**Catatan**: Web sudah memiliki read receipts penuh. Mobile perlu menyusul.

---

### GAP-08: Message Search
| ID | Task | Priority | Effort | Status |
|----|------|----------|--------|--------|
| GAP-08.1 | Search bar di conversation list | MEDIUM | 1d | ⬜ |
| GAP-08.2 | Search dalam chat (cari pesan spesifik) | MEDIUM | 1-2d | ⬜ |
| GAP-08.3 | Highlight dan scroll ke hasil search | LOW | 1d | ⬜ |

---

### GAP-09: Presence & Online Status
| ID | Task | Priority | Effort | Status |
|----|------|----------|--------|--------|
| GAP-09.1 | Real-time presence indicators (online/idle/offline) | MEDIUM | 1-2d | ⬜ |
| GAP-09.2 | "Last seen" timestamp di chat header | LOW | 0.5d | ⬜ |
| GAP-09.3 | Broadcast presence status dari mobile | MEDIUM | 1d | ⬜ |

---

## Detail Gap: Fitur di Mobile yang TIDAK ADA di Web

### GAP-10: Mobile-Specific UX
| ID | Task | Priority | Effort | Status |
|----|------|----------|--------|--------|
| GAP-10.1 | Long-press context menu pada pesan (mobile sudah ada, web pakai right-click) | LOW | - | N/A |
| GAP-10.2 | Swipe actions (reply, delete) | LOW | - | N/A |
| GAP-10.3 | Push notifications (mobile-specific, tidak relevan untuk web) | LOW | - | N/A |

**Catatan**: Ini fitur mobile-native yang tidak perlu diimplementasi di web.

---

## Prioritas Implementasi (Rekomendasi)

### Gelombang 1 — CRITICAL (minggu pertama)
| ID | Gap | Effort Total |
|----|-----|-------------|
| GAP-01 | ~~Group Chat Management~~ ✅ SELESAI | ~~5-7d~~ |
| GAP-02 | PII/Compliance Warning | 2-3d |
| GAP-06 | Offline Queue & Sync | 3-5d |

### Gelombang 2 — HIGH (minggu kedua)
| ID | Gap | Effort Total |
|----|-----|-------------|
| GAP-03 | Task Management | 8-12d |
| GAP-07 | Read Receipts | 2-3d |

### Gelombang 3 — MEDIUM (minggu ketiga)
| ID | Gap | Effort Total |
|----|-----|-------------|
| GAP-05 | Link Previews | 2-3d |
| GAP-08 | Message Search | 2-4d |
| GAP-09 | Presence & Online Status | 2-3d |

### Gelombang 4 — LOW (opsional)
| ID | Gap | Effort Total |
|----|-----|-------------|
| GAP-04 | Admin Features di Mobile | 13-19d |

---

## Statistik Total

| Metrik | Nilai |
|--------|-------|
| Total gap items | 42 |
| CRITICAL priority | 9 |
| HIGH priority | 14 |
| MEDIUM priority | 12 |
| LOW priority | 7 |
| Estimasi total effort | 45-65 hari kerja |
| Gap terbesar | Task Management (GAP-03) |
