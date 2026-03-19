import React, { useState } from "react";
import {
  View, Text, ScrollView, Pressable, StyleSheet, Modal, SafeAreaView,
  useColorScheme, Dimensions
} from "react-native";
import { Feather } from "@expo/vector-icons";
import Colors from "@/constants/colors";

const EMOJI_CATEGORIES = [
  {
    label: "Smileys",
    icon: "smile",
    emojis: [
      "😀", "😂", "😍", "😎", "😭", "😤", "😱", "🥳",
      "😴", "🤔", "😅", "😇", "🥺", "😏", "😒", "😬",
      "🤗", "🤩", "🥰", "😋", "😜", "🤣", "😔", "😢",
    ]
  },
  {
    label: "Gestures",
    icon: "thumbs-up",
    emojis: [
      "👍", "👎", "👌", "✌️", "🤞", "🙏", "🤝", "👏",
      "🤙", "💪", "👋", "✋", "🖐️", "☝️", "👆", "👇",
      "👉", "👈", "🤜", "🤛", "👊", "✊", "🤚", "🖖"
    ]
  },
  {
    label: "Objects",
    icon: "heart",
    emojis: [
      "❤️", "🔥", "⭐", "💯", "✅", "❌", "⚡", "🎉",
      "🎊", "🎯", "💡", "📌", "🔔", "💬", "📎", "🗂️",
      "📁", "💼", "⏰", "📱", "💻", "🖥️", "📷", "🎵"
    ]
  },
  {
    label: "Nature",
    icon: "sun",
    emojis: [
      "🌞", "🌙", "🌈", "🌊", "🌸", "🌺", "🌻", "🍀",
      "🌿", "🌱", "🍁", "❄️", "⛅", "🌤️", "🐶", "🐱",
      "🐻", "🦁", "🐯", "🦊", "🐺", "🦋", "🐝", "🌾"
    ]
  }
];

interface EmojiPickerProps {
  visible: boolean;
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

export function EmojiPicker({ visible, onSelect, onClose }: EmojiPickerProps) {
  const [activeTab, setActiveTab] = useState(0);
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme === "dark" ? "dark" : "light"];
  const currentEmojis = EMOJI_CATEGORIES[activeTab].emojis;

  const itemsPerRow = 7;
  const screenWidth = Dimensions.get("window").width;
  const itemSize = (screenWidth - 40) / itemsPerRow;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.text }]}>Pilih Emoji</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Feather name="x" size={24} color={colors.text} />
          </Pressable>
        </View>

        {/* Category Tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={[styles.tabsContainer, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}
        >
          {EMOJI_CATEGORIES.map((cat, i) => (
            <Pressable
              key={i}
              onPress={() => setActiveTab(i)}
              style={[
                styles.tab,
                activeTab === i && { borderBottomWidth: 3, borderBottomColor: colors.primary }
              ]}
            >
              <Feather
                name={cat.icon as any}
                size={20}
                color={activeTab === i ? colors.primary : colors.textSecondary}
              />
            </Pressable>
          ))}
        </ScrollView>

        {/* Emoji Grid */}
        <ScrollView
          contentContainerStyle={styles.emojiGrid}
          showsVerticalScrollIndicator={false}
        >
          {currentEmojis.map((emoji, i) => (
            <Pressable
              key={i}
              onPress={() => {
                onSelect(emoji);
                onClose();
              }}
              style={[styles.emojiBtn, { width: itemSize, height: itemSize }]}
            >
              <Text style={styles.emojiText}>{emoji}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  title: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
  },
  tabsContainer: {
    borderBottomWidth: 0.5,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0,
  },
  emojiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 6,
    paddingVertical: 12,
  },
  emojiBtn: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  emojiText: {
    fontSize: 28,
  },
});
