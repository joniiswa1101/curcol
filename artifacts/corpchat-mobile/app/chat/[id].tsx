import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  View, Text, FlatList, Pressable, TextInput, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, useColorScheme, Alert,
  ScrollView, Image, Linking,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { format, isToday, isYesterday } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import Colors from "@/constants/colors";
import { api, APIError } from "@/lib/api";
import { validateFile, getFileIcon } from "@/lib/upload-config";
import { useAuth } from "@/contexts/AuthContext";
import { UserAvatar } from "@/components/UserAvatar";
import { CicoStatusBadge } from "@/components/CicoStatusBadge";
import { EmojiPicker } from "@/components/EmojiPicker";
import { VoiceRecorder } from "@/components/VoiceRecorder";
import { AudioPlayer } from "@/components/AudioPlayer";
import { useWebSocket } from "@/hooks/use-websocket";
import { useTypingIndicators } from "@/hooks/use-typing-indicators";
import { useCall } from "@/contexts/CallContext";
import { detectPII } from "@/lib/pii-detection";

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

const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;

function detectUrls(text: string): string[] {
  if (!text) return [];
  const matches = text.match(URL_REGEX);
  if (!matches) return [];
  return [...new Set(matches.map(u => u.replace(/[.,;:!?)]+$/, "")))];
}

interface LinkPreview {
  url: string;
  title: string;
  description: string;
  image: string;
  domain: string;
}

const linkPreviewCache = new Map<string, LinkPreview | null>();
const linkPreviewInFlight = new Map<string, Promise<LinkPreview | null>>();

function fetchPreview(url: string): Promise<LinkPreview | null> {
  if (linkPreviewCache.has(url)) return Promise.resolve(linkPreviewCache.get(url)!);
  if (linkPreviewInFlight.has(url)) return linkPreviewInFlight.get(url)!;
  const p = api.post("/messages/link-preview", { url })
    .then((data: any) => {
      const result = data?.title ? data as LinkPreview : null;
      linkPreviewCache.set(url, result);
      return result;
    })
    .catch(() => {
      linkPreviewCache.set(url, null);
      return null;
    })
    .finally(() => linkPreviewInFlight.delete(url));
  linkPreviewInFlight.set(url, p);
  return p;
}

