import React, { useState } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet, Image,
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
  const { login, loginViaCICO } = useAuth();
  const [mode, setMode] = useState<"cico" | "local">("cico"); // CICO is primary
  const [cicoUsername, setCICOUsername] = useState("");
  const [cicoPassword, setCICOPassword] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [showCICOPass, setShowCICOPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const showError = (message: string) => {
    setError(message);
    setTimeout(() => setError(""), 5000);
  };

  async function handleLocalLogin() {
    if (!employeeId.trim() || !password.trim()) {
      showError("Isi Employee ID / Email dan Password");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await login(employeeId.trim(), password);
      router.replace("/(tabs)");
    } catch (e: any) {
      showError(e.message || "Cek kembali kredensial Anda");
    } finally {
      setLoading(false);
    }
  }

  async function handleCICOLogin() {
    if (!cicoUsername.trim() || !cicoPassword.trim()) {
      showError("Isi Username/Email dan Password CICO");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await loginViaCICO(cicoUsername.trim(), cicoPassword);
      router.replace("/(tabs)");
    } catch (e: any) {
      showError(e.message || "Cek kembali kredensial CICO Anda");
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
        <View style={styles.logoContainer}>
          <Image source={require("../assets/logo-2.svg")} style={styles.logo} />
        </View>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Platform komunikasi resmi karyawan
        </Text>

        {/* Tabs */}
        <View style={styles.tabs}>
          <Pressable
            onPress={() => setMode("cico")}
            style={[styles.tab, mode === "cico" && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
          >
            <Text style={[styles.tabText, { color: mode === "cico" ? colors.primary : colors.textSecondary }]}>
              CICO SSO
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setMode("local")}
            style={[styles.tab, mode === "local" && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
          >
            <Text style={[styles.tabText, { color: mode === "local" ? colors.primary : colors.textSecondary }]}>
              Lokal
            </Text>
          </Pressable>
        </View>

        <View style={styles.form}>
          {error && (
            <View style={[styles.errorBanner, { backgroundColor: "#FEE2E2", borderColor: "#FECACA" }]}>
              <Feather name="alert-circle" size={14} color="#DC2626" />
              <Text style={[styles.errorText, { color: "#991B1B" }]}>{error}</Text>
            </View>
          )}

          {mode === "cico" ? (
            <>
              {/* CICO SSO Form */}
              <View style={[styles.infoBanner, { backgroundColor: colors.primary + "15", borderColor: colors.primary + "40" }]}>
                <Feather name="shield" size={14} color={colors.primary} />
                <Text style={[styles.infoText, { color: colors.primary }]}>
                  Login menggunakan akun CICO Anda
                </Text>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>Username/Email CICO</Text>
                <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Feather name="user" size={16} color={colors.textSecondary} />
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    placeholder="joni@rpk.com atau username CICO"
                    placeholderTextColor={colors.textSecondary}
                    value={cicoUsername}
                    onChangeText={setCICOUsername}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                  />
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>Password CICO</Text>
                <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Feather name="lock" size={16} color={colors.textSecondary} />
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    placeholder="Password CICO"
                    placeholderTextColor={colors.textSecondary}
                    value={cicoPassword}
                    onChangeText={setCICOPassword}
                    secureTextEntry={!showCICOPass}
                  />
                  <Pressable onPress={() => setShowCICOPass(!showCICOPass)} hitSlop={8}>
                    <Feather name={showCICOPass ? "eye-off" : "eye"} size={16} color={colors.textSecondary} />
                  </Pressable>
                </View>
              </View>

              <Pressable
                onPress={handleCICOLogin}
                disabled={loading}
                style={({ pressed }) => [
                  styles.btn,
                  { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
                ]}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.btnText}>Login via CICO</Text>
                )}
              </Pressable>
            </>
          ) : (
            <>
              {/* Local Login Form */}
              <View style={[styles.infoBanner, { backgroundColor: "#FEF08A", borderColor: "#FBBF24" }]}>
                <Feather name="alert-circle" size={14} color="#D97706" />
                <Text style={[styles.infoText, { color: "#D97706" }]}>
                  Fallback login. Gunakan CICO SSO jika tersedia.
                </Text>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>Employee ID atau Email</Text>
                <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Feather name="user" size={16} color={colors.textSecondary} />
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    placeholder="EMP001 atau joni@rpk.com"
                    placeholderTextColor={colors.textSecondary}
                    value={employeeId}
                    onChangeText={setEmployeeId}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                  />
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>Password</Text>
                <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Feather name="lock" size={16} color={colors.textSecondary} />
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    placeholder="Password awal = Employee ID"
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
                onPress={handleLocalLogin}
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
            </>
          )}
        </View>

        <View style={styles.footer}>
          <Feather name="shield" size={12} color={colors.textSecondary} />
          <Text style={[styles.footerText, { color: colors.textSecondary }]}>
            Koneksi terenkripsi & seluruh aktivitas diaudit
          </Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: { flex: 1, paddingHorizontal: 28, justifyContent: "center", gap: 8 },
  logoContainer: { alignItems: "center", marginBottom: 8 },
  logo: { width: 180, height: 54 },
  subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", marginBottom: 12 },
  tabs: {
    flexDirection: "row", gap: 0, marginBottom: 16, borderBottomWidth: 1, borderBottomColor: "#E5E7EB",
  },
  tab: { flex: 1, paddingVertical: 12, alignItems: "center", justifyContent: "center" },
  tabText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  errorBanner: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
    marginBottom: 12,
  },
  errorText: { fontSize: 12, fontFamily: "Inter_500Medium", flex: 1 },
  infoBanner: {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
    marginBottom: 12,
  },
  infoText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  ssoBanner: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
    marginBottom: 16,
  },
  ssoTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  ssoDesc: { fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 15 },
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
