import { useState, useRef } from "react"
import { AppLayout } from "@/components/layout/AppLayout"
import { useListUsers } from "@workspace/api-client-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { 
  UserPlus, Search, MoreHorizontal, ShieldCheck, 
  Shield, User, CheckCircle, XCircle, KeyRound,
  Upload, FileSpreadsheet, AlertCircle, Download
} from "lucide-react"
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
const API_BASE = "/api"

// Parse CSV — toleran terhadap berbagai format CICO export
function parseCSV(text: string): Array<Record<string, string>> {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return []
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, "").toLowerCase())
  return lines.slice(1).map(line => {
    const cols = line.split(",").map(c => c.trim().replace(/^"|"$/g, ""))
    const row: Record<string, string> = {}
    headers.forEach((h, i) => { row[h] = cols[i] || "" })
    return row
  }).filter(r => Object.values(r).some(v => v))
}

// Map kolom CSV ke format CurCol (toleran terhadap nama kolom berbeda)
function mapRow(row: Record<string, string>) {
  const get = (...keys: string[]) => {
    for (const k of keys) {
      const val = row[k] || row[k.toLowerCase()] || row[k.toUpperCase()]
      if (val) return val
    }
    return ""
  }
  return {
    employeeId: get("employee_id", "employeeid", "emp_id", "empid", "nik", "id karyawan", "no karyawan"),
    name:       get("name", "nama", "full_name", "fullname", "nama lengkap", "nama_lengkap"),
    email:      get("email", "e-mail", "email address", "email_address"),
    department: get("department", "departemen", "dept", "divisi", "division"),
    position:   get("position", "jabatan", "posisi", "job_title", "jobtitle"),
    role:       get("role", "peran", "tipe"),
  }
}

interface UserFormData {
  employeeId: string
  name: string
  email: string
  password: string
  role: "admin" | "manager" | "employee"
  department: string
  position: string
  phone: string
}

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  manager: "Manager",
  employee: "Karyawan",
}

const ROLE_COLOR: Record<string, string> = {
  admin: "bg-red-500/10 text-red-600 border-red-200",
  manager: "bg-blue-500/10 text-blue-600 border-blue-200",
  employee: "bg-green-500/10 text-green-600 border-green-200",
}