function LinkPreviewCard({ url, isMine, colors }: { url: string; isMine: boolean; colors: any }) {
  const [preview, setPreview] = useState<LinkPreview | null>(linkPreviewCache.get(url) || null);
  const [loading, setLoading] = useState(!linkPreviewCache.has(url));

  useEffect(() => {
    if (linkPreviewCache.has(url)) {
      setPreview(linkPreviewCache.get(url) || null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetchPreview(url).then(result => {
      if (!cancelled) {
        setPreview(result);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [url]);

  if (loading) return null;
  if (!preview) return null;

  const cardBg = isMine ? "rgba(255,255,255,0.15)" : (colors.surfaceSecondary || "#f3f4f6");

  return (
    <Pressable
      onPress={() => Linking.openURL(preview.url)}
      style={[styles.linkPreviewCard, { backgroundColor: cardBg, borderColor: isMine ? "rgba(255,255,255,0.2)" : colors.border }]}
    >
      {preview.image ? (
        <Image source={{ uri: preview.image }} style={styles.linkPreviewImage} resizeMode="cover" />
      ) : null}
      <View style={styles.linkPreviewBody}>
        <Text style={[styles.linkPreviewTitle, { color: isMine ? "#fff" : colors.text }]} numberOfLines={1}>{preview.title}</Text>
        {preview.description ? (
          <Text style={[styles.linkPreviewDesc, { color: isMine ? "rgba(255,255,255,0.7)" : colors.textSecondary }]} numberOfLines={2}>
            {preview.description}
          </Text>
        ) : null}
        <Text style={[styles.linkPreviewDomain, { color: isMine ? "rgba(255,255,255,0.5)" : colors.textSecondary }]} numberOfLines={1}>
          {preview.domain}
        </Text>
      </View>
    </Pressable>
  );
}

interface Attachment {
  fileName: string;
  url: string;
  mimeType: string;
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
  attachments?: Attachment[];
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
          {msg.attachments?.filter(a => a.mimeType?.startsWith("audio/")).map((att, idx) => (
            <AudioPlayer key={`audio-${idx}`} src={att.url} isMine={isMine} colors={colors} />
          ))}
          {msg.attachments?.filter(a => a.mimeType?.startsWith("image/")).map((att, idx) => (
            <Pressable key={`img-${idx}`} onPress={() => {}}>
              <Image source={{ uri: att.url.startsWith("http") ? att.url : `${process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : ""}${att.url}` }} style={{ width: 200, height: 200, borderRadius: 12, marginBottom: 4 }} resizeMode="cover" />
            </Pressable>
          ))}
          {(!msg.attachments?.some(a => a.mimeType?.startsWith("audio/")) || content) && (
            <Text style={[styles.msgText, {
              color: isMine ? colors.bubble.mineText : colors.bubble.otherText,
              fontStyle: msg.isDeleted ? "italic" : "normal",
              opacity: msg.isDeleted ? 0.6 : 1,
            }]}>
              {content}
            </Text>
          )}
          {!msg.isDeleted && detectUrls(content).slice(0, 1).map(url => (
            <LinkPreviewCard key={url} url={url} isMine={isMine} colors={colors} />
          ))}
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
  const { id, name, type: paramType } = useLocalSearchParams<{ id: string; name: string; type?: string }>();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme === "dark" ? "dark" : "light"];
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [editingMsgId, setEditingMsgId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [optimisticMessages, setOptimisticMessages] = useState<Message[]>([]);
  const [pendingFile, setPendingFile] = useState<any>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [piiWarning, setPiiWarning] = useState<{ types: string[] } | null>(null);
  const piiConfirmedRef = useRef(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();
  const flatRef = useRef<FlatList>(null);

  const { data: convDetail } = useQuery({
    queryKey: ["conversation-detail", id],
    queryFn: () => api.get(`/conversations/${id}`),
    enabled: !paramType,
  });

  const type = paramType || convDetail?.type;
  const isWhatsapp = type === "whatsapp";

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["messages", id],
    queryFn: () => api.get(`/conversations/${id}/messages`),
    refetchInterval: 30000,
  });

  // Real-time WebSocket listener for instant message updates
  useWebSocket(id);

  const { typingUsers, sendTyping } = useTypingIndicators(Number(id));
  const callCtx = useCall();

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
      // Handle 429 rate limit error
      if (error instanceof APIError && (error.errorCode === "pii_blocked" || (error.status === 400 && error.message?.toLowerCase().includes("pii")))) {
        Alert.alert(
          "Pesan Diblokir",
          "Pesan mengandung data sensitif (PII) dan tidak dapat dikirim ke channel grup/pengumuman.",
          [{ text: "OK" }]
        );
      } else if (error instanceof APIError && error.status === 429) {
        Alert.alert(
          "Terlalu Banyak Pesan",
          "Anda telah mengirim terlalu banyak pesan dalam waktu singkat. Coba lagi dalam beberapa detik.",
          [{ text: "OK" }]
        );
      }
    },
  });

  const editMutation = useMutation({
    mutationFn: (content: string) => api.patch(`/conversations/${id}/messages/${editingMsgId}`, { content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages", id] });
      setEditingMsgId(null);
      setEditText("");
    },
    onError: (error) => {
      if (error instanceof APIError && error.status === 429) {
        Alert.alert("Terlalu Banyak Permintaan", "Coba lagi dalam beberapa detik.", [{ text: "OK" }]);
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (msgId: number) => api.delete(`/conversations/${id}/messages/${msgId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["messages", id] }),
    onError: (error) => {
      if (error instanceof APIError && error.status === 429) {
        Alert.alert("Terlalu Banyak Permintaan", "Coba lagi dalam beberapa detik.", [{ text: "OK" }]);
      }
    },
  });

  const pinMutation = useMutation({
    mutationFn: (msgId: number) => api.patch(`/conversations/${id}/messages/${msgId}/pin`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["messages", id] }),
    onError: (error) => {
      if (error instanceof APIError && error.status === 429) {
        Alert.alert("Terlalu Banyak Permintaan", "Coba lagi dalam beberapa detik.", [{ text: "OK" }]);
      }
    },
  });

  // File upload handler
  const handleFileSelect = useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        quality: 0.8,
      });

      if (result.canceled) return;

      const asset = result.assets[0];
      if (!asset.uri) return;

      setUploadError(null);

      // Validate file
      const validation = validateFile(asset.uri, asset.mimeType || "application/octet-stream", asset.fileSize || 0);
      if (!validation.valid) {
        setUploadError(validation.error || "File tidak valid");
        return;
      }

      // Upload file
      setUploading(true);
      const formData = new FormData();
      formData.append("file", {
        uri: asset.uri,
        name: asset.filename || "file",
        type: asset.mimeType || "application/octet-stream",
      } as any);

      const response = await fetch(`${getBaseUrl()}/api/files/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${user?.token || (await (await import("@react-native-async-storage/async-storage")).default.getItem("auth_token")) || ""}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: "Upload gagal" }));
        throw new Error(error.message || "Upload gagal");
      }

      const data = await response.json();
      setPendingFile({
        id: data.id,
        fileName: data.fileName,
        fileSize: data.fileSize,
        mimeType: data.mimeType,
        url: data.url,
        localUri: asset.uri,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload gagal";
      setUploadError(message);
    } finally {
      setUploading(false);
    }
  }, [user?.token]);

  const getBaseUrl = useCallback(() => {
    if (Platform.OS === "web") return "";
    const domain = process.env.EXPO_PUBLIC_DOMAIN;
    return domain ? `https://${domain}` : "";
  }, []);

  const allMessages: Message[] = [...(data?.messages || []), ...optimisticMessages];

  // Insert date separators between messages from different days
  const messagesWithSeparators = useCallback(() => {
    if (allMessages.length === 0) return [];

    const result: any[] = [];
    let lastDate = "";

    for (let i = 0; i < allMessages.length; i++) {
      const msg = allMessages[i];
      const msgDate = new Date(msg.createdAt).toDateString();

      // Add separator if date changed
      if (msgDate !== lastDate) {
        result.push({
          id: `sep_${msgDate}`,
          type: "date_separator",
          date: msg.createdAt,
        });
        lastDate = msgDate;
      }

      result.push(msg);
    }

    return result;
  }, [allMessages]);

  const displayItems = messagesWithSeparators();

  const handleTextChange = (newText: string) => {
    setText(newText);
    if (piiWarning) {
      setPiiWarning(null);
      piiConfirmedRef.current = false;
    }
    
    // Send typing notification via WebSocket
    if (newText.trim() && user?.id) {
      sendTyping();
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

    if (!piiConfirmedRef.current) {
      const piiResult = detectPII(trimmed);
      if (piiResult.hasPII) {
        setPiiWarning({ types: piiResult.types });
        return;
      }
    }

    setText("");
    setPiiWarning(null);
    piiConfirmedRef.current = false;
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

  const handleVoiceRecorded = useCallback(async (uri: string, duration: number, mimeType: string) => {
    setShowVoiceRecorder(false);
    setUploading(true);
    try {
      const ext = mimeType.includes("mp4") ? "m4a" : "webm";
      const formData = new FormData();
      formData.append("file", {
        uri,
        name: `voice-${Date.now()}.${ext}`,
        type: mimeType,
      } as any);

      const baseUrl = getBaseUrl();
      const authToken = user?.token || (await (await import("@react-native-async-storage/async-storage")).default.getItem("auth_token")) || "";

      const response = await fetch(`${baseUrl}/api/files/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}` },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: "Upload gagal" }));
        throw new Error(error.message || "Upload gagal");
      }

      const data = await response.json();
      const durationStr = `${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, "0")}`;

      const optimisticMsg: Message = {
        id: Math.random() * -1,
        senderId: user?.id || 0,
        content: `🎤 Pesan suara (${durationStr})`,
        type: "file",
        isEdited: false,
        isDeleted: false,
        isPinned: false,
        createdAt: new Date().toISOString(),
        sender: user ? { name: user.name, avatarUrl: user.avatarUrl, cicoStatus: null } : undefined,
        reactions: [],
      };

      setOptimisticMessages(prev => [...prev, optimisticMsg]);

      await api.post(`/conversations/${id}/messages`, {
        content: `🎤 Pesan suara (${durationStr})`,
        type: "text",
        attachmentIds: [data.id],
      });

      queryClient.invalidateQueries({ queryKey: ["messages", id] });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload gagal";
      setUploadError(message);
    } finally {
      setUploading(false);
    }
  }, [user, id, queryClient]);

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
          {typingUsers.length > 0 ? (
            <Text style={[styles.waHeaderSub, { color: isWhatsapp ? "rgba(255,255,255,0.8)" : colors.textSecondary }]}>typing...</Text>
          ) : isWhatsapp ? (
            <Text style={styles.waHeaderSub}>Balasan diteruskan ke WhatsApp</Text>
          ) : null}
        </View>
        {!isWhatsapp && (
          <>
            <Pressable
              style={styles.headerAction}
              hitSlop={8}
              onPress={() => {
                callCtx.initiateCall({
                  userId: Number(id),
                  userName: name || "Contact",
                  conversationId: Number(id),
                  type: "voice",
                });
              }}
            >
              <Feather name="phone" size={20} color={colors.textSecondary} />
            </Pressable>
            <Pressable
              style={styles.headerAction}
              hitSlop={8}
              onPress={() => {
                callCtx.initiateCall({
                  userId: Number(id),
                  userName: name || "Contact",
                  conversationId: Number(id),
                  type: "video",
                });
              }}
            >
              <Feather name="video" size={20} color={colors.textSecondary} />
            </Pressable>
          </>
        )}
        {type === "group" && (
          <Pressable
            style={styles.headerAction}
            hitSlop={8}
            onPress={() => router.push({ pathname: "/group-info", params: { id } })}
          >
            <Feather name="info" size={20} color={colors.textSecondary} />
          </Pressable>
        )}
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
          data={[...displayItems].reverse()}
          keyExtractor={(item) => `${item.id}_${item.type === 'date_separator' ? 'sep' : item.createdAt}`}
          inverted
          contentContainerStyle={{ paddingVertical: 12, paddingHorizontal: 16 }}
          renderItem={({ item, index }) => {
            // Render date separator
            if (item.type === "date_separator") {
              return (
                <View style={[styles.dateSeparator, { marginVertical: 12 }]}>
                  <Text style={[styles.dateSeparatorText, { color: colors.textSecondary }]}>
                    {formatDayLabel(item.date)}
                  </Text>
                </View>
              );
            }

            // Render message bubble
            const isMine = item.senderId === user?.id;
            const nextItem = displayItems[displayItems.length - index - 2];
            const nextMsg = nextItem?.type !== "date_separator" ? nextItem : null;
            const showAvatar = !isMine && (!nextMsg || nextMsg?.senderId !== item.senderId);

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
            <View style={[styles.center, { transform: [{ scaleY: -1 }] }]}>
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
        {/* Upload error alert */}
        {uploadError && (
          <View style={[styles.errorBanner, { backgroundColor: colors.errorBg || "#fee2e2", borderColor: colors.error || "#ef4444" }]}>
            <Feather name="alert-circle" size={14} color={colors.error || "#ef4444"} />
            <Text style={[styles.errorText, { color: colors.error || "#ef4444", flex: 1, marginLeft: 8 }]} numberOfLines={2}>{uploadError}</Text>
            <Pressable onPress={() => setUploadError(null)} hitSlop={6}>
              <Feather name="x" size={16} color={colors.error || "#ef4444"} />
            </Pressable>
          </View>
        )}

        {/* File preview */}
        {pendingFile && (
          <View style={[styles.filePreview, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
            <Text style={[styles.fileIcon, { fontSize: 24 }]}>{getFileIcon(pendingFile.mimeType)}</Text>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={[styles.fileName, { color: colors.text }]} numberOfLines={1}>{pendingFile.fileName}</Text>
              <Text style={[styles.fileSize, { color: colors.textSecondary, fontSize: 12 }]}>
                {pendingFile.fileSize ? (pendingFile.fileSize / 1024).toFixed(0) + " KB" : ""}
              </Text>
            </View>
            <Pressable onPress={() => setPendingFile(null)} hitSlop={6}>
              <Feather name="x" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>
        )}

        {isWhatsapp && (
          <View style={[styles.waInputHint, { backgroundColor: "#e8fce8" }]}>
            <Feather name="phone" size={12} color="#25D366" />
            <Text style={styles.waInputHintText}>Pesan akan dikirim ke WhatsApp kontak</Text>
          </View>
        )}
        {piiWarning && (
          <View style={[styles.piiWarningBanner, { backgroundColor: "#FEF3C7", borderColor: "#FCD34D" }]}>
            <View style={styles.piiWarningHeader}>
              <Feather name="alert-triangle" size={16} color="#D97706" />
              <Text style={styles.piiWarningTitle}>Data Sensitif Terdeteksi</Text>
            </View>
            <Text style={styles.piiWarningTypes}>Terdeteksi: {piiWarning.types.join(", ")}</Text>
            <Text style={styles.piiWarningNote}>PII akan diblokir di channel grup/pengumuman.</Text>
            <View style={styles.piiWarningActions}>
              <Pressable
                onPress={() => { setPiiWarning(null); piiConfirmedRef.current = false; }}
                style={[styles.piiBtn, { backgroundColor: "#E5E7EB" }]}
              >
                <Text style={[styles.piiBtnText, { color: "#374151" }]}>Ubah Pesan</Text>
              </Pressable>
              <Pressable
                onPress={() => { piiConfirmedRef.current = true; setPiiWarning(null); send(); }}
                style={[styles.piiBtn, { backgroundColor: "#D97706" }]}
              >
                <Text style={[styles.piiBtnText, { color: "#fff" }]}>Kirim Tetap</Text>
              </Pressable>
            </View>
          </View>
        )}
        {showVoiceRecorder ? (
          <VoiceRecorder
            onRecorded={handleVoiceRecorded}
            onCancel={() => setShowVoiceRecorder(false)}
            colors={colors}
            disabled={uploading}
          />
        ) : (
          <View style={styles.inputRow}>
            <Pressable 
              onPress={handleFileSelect}
              disabled={uploading}
              style={[styles.attachBtn, { opacity: uploading ? 0.5 : 1 }]} 
              hitSlop={6}
            >
              {uploading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Feather name="paperclip" size={20} color={colors.textSecondary} />
              )}
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
            {(text.trim() || pendingFile) ? (
              <Pressable
                onPress={send}
                disabled={sendMutation.isPending}
                style={({ pressed }) => [
                  styles.sendBtn,
                  { backgroundColor: isWhatsapp ? "#25D366" : colors.primary, opacity: pressed ? 0.8 : 1 },
                ]}
              >
                {sendMutation.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Feather name="send" size={16} color="#fff" />
                )}
              </Pressable>
            ) : (
              <Pressable
                onPress={() => setShowVoiceRecorder(true)}
                style={({ pressed }) => [
                  styles.sendBtn,
                  { backgroundColor: colors.surfaceSecondary, opacity: pressed ? 0.8 : 1 },
                ]}
              >
                <Feather name="mic" size={18} color={colors.textSecondary} />
              </Pressable>
            )}
          </View>
        )}

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
  errorBanner: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 8, marginHorizontal: 12, marginTop: 8, marginBottom: 4, borderRadius: 8, borderWidth: 0.5 },
  errorText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  filePreview: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 10, marginHorizontal: 12, marginTop: 4, marginBottom: 8, borderRadius: 8, borderWidth: 0.5 },
  fileIcon: { textAlign: "center" },
  fileName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  fileSize: { fontFamily: "Inter_400Regular" },
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
  dateSeparator: { alignItems: "center", justifyContent: "center", marginVertical: 16 },
  dateSeparatorText: { fontSize: 12, fontFamily: "Inter_500Medium", letterSpacing: 0.3, textTransform: "capitalize" },
  piiWarningBanner: { marginHorizontal: 12, marginTop: 8, marginBottom: 4, padding: 12, borderRadius: 10, borderWidth: 1 },
  piiWarningHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  piiWarningTitle: { fontSize: 14, fontFamily: "Inter_700Bold", color: "#92400E" },
  piiWarningTypes: { fontSize: 12, fontFamily: "Inter_500Medium", color: "#B45309", marginBottom: 2 },
  piiWarningNote: { fontSize: 11, fontFamily: "Inter_400Regular", color: "#92400E", marginBottom: 8 },
  piiWarningActions: { flexDirection: "row", gap: 8 },
  piiBtn: { flex: 1, paddingVertical: 8, borderRadius: 6, alignItems: "center" },
  piiBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  linkPreviewCard: { flexDirection: "row", borderRadius: 10, overflow: "hidden", marginTop: 6, borderWidth: 0.5 },
  linkPreviewImage: { width: 72, height: 72 },
  linkPreviewBody: { flex: 1, padding: 8, gap: 2, justifyContent: "center" },
  linkPreviewTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  linkPreviewDesc: { fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 15 },
  linkPreviewDomain: { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 2 },
});
