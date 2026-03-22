import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  View, Text, FlatList, Pressable, TextInput, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, useColorScheme, Alert,
  ScrollView, Image, Linking, Modal,
} from "react-native";
import * as Clipboard from "expo-clipboard";
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
import { useOfflineQueue, QueuedMessage } from "@/hooks/use-offline-queue";
import { usePresence, formatLastSeen } from "@/hooks/use-presence";

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

interface MessageRead {
  userId: number;
  readAt: string;
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
  reads?: MessageRead[];
  isFavorited?: boolean;
}

interface BubbleProps {
  msg: Message;
  isMine: boolean;
  colors: any;
  showAvatar: boolean;
  queueStatus?: "pending" | "sending" | "failed";
  isHighlighted?: boolean;
  onLongPress?: (msg: Message) => void;
  onRetry?: () => void;
  onDiscard?: () => void;
}

interface BubblePropsExtended extends BubbleProps {
  translation?: { text: string; lang: string };
  breakdown?: { words: Array<{ word: string; pronunciation: string; meaning: string; pos: string }>; grammar: string };
  lesson?: string;
}

function MessageBubble({ msg, isMine, colors, showAvatar, queueStatus, isHighlighted, onLongPress, onRetry, onDiscard, translation, breakdown, lesson }: BubblePropsExtended) {
  const content = msg.isDeleted ? "Pesan telah dihapus" : (msg.content || "");
  const isFromWa = msg.isFromWhatsapp;

  const bubbleBg = isMine
    ? colors.bubble.mine
    : isFromWa
      ? "#e8fce8"
      : colors.bubble.other;

  return (
    <View style={[styles.bubbleRow, isMine && styles.bubbleRowMine, isHighlighted && styles.highlightedBubble]}>
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

      <Pressable onLongPress={() => !msg.isDeleted && !queueStatus && onLongPress?.(msg)} style={[styles.bubbleWrap, isMine && styles.bubbleWrapMine]}>
        {!isMine && showAvatar && (
          <Text
            selectable={false}
            style={[styles.senderName, { color: colors.textSecondary }]}>
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
            <Text
              selectable={false}
              style={[styles.msgText, {
                color: isMine ? colors.bubble.mineText : colors.bubble.otherText,
                fontStyle: msg.isDeleted ? "italic" : "normal",
                opacity: msg.isDeleted ? 0.6 : 1,
              }]}>
              {content}
            </Text>
          )}
          {translation && (
            <View style={[styles.translationBox, { backgroundColor: isMine ? "rgba(255,255,255,0.1)" : "rgba(59,130,246,0.1)" }]}>
              <Text
                selectable={false}
                style={[styles.translationLabel, { color: isMine ? "rgba(255,255,255,0.7)" : colors.primary }]}>
                🌐 {translation.lang.toUpperCase()}
              </Text>
              <Text
                selectable={false}
                style={[styles.translationText, {
                  color: isMine ? colors.bubble.mineText : colors.bubble.otherText,
                }]}>
                {translation.text}
              </Text>
            </View>
          )}
          {breakdown && breakdown.words.length > 0 && (
            <View style={[styles.breakdownBox, { backgroundColor: isMine ? "rgba(255,255,255,0.08)" : "rgba(34,197,94,0.08)" }]}>
              <Text
                selectable={false}
                style={[styles.breakdownLabel, { color: isMine ? "rgba(255,255,255,0.7)" : "#22c55e" }]}>
                📖 Analisis Kata
              </Text>
              <View style={styles.wordGrid}>
                {breakdown.words.map((w, idx) => (
                  <View key={idx} style={[styles.wordBox, { backgroundColor: isMine ? "rgba(255,255,255,0.05)" : "rgba(34,197,94,0.1)" }]}>
                    <Text
                      selectable={false}
                      style={[styles.wordMain, { color: isMine ? colors.bubble.mineText : colors.bubble.otherText }]}>
                      {w.word}
                    </Text>
                    <Text
                      selectable={false}
                      style={[styles.wordPronunciation, { color: isMine ? "rgba(255,255,255,0.6)" : "rgba(34,197,94,0.8)" }]}>
                      {w.pronunciation}
                    </Text>
                    <Text
                      selectable={false}
                      style={[styles.wordMeaning, { color: isMine ? "rgba(255,255,255,0.7)" : colors.text }]}>
                      {w.meaning}
                    </Text>
                    <Text
                      selectable={false}
                      style={[styles.wordPos, { color: isMine ? "rgba(255,255,255,0.5)" : colors.tabIconDefault }]}>
                      {w.pos}
                    </Text>
                  </View>
                ))}
              </View>
              {breakdown.grammar && (
                <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: isMine ? "rgba(255,255,255,0.2)" : "rgba(34,197,94,0.3)" }}>
                  <Text
                    selectable={false}
                    style={[styles.grammarLabel, { color: isMine ? "rgba(255,255,255,0.7)" : "#22c55e" }]}>
                    📚 Catatan Tata Bahasa:
                  </Text>
                  <Text
                    selectable={false}
                    style={[styles.grammarText, { color: isMine ? colors.bubble.mineText : colors.bubble.otherText }]}>
                    {breakdown.grammar}
                  </Text>
                </View>
              )}
            </View>
          )}
          {lesson && (
            <View style={[styles.lessonBox, { backgroundColor: isMine ? "rgba(255,255,255,0.08)" : "rgba(217,119,6,0.08)" }]}>
              <Text
                selectable={false}
                style={[styles.lessonLabel, { color: isMine ? "rgba(255,255,255,0.7)" : "#d97706" }]}>
                🎓 Pelajaran Mini
              </Text>
              <Text
                selectable={false}
                style={[styles.lessonText, { color: isMine ? colors.bubble.mineText : colors.bubble.otherText }]}>
                {lesson}
              </Text>
            </View>
          )}
          {!msg.isDeleted && detectUrls(content).slice(0, 1).map(url => (
            <LinkPreviewCard key={url} url={url} isMine={isMine} colors={colors} />
          ))}
          <View style={styles.msgMeta}>
            <Text
              selectable={false}
              style={[styles.msgTime, { color: isMine ? "rgba(255,255,255,0.6)" : colors.textSecondary }]}>
              {formatMsgTime(msg.createdAt)}
            </Text>
            {msg.isEdited && !msg.isDeleted && (
              <Text
                selectable={false}
                style={[styles.edited, { color: isMine ? "rgba(255,255,255,0.6)" : colors.textSecondary }]}>diedit</Text>
            )}
            {(() => {
              if (!isMine || queueStatus || msg.isDeleted || typeof msg.id !== "number" || msg.id <= 0) return null;
              const othersRead = (msg.reads || []).filter(r => r.userId !== msg.senderId);
              if (othersRead.length > 0) {
                return <Text
                  selectable={false}
                  style={[styles.readCheck, { color: "#3b82f6" }]}>✓✓</Text>;
              }
              return <Text
                selectable={false}
                style={[styles.readCheck, { color: "rgba(255,255,255,0.5)" }]}>✓</Text>;
            })()}
            {queueStatus === "pending" && (
              <Feather name="clock" size={11} color={isMine ? "rgba(255,255,255,0.5)" : colors.textSecondary} />
            )}
            {queueStatus === "sending" && (
              <ActivityIndicator size={10} color={isMine ? "rgba(255,255,255,0.5)" : colors.textSecondary} />
            )}
            {queueStatus === "failed" && (
              <Feather name="alert-circle" size={11} color="#ef4444" />
            )}
          </View>
          {queueStatus === "failed" && (
            <View style={styles.queueFailedActions}>
              <Pressable onPress={onRetry} style={styles.queueActionBtn}>
                <Feather name="refresh-cw" size={12} color={colors.primary} />
                <Text style={[styles.queueActionText, { color: colors.primary }]}>Coba Lagi</Text>
              </Pressable>
              <Pressable onPress={onDiscard} style={styles.queueActionBtn}>
                <Feather name="x" size={12} color="#ef4444" />
                <Text style={[styles.queueActionText, { color: "#ef4444" }]}>Hapus</Text>
              </Pressable>
            </View>
          )}
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
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Message[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [highlightedMsgId, setHighlightedMsgId] = useState<number | null>(null);
  const [contextMenuMsg, setContextMenuMsg] = useState<Message | null>(null);
  const [replyToMessage, setReplyToMessage] = useState<Message | null>(null);
  
  // AI Summarization states
  const [showSummaryPanel, setShowSummaryPanel] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [summaryData, setSummaryData] = useState<{ summary: string; keyPoints: string[]; actionItems: string[] } | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryMessageCount, setSummaryMessageCount] = useState(50);
  
  // Translation states
  const [translations, setTranslations] = useState<Record<number, { text: string; lang: string }>>({});
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const [translatingMsgId, setTranslatingMsgId] = useState<number | null>(null);
  const [translating, setTranslating] = useState(false);
  const [translationError, setTranslationError] = useState<string | null>(null);
  
  // Breakdown states
  const [breakdowns, setBreakdowns] = useState<Record<number, { words: Array<{ word: string; pronunciation: string; meaning: string; pos: string }>; grammar: string }>>({});
  const [analyzingMsgId, setAnalyzingMsgId] = useState<number | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  
  // Lesson states
  const [lessons, setLessons] = useState<Record<number, string>>({});
  const [lessonMsgId, setLessonMsgId] = useState<number | null>(null);
  const [showLessonPicker, setShowLessonPicker] = useState(false);
  const [teachingLang, setTeachingLang] = useState<string | null>(null);
  const [teaching, setTeaching] = useState(false);
  
  // Header menu states
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [showConvInfo, setShowConvInfo] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [menuActionLoading, setMenuActionLoading] = useState(false);
  
  const QUICK_LANGUAGES = [
    { code: "id", name: "🇮🇩 Indonesia" },
    { code: "en", name: "🇺🇸 English" },
    { code: "ja", name: "🇯🇵 日本語" },
    { code: "ko", name: "🇰🇷 한국어" },
    { code: "zh", name: "🇨🇳 中文" },
    { code: "es", name: "🇪🇸 Español" },
    { code: "fr", name: "🇫🇷 Français" },
    { code: "de", name: "🇩🇪 Deutsch" },
  ];
  
  const searchInputRef = useRef<TextInput>(null);
  const offlineQueue = useOfflineQueue(user?.id, () => {
    queryClient.invalidateQueries({ queryKey: ["messages", id] });
  });
  const piiConfirmedRef = useRef(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();
  const flatRef = useRef<FlatList>(null);

  const { data: convDetail } = useQuery({
    queryKey: ["conversation-detail", id],
    queryFn: () => api.get(`/conversations/${id}`),
  });

  const type = paramType || convDetail?.type;
  const isWhatsapp = type === "whatsapp";

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["messages", id],
    queryFn: () => api.get(`/conversations/${id}/messages`),
    refetchInterval: 30000,
  });

  const lastMsgCountRef = useRef(0);
  useEffect(() => {
    if (!id || !data?.messages) return;
    const count = data.messages.length;
    if (count === lastMsgCountRef.current && lastMsgCountRef.current > 0) return;
    lastMsgCountRef.current = count;
    api.post(`/conversations/${id}/mark-read`, {}).then(() => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    }).catch(() => {});
  }, [id, data?.messages?.length, queryClient]);

  // Real-time WebSocket listener for instant message updates
  useWebSocket(id);

  const { typingUsers, sendTyping } = useTypingIndicators(Number(id));
  const callCtx = useCall();
  const { getUserPresence } = usePresence();

  const otherUserId = useMemo(() => {
    if (type !== "direct" || !convDetail?.members) return null;
    const other = convDetail.members.find((m: any) => m.userId !== user?.id);
    return other?.userId || other?.user?.id || null;
  }, [type, convDetail, user?.id]);

  const otherPresence = otherUserId ? getUserPresence(otherUserId) : null;
  const presenceStatus = otherPresence?.status || "offline";
  const presenceColor = presenceStatus === "online" ? "#22c55e" : presenceStatus === "idle" ? "#eab308" : "#9ca3af";
  const presenceLabel = presenceStatus === "online" ? "Online" : presenceStatus === "idle" ? "Idle" : formatLastSeen(otherPresence?.lastSeenAt || null);

  const handleMessageSearch = useCallback(async () => {
    const q = searchQuery.trim();
    if (!q) return;
    setSearchLoading(true);
    try {
      const params = new URLSearchParams({ q, limit: "50" });
      const result = await api.get(`/conversations/${id}/search?${params}`);
      setSearchResults(result.messages || []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, [searchQuery, id]);

  const handleSummarize = useCallback(async () => {
    if (summarizing) return;
    
    setSummarizing(true);
    setSummaryError(null);
    setSummaryData(null);
    
    try {
      const result = await api.post(`/summarize/conversation/${id}`, { messageCount: summaryMessageCount });
      setSummaryData({
        summary: result.summary || result.tldr || "",
        keyPoints: result.keyPoints || result.points || [],
        actionItems: result.actionItems || result.actions || []
      });
      setShowSummaryPanel(true);
    } catch (err) {
      const errorMsg = err instanceof APIError ? err.message : "Gagal merangkum percakapan";
      setSummaryError(errorMsg);
    } finally {
      setSummarizing(false);
    }
  }, [id, summarizing, summaryMessageCount]);

  const handleTranslate = useCallback(async (msgId: number, content: string, targetLang: string) => {
    if (translating) return;
    
    setTranslating(true);
    setTranslationError(null);
    
    try {
      const result = await api.post("/translate/message", { text: content, targetLang });
      setTranslations(prev => ({
        ...prev,
        [msgId]: { text: result.translation || result.translated || result, lang: targetLang }
      }));
      setShowLanguagePicker(false);
      setTranslatingMsgId(null);
    } catch (err) {
      const errorMsg = err instanceof APIError ? err.message : "Gagal menerjemahkan pesan";
      setTranslationError(errorMsg);
      Alert.alert("Terjemahan Gagal", errorMsg);
    } finally {
      setTranslating(false);
    }
  }, [translating]);

  const handleBreakdown = useCallback(async (msgId: number, content: string) => {
    if (analyzing) return;
    
    setAnalyzing(true);
    setAnalyzingMsgId(msgId);
    
    try {
      const result = await api.post("/translate/breakdown", { text: content });
      setBreakdowns(prev => ({
        ...prev,
        [msgId]: result.breakdown || { words: [], grammar: "" }
      }));
      setContextMenuMsg(null);
    } catch (err) {
      const errorMsg = err instanceof APIError ? err.message : "Gagal menganalisis pesan";
      Alert.alert("Analisis Gagal", errorMsg);
    } finally {
      setAnalyzing(false);
      setAnalyzingMsgId(null);
    }
  }, [analyzing]);

  const handleLesson = useCallback(async (msgId: number, content: string, lang: string) => {
    if (teaching) return;
    
    setTeaching(true);
    setLessonMsgId(msgId);
    setTeachingLang(lang);
    
    try {
      const result = await api.post("/translate/lesson", { text: content, targetLang: lang });
      setLessons(prev => ({
        ...prev,
        [msgId]: result.lesson || "Gagal membuat pelajaran."
      }));
      setShowLessonPicker(false);
      setContextMenuMsg(null);
    } catch (err) {
      const errorMsg = err instanceof APIError ? err.message : "Gagal membuat pelajaran";
      Alert.alert("Pelajaran Gagal", errorMsg);
    } finally {
      setTeaching(false);
      setLessonMsgId(null);
      setTeachingLang(null);
    }
  }, [teaching]);

  const handleTogglePin = useCallback(async () => {
    setMenuActionLoading(true);
    try {
      await api.post(`/conversations/${id}/pin`, {});
      queryClient.invalidateQueries({ queryKey: ["conversation-detail", id] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      setShowHeaderMenu(false);
    } catch {
      Alert.alert("Gagal", "Tidak dapat mengubah status pin.");
    } finally {
      setMenuActionLoading(false);
    }
  }, [id, queryClient]);

  const handleToggleMute = useCallback(async () => {
    setMenuActionLoading(true);
    try {
      await api.post(`/conversations/${id}/mute`, {});
      queryClient.invalidateQueries({ queryKey: ["conversation-detail", id] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      setShowHeaderMenu(false);
    } catch {
      Alert.alert("Gagal", "Tidak dapat mengubah status notifikasi.");
    } finally {
      setMenuActionLoading(false);
    }
  }, [id, queryClient]);

  const handleClearChat = useCallback(async () => {
    setMenuActionLoading(true);
    try {
      await api.post(`/conversations/${id}/clear`, {});
      queryClient.invalidateQueries({ queryKey: ["messages", id] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["conversation-detail", id] });
      setSearchQuery("");
      setSearchResults([]);
      setShowClearConfirm(false);
      setShowHeaderMenu(false);
    } catch {
      Alert.alert("Gagal", "Tidak dapat menghapus riwayat chat.");
    } finally {
      setMenuActionLoading(false);
    }
  }, [id, queryClient]);

  const sendMutation = useMutation({
    mutationFn: (payload: { content: string; replyToId?: number }) =>
      api.post(`/conversations/${id}/messages`, { content: payload.content, type: "text", replyToId: payload.replyToId }),
    onSuccess: (newMsg) => {
      // Remove optimistic message that matches this response (same content & sender)
      setOptimisticMessages(prev => 
        prev.filter(m => !(m.content === newMsg.content && m.senderId === newMsg.senderId && (m.id as any) < 0))
      );
      queryClient.invalidateQueries({ queryKey: ["messages", id] });
    },
    onError: (error, payload) => {
      // Remove optimistic message on error
      setOptimisticMessages(prev => 
        prev.filter(m => !(m.content === payload.content && (m.id as any) < 0))
      );
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

  const favoriteMutation = useMutation({
    mutationFn: (msgId: number) => api.post(`/conversations/${id}/messages/${msgId}/favorite`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["messages", id] }),
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

  const queuedForChat = offlineQueue.getQueuedForConversation(Number(id));
  const queuedAsMessages: Message[] = queuedForChat.map(q => ({
    id: q.id as any,
    senderId: user?.id || 0,
    content: q.content,
    type: q.type,
    isEdited: false,
    isDeleted: false,
    isPinned: false,
    createdAt: q.createdAt,
    sender: user ? { name: user.name, avatarUrl: user.avatarUrl, cicoStatus: null } : undefined,
    reactions: [],
    _queueStatus: q.status,
    _queueId: q.id,
  } as Message & { _queueStatus: string; _queueId: string }));
  
  // Deduplicate messages from multiple sources
  const seenIds = new Set<string | number>();
  const deduplicatedMessages: Message[] = [];
  
  for (const msg of [...(data?.messages || []), ...optimisticMessages, ...queuedAsMessages]) {
    const msgId = msg.id;
    if (!seenIds.has(msgId)) {
      seenIds.add(msgId);
      deduplicatedMessages.push(msg);
    }
  }
  
  const allMessages: Message[] = deduplicatedMessages;

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

  const scrollToMessage = useCallback((msgId: number) => {
    const reversed = [...displayItems].reverse();
    const idx = reversed.findIndex((item: any) => item.type !== "date_separator" && item.id === msgId);
    if (idx >= 0 && flatRef.current) {
      flatRef.current.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
      setHighlightedMsgId(msgId);
      setTimeout(() => setHighlightedMsgId(null), 2500);
    }
    setShowSearch(false);
    setSearchQuery("");
    setSearchResults([]);
  }, [displayItems]);

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

    const currentReply = replyToMessage;

    if (!offlineQueue.isOnline) {
      offlineQueue.enqueue({
        conversationId: Number(id),
        content: trimmed,
        type: "text",
        replyToId: currentReply?.id,
      });
      setReplyToMessage(null);
      return;
    }
    const optimisticMsg: Message = {
      id: Math.random() * -1,
      senderId: user?.id || 0,
      content: trimmed,
      type: "text",
      isEdited: false,
      isDeleted: false,
      isPinned: false,
      createdAt: new Date().toISOString(),
      sender: user ? { name: user.name, avatarUrl: user.avatarUrl, cicoStatus: null } : undefined,
      reactions: [],
      replyTo: currentReply || undefined,
    };
    
    setOptimisticMessages(prev => [...prev, optimisticMsg]);
    setReplyToMessage(null);
    sendMutation.mutate({ content: trimmed, replyToId: currentReply?.id });
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
    <>
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
          ) : type === "direct" && otherUserId ? (
            <View style={styles.presenceRow}>
              <View style={[styles.presenceDotSmall, { backgroundColor: presenceColor }]} />
              <Text style={[styles.presenceText, { color: isWhatsapp ? "rgba(255,255,255,0.7)" : colors.textSecondary }]}>
                {presenceLabel}
              </Text>
            </View>
          ) : null}
        </View>
        {!isWhatsapp && type === "direct" && otherUserId && (
          <>
            <Pressable
              style={styles.headerAction}
              hitSlop={8}
              onPress={() => {
                callCtx.initiateCall({
                  userId: otherUserId,
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
                  userId: otherUserId,
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
        <Pressable
          style={styles.headerAction}
          hitSlop={8}
          onPress={async () => {
            try {
              const token = user?.token || "";
              const domain = process.env.EXPO_PUBLIC_DOMAIN;
              const baseUrl = domain ? `https://${domain}` : "";
              const res = await fetch(`${baseUrl}/api/calls/group-call/${id}`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ callType: "video" }),
              });
              const data = await res.json();
              if (data.room) {
                router.push({
                  pathname: "/jitsi-call",
                  params: { roomName: data.room.roomName, callType: "video", conversationId: id as string },
                });
              }
            } catch (e) {
              Alert.alert("Error", "Gagal memulai group video call");
            }
          }}
        >
          <Feather name="users" size={20} color={colors.textSecondary} />
        </Pressable>
        {type === "group" && (
          <Pressable
            style={styles.headerAction}
            hitSlop={8}
            onPress={() => router.push({ pathname: "/group-info", params: { id } })}
          >
            <Feather name="info" size={20} color={colors.textSecondary} />
          </Pressable>
        )}
        <Pressable
          style={styles.headerAction}
          hitSlop={8}
          onPress={() => {
            setShowSearch(s => !s);
            if (!showSearch) setTimeout(() => searchInputRef.current?.focus(), 100);
            else { setSearchQuery(""); setSearchResults([]); }
          }}
        >
          <Feather name="search" size={20} color={showSearch ? colors.primary : (isWhatsapp ? "#fff" : colors.textSecondary)} />
        </Pressable>
        <Pressable
          style={styles.headerAction}
          hitSlop={8}
          onPress={handleSummarize}
          disabled={summarizing}
        >
          <Text style={{ fontSize: 18, opacity: summarizing ? 0.5 : 1 }}>✨</Text>
        </Pressable>
        <Pressable style={styles.headerAction} hitSlop={8} onPress={() => setShowHeaderMenu(true)}>
          <Feather name="more-vertical" size={22} color={isWhatsapp ? "#fff" : colors.textSecondary} />
        </Pressable>
      </View>

      {showSearch && (
        <View style={[styles.searchPanel, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <View style={[styles.searchInputRow, { backgroundColor: colors.surfaceSecondary }]}>
            <Feather name="search" size={15} color={colors.textSecondary} />
            <TextInput
              ref={searchInputRef}
              style={[styles.searchTextInput, { color: colors.text }]}
              placeholder="Cari pesan..."
              placeholderTextColor={colors.textSecondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={handleMessageSearch}
              returnKeyType="search"
              autoFocus
            />
            {searchLoading && <ActivityIndicator size="small" color={colors.primary} />}
            {!!searchQuery && !searchLoading && (
              <Pressable onPress={() => { setSearchQuery(""); setSearchResults([]); }}>
                <Feather name="x" size={16} color={colors.textSecondary} />
              </Pressable>
            )}
          </View>
          {searchResults.length > 0 && (
            <Text style={[styles.searchCount, { color: colors.textSecondary }]}>
              {searchResults.length} hasil ditemukan
            </Text>
          )}
          {searchResults.length > 0 && (
            <ScrollView style={styles.searchResultsScroll} keyboardShouldPersistTaps="handled">
              {searchResults.map((msg) => (
                <Pressable
                  key={msg.id}
                  style={({ pressed }) => [styles.searchResultItem, { backgroundColor: pressed ? colors.surfaceSecondary : "transparent" }]}
                  onPress={() => scrollToMessage(msg.id)}
                >
                  <View style={styles.searchResultHeader}>
                    <Text style={[styles.searchResultSender, { color: colors.primary }]} numberOfLines={1}>
                      {msg.sender?.name || "Unknown"}
                    </Text>
                    <Text style={[styles.searchResultTime, { color: colors.textSecondary }]}>
                      {format(new Date(msg.createdAt), "dd MMM HH:mm")}
                    </Text>
                  </View>
                  <Text style={[styles.searchResultContent, { color: colors.text }]} numberOfLines={2}>
                    {msg.content}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
          {!searchLoading && searchQuery && searchResults.length === 0 && (
            <Text style={[styles.searchNoResult, { color: colors.textSecondary }]}>
              Tidak ada hasil untuk "{searchQuery}"
            </Text>
          )}
        </View>
      )}

      {/* AI Summarization Panel */}
      <Modal visible={showSummaryPanel} transparent animationType="fade" onRequestClose={() => setShowSummaryPanel(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
          <View style={[styles.summaryPanel, { backgroundColor: colors.surface }]}>
            {/* Header */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: 12, borderBottomColor: colors.border, borderBottomWidth: 1 }}>
              <Text style={[styles.summaryPanelTitle, { color: colors.text }]}>✨ AI Ringkasan</Text>
              <Pressable onPress={() => setShowSummaryPanel(false)} hitSlop={8}>
                <Feather name="x" size={24} color={colors.textSecondary} />
              </Pressable>
            </View>

            {/* Message Count Selector */}
            {!summarizing && summaryData && (
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
                {[50, 100, 200].map(count => (
                  <Pressable
                    key={count}
                    style={[
                      styles.countButton,
                      {
                        backgroundColor: summaryMessageCount === count ? colors.primary : colors.surfaceSecondary,
                        borderColor: summaryMessageCount === count ? colors.primary : colors.border,
                        borderWidth: 1
                      }
                    ]}
                    onPress={() => setSummaryMessageCount(count)}
                  >
                    <Text style={[{ color: summaryMessageCount === count ? "#fff" : colors.text }]}>
                      {count} pesan
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}

            {/* Content */}
            <ScrollView style={{ flex: 1, marginBottom: 12 }} showsVerticalScrollIndicator={true}>
              {summarizing && (
                <View style={styles.summaryLoading}>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text style={[styles.summaryLoadingText, { color: colors.textSecondary, marginTop: 12 }]}>
                    Merangkum percakapan...
                  </Text>
                </View>
              )}

              {summaryError && (
                <View style={[styles.summaryError, { backgroundColor: colors.surfaceSecondary }]}>
                  <Feather name="alert-circle" size={20} color="#ef4444" />
                  <Text style={[styles.summaryErrorText, { color: colors.text, marginLeft: 8, flex: 1 }]}>
                    {summaryError}
                  </Text>
                </View>
              )}

              {summaryData && !summarizing && (
                <View>
                  {/* Summary */}
                  <View style={{ marginBottom: 16 }}>
                    <Text style={[styles.summarySubtitle, { color: colors.text }]}>📌 Ringkasan</Text>
                    <Text style={[styles.summaryContent, { color: colors.text }]}>
                      {summaryData.summary}
                    </Text>
                  </View>

                  {/* Key Points */}
                  {summaryData.keyPoints.length > 0 && (
                    <View style={{ marginBottom: 16 }}>
                      <Text style={[styles.summarySubtitle, { color: colors.text }]}>⭐ Poin Penting</Text>
                      {summaryData.keyPoints.map((point, idx) => (
                        <View key={idx} style={{ flexDirection: "row", marginBottom: 8 }}>
                          <Text style={[{ color: colors.textSecondary, marginRight: 8 }]}>•</Text>
                          <Text style={[styles.summaryBullet, { color: colors.text, flex: 1 }]}>
                            {point}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Action Items */}
                  {summaryData.actionItems.length > 0 && (
                    <View>
                      <Text style={[styles.summarySubtitle, { color: colors.text }]}>✅ Tindakan</Text>
                      {summaryData.actionItems.map((item, idx) => (
                        <View key={idx} style={{ flexDirection: "row", marginBottom: 8 }}>
                          <Text style={[{ color: colors.textSecondary, marginRight: 8 }]}>→</Text>
                          <Text style={[styles.summaryBullet, { color: colors.text, flex: 1 }]}>
                            {item}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}
            </ScrollView>

            {/* Footer */}
            <View style={{ flexDirection: "row", gap: 8, paddingTop: 12, borderTopColor: colors.border, borderTopWidth: 1 }}>
              <Pressable
                style={[styles.summaryButton, { flex: 1, backgroundColor: colors.surfaceSecondary }]}
                onPress={() => setShowSummaryPanel(false)}
              >
                <Text style={[{ color: colors.text, fontWeight: "600", textAlign: "center" }]}>Tutup</Text>
              </Pressable>
              {!summarizing && (
                <Pressable
                  style={[styles.summaryButton, { flex: 1, backgroundColor: colors.primary }]}
                  onPress={handleSummarize}
                >
                  <Text style={[{ color: "#fff", fontWeight: "600", textAlign: "center" }]}>Buat Ulang</Text>
                </Pressable>
              )}
            </View>
          </View>
        </View>
      </Modal>

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
          extraData={{ translations, breakdowns, lessons, highlightedMsgId, colors }}
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

            const qStatus = (item as any)._queueStatus as "pending" | "sending" | "failed" | undefined;
            const qId = (item as any)._queueId as string | undefined;

            return (
              <MessageBubble
                msg={item}
                isMine={isMine}
                colors={colors}
                showAvatar={showAvatar}
                queueStatus={qStatus}
                isHighlighted={highlightedMsgId === item.id}
                onLongPress={(m) => setContextMenuMsg(m)}
                onRetry={qId ? () => offlineQueue.retryMessage(qId) : undefined}
                onDiscard={qId ? () => offlineQueue.discardMessage(qId) : undefined}
                translation={translations[item.id]}
                breakdown={breakdowns[item.id]}
                lesson={lessons[item.id]}
              />
            );
          }}
          onLayout={() => flatRef.current?.scrollToOffset({ offset: 0, animated: false })}
          onScrollToIndexFailed={(info) => {
            setTimeout(() => {
              flatRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.5 });
            }, 300);
          }}
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

      {!offlineQueue.isOnline && (
        <View style={styles.offlineBanner}>
          <Feather name="wifi-off" size={14} color="#fff" />
          <Text style={styles.offlineBannerText}>
            Offline — pesan akan dikirim otomatis saat online
            {offlineQueue.queuedCount > 0 ? ` (${offlineQueue.queuedCount} antrian)` : ""}
          </Text>
        </View>
      )}

      {/* Reply bar */}
      {replyToMessage && (
        <View style={[styles.replyBarInput, { backgroundColor: colors.surfaceSecondary, borderLeftColor: colors.primary }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.replyBarName, { color: colors.primary }]} numberOfLines={1}>
              {replyToMessage.sender?.name || "Unknown"}
            </Text>
            <Text style={[styles.replyBarContent, { color: colors.textSecondary }]} numberOfLines={1}>
              {replyToMessage.content || ""}
            </Text>
          </View>
          <Pressable onPress={() => setReplyToMessage(null)} hitSlop={8}>
            <Feather name="x" size={18} color={colors.textSecondary} />
          </Pressable>
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

    {/* Context Menu Modal */}
    <Modal
      visible={!!contextMenuMsg}
      transparent
      animationType="fade"
      onRequestClose={() => setContextMenuMsg(null)}
    >
      <Pressable style={styles.contextOverlay} onPress={() => setContextMenuMsg(null)}>
        <View style={[styles.contextSheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 12 }]}>
          {contextMenuMsg && (
            <View style={[styles.contextPreview, { backgroundColor: colors.surfaceSecondary }]}>
              <Text style={[styles.contextPreviewSender, { color: colors.primary }]} numberOfLines={1}>
                {contextMenuMsg.sender?.name || "Unknown"}
              </Text>
              <Text style={[styles.contextPreviewText, { color: colors.text }]} numberOfLines={2}>
                {contextMenuMsg.content}
              </Text>
            </View>
          )}

          <Pressable
            style={styles.contextItem}
            onPress={() => {
              setReplyToMessage(contextMenuMsg);
              setContextMenuMsg(null);
            }}
          >
            <Feather name="corner-up-left" size={18} color={colors.text} />
            <Text style={[styles.contextItemText, { color: colors.text }]}>Balas</Text>
          </Pressable>

          <Pressable
            style={styles.contextItem}
            onPress={async () => {
              if (contextMenuMsg?.content) {
                await Clipboard.setStringAsync(contextMenuMsg.content);
              }
              setContextMenuMsg(null);
            }}
          >
            <Feather name="copy" size={18} color={colors.text} />
            <Text style={[styles.contextItemText, { color: colors.text }]}>Salin</Text>
          </Pressable>

          <Pressable
            style={styles.contextItem}
            onPress={() => {
              if (contextMenuMsg) pinMutation.mutate(contextMenuMsg.id);
              setContextMenuMsg(null);
            }}
          >
            <Feather name="bookmark" size={18} color={contextMenuMsg?.isPinned ? "#f59e0b" : colors.text} />
            <Text style={[styles.contextItemText, { color: colors.text }]}>
              {contextMenuMsg?.isPinned ? "Lepas Pin" : "Pin"}
            </Text>
          </Pressable>

          <Pressable
            style={styles.contextItem}
            onPress={() => {
              if (contextMenuMsg) favoriteMutation.mutate(contextMenuMsg.id);
              setContextMenuMsg(null);
            }}
          >
            <Feather name="heart" size={18} color={contextMenuMsg?.isFavorited ? "#ef4444" : colors.text} />
            <Text style={[styles.contextItemText, { color: colors.text }]}>
              {contextMenuMsg?.isFavorited ? "Hapus Favorit" : "Favorit"}
            </Text>
          </Pressable>

          <Pressable
            style={styles.contextItem}
            onPress={() => {
              if (contextMenuMsg) {
                setTranslatingMsgId(contextMenuMsg.id);
                setShowLanguagePicker(true);
              }
            }}
          >
            <Feather name="globe" size={18} color={colors.text} />
            <Text style={[styles.contextItemText, { color: colors.text }]}>Terjemahkan</Text>
          </Pressable>

          <Pressable
            style={styles.contextItem}
            onPress={() => {
              if (contextMenuMsg) {
                handleBreakdown(contextMenuMsg.id, contextMenuMsg.content || "");
              }
            }}
            disabled={analyzing}
          >
            <Feather name="book-open" size={18} color={colors.text} />
            <Text style={[styles.contextItemText, { color: colors.text }]}>
              {analyzing && analyzingMsgId === contextMenuMsg?.id ? "Menganalisis..." : "Analisis Kata"}
            </Text>
          </Pressable>

          <Pressable
            style={styles.contextItem}
            onPress={() => {
              if (contextMenuMsg) {
                setLessonMsgId(contextMenuMsg.id);
                setShowLessonPicker(true);
              }
            }}
          >
            <Feather name="award" size={18} color={colors.text} />
            <Text style={[styles.contextItemText, { color: colors.text }]}>Pelajaran Mini</Text>
          </Pressable>

          {contextMenuMsg?.senderId === user?.id && (
            <>
              <View style={[styles.contextSeparator, { backgroundColor: colors.border }]} />
              <Pressable
                style={styles.contextItem}
                onPress={() => {
                  if (contextMenuMsg) {
                    setEditingMsgId(contextMenuMsg.id);
                    setEditText(contextMenuMsg.content || "");
                  }
                  setContextMenuMsg(null);
                }}
              >
                <Feather name="edit-2" size={18} color={colors.primary} />
                <Text style={[styles.contextItemText, { color: colors.primary }]}>Edit</Text>
              </Pressable>

              <Pressable
                style={styles.contextItem}
                onPress={() => {
                  Alert.alert("Hapus Pesan", "Yakin ingin menghapus pesan ini?", [
                    { text: "Batal", style: "cancel" },
                    {
                      text: "Hapus",
                      style: "destructive",
                      onPress: () => {
                        if (contextMenuMsg) deleteMutation.mutate(contextMenuMsg.id);
                        setContextMenuMsg(null);
                      },
                    },
                  ]);
                }}
              >
                <Feather name="trash-2" size={18} color="#ef4444" />
                <Text style={[styles.contextItemText, { color: "#ef4444" }]}>Hapus</Text>
              </Pressable>
            </>
          )}
        </View>
      </Pressable>
    </Modal>

    {/* Language Picker Modal */}
    <Modal
      visible={showLanguagePicker}
      transparent
      animationType="fade"
      onRequestClose={() => {
        setShowLanguagePicker(false);
        setContextMenuMsg(null);
      }}
    >
      <Pressable
        style={styles.contextOverlay}
        onPress={() => {
          setShowLanguagePicker(false);
          setContextMenuMsg(null);
        }}
      >
        <View style={[styles.contextSheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 12 }]}>
          <Text style={[styles.contextPreviewSender, { color: colors.primary, paddingHorizontal: 16, paddingTop: 12, marginBottom: 8 }]}>
            Pilih Bahasa Target
          </Text>

          {translating ? (
            <View style={{ paddingVertical: 20, alignItems: "center" }}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.contextItemText, { color: colors.tabIconDefault, marginTop: 8 }]}>
                Menerjemahkan...
              </Text>
            </View>
          ) : (
            QUICK_LANGUAGES.map(lang => (
              <Pressable
                key={lang.code}
                style={styles.contextItem}
                onPress={() => {
                  if (contextMenuMsg) {
                    handleTranslate(contextMenuMsg.id, contextMenuMsg.content || "", lang.code);
                  }
                }}
              >
                <Text style={[styles.contextItemText, { color: colors.text }]}>
                  {lang.name}
                </Text>
              </Pressable>
            ))
          )}
        </View>
      </Pressable>
    </Modal>

    {/* Lesson Picker Modal */}
    <Modal
      visible={showLessonPicker}
      transparent
      animationType="fade"
      onRequestClose={() => {
        setShowLessonPicker(false);
        setContextMenuMsg(null);
      }}
    >
      <Pressable
        style={styles.contextOverlay}
        onPress={() => {
          setShowLessonPicker(false);
          setContextMenuMsg(null);
        }}
      >
        <View style={[styles.contextSheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 12 }]}>
          <Text style={[styles.contextPreviewSender, { color: colors.primary, paddingHorizontal: 16, paddingTop: 12, marginBottom: 8 }]}>
            Pilih Bahasa Pelajaran
          </Text>

          {teaching ? (
            <View style={{ paddingVertical: 20, alignItems: "center" }}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.contextItemText, { color: colors.tabIconDefault, marginTop: 8 }]}>
                Membuat pelajaran...
              </Text>
            </View>
          ) : (
            QUICK_LANGUAGES.map(lang => (
              <Pressable
                key={lang.code}
                style={styles.contextItem}
                onPress={() => {
                  if (contextMenuMsg && lessonMsgId) {
                    handleLesson(lessonMsgId, contextMenuMsg.content || "", lang.code);
                  }
                }}
              >
                <Text style={[styles.contextItemText, { color: colors.text }]}>
                  {lang.name}
                </Text>
              </Pressable>
            ))
          )}
        </View>
      </Pressable>
    </Modal>

    {/* Header Menu Modal */}
    <Modal
      visible={showHeaderMenu}
      transparent
      animationType="fade"
      onRequestClose={() => setShowHeaderMenu(false)}
    >
      <Pressable
        style={styles.contextOverlay}
        onPress={() => setShowHeaderMenu(false)}
      >
        <View style={[styles.contextSheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 12 }]}>
          <Pressable
            style={styles.contextItem}
            onPress={() => { setShowHeaderMenu(false); setShowConvInfo(true); }}
          >
            <Feather name="info" size={18} color={colors.text} />
            <Text selectable={false} style={[styles.contextItemText, { color: colors.text }]}>
              Lihat Info
            </Text>
          </Pressable>

          <Pressable
            style={styles.contextItem}
            onPress={handleToggleMute}
            disabled={menuActionLoading}
          >
            <Feather name={convDetail?.isMuted ? "bell" : "bell-off"} size={18} color={colors.text} />
            <Text selectable={false} style={[styles.contextItemText, { color: colors.text }]}>
              {convDetail?.isMuted ? "Aktifkan Notifikasi" : "Bisukan Notifikasi"}
            </Text>
          </Pressable>

          <Pressable
            style={styles.contextItem}
            onPress={() => {
              setShowHeaderMenu(false);
              setShowSearch(true);
              setTimeout(() => searchInputRef.current?.focus(), 100);
            }}
          >
            <Feather name="search" size={18} color={colors.text} />
            <Text selectable={false} style={[styles.contextItemText, { color: colors.text }]}>
              Cari di Chat
            </Text>
          </Pressable>

          <Pressable
            style={styles.contextItem}
            onPress={handleTogglePin}
            disabled={menuActionLoading}
          >
            <Feather name="bookmark" size={18} color={convDetail?.isPinned ? "#f59e0b" : colors.text} />
            <Text selectable={false} style={[styles.contextItemText, { color: colors.text }]}>
              {convDetail?.isPinned ? "Lepas Pin Chat" : "Pin Chat"}
            </Text>
          </Pressable>

          <Pressable
            style={styles.contextItem}
            onPress={() => { setShowHeaderMenu(false); setShowClearConfirm(true); }}
          >
            <Feather name="trash-2" size={18} color="#ef4444" />
            <Text selectable={false} style={[styles.contextItemText, { color: "#ef4444" }]}>
              Hapus Riwayat Chat
            </Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>

    {/* Conversation Info Modal */}
    <Modal
      visible={showConvInfo}
      transparent
      animationType="slide"
      onRequestClose={() => setShowConvInfo(false)}
    >
      <View style={[styles.infoModalContainer, { backgroundColor: colors.background }]}>
        <View style={[styles.infoModalHeader, { backgroundColor: colors.surface, borderBottomColor: colors.border, paddingTop: insets.top + 8 }]}>
          <Pressable style={styles.backBtn} onPress={() => setShowConvInfo(false)}>
            <Feather name="x" size={22} color={colors.text} />
          </Pressable>
          <Text selectable={false} style={[styles.headerName, { color: colors.text, flex: 1 }]}>
            Info {type === "group" ? "Grup" : type === "direct" ? "Kontak" : "Chat"}
          </Text>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
          <View style={[styles.infoCard, { backgroundColor: colors.surface }]}>
            <View style={styles.infoAvatarRow}>
              <View style={[styles.infoAvatarCircle, { backgroundColor: colors.primary }]}>
                <Feather name={type === "group" ? "users" : "user"} size={32} color="#fff" />
              </View>
              <View style={{ flex: 1, marginLeft: 16 }}>
                <Text selectable={false} style={[styles.infoName, { color: colors.text }]}>
                  {convDetail?.name || name || "Chat"}
                </Text>
                <Text selectable={false} style={[styles.infoSub, { color: colors.textSecondary }]}>
                  {type === "group" ? `${convDetail?.members?.length || 0} anggota` : type === "whatsapp" ? "WhatsApp" : "Percakapan langsung"}
                </Text>
              </View>
            </View>

            {convDetail?.description && (
              <View style={[styles.infoSection, { borderTopColor: colors.border }]}>
                <Text selectable={false} style={[styles.infoSectionTitle, { color: colors.textSecondary }]}>Deskripsi</Text>
                <Text selectable={false} style={[styles.infoSectionValue, { color: colors.text }]}>{convDetail.description}</Text>
              </View>
            )}

            <View style={[styles.infoSection, { borderTopColor: colors.border }]}>
              <Text selectable={false} style={[styles.infoSectionTitle, { color: colors.textSecondary }]}>Status</Text>
              <View style={styles.infoStatusRow}>
                <Feather name={convDetail?.isPinned ? "bookmark" : "bookmark"} size={14} color={convDetail?.isPinned ? "#f59e0b" : colors.textSecondary} />
                <Text selectable={false} style={[styles.infoStatusText, { color: colors.text }]}>
                  {convDetail?.isPinned ? "Di-pin" : "Tidak di-pin"}
                </Text>
              </View>
              <View style={styles.infoStatusRow}>
                <Feather name={convDetail?.isMuted ? "bell-off" : "bell"} size={14} color={convDetail?.isMuted ? "#ef4444" : colors.textSecondary} />
                <Text selectable={false} style={[styles.infoStatusText, { color: colors.text }]}>
                  {convDetail?.isMuted ? "Dibisukan" : "Notifikasi aktif"}
                </Text>
              </View>
            </View>

            <View style={[styles.infoSection, { borderTopColor: colors.border }]}>
              <Text selectable={false} style={[styles.infoSectionTitle, { color: colors.textSecondary }]}>Dibuat pada</Text>
              <Text selectable={false} style={[styles.infoSectionValue, { color: colors.text }]}>
                {convDetail?.createdAt ? new Date(convDetail.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : "-"}
              </Text>
            </View>
          </View>

          {convDetail?.members && convDetail.members.length > 0 && (
            <View style={[styles.infoCard, { backgroundColor: colors.surface, marginTop: 12 }]}>
              <Text selectable={false} style={[styles.infoSectionTitle, { color: colors.textSecondary, padding: 16, paddingBottom: 8 }]}>
                Anggota ({convDetail.members.length})
              </Text>
              {convDetail.members.map((m: any) => (
                <View key={m.userId} style={styles.infoMemberRow}>
                  <UserAvatar name={m.user?.name || "?"} size={36} avatarUrl={m.user?.avatarUrl} />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text selectable={false} style={[styles.infoMemberName, { color: colors.text }]}>
                      {m.user?.name || `User #${m.userId}`}
                      {m.userId === user?.id ? " (Anda)" : ""}
                    </Text>
                    <Text selectable={false} style={[styles.infoMemberRole, { color: colors.textSecondary }]}>
                      {m.role === "admin" ? "Admin" : "Anggota"}
                    </Text>
                  </View>
                  {m.role === "admin" && (
                    <View style={[styles.adminBadge, { backgroundColor: colors.primary + "20" }]}>
                      <Text selectable={false} style={[styles.adminBadgeText, { color: colors.primary }]}>Admin</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>

    {/* Clear Chat Confirmation Modal */}
    <Modal
      visible={showClearConfirm}
      transparent
      animationType="fade"
      onRequestClose={() => setShowClearConfirm(false)}
    >
      <Pressable
        style={[styles.contextOverlay, { justifyContent: "center" }]}
        onPress={() => setShowClearConfirm(false)}
      >
        <View style={[styles.clearConfirmBox, { backgroundColor: colors.surface }]}>
          <Feather name="alert-triangle" size={32} color="#f59e0b" style={{ alignSelf: "center", marginBottom: 12 }} />
          <Text selectable={false} style={[styles.clearConfirmTitle, { color: colors.text }]}>
            Hapus Riwayat Chat?
          </Text>
          <Text selectable={false} style={[styles.clearConfirmDesc, { color: colors.textSecondary }]}>
            Semua pesan di chat ini akan dihapus dari tampilan Anda. Pesan tetap tersimpan untuk anggota lain.
          </Text>
          <View style={styles.clearConfirmButtons}>
            <Pressable
              style={[styles.clearConfirmBtn, { backgroundColor: colors.surfaceSecondary }]}
              onPress={() => setShowClearConfirm(false)}
            >
              <Text selectable={false} style={[styles.clearConfirmBtnText, { color: colors.text }]}>Batal</Text>
            </Pressable>
            <Pressable
              style={[styles.clearConfirmBtn, { backgroundColor: "#ef4444" }]}
              onPress={handleClearChat}
              disabled={menuActionLoading}
            >
              {menuActionLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text selectable={false} style={[styles.clearConfirmBtnText, { color: "#fff" }]}>Hapus</Text>
              )}
            </Pressable>
          </View>
        </View>
      </Pressable>
    </Modal>
    </>
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
  translationBox: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginTop: 4 },
  translationLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", marginBottom: 4 },
  translationText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  breakdownBox: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginTop: 4 },
  breakdownLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", marginBottom: 8 },
  wordGrid: { gap: 6 },
  wordBox: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 6, borderLeftWidth: 3, borderLeftColor: "#22c55e" },
  wordMain: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  wordPronunciation: { fontSize: 11, fontFamily: "Inter_400Regular", fontStyle: "italic", marginBottom: 2 },
  wordMeaning: { fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 1 },
  wordPos: { fontSize: 10, fontFamily: "Inter_500Medium" },
  grammarLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold", marginBottom: 4 },
  grammarText: { fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 16 },
  lessonBox: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginTop: 4 },
  lessonLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", marginBottom: 6 },
  lessonText: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 },
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
  readCheck: { fontSize: 10, fontFamily: "Inter_700Bold", marginLeft: 2 },
  highlightedBubble: { backgroundColor: "rgba(59, 130, 246, 0.15)", borderRadius: 12, marginHorizontal: -4, paddingHorizontal: 4 },
  searchPanel: { paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 0.5, maxHeight: 300 },
  searchInputRow: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  searchTextInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", paddingVertical: 0 },
  searchCount: { fontSize: 11, fontFamily: "Inter_500Medium", marginTop: 6, marginLeft: 4 },
  searchResultsScroll: { maxHeight: 200, marginTop: 6 },
  searchResultItem: { paddingVertical: 8, paddingHorizontal: 8, borderRadius: 8 },
  searchResultHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  searchResultSender: { fontSize: 12, fontFamily: "Inter_600SemiBold", flex: 1 },
  searchResultTime: { fontSize: 10, fontFamily: "Inter_400Regular" },
  searchResultContent: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  searchNoResult: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", paddingVertical: 16 },
  presenceRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 1 },
  presenceDotSmall: { width: 7, height: 7, borderRadius: 3.5 },
  presenceText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  contextOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  contextSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 12, paddingHorizontal: 8 },
  contextPreview: { marginHorizontal: 8, marginBottom: 8, padding: 10, borderRadius: 10 },
  contextPreviewSender: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  contextPreviewText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  contextItem: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 10 },
  contextItemText: { fontSize: 15, fontFamily: "Inter_500Medium" },
  contextSeparator: { height: 0.5, marginHorizontal: 16, marginVertical: 2 },
  replyBarInput: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 8, borderLeftWidth: 3, marginHorizontal: 8, marginBottom: 2, borderRadius: 6 },
  replyBarName: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  replyBarContent: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 1 },
  offlineBanner: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, paddingHorizontal: 16, backgroundColor: "#6b7280" },
  offlineBannerText: { color: "#fff", fontSize: 12, fontFamily: "Inter_500Medium", flex: 1 },
  queueFailedActions: { flexDirection: "row", gap: 12, marginTop: 4, paddingTop: 4, borderTopWidth: 0.5, borderTopColor: "rgba(0,0,0,0.1)" },
  queueActionBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  queueActionText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  linkPreviewCard: { flexDirection: "row", borderRadius: 10, overflow: "hidden", marginTop: 6, borderWidth: 0.5 },
  linkPreviewImage: { width: 72, height: 72 },
  linkPreviewBody: { flex: 1, padding: 8, gap: 2, justifyContent: "center" },
  linkPreviewTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  linkPreviewDesc: { fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 15 },
  linkPreviewDomain: { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 2 },
  
  // Summary Panel Styles
  summaryPanel: { maxHeight: "90%", borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16, paddingVertical: 16 },
  summaryPanelTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  countButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  summaryLoading: { alignItems: "center", justifyContent: "center", paddingVertical: 40 },
  summaryLoadingText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  summaryError: { borderRadius: 10, padding: 12, flexDirection: "row", alignItems: "center", marginBottom: 12 },
  summaryErrorText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  summaryContent: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 21 },
  summarySubtitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 8 },
  summaryBullet: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  summaryButton: { paddingVertical: 12, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  infoModalContainer: { flex: 1 },
  infoModalHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingBottom: 12, borderBottomWidth: 0.5 },
  infoCard: { borderRadius: 12, overflow: "hidden" },
  infoAvatarRow: { flexDirection: "row", alignItems: "center", padding: 16 },
  infoAvatarCircle: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  infoName: { fontSize: 18, fontFamily: "Inter_600SemiBold" },
  infoSub: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  infoSection: { paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 0.5 },
  infoSectionTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 },
  infoSectionValue: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  infoStatusRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  infoStatusText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  infoMemberRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10 },
  infoMemberName: { fontSize: 14, fontFamily: "Inter_500Medium" },
  infoMemberRole: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  adminBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  adminBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  clearConfirmBox: { borderRadius: 16, padding: 24, marginHorizontal: 32, alignSelf: "center", width: "85%", maxWidth: 360 },
  clearConfirmTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", textAlign: "center", marginBottom: 8 },
  clearConfirmDesc: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 19, marginBottom: 20 },
  clearConfirmButtons: { flexDirection: "row", gap: 12 },
  clearConfirmBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  clearConfirmBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
