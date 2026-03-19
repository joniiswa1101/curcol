import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View, Text, FlatList, Pressable, TextInput, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, useColorScheme, Alert,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { format, isToday, isYesterday } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import Colors from "@/constants/colors";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { UserAvatar } from "@/components/UserAvatar";
import { CicoStatusBadge } from "@/components/CicoStatusBadge";
import { EmojiPicker } from "@/components/EmojiPicker";
import { useWebSocket } from "@/hooks/use-websocket";

function formatMsgTime(dateStr: string) {
  const d = new Date(dateStr);
  return format(d, "HH:mm");
}

function formatDayLabel(dateStr: string) {
  const d = new Date(dateStr);
  if (isToday(d)) return "Hari Ini";
  if (isYesterday(d)) return "Kemarin";
  return format(d, "d MMMM yyyy", { locale: idLocale });
}

interface Message {
  id: number;
  senderId: number;
  content?: string;
  type: string;
  isEdited: boolean;
  isDeleted: boolean;
  isPinned: boolean;
  isFromWhatsapp?: boolean;
  createdAt: string;
  sender?: { name: string; avatarUrl?: string; cicoStatus?: any };
  replyTo?: Message;
  reactions?: { emoji: string; count: number; userIds: number[] }[];
}

interface BubbleProps {
  msg: Message;
  isMine: boolean;
  colors: any;
  showAvatar: boolean;
}

function MessageBubble({ msg, isMine, colors, showAvatar, onEdit, onDelete, onPin }: BubbleProps & { onEdit?: (msg: Message) => void; onDelete?: (msgId: number) => void; onPin?: (msgId: number) => void }) {
  const [showMenu, setShowMenu] = useState(false);
  const content = msg.isDeleted ? "Pesan telah dihapus" : (msg.content || "");
  const isFromWa = msg.isFromWhatsapp;

  const bubbleBg = isMine
    ? colors.bubble.mine
    : isFromWa
      ? "#e8fce8"
      : colors.bubble.other;

  return (
    <View style={[styles.bubbleRow, isMine && styles.bubbleRowMine]}>
      {!isMine && showAvatar ? (
        isFromWa ? (
          <View style={styles.waAvatarSmall}>
            <Feather name="phone" size={14} color="#fff" />
          </View>
        ) : (
          <UserAvatar name={msg.sender?.name || "?"} size={30} avatarUrl={msg.sender?.avatarUrl} />
        )
      ) : !isMine ? (
        <View style={{ width: 30 }} />
      ) : null}

      <Pressable onLongPress={() => setShowMenu(true)} style={[styles.bubbleWrap, isMine && styles.bubbleWrapMine]}>
        {!isMine && showAvatar && (
          <Text style={[styles.senderName, { color: colors.textSecondary }]}>
            {isFromWa ? `📱 ${msg.sender?.name || "WhatsApp"}` : (msg.sender?.name || "")}
          </Text>
        )}
        <View style={[
          styles.bubble,
          { backgroundColor: bubbleBg },
          isMine ? styles.bubbleMine : styles.bubbleOther,
          isFromWa && !isMine && styles.bubbleWhatsapp,
          msg.isPinned && { borderLeftWidth: 3, borderLeftColor: "#f59e0b" },
        ]}>
          {msg.isPinned && (
            <View style={styles.pinnedBadge}>
              <Feather name="pin" size={10} color="#fff" />
              <Text style={styles.pinnedText}>Pinned</Text>
            </View>
          )}
          {isFromWa && (
            <View style={styles.waTag}>
              <Feather name="phone" size={9} color="#25D366" />
              <Text style={styles.waTagText}>WhatsApp</Text>
            </View>
          )}
          {msg.replyTo && (
            <View style={[styles.replyBar, { borderColor: isMine ? "rgba(255,255,255,0.5)" : colors.primary }]}>
              <Text style={[styles.replyText, { color: isMine ? "rgba(255,255,255,0.8)" : colors.textSecondary }]} numberOfLines={1}>
                {msg.replyTo.content || ""}
              </Text>
            </View>
          )}
          <Text style={[styles.msgText, {
            color: isMine ? colors.bubble.mineText : colors.bubble.otherText,
            fontStyle: msg.isDeleted ? "italic" : "normal",
            opacity: msg.isDeleted ? 0.6 : 1,
          }]}>
            {content}
          </Text>
          <View style={styles.msgMeta}>
            <Text style={[styles.msgTime, { color: isMine ? "rgba(255,255,255,0.6)" : colors.textSecondary }]}>
              {formatMsgTime(msg.createdAt)}
            </Text>
            {msg.isEdited && !msg.isDeleted && (
              <Text style={[styles.edited, { color: isMine ? "rgba(255,255,255,0.6)" : colors.textSecondary }]}>diedit</Text>
            )}
          </View>
        </View>
        {msg.reactions && msg.reactions.length > 0 && (
          <View style={styles.reactions}>
            {msg.reactions.map(r => (
              <View key={r.emoji} style={[styles.reactionBadge, { backgroundColor: colors.surfaceSecondary }]}>
                <Text style={styles.reactionEmoji}>{r.emoji}</Text>
                <Text style={[styles.reactionCount, { color: colors.textSecondary }]}>{r.count}</Text>
              </View>
            ))}
          </View>
        )}
      </Pressable>

      {showMenu && isMine && (
        <View style={styles.menuBtns}>
          <Feather
            name="edit-2"
            size={16}
            color={colors.primary}
            onPress={() => {
              onEdit?.(msg);
              setShowMenu(false);
            }}
          />
          <Feather
            name={msg.isPinned ? "pin" : "pin"}
            size={16}
            color={msg.isPinned ? "#f59e0b" : colors.textSecondary}
            onPress={() => {
              onPin?.(msg.id);
              setShowMenu(false);
            }}
          />
          <Feather
            name="trash-2"
            size={16}
            color="#ef4444"
            onPress={() => {
              onDelete?.(msg.id);
              setShowMenu(false);
            }}
          />
        </View>
      )}
    </View>
  );
}

