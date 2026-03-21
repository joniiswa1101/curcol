import { useState, useEffect, useRef, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuthStore } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Plus,
  Pencil,
  Square,
  Circle,
  Minus,
  Type,
  StickyNote,
  MousePointer,
  Trash2,
  Download,
  Undo2,
  Redo2,
  ArrowLeft,
  Move,
  ZoomIn,
  ZoomOut,
  Palette,
  Users,
  Loader2,
} from "lucide-react";

interface CanvasBoard {
  id: number;
  name: string;
  conversationId: number | null;
  createdById: number;
  thumbnail: string | null;
  createdAt: string;
  updatedAt: string;
  creatorName: string;
  creatorAvatar: string | null;
}

interface CanvasElement {
  id?: number;
  tempId?: string;
  elementType: "freehand" | "rectangle" | "ellipse" | "line" | "arrow" | "text" | "sticky_note";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  points: number[][] | null;
  content: string | null;
  style: ElementStyle;
  zIndex: number;
  createdById?: number;
}

interface ElementStyle {
  strokeColor: string;
  fillColor: string;
  strokeWidth: number;
  fontSize?: number;
  fontFamily?: string;
  opacity?: number;
}

interface RemoteCursor {
  userId: number;
  userName: string;
  x: number;
  y: number;
  lastUpdate: number;
}

type Tool = "select" | "freehand" | "rectangle" | "ellipse" | "line" | "arrow" | "text" | "sticky_note" | "eraser" | "pan";

const COLORS = ["#1e1e1e", "#e03131", "#2f9e44", "#1971c2", "#f08c00", "#7048e8", "#e64980", "#ffffff"];
const STROKE_WIDTHS = [2, 4, 6, 8];

const DEFAULT_STYLE: ElementStyle = {
  strokeColor: "#1e1e1e",
  fillColor: "transparent",
  strokeWidth: 2,
  fontSize: 16,
  fontFamily: "sans-serif",
  opacity: 1,
};

function apiGet(url: string) {
  const token = localStorage.getItem("curcol_token");
  return fetch(`/api${url}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
}

function apiPost(url: string, body: any) {
  const token = localStorage.getItem("curcol_token");
  return fetch(`/api${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  }).then(r => r.json());
}

function apiPatch(url: string, body: any) {
  const token = localStorage.getItem("curcol_token");
  return fetch(`/api${url}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  }).then(r => r.json());
}

function apiDelete(url: string) {
  const token = localStorage.getItem("curcol_token");
  return fetch(`/api${url}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  }).then(r => r.json());
}

