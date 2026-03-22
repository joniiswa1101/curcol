let notificationSound: HTMLAudioElement | null = null;

function getSound(): HTMLAudioElement {
  if (!notificationSound) {
    notificationSound = new Audio("/sounds/notification.wav");
    notificationSound.volume = 0.5;
    notificationSound.load();
  }
  return notificationSound;
}

export function initNotificationSound() {
  getSound();
}

export function playNotificationSound() {
  try {
    const sound = getSound();
    sound.currentTime = 0;
    sound.play().catch(() => {});
  } catch {}
}

export function setNotificationVolume(volume: number) {
  const sound = getSound();
  sound.volume = Math.max(0, Math.min(1, volume));
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

export function showBrowserNotification(title: string, body: string, onClick?: () => void) {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  if (document.hasFocus()) return;

  try {
    const notification = new Notification(title, {
      body,
      icon: "/logo-2.svg",
      tag: "corpchat-message",
      renotify: true,
    });

    if (onClick) {
      notification.onclick = () => {
        window.focus();
        onClick();
        notification.close();
      };
    }

    setTimeout(() => notification.close(), 5000);
  } catch {}
}

export function getNotificationPermission(): NotificationPermission {
  if (!("Notification" in window)) return "denied";
  return Notification.permission;
}
