import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, isToday, isYesterday, formatDistanceToNow } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function formatMessageTime(dateString: string): string {
  const date = new Date(dateString);
  if (isToday(date)) {
    return format(date, "HH:mm");
  } else if (isYesterday(date)) {
    return "Yesterday";
  } else {
    return format(date, "MMM d");
  }
}

export function formatTimeAgo(dateString: string): string {
  return formatDistanceToNow(new Date(dateString), { addSuffix: true });
}

export function getStatusColor(status?: string | null): string {
  switch (status) {
    case "present": return "bg-status-present";
    case "break": return "bg-status-break";
    case "wfh": return "bg-status-wfh";
    case "absent": 
    case "off": return "bg-status-absent";
    default: return "bg-muted-foreground/30";
  }
}

export function getStatusLabel(status?: string | null): string {
  switch (status) {
    case "present": return "Hadir";
    case "break": return "Istirahat";
    case "wfh": return "WFH";
    case "absent": return "Absen";
    case "off": return "Cuti/Libur";
    default: return "Offline";
  }
}
