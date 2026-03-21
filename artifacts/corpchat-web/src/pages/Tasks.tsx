import { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuthStore } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import {
  Plus,
  Search,
  Filter,
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  AlertCircle,
  MoreHorizontal,
  MessageSquare,
  Trash2,
  Edit3,
  User,
  Flag,
  X,
  ArrowUpCircle,
  ArrowDownCircle,
  ChevronDown,
  LayoutGrid,
  List,
  Loader2,
  Send,
} from "lucide-react";

interface TaskUser {
  id: number;
  name: string;
  avatarUrl?: string;
  role?: string;
}

interface Task {
  id: number;
  title: string;
  description: string | null;
  status: "todo" | "in_progress" | "review" | "done" | "cancelled";
  priority: "low" | "medium" | "high" | "urgent";
  creatorId: number;
  assigneeId: number | null;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  creator: TaskUser | null;
  assignee: TaskUser | null;
  labels: string[];
  commentCount: number;
}

interface TaskComment {
  id: number;
  taskId: number;
  userId: number;
  content: string;
  createdAt: string;
  user: TaskUser | null;
}

interface TaskStats {
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  overdue: number;
}

const STATUS_CONFIG = {
  todo: { label: "To Do", icon: Circle, color: "text-slate-500", bg: "bg-slate-100 dark:bg-slate-800", border: "border-slate-200 dark:border-slate-700" },
  in_progress: { label: "Dalam Proses", icon: Clock, color: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-950", border: "border-blue-200 dark:border-blue-800" },
  review: { label: "Review", icon: AlertCircle, color: "text-amber-500", bg: "bg-amber-50 dark:bg-amber-950", border: "border-amber-200 dark:border-amber-800" },
  done: { label: "Selesai", icon: CheckCircle2, color: "text-green-500", bg: "bg-green-50 dark:bg-green-950", border: "border-green-200 dark:border-green-800" },
  cancelled: { label: "Dibatalkan", icon: X, color: "text-red-400", bg: "bg-red-50 dark:bg-red-950", border: "border-red-200 dark:border-red-800" },
};

const PRIORITY_CONFIG = {
  low: { label: "Rendah", color: "text-slate-400", bg: "bg-slate-100 dark:bg-slate-800" },
  medium: { label: "Sedang", color: "text-blue-500", bg: "bg-blue-100 dark:bg-blue-900" },
  high: { label: "Tinggi", color: "text-orange-500", bg: "bg-orange-100 dark:bg-orange-900" },
  urgent: { label: "Urgen", color: "text-red-500", bg: "bg-red-100 dark:bg-red-900" },
};

const COLUMNS: Array<Task["status"]> = ["todo", "in_progress", "review", "done", "cancelled"];

function getHeaders() {
  const token = localStorage.getItem("curcol_token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function apiGet(url: string) {
  const res = await fetch(url, { headers: getHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function apiPost(url: string, body: any) {
  const res = await fetch(url, { method: "POST", headers: getHeaders(), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function apiPatch(url: string, body: any) {
  const res = await fetch(url, { method: "PATCH", headers: getHeaders(), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function apiDelete(url: string) {
  const res = await fetch(url, { method: "DELETE", headers: getHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export default function Tasks() {
  const { user } = useAuthStore();
  const { toast } = useToast();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState<TaskStats | null>(null);
  const [users, setUsers] = useState<TaskUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"board" | "list">("board");
  const [search, setSearch] = useState("");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterAssignee, setFilterAssignee] = useState("all");
  const [filterView, setFilterView] = useState("all");

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const fetchTasks = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (filterPriority !== "all") params.set("priority", filterPriority);
      if (filterAssignee === "me") params.set("assignee", "me");
      else if (filterAssignee === "unassigned") params.set("assignee", "unassigned");
      if (filterView !== "all") params.set("view", filterView);

      const data = await apiGet(`/api/tasks?${params.toString()}`);
      setTasks(data.tasks);
    } catch (err) {
      console.error("Failed to fetch tasks:", err);
    }
  }, [search, filterPriority, filterAssignee, filterView]);

  const fetchStats = useCallback(async () => {
    try {
      const data = await apiGet("/api/tasks/stats");
      setStats(data);
    } catch {}
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      const data = await apiGet("/api/users?limit=500");
      setUsers(data.users || data);
    } catch {}
  }, []);

  useEffect(() => {
    Promise.all([fetchTasks(), fetchStats(), fetchUsers()]).finally(() => setLoading(false));
  }, [fetchTasks, fetchStats, fetchUsers]);

  const handleStatusChange = async (taskId: number, newStatus: Task["status"]) => {
    try {
      await apiPatch(`/api/tasks/${taskId}`, { status: newStatus });
      await fetchTasks();
      await fetchStats();
      toast({ title: "Status task diperbarui" });
    } catch {
      toast({ title: "Gagal mengubah status", variant: "destructive" });
    }
  };

  const handleDelete = async (taskId: number) => {
    try {
      await apiDelete(`/api/tasks/${taskId}`);
      setTasks(prev => prev.filter(t => t.id !== taskId));
      setSelectedTask(null);
      await fetchStats();
      toast({ title: "Task dihapus" });
    } catch {
      toast({ title: "Gagal menghapus task", variant: "destructive" });
    }
  };

  const totalTasks = stats ? Object.values(stats.byStatus).reduce((a, b) => a + b, 0) : 0;

  return (
    <AppLayout>
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex-shrink-0 border-b border-border bg-card/50 backdrop-blur-sm">
          <div className="flex items-center justify-between px-4 sm:px-6 py-4">
            <div>
              <h1 className="text-xl font-bold text-foreground">Smart Tasks</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {totalTasks} task{totalTasks !== 1 ? "s" : ""} total
                {stats?.overdue ? ` \u00b7 ${stats.overdue} overdue` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden sm:flex items-center bg-muted/50 rounded-lg p-1">
                <button
                  onClick={() => setView("board")}
                  className={cn("p-1.5 rounded-md transition-colors", view === "board" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setView("list")}
                  className={cn("p-1.5 rounded-md transition-colors", view === "list" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
              <Button onClick={() => setShowCreateDialog(true)} size="sm" className="gap-1.5">
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Buat Task</span>
              </Button>
            </div>
          </div>

          {stats && (
            <div className="flex gap-3 px-4 sm:px-6 pb-3 overflow-x-auto scrollbar-none">
              {COLUMNS.map(status => {
                const cfg = STATUS_CONFIG[status];
                const count = stats.byStatus[status] || 0;
                return (
                  <div key={status} className={cn("flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium", cfg.bg, cfg.border, "border")}>
                    <cfg.icon className={cn("w-3.5 h-3.5", cfg.color)} />
                    <span>{cfg.label}</span>
                    <span className="font-bold">{count}</span>
                  </div>
                );
              })}
              {stats.overdue > 0 && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-red-100 dark:bg-red-950 border border-red-200 dark:border-red-800">
                  <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                  <span>Overdue</span>
                  <span className="font-bold text-red-600">{stats.overdue}</span>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-2 px-4 sm:px-6 pb-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Cari task..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 text-sm"
              />
            </div>
            <Button
              variant={showFilters ? "secondary" : "outline"}
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="gap-1.5"
            >
              <Filter className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Filter</span>
            </Button>
          </div>

          {showFilters && (
            <div className="flex flex-wrap gap-2 px-4 sm:px-6 pb-3">
              <select
                value={filterView}
                onChange={(e) => setFilterView(e.target.value)}
                className="h-8 px-3 text-xs rounded-md border bg-background"
              >
                <option value="all">Semua Task</option>
                <option value="my">Task Saya</option>
              </select>
              <select
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value)}
                className="h-8 px-3 text-xs rounded-md border bg-background"
              >
                <option value="all">Semua Prioritas</option>
                <option value="urgent">Urgen</option>
                <option value="high">Tinggi</option>
                <option value="medium">Sedang</option>
                <option value="low">Rendah</option>
              </select>
              <select
                value={filterAssignee}
                onChange={(e) => setFilterAssignee(e.target.value)}
                className="h-8 px-3 text-xs rounded-md border bg-background"
              >
                <option value="all">Semua Assignee</option>
                <option value="me">Ditugaskan ke Saya</option>
                <option value="unassigned">Belum Ditugaskan</option>
              </select>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-auto p-4 sm:p-6">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : view === "board" ? (
            <BoardView
              tasks={tasks}
              onStatusChange={handleStatusChange}
              onSelectTask={setSelectedTask}
            />
          ) : (
            <ListView
              tasks={tasks}
              onStatusChange={handleStatusChange}
              onSelectTask={setSelectedTask}
            />
          )}
        </div>
      </div>

      {showCreateDialog && (
        <CreateTaskDialog
          users={users}
          onClose={() => setShowCreateDialog(false)}
          onCreated={() => {
            setShowCreateDialog(false);
            fetchTasks();
            fetchStats();
          }}
        />
      )}

      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          users={users}
          currentUser={user}
          onClose={() => setSelectedTask(null)}
          onUpdate={() => { fetchTasks(); fetchStats(); }}
          onDelete={handleDelete}
          onStatusChange={handleStatusChange}
        />
      )}
    </AppLayout>
  );
}

function BoardView({
  tasks,
  onStatusChange,
  onSelectTask,
}: {
  tasks: Task[];
  onStatusChange: (id: number, status: Task["status"]) => void;
  onSelectTask: (t: Task) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 h-full">
      {COLUMNS.map(status => {
        const cfg = STATUS_CONFIG[status];
        const columnTasks = tasks.filter(t => t.status === status);

        return (
          <div key={status} className="flex flex-col min-h-0">
            <div className={cn("flex items-center gap-2 px-3 py-2 rounded-t-xl", cfg.bg)}>
              <cfg.icon className={cn("w-4 h-4", cfg.color)} />
              <span className="text-sm font-semibold">{cfg.label}</span>
              <span className="ml-auto text-xs font-bold text-muted-foreground bg-background/60 px-2 py-0.5 rounded-full">
                {columnTasks.length}
              </span>
            </div>
            <div className={cn("flex-1 overflow-y-auto space-y-2 p-2 rounded-b-xl border", cfg.border, "bg-background/30")}>
              {columnTasks.length === 0 ? (
                <p className="text-center text-xs text-muted-foreground py-8">Tidak ada task</p>
              ) : (
                columnTasks.map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onClick={() => onSelectTask(task)}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ListView({
  tasks,
  onStatusChange,
  onSelectTask,
}: {
  tasks: Task[];
  onStatusChange: (id: number, status: Task["status"]) => void;
  onSelectTask: (t: Task) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="hidden sm:grid grid-cols-12 gap-3 px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        <div className="col-span-5">Task</div>
        <div className="col-span-2">Status</div>
        <div className="col-span-2">Prioritas</div>
        <div className="col-span-2">Assignee</div>
        <div className="col-span-1">Due</div>
      </div>
      {tasks.map(task => {
        const statusCfg = STATUS_CONFIG[task.status];
        const priorityCfg = PRIORITY_CONFIG[task.priority];
        return (
          <div
            key={task.id}
            onClick={() => onSelectTask(task)}
            className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-3 px-4 py-3 rounded-xl hover:bg-muted/50 cursor-pointer transition-colors border border-transparent hover:border-border"
          >
            <div className="sm:col-span-5 flex items-center gap-3">
              <statusCfg.icon className={cn("w-4 h-4 shrink-0", statusCfg.color)} />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{task.title}</p>
                {task.labels.length > 0 && (
                  <div className="flex gap-1 mt-0.5">
                    {task.labels.slice(0, 3).map(l => (
                      <span key={l} className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">{l}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="sm:col-span-2 flex items-center">
              <span className={cn("text-xs px-2 py-1 rounded-full font-medium", statusCfg.bg)}>
                {statusCfg.label}
              </span>
            </div>
            <div className="sm:col-span-2 flex items-center">
              <span className={cn("text-xs px-2 py-1 rounded-full font-medium", priorityCfg.bg, priorityCfg.color)}>
                {priorityCfg.label}
              </span>
            </div>
            <div className="sm:col-span-2 flex items-center gap-2">
              {task.assignee ? (
                <>
                  <Avatar src={task.assignee.avatarUrl} fallback={task.assignee.name} size="sm" />
                  <span className="text-xs truncate">{task.assignee.name}</span>
                </>
              ) : (
                <span className="text-xs text-muted-foreground">-</span>
              )}
            </div>
            <div className="sm:col-span-1 flex items-center">
              {task.dueDate ? (
                <span className={cn("text-xs", isOverdue(task.dueDate) && task.status !== "done" ? "text-red-500 font-medium" : "text-muted-foreground")}>
                  {formatDate(task.dueDate)}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">-</span>
              )}
            </div>
          </div>
        );
      })}
      {tasks.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Belum ada task. Buat task pertamamu!</p>
        </div>
      )}
    </div>
  );
}

function TaskCard({ task, onClick }: { task: Task; onClick: () => void }) {
  const priorityCfg = PRIORITY_CONFIG[task.priority];
  const overdue = task.dueDate && isOverdue(task.dueDate) && task.status !== "done";

  return (
    <div
      onClick={onClick}
      className={cn(
        "p-3 rounded-xl bg-card border border-border/60 cursor-pointer hover:shadow-md hover:border-border transition-all group",
        overdue && "border-red-300 dark:border-red-800"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-medium leading-snug line-clamp-2">{task.title}</h4>
        <span className={cn("shrink-0 w-2 h-2 rounded-full mt-1.5", {
          "bg-slate-300": task.priority === "low",
          "bg-blue-400": task.priority === "medium",
          "bg-orange-400": task.priority === "high",
          "bg-red-500": task.priority === "urgent",
        })} title={priorityCfg.label} />
      </div>

      {task.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {task.labels.slice(0, 3).map(l => (
            <span key={l} className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">{l}</span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between mt-3 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {task.assignee ? (
            <Avatar src={task.assignee.avatarUrl} fallback={task.assignee.name} size="sm" className="w-5 h-5 text-[8px]" />
          ) : (
            <div className="w-5 h-5 rounded-full border-2 border-dashed border-muted-foreground/30 flex items-center justify-center">
              <User className="w-2.5 h-2.5 text-muted-foreground/40" />
            </div>
          )}
          {task.dueDate && (
            <span className={cn("text-[10px] flex items-center gap-0.5", overdue ? "text-red-500 font-medium" : "text-muted-foreground")}>
              <Calendar className="w-2.5 h-2.5" />
              {formatDate(task.dueDate)}
            </span>
          )}
        </div>
        {task.commentCount > 0 && (
          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
            <MessageSquare className="w-2.5 h-2.5" />
            {task.commentCount}
          </span>
        )}
      </div>
    </div>
  );
}

function CreateTaskDialog({
  users,
  onClose,
  onCreated,
}: {
  users: TaskUser[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Task["priority"]>("medium");
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [dueDate, setDueDate] = useState("");
  const [labelInput, setLabelInput] = useState("");
  const [labels, setLabels] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const handleAddLabel = () => {
    const val = labelInput.trim();
    if (val && !labels.includes(val)) {
      setLabels([...labels, val]);
      setLabelInput("");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      await apiPost("/api/tasks", {
        title,
        description: description || null,
        priority,
        assigneeId: assigneeId ? parseInt(assigneeId) : null,
        dueDate: dueDate || null,
        labels,
      });
      toast({ title: "Task berhasil dibuat" });
      onCreated();
    } catch {
      toast({ title: "Gagal membuat task", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto border" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-bold">Buat Task Baru</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="text-sm font-medium mb-1 block">Judul *</label>
            <Input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Nama task..."
              autoFocus
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Deskripsi</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Detail task (opsional)..."
              rows={3}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm resize-none focus:ring-2 ring-primary/20 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block">Prioritas</label>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value as any)}
                className="w-full h-10 px-3 text-sm rounded-lg border bg-background"
              >
                <option value="low">Rendah</option>
                <option value="medium">Sedang</option>
                <option value="high">Tinggi</option>
                <option value="urgent">Urgen</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Deadline</label>
              <Input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Ditugaskan Ke</label>
            <select
              value={assigneeId}
              onChange={e => setAssigneeId(e.target.value)}
              className="w-full h-10 px-3 text-sm rounded-lg border bg-background"
            >
              <option value="">Belum ditugaskan</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Label</label>
            <div className="flex gap-2">
              <Input
                value={labelInput}
                onChange={e => setLabelInput(e.target.value)}
                placeholder="Tambah label..."
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleAddLabel(); } }}
              />
              <Button type="button" variant="outline" size="sm" onClick={handleAddLabel}>+</Button>
            </div>
            {labels.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {labels.map(l => (
                  <span key={l} className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-primary/10 text-primary">
                    {l}
                    <button type="button" onClick={() => setLabels(labels.filter(x => x !== l))}>
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>Batal</Button>
            <Button type="submit" disabled={submitting || !title.trim()}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
              Buat Task
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TaskDetailPanel({
  task,
  users,
  currentUser,
  onClose,
  onUpdate,
  onDelete,
  onStatusChange,
}: {
  task: Task;
  users: TaskUser[];
  currentUser: any;
  onClose: () => void;
  onUpdate: () => void;
  onDelete: (id: number) => void;
  onStatusChange: (id: number, status: Task["status"]) => void;
}) {
  const { toast } = useToast();
  const [detail, setDetail] = useState<any>(null);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [editDesc, setEditDesc] = useState(task.description || "");
  const [editPriority, setEditPriority] = useState(task.priority);
  const [editAssignee, setEditAssignee] = useState(String(task.assigneeId || ""));
  const [editDueDate, setEditDueDate] = useState(task.dueDate ? task.dueDate.split("T")[0] : "");
  const [saving, setSaving] = useState(false);
  const [sendingComment, setSendingComment] = useState(false);

  useEffect(() => {
    apiGet(`/api/tasks/${task.id}`).then(data => {
      setDetail(data);
      setComments(data.comments || []);
    }).catch(() => {});
  }, [task.id]);

  const handleSaveEdit = async () => {
    setSaving(true);
    try {
      await apiPatch(`/api/tasks/${task.id}`, {
        title: editTitle,
        description: editDesc || null,
        priority: editPriority,
        assigneeId: editAssignee ? parseInt(editAssignee) : null,
        dueDate: editDueDate || null,
      });
      setEditing(false);
      onUpdate();
      toast({ title: "Task diperbarui" });
    } catch {
      toast({ title: "Gagal menyimpan", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleAddComment = async () => {
    if (!commentText.trim()) return;
    setSendingComment(true);
    try {
      const c = await apiPost(`/api/tasks/${task.id}/comments`, { content: commentText });
      setComments(prev => [...prev, c]);
      setCommentText("");
    } catch {
      toast({ title: "Gagal mengirim komentar", variant: "destructive" });
    } finally {
      setSendingComment(false);
    }
  };

  const statusCfg = STATUS_CONFIG[task.status];
  const priorityCfg = PRIORITY_CONFIG[task.priority];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-card rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-xl max-h-[85vh] overflow-hidden border flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b flex-shrink-0">
          <div className="flex items-center gap-2">
            <statusCfg.icon className={cn("w-5 h-5", statusCfg.color)} />
            <span className={cn("text-xs px-2 py-1 rounded-full font-medium", statusCfg.bg)}>{statusCfg.label}</span>
            <span className={cn("text-xs px-2 py-1 rounded-full font-medium", priorityCfg.bg, priorityCfg.color)}>
              {priorityCfg.label}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {!editing && (
              <button onClick={() => setEditing(true)} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                <Edit3 className="w-4 h-4" />
              </button>
            )}
            {(task.creatorId === currentUser?.id || currentUser?.role === "admin") && (
              <button onClick={() => { if (confirm("Hapus task ini?")) onDelete(task.id); }} className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-950 transition-colors text-muted-foreground hover:text-red-500">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {editing ? (
            <div className="space-y-3">
              <Input value={editTitle} onChange={e => setEditTitle(e.target.value)} placeholder="Judul task" />
              <textarea
                value={editDesc}
                onChange={e => setEditDesc(e.target.value)}
                placeholder="Deskripsi..."
                rows={3}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm resize-none focus:ring-2 ring-primary/20 focus:outline-none"
              />
              <div className="grid grid-cols-2 gap-3">
                <select value={editPriority} onChange={e => setEditPriority(e.target.value as any)} className="h-9 px-3 text-sm rounded-lg border bg-background">
                  <option value="low">Rendah</option>
                  <option value="medium">Sedang</option>
                  <option value="high">Tinggi</option>
                  <option value="urgent">Urgen</option>
                </select>
                <Input type="date" value={editDueDate} onChange={e => setEditDueDate(e.target.value)} />
              </div>
              <select value={editAssignee} onChange={e => setEditAssignee(e.target.value)} className="w-full h-9 px-3 text-sm rounded-lg border bg-background">
                <option value="">Belum ditugaskan</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>Batal</Button>
                <Button size="sm" onClick={handleSaveEdit} disabled={saving}>
                  {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                  Simpan
                </Button>
              </div>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-bold">{task.title}</h2>
              {task.description && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{task.description}</p>}

              <div className="space-y-2">
                <div className="flex items-center gap-3 text-sm">
                  <User className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground w-20 shrink-0">Assignee</span>
                  {task.assignee ? (
                    <div className="flex items-center gap-2">
                      <Avatar src={task.assignee.avatarUrl} fallback={task.assignee.name} size="sm" />
                      <span>{task.assignee.name}</span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground italic">Belum ditugaskan</span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground w-20 shrink-0">Deadline</span>
                  {task.dueDate ? (
                    <span className={cn(isOverdue(task.dueDate) && task.status !== "done" ? "text-red-500 font-medium" : "")}>
                      {new Date(task.dueDate).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
                    </span>
                  ) : (
                    <span className="text-muted-foreground italic">Tidak ada deadline</span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <User className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground w-20 shrink-0">Dibuat oleh</span>
                  {task.creator && (
                    <div className="flex items-center gap-2">
                      <Avatar src={task.creator.avatarUrl} fallback={task.creator.name} size="sm" />
                      <span>{task.creator.name}</span>
                    </div>
                  )}
                </div>
              </div>

              {task.labels.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {task.labels.map(l => (
                    <span key={l} className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary font-medium">{l}</span>
                  ))}
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-2 block">Ubah Status</label>
                <div className="flex flex-wrap gap-1.5">
                  {(Object.keys(STATUS_CONFIG) as Array<Task["status"]>).map(s => {
                    const c = STATUS_CONFIG[s];
                    return (
                      <button
                        key={s}
                        onClick={() => onStatusChange(task.id, s)}
                        className={cn(
                          "flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border transition-all",
                          task.status === s
                            ? cn(c.bg, c.border, "font-semibold")
                            : "border-transparent hover:bg-muted"
                        )}
                      >
                        <c.icon className={cn("w-3 h-3", c.color)} />
                        {c.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          <div className="border-t pt-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              Komentar ({comments.length})
            </h3>
            <div className="space-y-3 max-h-48 overflow-y-auto">
              {comments.map(c => (
                <div key={c.id} className="flex gap-2">
                  <Avatar src={c.user?.avatarUrl} fallback={c.user?.name || "?"} size="sm" className="mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-semibold">{c.user?.name}</span>
                      <span className="text-[10px] text-muted-foreground">{formatDateTime(c.createdAt)}</span>
                    </div>
                    <p className="text-sm text-foreground/90 whitespace-pre-wrap">{c.content}</p>
                  </div>
                </div>
              ))}
              {comments.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">Belum ada komentar</p>
              )}
            </div>
          </div>
        </div>

        <div className="border-t p-3 flex gap-2 flex-shrink-0">
          <Input
            value={commentText}
            onChange={e => setCommentText(e.target.value)}
            placeholder="Tulis komentar..."
            className="flex-1 h-9 text-sm"
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAddComment(); } }}
          />
          <Button size="sm" onClick={handleAddComment} disabled={sendingComment || !commentText.trim()} className="h-9">
            {sendingComment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

function isOverdue(dateStr: string) {
  return new Date(dateStr) < new Date();
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return "Hari ini";
  if (days === 1) return "Besok";
  if (days === -1) return "Kemarin";
  if (days < -1) return `${Math.abs(days)}d lalu`;
  if (days <= 7) return `${days}d lagi`;
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

function formatDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