export default function ChatScreen() {
  const { id, name, type } = useLocalSearchParams<{ id: string; name: string; type?: string }>();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme === "dark" ? "dark" : "light"];
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [editingMsgId, setEditingMsgId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [typingUsers, setTypingUsers] = useState<Map<number, string>>(new Map());
  const [optimisticMessages, setOptimisticMessages] = useState<Message[]>([]);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();
  const flatRef = useRef<FlatList>(null);
  const isWhatsapp = type === "whatsapp";

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["messages", id],
    queryFn: () => api.get(`/conversations/${id}/messages`),
    refetchInterval: 30000, // Fallback polling every 30s (WebSocket is primary)
  });

  // Real-time WebSocket listener for instant message updates
  useWebSocket(id);

  const sendMutation = useMutation({
    mutationFn: (content: string) => api.post(`/conversations/${id}/messages`, { content, type: "text" }),
    onSuccess: (newMsg) => {
      // Replace optimistic message with real one
      setOptimisticMessages(prev => prev.filter(m => m.id !== (newMsg.id - 0.5)));
      queryClient.invalidateQueries({ queryKey: ["messages", id] });
    },
    onError: (error, content) => {
      // Remove optimistic message on failure
      setOptimisticMessages(prev => prev.filter(m => m.content !== content || !m.id.toString().includes('.')));
    },
  });

  const editMutation = useMutation({
    mutationFn: (content: string) => api.patch(`/conversations/${id}/messages/${editingMsgId}`, { content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages", id] });
      setEditingMsgId(null);
      setEditText("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (msgId: number) => api.delete(`/conversations/${id}/messages/${msgId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["messages", id] }),
  });

  const pinMutation = useMutation({
    mutationFn: (msgId: number) => api.patch(`/conversations/${id}/messages/${msgId}/pin`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["messages", id] }),
  });

  const allMessages: Message[] = [...(data?.messages || []), ...optimisticMessages];

  // Handle text input with typing indicator
  const handleTextChange = (newText: string) => {
    setText(newText);
    
    // Send typing notification
    if (newText.trim() && user?.id) {
      api.post(`/conversations/${id}/typing`, {}).catch(() => {});
    }
    
    // Reset typing timeout
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (newText.trim()) {
      typingTimeoutRef.current = setTimeout(() => {
        api.post(`/conversations/${id}/typing/stop`, {}).catch(() => {});
      }, 2000);
    }
  };

  function send() {
    const trimmed = text.trim();
    if (!trimmed) return;
    setText("");
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    api.post(`/conversations/${id}/typing/stop`, {}).catch(() => {});
    
    // Create optimistic message
    const optimisticMsg: Message = {
      id: Math.random() * -1, // Negative ID to mark as optimistic
      senderId: user?.id || 0,
      content: trimmed,
      type: "text",
      isEdited: false,
      isDeleted: false,
      isPinned: false,
      createdAt: new Date().toISOString(),
      sender: user ? { name: user.name, avatarUrl: user.avatarUrl, cicoStatus: null } : undefined,
      reactions: [],
    };
    
    setOptimisticMessages(prev => [...prev, optimisticMsg]);
    sendMutation.mutate(trimmed);
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: isWhatsapp ? "#075E54" : colors.surface, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Feather name="chevron-left" size={26} color={isWhatsapp ? "#fff" : colors.primary} />
        </Pressable>
        {isWhatsapp && (
          <View style={styles.waHeaderIcon}>
            <Feather name="phone" size={16} color="#fff" />
          </View>
        )}
        <View style={styles.headerInfo}>
          <Text style={[styles.headerName, { color: isWhatsapp ? "#fff" : colors.text }]} numberOfLines={1}>{name || "Chat"}</Text>
          {isWhatsapp && (
            <Text style={styles.waHeaderSub}>Balasan diteruskan ke WhatsApp</Text>
          )}
        </View>
        <Pressable style={styles.headerAction} hitSlop={8}>
          <Feather name="more-vertical" size={22} color={isWhatsapp ? "#fff" : colors.textSecondary} />
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          ref={flatRef}
          data={[...allMessages].reverse()}
          keyExtractor={(item) => `${item.id}_${item.createdAt}`}
          inverted
          contentContainerStyle={{ paddingVertical: 12, paddingHorizontal: 16 }}
          renderItem={({ item, index }) => {
            const isMine = item.senderId === user?.id;
            const nextMsg = allMessages[allMessages.length - index - 2];
            const showAvatar = !isMine && (!nextMsg || nextMsg.senderId !== item.senderId);
            return (
              <MessageBubble
                msg={item}
                isMine={isMine}
                colors={colors}
                showAvatar={showAvatar}
                onEdit={(msg) => {
                  setEditingMsgId(msg.id);
                  setEditText(msg.content || "");
                }}
                onDelete={(msgId) => deleteMutation.mutate(msgId)}
                onPin={(msgId) => pinMutation.mutate(msgId)}
              />
            );
          }}
          onLayout={() => flatRef.current?.scrollToOffset({ offset: 0, animated: false })}
          ListEmptyComponent={() => (
            <View style={styles.center}>
              <Feather name="message-circle" size={40} color={colors.border} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>Mulai percakapan</Text>
            </View>
          )}
        />
      )}

      {/* Typing Indicators */}
      {typingUsers.size > 0 && (
        <View style={[styles.typingIndicator, { backgroundColor: colors.surfaceSecondary, borderTopColor: colors.border }]}>
          <Text style={[styles.typingText, { color: colors.textSecondary }]}>
            {Array.from(typingUsers.values()).join(", ")} {typingUsers.size === 1 ? "sedang mengetik" : "sedang mengetik"}...
          </Text>
        </View>
      )}

      {/* Input */}
      <View style={[styles.inputArea, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: insets.bottom + 4 }]}>
        {isWhatsapp && (
          <View style={[styles.waInputHint, { backgroundColor: "#e8fce8" }]}>
            <Feather name="phone" size={12} color="#25D366" />
            <Text style={styles.waInputHintText}>Pesan akan dikirim ke WhatsApp kontak</Text>
          </View>
        )}
        <View style={styles.inputRow}>
          <Pressable style={styles.attachBtn} hitSlop={6}>
            <Feather name="paperclip" size={20} color={colors.textSecondary} />
          </Pressable>
          <Pressable
            onPress={() => setShowEmojiPicker(!showEmojiPicker)}
            style={styles.attachBtn}
            hitSlop={6}
          >
            <Feather name="smile" size={20} color={colors.textSecondary} />
          </Pressable>
          <TextInput
            style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.text }]}
            placeholder={isWhatsapp ? "Balas ke WhatsApp..." : "Ketik pesan..."}
            placeholderTextColor={colors.textSecondary}
            value={text}
            onChangeText={handleTextChange}
            multiline
            maxLength={2000}
          />
          <Pressable
            onPress={send}
            disabled={!text.trim() || sendMutation.isPending}
            style={({ pressed }) => [
              styles.sendBtn,
              { backgroundColor: text.trim() ? (isWhatsapp ? "#25D366" : colors.primary) : colors.border, opacity: pressed ? 0.8 : 1 },
            ]}
          >
            {sendMutation.isPending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Feather name="send" size={16} color="#fff" />
            )}
          </Pressable>
        </View>

        <EmojiPicker
          visible={showEmojiPicker}
          onSelect={(emoji) => setText(prev => prev + emoji)}
          onClose={() => setShowEmojiPicker(false)}
        />
      </View>

      {/* Edit Modal */}
      {editingMsgId !== null && (
        <View style={[styles.modalOverlay, { backgroundColor: "rgba(0,0,0,0.5)" }]}>
          <View style={[styles.editModal, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.editTitle, { color: colors.text }]}>Edit Pesan</Text>
            <TextInput
              style={[styles.editInput, { backgroundColor: colors.surfaceSecondary, color: colors.text, borderColor: colors.border }]}
              multiline
              placeholder="Ketik pesan baru..."
              placeholderTextColor={colors.textSecondary}
              value={editText}
              onChangeText={setEditText}
              maxLength={2000}
            />
            <View style={styles.editActions}>
              <Pressable
                onPress={() => {
                  setEditingMsgId(null);
                  setEditText("");
                }}
                style={[styles.editBtn, { backgroundColor: colors.surfaceSecondary }]}
              >
                <Text style={[styles.editBtnText, { color: colors.text }]}>Batal</Text>
              </Pressable>
              <Pressable
                onPress={() => editMutation.mutate(editText.trim())}
                disabled={!editText.trim() || editMutation.isPending}
                style={[styles.editBtn, { backgroundColor: colors.primary, opacity: !editText.trim() || editMutation.isPending ? 0.5 : 1 }]}
              >
                {editMutation.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={[styles.editBtnText, { color: "#fff" }]}>Simpan</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingBottom: 10, borderBottomWidth: 0.5,
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  waHeaderIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#25D366", alignItems: "center", justifyContent: "center", marginRight: 4 },
  headerInfo: { flex: 1, paddingHorizontal: 8 },
  headerName: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  waHeaderSub: { fontSize: 11, color: "rgba(255,255,255,0.7)", fontFamily: "Inter_400Regular" },
  headerAction: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  waAvatarSmall: { width: 30, height: 30, borderRadius: 15, backgroundColor: "#25D366", alignItems: "center", justifyContent: "center" },
  bubbleRow: { flexDirection: "row", alignItems: "flex-end", marginBottom: 4, gap: 6 },
  bubbleRowMine: { flexDirection: "row-reverse" },
  bubbleWrap: { maxWidth: "78%", gap: 2 },
  bubbleWrapMine: { alignItems: "flex-end" },
  senderName: { fontSize: 11, fontFamily: "Inter_500Medium", marginLeft: 4, marginBottom: 2 },
  bubble: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, gap: 4 },
  bubbleMine: { borderBottomRightRadius: 4 },
  bubbleOther: { borderBottomLeftRadius: 4 },
  bubbleWhatsapp: { borderWidth: 1, borderColor: "#c8f0c8" },
  waTag: { flexDirection: "row", alignItems: "center", gap: 3, marginBottom: 2 },
  waTagText: { fontSize: 9, fontFamily: "Inter_600SemiBold", color: "#25D366" },
  replyBar: { borderLeftWidth: 2, paddingLeft: 6, borderRadius: 2 },
  replyText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  msgText: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 21 },
  msgMeta: { flexDirection: "row", alignItems: "center", gap: 4, justifyContent: "flex-end" },
  msgTime: { fontSize: 10, fontFamily: "Inter_400Regular" },
  edited: { fontSize: 10, fontFamily: "Inter_400Regular" },
  reactions: { flexDirection: "row", gap: 4, flexWrap: "wrap" },
  reactionBadge: { flexDirection: "row", alignItems: "center", gap: 2, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  reactionEmoji: { fontSize: 13 },
  reactionCount: { fontSize: 11, fontFamily: "Inter_500Medium" },
  inputArea: { borderTopWidth: 0.5, paddingBottom: 4 },
  waInputHint: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 6 },
  waInputHintText: { fontSize: 11, color: "#25D366", fontFamily: "Inter_400Regular" },
  inputRow: {
    flexDirection: "row", alignItems: "flex-end", gap: 10,
    paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4,
  },
  attachBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  input: {
    flex: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 15, fontFamily: "Inter_400Regular", maxHeight: 120,
  },
  sendBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  menuBtns: { flexDirection: "row", gap: 8, paddingHorizontal: 8, paddingVertical: 4 },
  modalOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", zIndex: 1000 },
  editModal: { width: "85%", borderRadius: 12, padding: 16, gap: 12, borderWidth: 0.5 },
  editTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  editInput: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, fontFamily: "Inter_400Regular", minHeight: 80, borderWidth: 0.5, maxHeight: 150 },
  editActions: { flexDirection: "row", gap: 12, justifyContent: "flex-end" },
  editBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, minWidth: 80, alignItems: "center" },
  editBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  pinnedBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#f59e0b", paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4, alignSelf: "flex-start", marginBottom: 4 },
  pinnedText: { fontSize: 10, color: "#fff", fontFamily: "Inter_500Medium" },
  typingIndicator: { borderTopWidth: 0.5, paddingHorizontal: 12, paddingVertical: 6 },
  typingText: { fontSize: 12, fontFamily: "Inter_400Regular", fontStyle: "italic" },
});
