import { useEffect, useRef } from "react";
import { Platform, AppState } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { router } from "expo-router";
import { api } from "@/lib/api";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    priority: Notifications.AndroidNotificationPriority.HIGH,
  }),
});

if (Platform.OS === "android") {
  Notifications.setNotificationChannelAsync("messages", {
    name: "Messages",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#3b82f6",
    sound: "default",
  });
}

async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (Platform.OS === "web") return null;
  if (!Device.isDevice) {
    console.log("[Push] Must use physical device for push notifications");
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    console.log("[Push] Permission not granted");
    return null;
  }

  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
      console.error("[Push] No EAS projectId found in app config");
      return null;
    }
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    return tokenData.data;
  } catch (err) {
    console.error("[Push] Failed to get push token:", err);
    return null;
  }
}

function handleNotificationNavigation(data: Record<string, any> | undefined) {
  if (data?.conversationId) {
    router.push(`/chat/${data.conversationId}`);
  }
}

export function usePushNotifications(userId: number | undefined) {
  const tokenRef = useRef<string | null>(null);
  const prevUserIdRef = useRef<number | undefined>(undefined);
  const responseListener = useRef<Notifications.EventSubscription>();

  useEffect(() => {
    if (!userId) {
      if (prevUserIdRef.current && tokenRef.current) {
        api.post("/push-tokens/unregister", { token: tokenRef.current }).catch(() => {});
        tokenRef.current = null;
      }
      prevUserIdRef.current = undefined;
      return;
    }

    prevUserIdRef.current = userId;

    registerForPushNotificationsAsync().then(async (token) => {
      if (token) {
        tokenRef.current = token;
        try {
          await api.post("/push-tokens/register", { token, platform: Platform.OS });
          console.log("[Push] Token registered successfully");
        } catch (err) {
          console.error("[Push] Failed to register token:", err);
        }
      }
    });

    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        handleNotificationNavigation(response.notification.request.content.data);
      }
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        handleNotificationNavigation(response.notification.request.content.data);
      }
    );

    return () => {
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        Notifications.setBadgeCountAsync(0).catch(() => {});
      }
    });

    return () => subscription.remove();
  }, [userId]);
}
