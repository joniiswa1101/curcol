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

function MessageBubble({ msg, isMine, colors, showAvatar }: BubbleProps) {
  const content = msg.isDeleted ? "Pesan telah dihapus" : (msg.content || "");

  return (
    <View style={[styles.bubbleRow, isMine && styles.bubbleRowMine]}>
      {!isMine && showAvatar ? (
        <UserAvatar name={msg.sender?.name || "?"} size={30} avatarUrl={msg.sender?.avatarUrl} />
      ) : !isMine ? (
        <View style={{ width: 30 }} />
      ) : null}

      <View style={[styles.bubbleWrap, isMine && styles.bubbleWrapMine]}>
        {!isMine && showAvatar && (
          <Text style={[styles.senderName, { color: colors.textSecondary }]}>
            {msg.sender?.name || ""}
          </Text>
        )}
        <View style={[
          styles.bubble,
          { backgroundColor: isMine ? colors.bubble.mine : colors.bubble.other },
          isMine ? styles.bubbleMine : styles.bubbleOther,
        ]}>
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
      </View>
    </View>
  );
}

export default function ChatScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme === "dark" ? "dark" : "light"];
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const flatRef = useRef<FlatList>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["messages", id],
    queryFn: () => api.get(`/conversations/${id}/messages`),
    refetchInterval: 5000,
  });

  const sendMutation = useMutation({
    mutationFn: (content: string) => api.post(`/conversations/${id}/messages`, { content, type: "text" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["messages", id] }),
  });

  const messages: Message[] = data?.messages || [];

  function send() {
    const trimmed = text.trim();
    if (!trimmed) return;
    setText("");
    sendMutation.mutate(trimmed);
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Feather name="chevron-left" size={26} color={colors.primary} />
        </Pressable>
        <View style={styles.headerInfo}>
          <Text style={[styles.headerName, { color: colors.text }]} numberOfLines={1}>{name || "Chat"}</Text>
        </View>
        <Pressable style={styles.headerAction} hitSlop={8}>
          <Feather name="more-vertical" size={22} color={colors.textSecondary} />
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          ref={flatRef}
          data={[...messages].reverse()}
          keyExtractor={(item) => item.id.toString()}
          inverted
          contentContainerStyle={{ paddingVertical: 12, paddingHorizontal: 16 }}
          renderItem={({ item, index }) => {
            const isMine = item.senderId === user?.id;
            const nextMsg = messages[messages.length - index - 2];
            const showAvatar = !isMine && (!nextMsg || nextMsg.senderId !== item.senderId);
            return <MessageBubble msg={item} isMine={isMine} colors={colors} showAvatar={showAvatar} />;
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

      {/* Input */}
      <View style={[styles.inputArea, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: insets.bottom + 4 }]}>
        <Pressable style={styles.attachBtn} hitSlop={6}>
          <Feather name="paperclip" size={20} color={colors.textSecondary} />
        </Pressable>
        <TextInput
          style={[styles.input, { backgroundColor: colors.surfaceSecondary, color: colors.text }]}
          placeholder="Ketik pesan..."
          placeholderTextColor={colors.textSecondary}
          value={text}
          onChangeText={setText}
          multiline
          maxLength={2000}
        />
        <Pressable
          onPress={send}
          disabled={!text.trim() || sendMutation.isPending}
          style={({ pressed }) => [
            styles.sendBtn,
            { backgroundColor: text.trim() ? colors.primary : colors.border, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          {sendMutation.isPending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Feather name="send" size={16} color="#fff" />
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingBottom: 10, borderBottomWidth: 0.5,
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerInfo: { flex: 1, paddingHorizontal: 8 },
  headerName: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  headerAction: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  bubbleRow: { flexDirection: "row", alignItems: "flex-end", marginBottom: 4, gap: 6 },
  bubbleRowMine: { flexDirection: "row-reverse" },
  bubbleWrap: { maxWidth: "78%", gap: 2 },
  bubbleWrapMine: { alignItems: "flex-end" },
  senderName: { fontSize: 11, fontFamily: "Inter_500Medium", marginLeft: 4, marginBottom: 2 },
  bubble: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, gap: 4 },
  bubbleMine: { borderBottomRightRadius: 4 },
  bubbleOther: { borderBottomLeftRadius: 4 },
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
  inputArea: {
    flexDirection: "row", alignItems: "flex-end", gap: 10,
    paddingHorizontal: 12, paddingTop: 10, borderTopWidth: 0.5,
  },
  attachBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  input: {
    flex: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 15, fontFamily: "Inter_400Regular", maxHeight: 120,
  },
  sendBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
});