export default function AdminUsers() {
  const [search, setSearch] = useState("")
  const [addOpen, setAddOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  // Import CSV state
  const [importOpen, setImportOpen] = useState(false)
  const [csvRows, setCsvRows] = useState<ReturnType<typeof mapRow>[]>([])
  const [csvError, setCsvError] = useState("")
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ created: number; skipped: number; errors: string[] } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { data, refetch } = useListUsers({ search: search || undefined, limit: 100 })
  const users = data?.users || []

  const [form, setForm] = useState<UserFormData>({
    employeeId: "",
    name: "",
    email: "",
    password: "",
    role: "employee",
    department: "",
    position: "",
    phone: "",
  })

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setCsvError("")
    setCsvRows([])
    setImportResult(null)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const parsed = parseCSV(text).map(mapRow)
      const valid = parsed.filter(r => r.employeeId && r.name && r.email)
      if (valid.length === 0) {
        setCsvError("Tidak ada data valid ditemukan. Pastikan CSV punya kolom: employee_id/NIK, nama, email.")
        return
      }
      setCsvRows(valid)
    }
    reader.readAsText(file)
  }

  async function handleImport() {
    if (csvRows.length === 0) return
    setImporting(true)
    setImportResult(null)
    try {
      const res = await fetch(`${API_BASE}/users/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ users: csvRows }),
      })
      const result = await res.json()
      setImportResult(result)
      if (result.created > 0) refetch()
    } catch {
      setCsvError("Terjadi kesalahan jaringan.")
    } finally {
      setImporting(false)
    }
  }

  function downloadTemplate() {
    const csv = "employee_id,nama,email,departemen,jabatan\nEMP007,Nama Karyawan,email@perusahaan.com,Engineering,Staff IT"
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a"); a.href = url; a.download = "template_import_karyawan.csv"; a.click()
  }

  function resetForm() {
    setForm({ employeeId: "", name: "", email: "", password: "", role: "employee", department: "", position: "", phone: "" })
    setError("")
  }

  async function handleAddUser(e: React.FormEvent) {
    e.preventDefault()
    if (!form.employeeId || !form.name || !form.email) {
      setError("Employee ID, nama, dan email wajib diisi.")
      return
    }
    setSaving(true)
    setError("")
    try {
      const res = await fetch(`${API_BASE}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          password: form.password || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.message || "Gagal menambah user.")
        return
      }
      setSuccess(`User ${data.name} (${data.employeeId}) berhasil ditambahkan. Password awal: ${form.password || form.employeeId}`)
      setAddOpen(false)
      resetForm()
      refetch()
    } catch {
      setError("Terjadi kesalahan jaringan.")
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleActive(userId: number, currentlyActive: boolean) {
    try {
      if (currentlyActive) {
        await fetch(`${API_BASE}/users/${userId}/deactivate`, { method: "POST" })
      } else {
        await fetch(`${API_BASE}/users/${userId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: true }),
        })
      }
      refetch()
    } catch {
      alert("Gagal mengubah status user.")
    }
  }

  async function handleResetPassword(userId: number, employeeId: string) {
    if (!confirm(`Reset password ${employeeId} ke default (Employee ID)?`)) return
    try {
      await fetch(`${API_BASE}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId: userId }),
      })
      alert(`Password ${employeeId} berhasil direset ke: ${employeeId}`)
    } catch {
      alert("Gagal reset password.")
    }
  }

  return (
    <AppLayout>
      <div className="flex-1 overflow-y-auto bg-background p-8 custom-scrollbar">
        <div className="max-w-6xl mx-auto space-y-6">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-display font-bold text-foreground">Manajemen User</h1>
              <p className="text-muted-foreground mt-1">{users.length} karyawan terdaftar</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setCsvRows([]); setCsvError(""); setImportResult(null); setImportOpen(true) }} className="gap-2">
                <Upload className="w-4 h-4" />
                Import CSV
              </Button>
              <Button onClick={() => { resetForm(); setAddOpen(true) }} className="gap-2">
                <UserPlus className="w-4 h-4" />
                Tambah Manual
              </Button>
            </div>
          </div>

          {/* Success Banner */}
          {success && (
            <div className="bg-green-50 border border-green-200 text-green-800 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
              <CheckCircle className="w-4 h-4 shrink-0" />
              <span>{success}</span>
              <button onClick={() => setSuccess("")} className="ml-auto text-green-600 hover:text-green-800">✕</button>
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Cari nama, email, departemen..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10 h-11"
            />
          </div>

          {/* Users Table */}
          <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground uppercase font-medium text-xs">
                  <tr>
                    <th className="px-6 py-4 text-left">Karyawan</th>
                    <th className="px-6 py-4 text-left">Employee ID</th>
                    <th className="px-6 py-4 text-left">Departemen</th>
                    <th className="px-6 py-4 text-left">Role</th>
                    <th className="px-6 py-4 text-left">Status</th>
                    <th className="px-6 py-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {users.map(u => (
                    <tr key={u.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                            {u.name?.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold text-foreground">{u.name}</p>
                            <p className="text-xs text-muted-foreground">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-mono text-sm text-muted-foreground">{u.employeeId}</td>
                      <td className="px-6 py-4 text-muted-foreground">{u.department || "—"}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${ROLE_COLOR[u.role] || ROLE_COLOR.employee}`}>
                          {u.role === "admin" && <ShieldCheck className="w-3 h-3" />}
                          {u.role === "manager" && <Shield className="w-3 h-3" />}
                          {u.role === "employee" && <User className="w-3 h-3" />}
                          {ROLE_LABEL[u.role] || u.role}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {u.isActive ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                            <CheckCircle className="w-3 h-3" /> Aktif
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                            <XCircle className="w-3 h-3" /> Nonaktif
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleResetPassword(u.id, u.employeeId)} className="gap-2">
                              <KeyRound className="w-4 h-4" /> Reset Password
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleToggleActive(u.id, u.isActive)}
                              className={`gap-2 ${u.isActive ? "text-red-600 focus:text-red-600" : "text-emerald-600 focus:text-emerald-600"}`}
                            >
                              {u.isActive ? (
                                <><XCircle className="w-4 h-4" /> Nonaktifkan</>
                              ) : (
                                <><CheckCircle className="w-4 h-4" /> Aktifkan</>
                              )}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {users.length === 0 && (
                <div className="p-12 text-center text-muted-foreground">
                  <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p>Tidak ada user ditemukan.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Import CSV Dialog */}
      <Dialog open={importOpen} onOpenChange={v => { setImportOpen(v); if (!v) { setCsvRows([]); setCsvError(""); setImportResult(null); if (fileInputRef.current) fileInputRef.current.value = "" } }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-primary" />
            Import Karyawan dari CSV
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Template download + format info */}
          {!importResult && (
            <div className="bg-muted/50 rounded-xl p-4 text-sm space-y-2">
              <p className="font-semibold text-foreground">Format CSV yang diperlukan:</p>
              <p className="font-mono text-xs text-muted-foreground bg-background rounded p-2 border">
                employee_id, nama, email, departemen, jabatan
              </p>
              <p className="text-muted-foreground text-xs">Nama kolom fleksibel — sistem otomatis mengenali NIK, emp_id, nama_lengkap, dll. Password awal setiap karyawan = Employee ID mereka.</p>
              <button onClick={downloadTemplate} className="flex items-center gap-1.5 text-primary text-xs font-semibold hover:underline mt-1">
                <Download className="w-3.5 h-3.5" /> Download template CSV
              </button>
            </div>
          )}

          {/* File upload */}
          {!importResult && (
            <div
              className="border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="font-semibold text-sm">Klik untuk pilih file CSV</p>
              <p className="text-xs text-muted-foreground mt-1">Atau drag & drop file di sini</p>
              <input ref={fileInputRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFileChange} />
            </div>
          )}

          {/* Error */}
          {csvError && (
            <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{csvError}</span>
            </div>
          )}

          {/* Preview parsed rows */}
          {csvRows.length > 0 && !importResult && (
            <div>
              <p className="text-sm font-semibold mb-2 text-foreground">{csvRows.length} karyawan siap diimport:</p>
              <div className="max-h-48 overflow-y-auto rounded-xl border border-border text-xs">
                <table className="w-full">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">Employee ID</th>
                      <th className="px-3 py-2 text-left font-semibold">Nama</th>
                      <th className="px-3 py-2 text-left font-semibold">Email</th>
                      <th className="px-3 py-2 text-left font-semibold">Dept</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {csvRows.map((r, i) => (
                      <tr key={i} className="hover:bg-muted/30">
                        <td className="px-3 py-1.5 font-mono">{r.employeeId}</td>
                        <td className="px-3 py-1.5">{r.name}</td>
                        <td className="px-3 py-1.5 text-muted-foreground">{r.email}</td>
                        <td className="px-3 py-1.5 text-muted-foreground">{r.department || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Import result */}
          {importResult && (
            <div className="rounded-xl border p-5 space-y-3">
              <p className="font-bold text-foreground text-base">Import selesai!</p>
              <div className="flex gap-4">
                <div className="flex items-center gap-2 text-emerald-600 font-semibold">
                  <CheckCircle className="w-5 h-5" />
                  <span>{importResult.created} akun dibuat</span>
                </div>
                {importResult.skipped > 0 && (
                  <div className="flex items-center gap-2 text-amber-600 font-semibold">
                    <AlertCircle className="w-5 h-5" />
                    <span>{importResult.skipped} sudah ada, dilewati</span>
                  </div>
                )}
              </div>
              <p className="text-sm text-muted-foreground">Password awal setiap karyawan = Employee ID masing-masing.</p>
            </div>
          )}
        </div>

        <DialogFooter className="mt-2">
          {!importResult ? (
            <>
              <Button variant="outline" onClick={() => setImportOpen(false)}>Batal</Button>
              <Button onClick={handleImport} disabled={csvRows.length === 0 || importing} className="gap-2">
                <Upload className="w-4 h-4" />
                {importing ? "Mengimport..." : `Import ${csvRows.length > 0 ? csvRows.length + " Karyawan" : ""}`}
              </Button>
            </>
          ) : (
            <Button onClick={() => setImportOpen(false)}>Selesai</Button>
          )}
        </DialogFooter>
      </Dialog>

      {/* Add User Dialog */}
      <Dialog open={addOpen} onOpenChange={v => { setAddOpen(v); if (!v) resetForm() }}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-primary" />
              Tambah Karyawan Baru
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddUser} className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-semibold">Employee ID <span className="text-red-500">*</span></label>
                <Input
                  placeholder="Contoh: EMP007"
                  value={form.employeeId}
                  onChange={e => setForm(f => ({ ...f, employeeId: e.target.value.toUpperCase() }))}
                  autoCapitalize="characters"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-semibold">Role</label>
                <select
                  value={form.role}
                  onChange={e => setForm(f => ({ ...f, role: e.target.value as any }))}
                  className="w-full h-10 px-3 text-sm rounded-md border border-input bg-background"
                >
                  <option value="employee">Karyawan</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-semibold">Nama Lengkap <span className="text-red-500">*</span></label>
              <Input
                placeholder="Nama sesuai data CICO"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-semibold">Email <span className="text-red-500">*</span></label>
              <Input
                type="email"
                placeholder="nama@perusahaan.com"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                autoCapitalize="none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-semibold">Departemen</label>
                <Input
                  placeholder="Contoh: Engineering"
                  value={form.department}
                  onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-semibold">Jabatan</label>
                <Input
                  placeholder="Contoh: Staff IT"
                  value={form.position}
                  onChange={e => setForm(f => ({ ...f, position: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-semibold">Password Awal</label>
              <Input
                placeholder={`Biarkan kosong = pakai Employee ID (${form.employeeId || "EMP00X"})`}
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                autoComplete="new-password"
              />
              <p className="text-xs text-muted-foreground">Karyawan dapat mengganti password setelah login pertama.</p>
            </div>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
            )}

            <DialogFooter className="mt-2">
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Batal</Button>
              <Button type="submit" disabled={saving} className="gap-2">
                <UserPlus className="w-4 h-4" />
                {saving ? "Menyimpan..." : "Tambah User"}
              </Button>
            </DialogFooter>
          </form>
      </Dialog>
    </AppLayout>
  )
}

function Users(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}
