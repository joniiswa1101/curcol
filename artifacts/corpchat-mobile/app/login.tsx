import React, { useState } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet,
  useColorScheme, ActivityIndicator, KeyboardAvoidingView, Platform, Alert,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";

export default function LoginScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme === "dark" ? "dark" : "light"];
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const [employeeId, setEmployeeId] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!employeeId.trim() || !password.trim()) {
      Alert.alert("Perhatian", "Isi Employee ID dan Password");
      return;
    }
    setLoading(true);
    try {
      await login(employeeId.trim(), password);
      router.replace("/(tabs)");
    } catch (e: any) {
      Alert.alert("Login Gagal", e.message || "Cek kembali kredensial Anda");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={[styles.root, { backgroundColor: colors.background }]}
    >
      <View style={[styles.container, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}>
        {/* Logo */}
        <View style={styles.logoRow}>
          <View style={[styles.logoBox, { backgroundColor: colors.primary }]}>
            <Feather name="message-square" size={28} color="#fff" />
          </View>
          <Text style={[styles.appName, { color: colors.text }]}>CorpChat</Text>
        </View>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Platform komunikasi resmi karyawan
        </Text>

        <View style={styles.form}>
          {/* Employee ID */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Employee ID</Text>
            <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Feather name="user" size={16} color={colors.textSecondary} />
              <TextInput
                style={[styles.input, { color: colors.text }]}
                placeholder="Contoh: EMP001"
                placeholderTextColor={colors.textSecondary}
                value={employeeId}
                onChangeText={setEmployeeId}
                autoCapitalize="characters"
                autoCorrect={false}
              />
            </View>
          </View>

          {/* Password */}
          <View style={styles.fieldGroup}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Password</Text>
            <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Feather name="lock" size={16} color={colors.textSecondary} />
              <TextInput
                style={[styles.input, { color: colors.text }]}
                placeholder="Password"
                placeholderTextColor={colors.textSecondary}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPass}
              />
              <Pressable onPress={() => setShowPass(!showPass)} hitSlop={8}>
                <Feather name={showPass ? "eye-off" : "eye"} size={16} color={colors.textSecondary} />
              </Pressable>
            </View>
          </View>

          <Pressable
            onPress={handleLogin}
            disabled={loading}
            style={({ pressed }) => [
              styles.btn,
              { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.btnText}>Masuk</Text>
            )}
          </Pressable>
        </View>

        <View style={styles.footer}>
          <Feather name="shield" size={12} color={colors.textSecondary} />
          <Text style={[styles.footerText, { color: colors.textSecondary }]}>
            Koneksi terenkripsi & teraudit
          </Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: { flex: 1, paddingHorizontal: 28, justifyContent: "center", gap: 8 },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 4 },
  logoBox: { width: 52, height: 52, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  appName: { fontSize: 28, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", marginBottom: 32 },
  form: { gap: 16 },
  fieldGroup: { gap: 6 },
  label: { fontSize: 13, fontFamily: "Inter_500Medium" },
  inputWrap: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14,
  },
  input: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  btn: {
    borderRadius: 12, paddingVertical: 15, alignItems: "center", justifyContent: "center",
    marginTop: 8,
  },
  btnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  footer: { flexDirection: "row", alignItems: "center", gap: 6, justifyContent: "center", marginTop: 32 },
  footerText: { fontSize: 12, fontFamily: "Inter_400Regular" },
});
