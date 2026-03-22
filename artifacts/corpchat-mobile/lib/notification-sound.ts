import { Audio } from "expo-av";

let sound: Audio.Sound | null = null;
let isLoaded = false;

export async function playNotificationSound() {
  try {
    if (sound && isLoaded) {
      await sound.setPositionAsync(0);
      await sound.playAsync();
      return;
    }

    const { sound: newSound } = await Audio.Sound.createAsync(
      require("../assets/sounds/notification.wav"),
      { shouldPlay: true, volume: 0.6 }
    );
    sound = newSound;
    isLoaded = true;

    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        // keep loaded for reuse
      }
    });
  } catch (e) {
    console.error("[NotificationSound] Play error:", e);
  }
}

export async function cleanupNotificationSound() {
  if (sound) {
    try {
      await sound.unloadAsync();
    } catch {}
    sound = null;
    isLoaded = false;
  }
}
