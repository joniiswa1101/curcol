import React, { useCallback, useState, useRef, useEffect } from "react";
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator,
  RefreshControl, useColorScheme, Pressable, TextInput,
  Platform, Modal, ScrollView, KeyboardAvoidingView,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import { format } from "date-fns";
import Colors from "@/constants/colors";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

interface Board {
  id: number;
  name: string;
  conversationId: number | null;
  createdById: number;
  createdAt: string;
  updatedAt: string;
  creatorName: string;
  creatorAvatar: string | null;
  isPublic?: boolean;
}

interface BoardMember {
  userId: number;
  userName: string;
  userAvatar: string | null;
  userDepartment: string | null;
  role: string;
}

function InputModal({ visible, title, placeholder, onSubmit, onClose, colors, multiline }: {
  visible: boolean; title: string; placeholder: string;
  onSubmit: (val: string) => void; onClose: () => void; colors: any; multiline?: boolean;
}) {
  const [value, setValue] = useState("");
  useEffect(() => { if (visible) setValue(""); }, [visible]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={modalStyles.overlay} onPress={onClose}>
        <KeyboardAvoidingView behavior="padding">
          <Pressable style={[modalStyles.content, { backgroundColor: colors.surface }]} onPress={e => e.stopPropagation()}>
            <Text style={[modalStyles.title, { color: colors.text }]}>{title}</Text>
            <TextInput
              style={[modalStyles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
              placeholder={placeholder}
              placeholderTextColor={colors.textSecondary}
              value={value}
              onChangeText={setValue}
              multiline={multiline}
              numberOfLines={multiline ? 4 : 1}
              autoFocus
            />
            <View style={modalStyles.btnRow}>
              <Pressable onPress={onClose} style={[modalStyles.btn, { backgroundColor: colors.border }]}>
                <Text style={{ color: colors.text, fontWeight: "600" }}>Batal</Text>
              </Pressable>
              <Pressable
                onPress={() => { if (value.trim()) { onSubmit(value.trim()); onClose(); } }}
                style={[modalStyles.btn, { backgroundColor: colors.primary }]}
              >
                <Text style={{ color: "#fff", fontWeight: "600" }}>OK</Text>
              </Pressable>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

function ConfirmModal({ visible, message, onConfirm, onClose, colors }: {
  visible: boolean; message: string; onConfirm: () => void; onClose: () => void; colors: any;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={modalStyles.overlay} onPress={onClose}>
        <Pressable style={[modalStyles.content, { backgroundColor: colors.surface }]} onPress={e => e.stopPropagation()}>
          <Text style={[modalStyles.title, { color: colors.text }]}>{message}</Text>
          <View style={modalStyles.btnRow}>
            <Pressable onPress={onClose} style={[modalStyles.btn, { backgroundColor: colors.border }]}>
              <Text style={{ color: colors.text, fontWeight: "600" }}>Batal</Text>
            </Pressable>
            <Pressable onPress={() => { onConfirm(); onClose(); }} style={[modalStyles.btn, { backgroundColor: "#e03131" }]}>
              <Text style={{ color: "#fff", fontWeight: "600" }}>Hapus</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function BoardSettingsModal({ visible, board, colors, onClose, onUpdated, userId }: {
  visible: boolean; board: Board; colors: any; onClose: () => void; onUpdated: (b: Board) => void; userId: number;
}) {
  const [isPublic, setIsPublic] = useState(board.isPublic ?? true);
  const [members, setMembers] = useState<BoardMember[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [addRole, setAddRole] = useState("editor");
  const [loading, setLoading] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible) return;
    setIsPublic(board.isPublic ?? true);
    api.get(`/canvas/boards/${board.id}/members`).then(setMembers).catch(() => {});
  }, [visible, board.id, board.isPublic]);

  const toggleVisibility = async () => {
    const newVal = !isPublic;
    setIsPublic(newVal);
    await api.patch(`/canvas/boards/${board.id}`, { isPublic: newVal });
    onUpdated({ ...board, isPublic: newVal });
  };

  const handleSearch = (q: string) => {
    setSearchQuery(q);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!q.trim()) { setSearchResults([]); return; }
    searchTimeout.current = setTimeout(async () => {
      const res = await api.get(`/users?search=${encodeURIComponent(q)}`);
      const users = res.users || res || [];
      const memberIds = new Set(members.map(m => m.userId));
      setSearchResults(users.filter((u: any) => !memberIds.has(u.id) && u.id !== userId));
    }, 300);
  };

  const addMember = async (user: any) => {
    setLoading(true);
    const result = await api.post(`/canvas/boards/${board.id}/members`, { userId: user.id, role: addRole });
    setMembers(prev => [...prev, { userId: user.id, userName: result.userName || user.name, userAvatar: result.userAvatar || user.avatar, userDepartment: result.userDepartment || null, role: addRole }]);
    setSearchQuery("");
    setSearchResults([]);
    setLoading(false);
  };

  const removeMember = async (memberId: number) => {
    await api.delete(`/canvas/boards/${board.id}/members/${memberId}`);
    setMembers(prev => prev.filter(m => m.userId !== memberId));
  };

  const roleOptions = ["viewer", "editor", "admin"];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[modalStyles.overlay, { justifyContent: "flex-end" }]}>
        <View style={[settingsStyles.sheet, { backgroundColor: colors.surface }]}>
          <View style={settingsStyles.handle} />
          <View style={settingsStyles.sheetHeader}>
            <Text style={[settingsStyles.sheetTitle, { color: colors.text }]}>Pengaturan Board</Text>
            <Pressable onPress={onClose} style={{ padding: 4 }}>
              <Feather name="x" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 500 }} showsVerticalScrollIndicator={false}>
            <View style={[settingsStyles.section, { borderBottomColor: colors.border }]}>
              <Text style={[settingsStyles.sectionTitle, { color: colors.textSecondary }]}>Visibilitas</Text>
              <Pressable onPress={toggleVisibility} style={[settingsStyles.toggleRow, { backgroundColor: colors.background }]}>
                <Feather name={isPublic ? "globe" : "lock"} size={18} color={isPublic ? "#2f9e44" : "#f08c00"} />
                <Text style={[settingsStyles.toggleText, { color: colors.text }]}>
                  {isPublic ? "Publik — semua bisa melihat & edit" : "Privat — hanya anggota"}
                </Text>
                <View style={[settingsStyles.toggleSwitch, isPublic && settingsStyles.toggleActive]}>
                  <View style={[settingsStyles.toggleDot, isPublic && settingsStyles.toggleDotActive]} />
                </View>
              </Pressable>
            </View>

            <View style={[settingsStyles.section, { borderBottomColor: colors.border }]}>
              <Text style={[settingsStyles.sectionTitle, { color: colors.textSecondary }]}>Anggota ({members.length})</Text>

              <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
                <TextInput
                  style={[settingsStyles.searchInput, { flex: 1, color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                  placeholder="Cari pengguna..."
                  placeholderTextColor={colors.textSecondary}
                  value={searchQuery}
                  onChangeText={handleSearch}
                />
                <View style={{ flexDirection: "row", gap: 4 }}>
                  {roleOptions.map(r => (
                    <Pressable
                      key={r}
                      onPress={() => setAddRole(r)}
                      style={[settingsStyles.roleChip, addRole === r && { backgroundColor: colors.primary + "20", borderColor: colors.primary }]}
                    >
                      <Text style={[settingsStyles.roleChipText, { color: addRole === r ? colors.primary : colors.textSecondary }]}>
                        {r === "viewer" ? "V" : r === "editor" ? "E" : "A"}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {searchResults.map(u => (
                <Pressable
                  key={u.id}
                  onPress={() => addMember(u)}
                  style={[settingsStyles.memberRow, { backgroundColor: colors.background }]}
                  disabled={loading}
                >
                  <View style={[settingsStyles.avatar, { backgroundColor: colors.primary + "20" }]}>
                    <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 12 }}>
                      {(u.name || "?")[0].toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontWeight: "500" }}>{u.name}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{u.email}</Text>
                  </View>
                  <Feather name="plus-circle" size={18} color="#2f9e44" />
                </Pressable>
              ))}

              {members.map(m => (
                <View key={m.userId} style={[settingsStyles.memberRow, { backgroundColor: colors.background }]}>
                  <View style={[settingsStyles.avatar, { backgroundColor: colors.primary + "20" }]}>
                    <Text style={{ color: colors.primary, fontWeight: "700", fontSize: 12 }}>
                      {(m.userName || "?")[0].toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontWeight: "500" }}>{m.userName}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{m.role}</Text>
                  </View>
                  {m.userId !== userId && (
                    <Pressable onPress={() => removeMember(m.userId)} style={{ padding: 4 }}>
                      <Feather name="x-circle" size={18} color="#e03131" />
                    </Pressable>
                  )}
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function BoardCard({ board, colors, onPress }: { board: Board; colors: any; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <View style={[styles.cardPreview, { backgroundColor: colors.background }]}>
        <Feather name="edit-3" size={32} color={colors.textSecondary} />
      </View>
      <View style={styles.cardInfo}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Text style={[styles.cardName, { color: colors.text, flex: 1 }]} numberOfLines={1}>
            {board.name}
          </Text>
          <Feather
            name={board.isPublic !== false ? "globe" : "lock"}
            size={12}
            color={colors.textSecondary}
          />
        </View>
        <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
          {board.creatorName} · {format(new Date(board.updatedAt), "d/M/yyyy")}
        </Text>
      </View>
    </Pressable>
  );
}

function CanvasEditor({ board: initialBoard, colors, onBack, user }: { board: Board; colors: any; onBack: () => void; user: any }) {
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [board, setBoard] = useState(initialBoard);
  const [tool, setTool] = useState<string>("freehand");
  const [strokeColor, setStrokeColor] = useState("#1e1e1e");
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [elements, setElements] = useState<any[]>([]);
  const elementsRef = useRef(elements);
  elementsRef.current = elements;

  const toolRef = useRef(tool);
  toolRef.current = tool;
  const strokeColorRef = useRef(strokeColor);
  strokeColorRef.current = strokeColor;
  const strokeWidthRef = useRef(strokeWidth);
  strokeWidthRef.current = strokeWidth;

  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const panStartRef = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const panRef = useRef(panOffset);
  panRef.current = panOffset;

  const isDrawingRef = useRef(false);
  const isPanningRef = useRef(false);
  const currentPointsRef = useRef<number[][]>([]);
  const startPointRef = useRef<[number, number] | null>(null);

  const [undoStack, setUndoStack] = useState<any[][]>([]);
  const [redoStack, setRedoStack] = useState<any[][]>([]);
  const undoRef = useRef(undoStack);
  undoRef.current = undoStack;
  const redoRef = useRef(redoStack);
  redoRef.current = redoStack;

  const [showTextInput, setShowTextInput] = useState(false);
  const [textInputType, setTextInputType] = useState<"text" | "sticky_note">("text");
  const [textClickPos, setTextClickPos] = useState<[number, number]>([0, 0]);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const pushUndo = useCallback(() => {
    setUndoStack(prev => [...prev.slice(-29), elementsRef.current]);
    setRedoStack([]);
  }, []);

  const handleUndo = useCallback(() => {
    if (undoRef.current.length === 0) return;
    const prev = undoRef.current[undoRef.current.length - 1];
    setRedoStack(r => [...r, elementsRef.current]);
    setUndoStack(u => u.slice(0, -1));
    setElements(prev);
  }, []);

  const handleRedo = useCallback(() => {
    if (redoRef.current.length === 0) return;
    const next = redoRef.current[redoRef.current.length - 1];
    setUndoStack(u => [...u, elementsRef.current]);
    setRedoStack(r => r.slice(0, -1));
    setElements(next);
  }, []);

  const handleExport = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${board.name || "canvas"}.png`;
    a.click();
  }, [board.name]);

  useEffect(() => {
    api.get(`/canvas/boards/${board.id}/elements`).then(data => {
      setElements(data || []);
    });
  }, [board.id]);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const token = typeof localStorage !== "undefined" ? localStorage.getItem("curcol_token") : null;
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
        } else if (msg.action === "delete") {
          setElements(prev => prev.filter(el => el.id !== msg.element.id && el.tempId !== msg.element.tempId));
        }
      } else if (msg.type === "canvas_clear" && msg.boardId === board.id) {
        setElements([]);
      }
    };

    return () => {
      ws.send(JSON.stringify({ type: "canvas_leave", boardId: board.id }));
      ws.close();
    };
  }, [board.id]);

  const sendWs = useCallback((data: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  const drawElement = useCallback((ctx: CanvasRenderingContext2D, el: any) => {
    ctx.save();
    ctx.strokeStyle = el.style?.strokeColor || "#1e1e1e";
    ctx.fillStyle = el.style?.fillColor || "transparent";
    ctx.lineWidth = el.style?.strokeWidth || 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    switch (el.elementType) {
      case "freehand":
        if (el.points && el.points.length > 1) {
          ctx.beginPath();
          ctx.moveTo(el.points[0][0], el.points[0][1]);
          for (let i = 1; i < el.points.length; i++) {
            ctx.lineTo(el.points[i][0], el.points[i][1]);
          }
          ctx.stroke();
        }
        break;
      case "rectangle":
        if (el.style?.fillColor && el.style.fillColor !== "transparent") ctx.fillRect(el.x, el.y, el.width, el.height);
        ctx.strokeRect(el.x, el.y, el.width, el.height);
        break;
      case "ellipse":
        ctx.beginPath();
        ctx.ellipse(el.x + el.width / 2, el.y + el.height / 2, Math.abs(el.width / 2), Math.abs(el.height / 2), 0, 0, Math.PI * 2);
        if (el.style?.fillColor && el.style.fillColor !== "transparent") ctx.fill();
        ctx.stroke();
        break;
      case "text":
        ctx.font = `${el.style?.fontSize || 16}px sans-serif`;
        ctx.fillStyle = el.style?.strokeColor || "#1e1e1e";
        ctx.textBaseline = "top";
        (el.content || "").split("\n").forEach((line: string, i: number) => {
          ctx.fillText(line, el.x, el.y + i * 20);
        });
        break;
      case "sticky_note":
        ctx.fillStyle = "#fff3bf";
        ctx.fillRect(el.x, el.y, el.width || 160, el.height || 120);
        ctx.strokeStyle = "#f08c00";
        ctx.lineWidth = 1;
        ctx.strokeRect(el.x, el.y, el.width || 160, el.height || 120);
        ctx.fillStyle = "#1e1e1e";
        ctx.font = "13px sans-serif";
        ctx.textBaseline = "top";
        (el.content || "").split("\n").forEach((line: string, i: number) => {
          ctx.fillText(line, el.x + 8, el.y + 8 + i * 18, (el.width || 160) - 16);
        });
        break;
    }
    ctx.restore();
  }, []);

  const redrawRef = useRef<() => void>(() => {});
  redrawRef.current = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const curZoom = zoomRef.current;
    const curPan = panRef.current;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#f8f9fa";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(curPan.x, curPan.y);
    ctx.scale(curZoom, curZoom);

    const gridSize = 30;
    ctx.strokeStyle = "#e9ecef";
    ctx.lineWidth = 0.5 / curZoom;
    const gStartX = Math.floor(-curPan.x / curZoom / gridSize) * gridSize;
    const gStartY = Math.floor(-curPan.y / curZoom / gridSize) * gridSize;
    const gEndX = gStartX + canvas.width / curZoom + gridSize * 2;
    const gEndY = gStartY + canvas.height / curZoom + gridSize * 2;
    for (let gx = gStartX; gx < gEndX; gx += gridSize) {
      ctx.beginPath(); ctx.moveTo(gx, gStartY); ctx.lineTo(gx, gEndY); ctx.stroke();
    }
    for (let gy = gStartY; gy < gEndY; gy += gridSize) {
      ctx.beginPath(); ctx.moveTo(gStartX, gy); ctx.lineTo(gEndX, gy); ctx.stroke();
    }

    elementsRef.current.forEach(el => drawElement(ctx, el));

    const pts = currentPointsRef.current;
    const sp = startPointRef.current;
    const curTool = toolRef.current;
    const curColor = strokeColorRef.current;
    const curWidth = strokeWidthRef.current;

    if (isDrawingRef.current && pts.length > 1 && curTool === "freehand") {
      ctx.strokeStyle = curColor;
      ctx.lineWidth = curWidth;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.stroke();
    }

    if (isDrawingRef.current && sp && curTool === "rectangle") {
      const last = pts[pts.length - 1];
      if (last) {
        ctx.strokeStyle = curColor;
        ctx.lineWidth = curWidth;
        ctx.strokeRect(sp[0], sp[1], last[0] - sp[0], last[1] - sp[1]);
      }
    }

    if (isDrawingRef.current && sp && curTool === "ellipse") {
      const last = pts[pts.length - 1];
      if (last) {
        ctx.strokeStyle = curColor;
        ctx.lineWidth = curWidth;
        ctx.beginPath();
        const cx = sp[0] + (last[0] - sp[0]) / 2;
        const cy = sp[1] + (last[1] - sp[1]) / 2;
        ctx.ellipse(cx, cy, Math.abs((last[0] - sp[0]) / 2), Math.abs((last[1] - sp[1]) / 2), 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    ctx.restore();

    ctx.fillStyle = colors.text + "80";
    ctx.font = "11px sans-serif";
    ctx.fillText(`${Math.round(curZoom * 100)}%`, 8, canvas.height - 8);
  };

  useEffect(() => { redrawRef.current(); }, [elements, zoom, panOffset]);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const container = canvasContainerRef.current;
    if (!container) return;

    const canvas = document.createElement("canvas");
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    canvas.style.touchAction = "none";
    container.appendChild(canvas);
    canvasRef.current = canvas;

    const resize = () => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      redrawRef.current();
    };
    resize();
    const obs = new ResizeObserver(resize);
    obs.observe(container);

    const screenToCanvas = (sx: number, sy: number): [number, number] => {
      const rect = canvas.getBoundingClientRect();
      const px = sx - rect.left;
      const py = sy - rect.top;
      return [(px - panRef.current.x) / zoomRef.current, (py - panRef.current.y) / zoomRef.current];
    };

    const onDown = (e: PointerEvent) => {
      const curTool = toolRef.current;
      if (curTool === "pan" || e.button === 1 || (e.altKey && e.button === 0)) {
        isPanningRef.current = true;
        panStartRef.current = { x: e.clientX, y: e.clientY, ox: panRef.current.x, oy: panRef.current.y };
        canvas.setPointerCapture(e.pointerId);
        return;
      }

      const [x, y] = screenToCanvas(e.clientX, e.clientY);

      if (curTool === "eraser") {
        const idx = [...elementsRef.current].reverse().findIndex(el => {
          if (el.elementType === "freehand" && el.points) {
            return el.points.some((p: number[]) => Math.hypot(p[0] - x, p[1] - y) < 15 / zoomRef.current);
          }
          return x >= el.x && x <= el.x + (el.width || 100) && y >= el.y && y <= el.y + (el.height || 100);
        });
        if (idx >= 0) {
          const realIdx = elementsRef.current.length - 1 - idx;
          const el = elementsRef.current[realIdx];
          setUndoStack(prev => [...prev.slice(-29), elementsRef.current]);
          setRedoStack([]);
          setElements(prev => prev.filter((_, i) => i !== realIdx));
          if (el.id) api.delete(`/canvas/boards/${board.id}/elements/${el.id}`);
          sendWs({ type: "canvas_draw", boardId: board.id, action: "delete", element: el });
        }
        return;
      }

      if (curTool === "text" || curTool === "sticky_note") {
        setTextInputType(curTool as "text" | "sticky_note");
        setTextClickPos([x, y]);
        setShowTextInput(true);
        return;
      }

      isDrawingRef.current = true;
      if (curTool === "freehand") {
        currentPointsRef.current = [[x, y]];
      } else {
        startPointRef.current = [x, y];
        currentPointsRef.current = [[x, y]];
      }
    };

    const onMove = (e: PointerEvent) => {
      if (isPanningRef.current) {
        const dx = e.clientX - panStartRef.current.x;
        const dy = e.clientY - panStartRef.current.y;
        setPanOffset({ x: panStartRef.current.ox + dx, y: panStartRef.current.oy + dy });
        return;
      }
      if (!isDrawingRef.current) return;
      const [x, y] = screenToCanvas(e.clientX, e.clientY);
      const curTool = toolRef.current;
      if (curTool === "freehand") {
        currentPointsRef.current = [...currentPointsRef.current, [x, y]];
      } else {
        currentPointsRef.current = [currentPointsRef.current[0], [x, y]];
      }
      redrawRef.current();
    };

    const onUp = (e: PointerEvent) => {
      if (isPanningRef.current) {
        isPanningRef.current = false;
        canvas.releasePointerCapture(e.pointerId);
        return;
      }
      if (!isDrawingRef.current) return;
      isDrawingRef.current = false;
      const pts = currentPointsRef.current;
      const sp = startPointRef.current;
      const curTool = toolRef.current;
      const curColor = strokeColorRef.current;
      const curWidth = strokeWidthRef.current;

      let newEl: any = null;
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      if (curTool === "freehand" && pts.length > 1) {
        newEl = {
          tempId,
          elementType: "freehand",
          x: 0, y: 0, width: 0, height: 0, rotation: 0,
          points: pts,
          content: null,
          style: { strokeColor: curColor, fillColor: "transparent", strokeWidth: curWidth },
          zIndex: elementsRef.current.length,
        };
      } else if (sp && pts.length > 1) {
        const last = pts[pts.length - 1];
        newEl = {
          tempId,
          elementType: curTool,
          x: Math.min(sp[0], last[0]),
          y: Math.min(sp[1], last[1]),
          width: Math.abs(last[0] - sp[0]),
          height: Math.abs(last[1] - sp[1]),
          rotation: 0,
          points: null,
          content: null,
          style: { strokeColor: curColor, fillColor: "transparent", strokeWidth: curWidth },
          zIndex: elementsRef.current.length,
        };
      }

      if (newEl) {
        setUndoStack(prev => [...prev.slice(-29), elementsRef.current]);
        setRedoStack([]);
        setElements(prev => [...prev, newEl]);
        sendWs({ type: "canvas_draw", boardId: board.id, action: "add", element: newEl });
        api.post(`/canvas/boards/${board.id}/elements`, newEl).then(saved => {
          setElements(prev => prev.map(el => el.tempId === tempId ? { ...saved, tempId } : el));
        });
      }

      currentPointsRef.current = [];
      startPointRef.current = null;
      redrawRef.current();
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const factor = e.deltaY < 0 ? 1.1 : 0.9;
        setZoom(z => Math.min(5, Math.max(0.1, z * factor)));
      } else {
        setPanOffset(p => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
      }
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointerleave", onUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      obs.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointerleave", onUp);
      canvas.removeEventListener("wheel", onWheel);
      container.removeChild(canvas);
    };
  }, [board.id, sendWs, drawElement, colors.text]);

  const handleTextSubmit = useCallback((content: string) => {
    const [x, y] = textClickPos;
    const tempId = `temp-${Date.now()}`;
    const newEl = {
      tempId,
      elementType: textInputType,
      x, y,
      width: textInputType === "sticky_note" ? 160 : 0,
      height: textInputType === "sticky_note" ? 120 : 0,
      rotation: 0,
      points: null,
      content,
      style: { strokeColor, fillColor: "transparent", strokeWidth, fontSize: 16 },
      zIndex: elementsRef.current.length,
    };
    pushUndo();
    setElements(prev => [...prev, newEl]);
    sendWs({ type: "canvas_draw", boardId: board.id, action: "add", element: newEl });
    api.post(`/canvas/boards/${board.id}/elements`, newEl).then(saved => {
      setElements(prev => prev.map(el => el.tempId === tempId ? { ...saved, tempId } : el));
    });
  }, [textClickPos, textInputType, strokeColor, strokeWidth, board.id, sendWs, pushUndo]);

  const handleClear = useCallback(() => {
    pushUndo();
    setElements([]);
    sendWs({ type: "canvas_clear", boardId: board.id });
    elementsRef.current.forEach(el => {
      if (el.id) api.delete(`/canvas/boards/${board.id}/elements/${el.id}`);
    });
  }, [board.id, sendWs, pushUndo]);

  const colorOptions = ["#1e1e1e", "#e03131", "#2f9e44", "#1971c2", "#f08c00", "#7048e8"];
  const toolOptions: { key: string; icon: string; label: string }[] = [
    { key: "freehand", icon: "edit-3", label: "Pensil" },
    { key: "rectangle", icon: "square", label: "Kotak" },
    { key: "ellipse", icon: "circle", label: "Lingkaran" },
    { key: "text", icon: "type", label: "Teks" },
    { key: "sticky_note", icon: "file-text", label: "Sticky" },
    { key: "eraser", icon: "trash-2", label: "Hapus" },
    { key: "pan", icon: "move", label: "Geser" },
  ];

  return (
    <View style={[styles.editorContainer, { backgroundColor: colors.background }]}>
      <View style={[styles.editorHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Pressable onPress={onBack} style={styles.backBtn}>
          <Feather name="arrow-left" size={20} color={colors.text} />
        </Pressable>
        <Text style={[styles.boardTitle, { color: colors.text }]} numberOfLines={1}>
          {board.name}
        </Text>

        <View style={{ flexDirection: "row", gap: 4 }}>
          <Pressable onPress={handleUndo} style={styles.headerBtn}>
            <Feather name="corner-up-left" size={18} color={undoStack.length > 0 ? colors.text : colors.textSecondary + "40"} />
          </Pressable>
          <Pressable onPress={handleRedo} style={styles.headerBtn}>
            <Feather name="corner-up-right" size={18} color={redoStack.length > 0 ? colors.text : colors.textSecondary + "40"} />
          </Pressable>
          <Pressable onPress={() => setZoom(z => Math.min(5, z * 1.2))} style={styles.headerBtn}>
            <Feather name="zoom-in" size={18} color={colors.text} />
          </Pressable>
          <Pressable onPress={() => setZoom(z => Math.max(0.1, z * 0.8))} style={styles.headerBtn}>
            <Feather name="zoom-out" size={18} color={colors.text} />
          </Pressable>
          <Pressable onPress={handleExport} style={styles.headerBtn}>
            <Feather name="download" size={18} color={colors.text} />
          </Pressable>
          <Pressable onPress={() => setShowSettings(true)} style={styles.headerBtn}>
            <Feather name="settings" size={18} color={colors.text} />
          </Pressable>
          <Pressable onPress={() => setShowClearConfirm(true)} style={styles.headerBtn}>
            <Feather name="trash" size={18} color="#e03131" />
          </Pressable>
        </View>
      </View>

      <View style={styles.canvasArea}>
        {Platform.OS === "web" ? (
          <div ref={canvasContainerRef as any} style={{ flex: 1, width: "100%", height: "100%", touchAction: "none", cursor: tool === "pan" ? "grab" : "crosshair" }} />
        ) : (
          <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
            <Text style={{ color: colors.textSecondary }}>Canvas memerlukan browser</Text>
          </View>
        )}
      </View>

      <View style={[styles.toolbar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        <View style={styles.toolRow}>
          {toolOptions.map(t => (
            <Pressable
              key={t.key}
              onPress={() => setTool(t.key)}
              style={[
                styles.toolBtn,
                tool === t.key && { backgroundColor: colors.primary + "20" },
              ]}
            >
              <Feather
                name={t.icon as any}
                size={18}
                color={tool === t.key ? colors.primary : colors.textSecondary}
              />
              <Text style={{ fontSize: 9, color: tool === t.key ? colors.primary : colors.textSecondary, marginTop: 2 }}>
                {t.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.colorRow}>
          {colorOptions.map(c => (
            <Pressable
              key={c}
              onPress={() => setStrokeColor(c)}
              style={[
                styles.colorBtn,
                { backgroundColor: c },
                strokeColor === c && { borderColor: colors.primary, borderWidth: 3 },
              ]}
            />
          ))}
        </View>
      </View>

      <InputModal
        visible={showTextInput}
        title={textInputType === "sticky_note" ? "Isi Sticky Note" : "Ketik Teks"}
        placeholder={textInputType === "sticky_note" ? "Tulis isi sticky note..." : "Ketik teks..."}
        onSubmit={handleTextSubmit}
        onClose={() => setShowTextInput(false)}
        colors={colors}
        multiline={textInputType === "sticky_note"}
      />

      <ConfirmModal
        visible={showClearConfirm}
        message="Hapus semua elemen di board ini?"
        onConfirm={handleClear}
        onClose={() => setShowClearConfirm(false)}
        colors={colors}
      />

      <BoardSettingsModal
        visible={showSettings}
        board={board}
        colors={colors}
        onClose={() => setShowSettings(false)}
        onUpdated={setBoard}
        userId={user?.id || 0}
      />
    </View>
  );
}

export default function CanvasTab() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme === "dark" ? "dark" : "light"];
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedBoard, setSelectedBoard] = useState<Board | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const { data: boards = [], isLoading, refetch } = useQuery({
    queryKey: ["canvas-boards"],
    queryFn: () => api.get("/canvas/boards"),
  });

  const createBoard = useMutation({
    mutationFn: (name: string) => api.post("/canvas/boards", { name }),
    onSuccess: (newBoard) => {
      queryClient.invalidateQueries({ queryKey: ["canvas-boards"] });
      setSelectedBoard(newBoard);
    },
  });

  if (selectedBoard) {
    return (
      <CanvasEditor
        board={selectedBoard}
        colors={colors}
        onBack={() => { setSelectedBoard(null); refetch(); }}
        user={user}
      />
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.text }]}>Canvas</Text>
        <Pressable onPress={() => setShowCreateModal(true)} style={[styles.createBtn, { backgroundColor: colors.primary }]}>
          <Feather name="plus" size={18} color="#fff" />
          <Text style={styles.createBtnText}>Baru</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
      ) : boards.length === 0 ? (
        <View style={styles.empty}>
          <Feather name="edit-3" size={48} color={colors.textSecondary + "40"} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Belum ada board</Text>
          <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>
            Buat board baru untuk mulai berkolaborasi
          </Text>
          <Pressable onPress={() => setShowCreateModal(true)} style={[styles.emptyBtn, { backgroundColor: colors.primary }]}>
            <Text style={styles.emptyBtnText}>Buat Board</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={boards}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={{ padding: 16, paddingBottom: tabBarHeight + 16 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => refetch()} tintColor={colors.primary} />}
          numColumns={2}
          columnWrapperStyle={{ gap: 12 }}
          renderItem={({ item }) => (
            <View style={{ flex: 1 }}>
              <BoardCard board={item} colors={colors} onPress={() => setSelectedBoard(item)} />
            </View>
          )}
        />
      )}

      <InputModal
        visible={showCreateModal}
        title="Buat Board Baru"
        placeholder="Nama board..."
        onSubmit={(name) => createBoard.mutate(name)}
        onClose={() => setShowCreateModal(false)}
        colors={colors}
      />
    </View>
  );
}

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  content: {
    width: "100%",
    maxWidth: 400,
    borderRadius: 16,
    padding: 20,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 16,
  },
  btnRow: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end",
  },
  btn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
});

const settingsStyles = StyleSheet.create({
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 40,
    maxHeight: "80%",
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: "#ccc",
    borderRadius: 2,
    alignSelf: "center",
    marginVertical: 12,
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  section: {
    paddingBottom: 16,
    marginBottom: 16,
    borderBottomWidth: 1,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: 10,
  },
  toggleText: {
    flex: 1,
    fontSize: 14,
  },
  toggleSwitch: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#ccc",
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  toggleActive: {
    backgroundColor: "#2f9e44",
  },
  toggleDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#fff",
  },
  toggleDotActive: {
    alignSelf: "flex-end",
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  roleChip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ccc",
  },
  roleChipText: {
    fontSize: 12,
    fontWeight: "700",
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    borderRadius: 10,
    marginBottom: 6,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  title: { fontSize: 24, fontWeight: "700" },
  createBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  createBtnText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 12,
  },
  cardPreview: {
    height: 100,
    justifyContent: "center",
    alignItems: "center",
  },
  cardInfo: { padding: 12 },
  cardName: { fontSize: 14, fontWeight: "600" },
  cardMeta: { fontSize: 12, marginTop: 4 },
  empty: { flex: 1, justifyContent: "center", alignItems: "center", padding: 40 },
  emptyTitle: { fontSize: 18, fontWeight: "600", marginTop: 16 },
  emptyDesc: { fontSize: 14, textAlign: "center", marginTop: 8 },
  emptyBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10, marginTop: 20 },
  emptyBtnText: { color: "#fff", fontWeight: "600" },
  editorContainer: { flex: 1 },
  editorHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    gap: 4,
  },
  backBtn: { padding: 6 },
  boardTitle: { flex: 1, fontSize: 16, fontWeight: "600" },
  headerBtn: { padding: 6 },
  canvasArea: { flex: 1 },
  toolbar: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    gap: 8,
  },
  toolRow: { flexDirection: "row", justifyContent: "space-around" },
  toolBtn: { padding: 8, borderRadius: 10, alignItems: "center", minWidth: 40 },
  colorRow: { flexDirection: "row", justifyContent: "center", gap: 10 },
  colorBtn: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: "transparent" },
});
