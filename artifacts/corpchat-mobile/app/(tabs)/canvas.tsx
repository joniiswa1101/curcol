import React, { useCallback, useState, useRef, useEffect } from "react";
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator,
  RefreshControl, useColorScheme, Pressable, TextInput,
  Platform,
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
        <Text style={[styles.cardName, { color: colors.text }]} numberOfLines={1}>
          {board.name}
        </Text>
        <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
          {board.creatorName} · {format(new Date(board.updatedAt), "d/M/yyyy")}
        </Text>
      </View>
    </Pressable>
  );
}

function CanvasEditor({ board, colors, onBack, user }: { board: Board; colors: any; onBack: () => void; user: any }) {
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [tool, setTool] = useState<string>("freehand");
  const [strokeColor, setStrokeColor] = useState("#1e1e1e");
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [elements, setElements] = useState<any[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPoints, setCurrentPoints] = useState<number[][]>([]);
  const [startPoint, setStartPoint] = useState<[number, number] | null>(null);
  const elementsRef = useRef(elements);
  elementsRef.current = elements;

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

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#f8f9fa";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const gridSize = 30;
    ctx.strokeStyle = "#e9ecef";
    ctx.lineWidth = 0.5;
    for (let x = 0; x < canvas.width; x += gridSize) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += gridSize) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }

    elementsRef.current.forEach(el => drawElement(ctx, el));

    if (isDrawing && currentPoints.length > 1 && tool === "freehand") {
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeWidth;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(currentPoints[0][0], currentPoints[0][1]);
      for (let i = 1; i < currentPoints.length; i++) ctx.lineTo(currentPoints[i][0], currentPoints[i][1]);
      ctx.stroke();
    }

    if (isDrawing && startPoint && tool === "rectangle") {
      const last = currentPoints[currentPoints.length - 1];
      if (last) {
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = strokeWidth;
        ctx.strokeRect(startPoint[0], startPoint[1], last[0] - startPoint[0], last[1] - startPoint[1]);
      }
    }

    if (isDrawing && startPoint && tool === "ellipse") {
      const last = currentPoints[currentPoints.length - 1];
      if (last) {
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = strokeWidth;
        ctx.beginPath();
        const cx = startPoint[0] + (last[0] - startPoint[0]) / 2;
        const cy = startPoint[1] + (last[1] - startPoint[1]) / 2;
        ctx.ellipse(cx, cy, Math.abs((last[0] - startPoint[0]) / 2), Math.abs((last[1] - startPoint[1]) / 2), 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }, [isDrawing, currentPoints, startPoint, tool, strokeColor, strokeWidth, drawElement]);

  useEffect(() => { redraw(); }, [elements, isDrawing, currentPoints, redraw]);

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
      redraw();
    };
    resize();
    const obs = new ResizeObserver(resize);
    obs.observe(container);

    const getPos = (e: PointerEvent): [number, number] => {
      const rect = canvas.getBoundingClientRect();
      return [e.clientX - rect.left, e.clientY - rect.top];
    };

    const onDown = (e: PointerEvent) => {
      const [x, y] = getPos(e);

      if (tool === "eraser") {
        const idx = [...elementsRef.current].reverse().findIndex(el => {
          if (el.elementType === "freehand" && el.points) {
            return el.points.some((p: number[]) => Math.hypot(p[0] - x, p[1] - y) < 15);
          }
          return x >= el.x && x <= el.x + (el.width || 100) && y >= el.y && y <= el.y + (el.height || 100);
        });
        if (idx >= 0) {
          const realIdx = elementsRef.current.length - 1 - idx;
          const el = elementsRef.current[realIdx];
          setElements(prev => prev.filter((_, i) => i !== realIdx));
          if (el.id) api.delete(`/canvas/boards/${board.id}/elements/${el.id}`);
          sendWs({ type: "canvas_draw", boardId: board.id, action: "delete", element: el });
        }
        return;
      }

      if (tool === "text" || tool === "sticky_note") {
        const content = window.prompt(tool === "sticky_note" ? "Isi sticky note:" : "Ketik teks:");
        if (!content) return;
        const tempId = `temp-${Date.now()}`;
        const newEl = {
          tempId,
          elementType: tool,
          x, y,
          width: tool === "sticky_note" ? 160 : 0,
          height: tool === "sticky_note" ? 120 : 0,
          rotation: 0,
          points: null,
          content,
          style: { strokeColor, fillColor: "transparent", strokeWidth, fontSize: 16 },
          zIndex: elementsRef.current.length,
        };
        setElements(prev => [...prev, newEl]);
        sendWs({ type: "canvas_draw", boardId: board.id, action: "add", element: newEl });
        api.post(`/canvas/boards/${board.id}/elements`, newEl).then(saved => {
          setElements(prev => prev.map(el => el.tempId === tempId ? { ...saved, tempId } : el));
        });
        return;
      }

      setIsDrawing(true);
      if (tool === "freehand") {
        setCurrentPoints([[x, y]]);
      } else {
        setStartPoint([x, y]);
        setCurrentPoints([[x, y]]);
      }
    };

    const onMove = (e: PointerEvent) => {
      if (!isDrawing) return;
      const [x, y] = getPos(e);
      if (tool === "freehand") {
        setCurrentPoints(prev => [...prev, [x, y]]);
      } else {
        setCurrentPoints(prev => [...prev.slice(0, 1), [x, y]]);
      }
    };

    const onUp = () => {
      if (!isDrawing) return;
      setIsDrawing(false);
      const pts = currentPoints;
      const sp = startPoint;

      let newEl: any = null;
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      if (tool === "freehand" && pts.length > 1) {
        newEl = {
          tempId,
          elementType: "freehand",
          x: 0, y: 0, width: 0, height: 0, rotation: 0,
          points: pts,
          content: null,
          style: { strokeColor, fillColor: "transparent", strokeWidth },
          zIndex: elementsRef.current.length,
        };
      } else if (sp && pts.length > 1) {
        const last = pts[pts.length - 1];
        newEl = {
          tempId,
          elementType: tool,
          x: Math.min(sp[0], last[0]),
          y: Math.min(sp[1], last[1]),
          width: Math.abs(last[0] - sp[0]),
          height: Math.abs(last[1] - sp[1]),
          rotation: 0,
          points: null,
          content: null,
          style: { strokeColor, fillColor: "transparent", strokeWidth },
          zIndex: elementsRef.current.length,
        };
      }

      if (newEl) {
        setElements(prev => [...prev, newEl]);
        sendWs({ type: "canvas_draw", boardId: board.id, action: "add", element: newEl });
        api.post(`/canvas/boards/${board.id}/elements`, newEl).then(saved => {
          setElements(prev => prev.map(el => el.tempId === tempId ? { ...saved, tempId } : el));
        });
      }

      setCurrentPoints([]);
      setStartPoint(null);
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointerleave", onUp);

    return () => {
      obs.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointerleave", onUp);
      container.removeChild(canvas);
    };
  }, [tool, strokeColor, strokeWidth, board.id, isDrawing, currentPoints, startPoint, sendWs, redraw]);

  const handleClear = () => {
    const confirmed = Platform.OS === "web" ? window.confirm("Hapus semua?") : true;
    if (!confirmed) return;
    setElements([]);
    sendWs({ type: "canvas_clear", boardId: board.id });
    elementsRef.current.forEach(el => {
      if (el.id) api.delete(`/canvas/boards/${board.id}/elements/${el.id}`);
    });
  };

  const colorOptions = ["#1e1e1e", "#e03131", "#2f9e44", "#1971c2", "#f08c00", "#7048e8"];
  const toolOptions: { key: string; icon: string; label: string }[] = [
    { key: "freehand", icon: "edit-3", label: "Pensil" },
    { key: "rectangle", icon: "square", label: "Kotak" },
    { key: "ellipse", icon: "circle", label: "Lingkaran" },
    { key: "text", icon: "type", label: "Teks" },
    { key: "sticky_note", icon: "file-text", label: "Sticky" },
    { key: "eraser", icon: "trash-2", label: "Hapus" },
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
        <Pressable onPress={handleClear} style={styles.clearBtn}>
          <Feather name="trash" size={18} color="#e03131" />
        </Pressable>
      </View>

      <View style={styles.canvasArea}>
        {Platform.OS === "web" ? (
          <div ref={canvasContainerRef as any} style={{ flex: 1, width: "100%", height: "100%", touchAction: "none" }} />
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

  const handleCreate = () => {
    if (Platform.OS === "web") {
      const name = window.prompt("Nama board baru:", "Board Baru");
      if (name) createBoard.mutate(name);
    } else {
      createBoard.mutate("Board Baru");
    }
  };

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
        <Pressable onPress={handleCreate} style={[styles.createBtn, { backgroundColor: colors.primary }]}>
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
          <Pressable onPress={handleCreate} style={[styles.emptyBtn, { backgroundColor: colors.primary }]}>
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
    </View>
  );
}

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
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 12,
  },
  backBtn: { padding: 6 },
  boardTitle: { flex: 1, fontSize: 16, fontWeight: "600" },
  clearBtn: { padding: 6 },
  canvasArea: { flex: 1 },
  toolbar: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    gap: 8,
  },
  toolRow: { flexDirection: "row", justifyContent: "space-around" },
  toolBtn: { padding: 10, borderRadius: 10 },
  colorRow: { flexDirection: "row", justifyContent: "center", gap: 10 },
  colorBtn: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: "transparent" },
});
