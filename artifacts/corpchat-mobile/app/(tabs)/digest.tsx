import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  useColorScheme,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { UserAvatar } from "@/components/UserAvatar";

type DigestPeriod = "daily" | "weekly";

interface DigestData {
  digest: string;
  period: "daily" | "weekly";
  since: string;
  conversations: Array<{
    conversationId: string;
    name: string;
    messageCount: number;
    preview?: string;
  }>;
}

export default function DigestScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme === "dark" ? "dark" : "light"];
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [period, setPeriod] = useState<DigestPeriod>("daily");
  const [showSummary, setShowSummary] = useState(true);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["digest", period],
    queryFn: async () => {
      if (!user?.id) throw new Error("Not authenticated");
      const res = await api.post("/summarize/digest", { period });
      return res.data as DigestData;
    },
    enabled: !!user?.id,
  });

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const handlePeriodChange = (newPeriod: DigestPeriod) => {
    setPeriod(newPeriod);
  };

  const periodLabel = period === "daily" ? "Harian" : "Mingguan";

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          { backgroundColor: colors.surface, paddingTop: insets.top },
        ]}
      >
        <View style={styles.headerTitleRow}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            📊 Ringkasan {periodLabel}
          </Text>
        </View>

        {/* Period Toggle */}
        <View style={styles.periodToggle}>
          <Pressable
            onPress={() => handlePeriodChange("daily")}
            style={[
              styles.periodButton,
              period === "daily" && {
                backgroundColor: colors.primary,
              },
            ]}
          >
            <Text
              style={[
                styles.periodButtonText,
                period === "daily" && { color: "#fff" },
                period !== "daily" && { color: colors.text },
              ]}
            >
              Harian
            </Text>
          </Pressable>

          <Pressable
            onPress={() => handlePeriodChange("weekly")}
            style={[
              styles.periodButton,
              period === "weekly" && {
                backgroundColor: colors.primary,
              },
            ]}
          >
            <Text
              style={[
                styles.periodButtonText,
                period === "weekly" && { color: "#fff" },
                period !== "weekly" && { color: colors.text },
              ]}
            >
              Mingguan
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.tabIconDefault }]}>
            Memproses ringkasan...
          </Text>
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <Feather name="alert-circle" size={48} color={colors.error} />
          <Text style={[styles.errorText, { color: colors.error }]}>
            {error instanceof Error ? error.message : "Gagal memuat ringkasan"}
          </Text>
          <Pressable
            onPress={handleRefresh}
            style={[styles.retryButton, { backgroundColor: colors.primary }]}
          >
            <Text style={styles.retryButtonText}>Coba Lagi</Text>
          </Pressable>
        </View>
      ) : !data || data.conversations.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Feather name="inbox" size={48} color={colors.tabIconDefault} />
          <Text style={[styles.emptyText, { color: colors.tabIconDefault }]}>
            Belum ada percakapan
          </Text>
        </View>
      ) : (
        <FlatList
          data={data.conversations}
          keyExtractor={(item) => item.conversationId}
          renderItem={({ item }) => (
            <ConversationDigestItem conversation={item} colors={colors} />
          )}
          ListHeaderComponent={
            <View style={styles.summarySection}>
              {/* Summary Header Toggle */}
              <Pressable
                onPress={() => setShowSummary(!showSummary)}
                style={[
                  styles.summaryHeader,
                  {
                    backgroundColor: colors.surface,
                    borderBottomColor: colors.border,
                  },
                ]}
              >
                <View style={styles.summaryHeaderLeft}>
                  <Text style={[styles.summaryTitle, { color: colors.text }]}>
                    📌 Ringkasan AI
                  </Text>
                </View>
                <Feather
                  name={showSummary ? "chevron-down" : "chevron-right"}
                  size={20}
                  color={colors.text}
                />
              </Pressable>

              {/* Summary Content */}
              {showSummary && (
                <>
                  <View
                    style={[
                      styles.summaryContent,
                      { backgroundColor: colors.surface },
                    ]}
                  >
                    <Text
                      style={[styles.summaryText, { color: colors.text }]}
                    >
                      {data.digest}
                    </Text>
                  </View>

                  {/* Divider */}
                  <View
                    style={[
                      styles.divider,
                      { backgroundColor: colors.border },
                    ]}
                  />

                  {/* Conversations Header */}
                  <Text
                    style={[
                      styles.conversationsTitle,
                      { color: colors.text },
                    ]}
                  >
                    💬 Percakapan Aktif
                  </Text>
                </>
              )}
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={isFetching}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
            />
          }
          contentContainerStyle={{ paddingBottom: 100 }}
        />
      )}
    </View>
  );
}

interface ConversationDigestItemProps {
  conversation: DigestData["conversations"][0];
  colors: typeof Colors.light;
}

function ConversationDigestItem({
  conversation,
  colors,
}: ConversationDigestItemProps) {
  return (
    <View
      style={[
        styles.conversationItem,
        {
          backgroundColor: colors.surface,
          borderBottomColor: colors.border,
        },
      ]}
    >
      <View style={styles.conversationLeft}>
        <UserAvatar name={conversation.name} size={44} />
      </View>

      <View style={styles.conversationMiddle}>
        <Text style={[styles.conversationName, { color: colors.text }]}>
          {conversation.name}
        </Text>
        {conversation.preview && (
          <Text
            style={[
              styles.conversationLastMsg,
              { color: colors.tabIconDefault },
            ]}
            numberOfLines={1}
          >
            {conversation.preview}
          </Text>
        )}
      </View>

      <View style={styles.conversationRight}>
        <Text style={[styles.messageCount, { color: colors.primary }]}>
          {conversation.messageCount}
        </Text>
        <Text style={[styles.messageLabel, { color: colors.tabIconDefault }]}>
          pesan
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    borderBottomWidth: 1,
  },
  headerTitleRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  periodToggle: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  periodButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    alignItems: "center",
  },
  periodButtonText: {
    fontSize: 14,
    fontWeight: "500",
  },
  loaderContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  errorText: {
    fontSize: 14,
    marginTop: 12,
    textAlign: "center",
  },
  retryButton: {
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  retryButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    fontSize: 14,
    marginTop: 8,
  },
  summarySection: {
    paddingVertical: 12,
  },
  summaryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  summaryHeaderLeft: {
    flex: 1,
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  summaryContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  summaryText: {
    fontSize: 14,
    lineHeight: 20,
  },
  divider: {
    height: 1,
    marginVertical: 12,
  },
  conversationsTitle: {
    fontSize: 14,
    fontWeight: "600",
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  conversationItem: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: "center",
    borderBottomWidth: 1,
  },
  conversationLeft: {
    marginRight: 12,
  },
  conversationMiddle: {
    flex: 1,
  },
  conversationName: {
    fontSize: 14,
    fontWeight: "500",
  },
  conversationLastMsg: {
    fontSize: 12,
    marginTop: 2,
  },
  conversationRight: {
    alignItems: "flex-end",
  },
  messageCount: {
    fontSize: 14,
    fontWeight: "600",
  },
  messageLabel: {
    fontSize: 11,
    marginTop: 2,
  },
});