function BoardList({ onSelect, onCreate }: { onSelect: (b: CanvasBoard) => void; onCreate: () => void }) {
  const [boards, setBoards] = useState<CanvasBoard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet("/canvas/boards").then(data => {
      setBoards(data);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Collaboration Canvas</h2>
          <p className="text-muted-foreground mt-1">Real-time whiteboard untuk kolaborasi tim</p>
        </div>
        <Button onClick={onCreate} className="gap-2">
          <Plus className="w-4 h-4" />
          Board Baru
        </Button>
      </div>

      {boards.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-xl border border-border">
          <StickyNote className="w-16 h-16 mx-auto text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">Belum ada board</h3>
          <p className="text-muted-foreground mb-4">Buat board baru untuk mulai berkolaborasi</p>
          <Button onClick={onCreate} className="gap-2">
            <Plus className="w-4 h-4" />
            Buat Board Pertama
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {boards.map(board => (
            <div
              key={board.id}
              onClick={() => onSelect(board)}
              className="bg-card border border-border rounded-xl p-4 cursor-pointer hover:border-primary/50 hover:shadow-lg transition-all group"
            >
              <div className="aspect-video bg-muted rounded-lg mb-3 flex items-center justify-center overflow-hidden">
                {board.thumbnail ? (
                  <img src={board.thumbnail} alt={board.name} className="w-full h-full object-cover" />
                ) : (
                  <Palette className="w-12 h-12 text-muted-foreground/20" />
                )}
              </div>
              <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                {board.name}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                {board.creatorName} · {new Date(board.updatedAt).toLocaleDateString("id-ID")}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CanvasEditor({ board, onBack }: { board: CanvasBoard; onBack: () => void }) {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const [tool, setTool] = useState<Tool>("freehand");
  const [style, setStyle] = useState<ElementStyle>({ ...DEFAULT_STYLE });
  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [undoStack, setUndoStack] = useState<CanvasElement[][]>([]);
  const [redoStack, setRedoStack] = useState<CanvasElement[][]>([]);
  const [remoteCursors, setRemoteCursors] = useState<Map<number, RemoteCursor>>(new Map());
  const [activeUsers, setActiveUsers] = useState<Set<number>>(new Set());
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPoints, setCurrentPoints] = useState<number[][]>([]);
  const [startPoint, setStartPoint] = useState<[number, number] | null>(null);
  const [editingText, setEditingText] = useState<{ x: number; y: number; existing?: CanvasElement } | null>(null);
  const [textInput, setTextInput] = useState("");
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [boardName, setBoardName] = useState(board.name);
  const [isEditingName, setIsEditingName] = useState(false);

  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<[number, number] | null>(null);

  const elementsRef = useRef(elements);
  elementsRef.current = elements;
  const lastCursorSent = useRef(0);

  const toCanvas = useCallback((clientX: number, clientY: number): [number, number] => {
    const canvas = canvasRef.current;
    if (!canvas) return [0, 0];
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left - panOffset.x) / zoom;
    const y = (clientY - rect.top - panOffset.y) / zoom;
    return [x, y];
  }, [panOffset, zoom]);

  useEffect(() => {
    apiGet(`/canvas/boards/${board.id}/elements`).then(data => {
      setElements(data || []);
    });
  }, [board.id]);

  useEffect(() => {
    const token = localStorage.getItem("curcol_token");
    if (!token) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/ws?token=${token}`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "canvas_join", boardId: board.id }));
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "canvas_draw" && msg.boardId === board.id) {
        if (msg.action === "add") {
          setElements(prev => [...prev, msg.element]);
        } else if (msg.action === "update") {
          setElements(prev => prev.map(el =>
            (el.id === msg.element.id || el.tempId === msg.element.tempId) ? msg.element : el
          ));
        } else if (msg.action === "delete") {
          setElements(prev => prev.filter(el => el.id !== msg.element.id && el.tempId !== msg.element.tempId));
        }
      } else if (msg.type === "canvas_cursor" && msg.boardId === board.id) {
        setRemoteCursors(prev => {
          const next = new Map(prev);
          next.set(msg.userId, { userId: msg.userId, userName: msg.userName, x: msg.x, y: msg.y, lastUpdate: Date.now() });
          return next;
        });
      } else if (msg.type === "canvas_user_joined" && msg.boardId === board.id) {
        setActiveUsers(prev => new Set([...prev, msg.userId]));
      } else if (msg.type === "canvas_user_left" && msg.boardId === board.id) {
        setActiveUsers(prev => { const n = new Set(prev); n.delete(msg.userId); return n; });
        setRemoteCursors(prev => { const n = new Map(prev); n.delete(msg.userId); return n; });
      } else if (msg.type === "canvas_clear" && msg.boardId === board.id) {
        setElements([]);
      }
    };

    return () => {
      ws.send(JSON.stringify({ type: "canvas_leave", boardId: board.id }));
      ws.close();
    };
  }, [board.id]);

  useEffect(() => {
    const interval = setInterval(() => {
      setRemoteCursors(prev => {
        const next = new Map(prev);
        const now = Date.now();
        next.forEach((cursor, key) => {
          if (now - cursor.lastUpdate > 5000) next.delete(key);
        });
        return next;
      });
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const sendWs = useCallback((data: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  const pushUndo = useCallback(() => {
    setUndoStack(prev => [...prev.slice(-30), [...elementsRef.current]]);
    setRedoStack([]);
  }, []);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setRedoStack(r => [...r, [...elementsRef.current]]);
    setUndoStack(u => u.slice(0, -1));
    setElements(prev);
  }, [undoStack]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack(u => [...u, [...elementsRef.current]]);
    setRedoStack(r => r.slice(0, -1));
    setElements(next);
  }, [redoStack]);

  const drawElement = useCallback((ctx: CanvasRenderingContext2D, el: CanvasElement) => {
    ctx.save();
    ctx.globalAlpha = el.style.opacity ?? 1;
    ctx.strokeStyle = el.style.strokeColor;
    ctx.fillStyle = el.style.fillColor;
    ctx.lineWidth = el.style.strokeWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    switch (el.elementType) {
      case "freehand": {
        if (el.points && el.points.length > 1) {
          ctx.beginPath();
          ctx.moveTo(el.points[0][0], el.points[0][1]);
          for (let i = 1; i < el.points.length; i++) {
            const [px, py] = el.points[i];
            ctx.lineTo(px, py);
          }
          ctx.stroke();
        }
        break;
      }
      case "rectangle": {
        if (el.style.fillColor !== "transparent") {
          ctx.fillRect(el.x, el.y, el.width, el.height);
        }
        ctx.strokeRect(el.x, el.y, el.width, el.height);
        break;
      }
      case "ellipse": {
        ctx.beginPath();
        ctx.ellipse(
          el.x + el.width / 2,
          el.y + el.height / 2,
          Math.abs(el.width / 2),
          Math.abs(el.height / 2),
          0, 0, Math.PI * 2
        );
        if (el.style.fillColor !== "transparent") ctx.fill();
        ctx.stroke();
        break;
      }
      case "line": {
        ctx.beginPath();
        ctx.moveTo(el.x, el.y);
        ctx.lineTo(el.x + el.width, el.y + el.height);
        ctx.stroke();
        break;
      }
      case "arrow": {
        const endX = el.x + el.width;
        const endY = el.y + el.height;
        ctx.beginPath();
        ctx.moveTo(el.x, el.y);
        ctx.lineTo(endX, endY);
        ctx.stroke();
        const angle = Math.atan2(el.height, el.width);
        const headLen = 15;
        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(endX - headLen * Math.cos(angle - Math.PI / 6), endY - headLen * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(endX, endY);
        ctx.lineTo(endX - headLen * Math.cos(angle + Math.PI / 6), endY - headLen * Math.sin(angle + Math.PI / 6));
        ctx.stroke();
        break;
      }
      case "text": {
        ctx.font = `${el.style.fontSize || 16}px ${el.style.fontFamily || "sans-serif"}`;
        ctx.fillStyle = el.style.strokeColor;
        ctx.textBaseline = "top";
        const lines = (el.content || "").split("\n");
        lines.forEach((line, i) => {
          ctx.fillText(line, el.x, el.y + i * (el.style.fontSize || 16) * 1.3);
        });
        break;
      }
      case "sticky_note": {
        const noteColors: Record<string, string> = {
          "#f08c00": "#fff3bf",
          "#2f9e44": "#d3f9d8",
          "#1971c2": "#d0ebff",
          "#e64980": "#fcc2d7",
          "#7048e8": "#e5dbff",
        };
        const bg = noteColors[el.style.strokeColor] || "#fff3bf";
        ctx.fillStyle = bg;
        ctx.shadowColor = "rgba(0,0,0,0.1)";
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 2;
        ctx.fillRect(el.x, el.y, el.width || 200, el.height || 150);
        ctx.shadowColor = "transparent";
        ctx.strokeStyle = el.style.strokeColor;
        ctx.lineWidth = 1;
        ctx.strokeRect(el.x, el.y, el.width || 200, el.height || 150);
        ctx.fillStyle = "#1e1e1e";
        ctx.font = `${el.style.fontSize || 14}px sans-serif`;
        ctx.textBaseline = "top";
        const noteLines = (el.content || "Sticky note").split("\n");
        noteLines.forEach((line, i) => {
          ctx.fillText(line, el.x + 12, el.y + 12 + i * 20, (el.width || 200) - 24);
        });
        break;
      }
    }
    ctx.restore();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const container = containerRef.current;
    if (!container) return;
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#f8f9fa";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(panOffset.x, panOffset.y);
    ctx.scale(zoom, zoom);

    const gridSize = 30;
    ctx.strokeStyle = "#e9ecef";
    ctx.lineWidth = 0.5;
    const startX = Math.floor(-panOffset.x / zoom / gridSize) * gridSize;
    const startY = Math.floor(-panOffset.y / zoom / gridSize) * gridSize;
    const endX = startX + canvas.width / zoom + gridSize * 2;
    const endY = startY + canvas.height / zoom + gridSize * 2;
    for (let x = startX; x < endX; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, startY);
      ctx.lineTo(x, endY);
      ctx.stroke();
    }
    for (let y = startY; y < endY; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(startX, y);
      ctx.lineTo(endX, y);
      ctx.stroke();
    }

    elements.forEach(el => drawElement(ctx, el));

    if (isDrawing && tool === "freehand" && currentPoints.length > 1) {
      ctx.strokeStyle = style.strokeColor;
      ctx.lineWidth = style.strokeWidth;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(currentPoints[0][0], currentPoints[0][1]);
      for (let i = 1; i < currentPoints.length; i++) {
        ctx.lineTo(currentPoints[i][0], currentPoints[i][1]);
      }
      ctx.stroke();
    }

    if (isDrawing && startPoint && (tool === "rectangle" || tool === "ellipse" || tool === "line" || tool === "arrow")) {
      const [sx, sy] = startPoint;
      const lastPt = currentPoints[currentPoints.length - 1] || startPoint;
      const [ex, ey] = lastPt;
      ctx.strokeStyle = style.strokeColor;
      ctx.fillStyle = style.fillColor;
      ctx.lineWidth = style.strokeWidth;

      if (tool === "rectangle") {
        if (style.fillColor !== "transparent") ctx.fillRect(sx, sy, ex - sx, ey - sy);
        ctx.strokeRect(sx, sy, ex - sx, ey - sy);
      } else if (tool === "ellipse") {
        ctx.beginPath();
        ctx.ellipse(sx + (ex - sx) / 2, sy + (ey - sy) / 2, Math.abs((ex - sx) / 2), Math.abs((ey - sy) / 2), 0, 0, Math.PI * 2);
        if (style.fillColor !== "transparent") ctx.fill();
        ctx.stroke();
      } else if (tool === "line") {
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
      } else if (tool === "arrow") {
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        const angle = Math.atan2(ey - sy, ex - sx);
        const headLen = 15;
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - headLen * Math.cos(angle - Math.PI / 6), ey - headLen * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - headLen * Math.cos(angle + Math.PI / 6), ey - headLen * Math.sin(angle + Math.PI / 6));
        ctx.stroke();
      }
    }

    ctx.restore();

    remoteCursors.forEach(cursor => {
      const sx = cursor.x * zoom + panOffset.x;
      const sy = cursor.y * zoom + panOffset.y;
      ctx.save();
      ctx.fillStyle = "#e03131";
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + 4, sy + 14);
      ctx.lineTo(sx + 10, sy + 10);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#e03131";
      ctx.font = "11px sans-serif";
      ctx.fillText(cursor.userName, sx + 12, sy + 14);
      ctx.restore();
    });
  }, [elements, currentPoints, isDrawing, startPoint, tool, style, panOffset, zoom, remoteCursors, drawElement]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const obs = new ResizeObserver(() => {
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
      }
    });
    obs.observe(container);
    return () => obs.disconnect();
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const [x, y] = toCanvas(e.clientX, e.clientY);

    if (tool === "pan" || (e.button === 1) || (e.button === 0 && e.altKey)) {
      setIsPanning(true);
      setPanStart([e.clientX, e.clientY]);
      return;
    }

    if (tool === "eraser") {
      pushUndo();
      const hitIndex = [...elements].reverse().findIndex(el => {
        if (el.elementType === "freehand" && el.points) {
          return el.points.some(p => Math.hypot(p[0] - x, p[1] - y) < 15);
        }
        return x >= el.x && x <= el.x + (el.width || 100) && y >= el.y && y <= el.y + (el.height || 100);
      });
      if (hitIndex >= 0) {
        const realIdx = elements.length - 1 - hitIndex;
        const el = elements[realIdx];
        setElements(prev => prev.filter((_, i) => i !== realIdx));
        if (el.id) apiDelete(`/canvas/boards/${board.id}/elements/${el.id}`);
        sendWs({ type: "canvas_draw", boardId: board.id, action: "delete", element: el });
      }
      return;
    }

    if (tool === "text" || tool === "sticky_note") {
      setEditingText({ x, y });
      setTextInput("");
      return;
    }

    if (tool === "freehand") {
      pushUndo();
      setIsDrawing(true);
      setCurrentPoints([[x, y]]);
    } else if (tool === "rectangle" || tool === "ellipse" || tool === "line" || tool === "arrow") {
      pushUndo();
      setIsDrawing(true);
      setStartPoint([x, y]);
      setCurrentPoints([[x, y]]);
    }
  }, [tool, elements, toCanvas, pushUndo, board.id, sendWs]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const [x, y] = toCanvas(e.clientX, e.clientY);

    if (isPanning && panStart) {
      const dx = e.clientX - panStart[0];
      const dy = e.clientY - panStart[1];
      setPanOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      setPanStart([e.clientX, e.clientY]);
      return;
    }

    const now = Date.now();
    if (now - lastCursorSent.current > 50) {
      lastCursorSent.current = now;
      sendWs({ type: "canvas_cursor", boardId: board.id, userName: user?.name || "User", x, y });
    }

    if (!isDrawing) return;

    if (tool === "freehand") {
      setCurrentPoints(prev => [...prev, [x, y]]);
    } else {
      setCurrentPoints(prev => [...prev.slice(0, 1), [x, y]]);
    }
  }, [isDrawing, isPanning, panStart, tool, toCanvas, board.id, user?.name, sendWs]);

  const handlePointerUp = useCallback(async () => {
    if (isPanning) {
      setIsPanning(false);
      setPanStart(null);
      return;
    }

    if (!isDrawing) return;
    setIsDrawing(false);

    let newElement: CanvasElement | null = null;
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    if (tool === "freehand" && currentPoints.length > 1) {
      newElement = {
        tempId,
        elementType: "freehand",
        x: 0, y: 0, width: 0, height: 0, rotation: 0,
        points: currentPoints,
        content: null,
        style: { ...style },
        zIndex: elements.length,
      };
    } else if (startPoint && currentPoints.length > 1) {
      const [sx, sy] = startPoint;
      const [ex, ey] = currentPoints[currentPoints.length - 1];
      newElement = {
        tempId,
        elementType: tool as any,
        x: tool === "line" || tool === "arrow" ? sx : Math.min(sx, ex),
        y: tool === "line" || tool === "arrow" ? sy : Math.min(sy, ey),
        width: tool === "line" || tool === "arrow" ? ex - sx : Math.abs(ex - sx),
        height: tool === "line" || tool === "arrow" ? ey - sy : Math.abs(ey - sy),
        rotation: 0,
        points: null,
        content: null,
        style: { ...style },
        zIndex: elements.length,
      };
    }

    if (newElement) {
      setElements(prev => [...prev, newElement!]);
      sendWs({ type: "canvas_draw", boardId: board.id, action: "add", element: newElement });
      try {
        const saved = await apiPost(`/canvas/boards/${board.id}/elements`, newElement);
        setElements(prev => prev.map(el => el.tempId === tempId ? { ...saved, tempId } : el));
      } catch {}
    }

    setCurrentPoints([]);
    setStartPoint(null);
  }, [isDrawing, isPanning, tool, currentPoints, startPoint, style, elements.length, board.id, sendWs]);

  const handleTextSubmit = useCallback(async () => {
    if (!editingText || !textInput.trim()) {
      setEditingText(null);
      setTextInput("");
      return;
    }
    pushUndo();
    const tempId = `temp-${Date.now()}`;
    const newEl: CanvasElement = {
      tempId,
      elementType: tool === "sticky_note" ? "sticky_note" : "text",
      x: editingText.x,
      y: editingText.y,
      width: tool === "sticky_note" ? 200 : 0,
      height: tool === "sticky_note" ? 150 : 0,
      rotation: 0,
      points: null,
      content: textInput,
      style: { ...style },
      zIndex: elements.length,
    };
    setElements(prev => [...prev, newEl]);
    sendWs({ type: "canvas_draw", boardId: board.id, action: "add", element: newEl });
    try {
      const saved = await apiPost(`/canvas/boards/${board.id}/elements`, newEl);
      setElements(prev => prev.map(el => el.tempId === tempId ? { ...saved, tempId } : el));
    } catch {}
    setEditingText(null);
    setTextInput("");
  }, [editingText, textInput, tool, style, elements.length, board.id, pushUndo, sendWs]);

  const handleClear = useCallback(async () => {
    if (!window.confirm("Hapus semua elemen di board ini?")) return;
    pushUndo();
    setElements([]);
    sendWs({ type: "canvas_clear", boardId: board.id });
    try {
      const els = elementsRef.current;
      for (const el of els) {
        if (el.id) await apiDelete(`/canvas/boards/${board.id}/elements/${el.id}`);
      }
    } catch {}
  }, [board.id, pushUndo, sendWs]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom(prev => Math.min(5, Math.max(0.1, prev * delta)));
    } else {
      setPanOffset(prev => ({ x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
    }
  }, []);

  const handleExport = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `${boardName || "canvas"}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }, [boardName]);

  const handleSaveName = useCallback(async () => {
    setIsEditingName(false);
    if (boardName !== board.name) {
      await apiPatch(`/canvas/boards/${board.id}`, { name: boardName });
      toast({ title: "Nama board disimpan" });
    }
  }, [boardName, board.id, board.name, toast]);

  const tools: { tool: Tool; icon: any; label: string }[] = [
    { tool: "select", icon: MousePointer, label: "Select" },
    { tool: "pan", icon: Move, label: "Pan" },
    { tool: "freehand", icon: Pencil, label: "Pensil" },
    { tool: "rectangle", icon: Square, label: "Kotak" },
    { tool: "ellipse", icon: Circle, label: "Lingkaran" },
    { tool: "line", icon: Minus, label: "Garis" },
    { tool: "arrow", icon: Minus, label: "Panah" },
    { tool: "text", icon: Type, label: "Teks" },
    { tool: "sticky_note", icon: StickyNote, label: "Sticky" },
    { tool: "eraser", icon: Trash2, label: "Hapus" },
  ];

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          {isEditingName ? (
            <Input
              value={boardName}
              onChange={e => setBoardName(e.target.value)}
              onBlur={handleSaveName}
              onKeyDown={e => e.key === "Enter" && handleSaveName()}
              className="w-48 h-8 text-sm"
              autoFocus
            />
          ) : (
            <h2
              className="font-semibold text-foreground cursor-pointer hover:text-primary"
              onClick={() => setIsEditingName(true)}
            >
              {boardName}
            </h2>
          )}
        </div>

        <div className="flex items-center gap-2">
          {activeUsers.size > 0 && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
              <Users className="w-3 h-3" />
              {activeUsers.size + 1} online
            </div>
          )}
          <Button variant="ghost" size="icon" onClick={handleUndo} disabled={undoStack.length === 0} title="Undo">
            <Undo2 className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={handleRedo} disabled={redoStack.length === 0} title="Redo">
            <Redo2 className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setZoom(z => Math.min(5, z * 1.2))} title="Zoom In">
            <ZoomIn className="w-4 h-4" />
          </Button>
          <span className="text-xs text-muted-foreground w-12 text-center">{Math.round(zoom * 100)}%</span>
          <Button variant="ghost" size="icon" onClick={() => setZoom(z => Math.max(0.1, z * 0.8))} title="Zoom Out">
            <ZoomOut className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={handleExport} title="Export PNG">
            <Download className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={handleClear} title="Clear All" className="text-destructive">
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-14 bg-card border-r border-border flex flex-col items-center py-2 gap-1">
          {tools.map(t => (
            <button
              key={t.tool}
              onClick={() => setTool(t.tool)}
              className={cn(
                "w-10 h-10 rounded-lg flex items-center justify-center transition-all",
                tool === t.tool
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
              title={t.label}
            >
              <t.icon className="w-4 h-4" />
            </button>
          ))}

          <div className="w-8 h-px bg-border my-2" />

          <div className="relative">
            <button
              onClick={() => setShowColorPicker(!showColorPicker)}
              className="w-10 h-10 rounded-lg flex items-center justify-center hover:bg-muted"
              title="Warna"
            >
              <div className="w-6 h-6 rounded-full border-2 border-border" style={{ backgroundColor: style.strokeColor }} />
            </button>

            {showColorPicker && (
              <div className="absolute left-12 top-0 bg-card border border-border rounded-xl p-3 shadow-xl z-50 w-48">
                <p className="text-xs text-muted-foreground mb-2 font-medium">Stroke</p>
                <div className="grid grid-cols-4 gap-2 mb-3">
                  {COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => setStyle(s => ({ ...s, strokeColor: c }))}
                      className={cn("w-8 h-8 rounded-full border-2 transition-transform hover:scale-110",
                        style.strokeColor === c ? "border-primary scale-110" : "border-transparent"
                      )}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mb-2 font-medium">Fill</p>
                <div className="grid grid-cols-4 gap-2 mb-3">
                  <button
                    onClick={() => setStyle(s => ({ ...s, fillColor: "transparent" }))}
                    className={cn("w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 bg-white relative overflow-hidden",
                      style.fillColor === "transparent" ? "border-primary scale-110" : "border-muted"
                    )}
                  >
                    <div className="absolute inset-0 flex items-center justify-center text-red-500 text-lg">/</div>
                  </button>
                  {COLORS.slice(0, 7).map(c => (
                    <button
                      key={`fill-${c}`}
                      onClick={() => setStyle(s => ({ ...s, fillColor: c + "40" }))}
                      className={cn("w-8 h-8 rounded-full border-2 transition-transform hover:scale-110",
                        style.fillColor === c + "40" ? "border-primary scale-110" : "border-transparent"
                      )}
                      style={{ backgroundColor: c + "40" }}
                    />
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mb-2 font-medium">Ketebalan</p>
                <div className="flex gap-2">
                  {STROKE_WIDTHS.map(w => (
                    <button
                      key={w}
                      onClick={() => setStyle(s => ({ ...s, strokeWidth: w }))}
                      className={cn("flex-1 h-8 rounded-lg flex items-center justify-center border transition-all",
                        style.strokeWidth === w ? "border-primary bg-primary/10" : "border-transparent hover:bg-muted"
                      )}
                    >
                      <div className="rounded-full bg-foreground" style={{ width: w * 3, height: w * 3 }} />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div ref={containerRef} className="flex-1 relative overflow-hidden cursor-crosshair" onWheel={handleWheel}>
          <canvas
            ref={canvasRef}
            className="absolute inset-0"
            style={{ cursor: tool === "pan" ? "grab" : tool === "eraser" ? "crosshair" : tool === "select" ? "default" : "crosshair" }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          />

          {editingText && (
            <div
              className="absolute z-50"
              style={{
                left: editingText.x * zoom + panOffset.x,
                top: editingText.y * zoom + panOffset.y,
              }}
            >
              {tool === "sticky_note" ? (
                <div className="bg-yellow-100 border border-yellow-300 rounded-lg shadow-lg p-3 w-52">
                  <textarea
                    value={textInput}
                    onChange={e => setTextInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleTextSubmit(); } }}
                    placeholder="Tulis catatan..."
                    className="w-full h-24 bg-transparent border-none outline-none resize-none text-sm"
                    autoFocus
                  />
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditingText(null)}>Batal</Button>
                    <Button size="sm" onClick={handleTextSubmit}>Simpan</Button>
                  </div>
                </div>
              ) : (
                <div className="bg-card border border-border rounded-lg shadow-lg p-2">
                  <Input
                    value={textInput}
                    onChange={e => setTextInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") handleTextSubmit(); if (e.key === "Escape") setEditingText(null); }}
                    placeholder="Ketik teks..."
                    className="w-48 text-sm"
                    autoFocus
                  />
                </div>
              )}
            </div>
          )}

          {showColorPicker && (
            <div className="absolute inset-0 z-40" onClick={() => setShowColorPicker(false)} />
          )}
        </div>
      </div>
    </div>
  );
}

export default function CanvasPage() {
  const [selectedBoard, setSelectedBoard] = useState<CanvasBoard | null>(null);
  const { toast } = useToast();

  const handleCreate = async () => {
    const name = window.prompt("Nama board baru:", "Board Baru");
    if (!name) return;
    const board = await apiPost("/canvas/boards", { name });
    if (board?.id) {
      setSelectedBoard(board);
      toast({ title: "Board dibuat" });
    }
  };

  return (
    <AppLayout>
      <div className="flex-1 h-full overflow-hidden">
        {selectedBoard ? (
          <CanvasEditor
            board={selectedBoard}
            onBack={() => setSelectedBoard(null)}
          />
        ) : (
          <div className="p-6 h-full overflow-auto">
            <BoardList onSelect={setSelectedBoard} onCreate={handleCreate} />
          </div>
        )}
      </div>
    </AppLayout>
  );
}
