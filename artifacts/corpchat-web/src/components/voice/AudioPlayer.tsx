import { useState, useRef, useEffect, useCallback } from "react"
import { Play, Pause } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuthStore } from "@/hooks/use-auth"

interface AudioPlayerProps {
  src: string
  duration?: number
  isMe?: boolean
  className?: string
}

export function AudioPlayer({ src, duration: initialDuration, isMe, className }: AudioPlayerProps) {
  const { token } = useAuthStore()
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(initialDuration || 0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const progressRef = useRef<HTMLDivElement>(null)

  const authSrc = src.includes("?") ? `${src}&token=${token}` : `${src}?token=${token}`

  useEffect(() => {
    const audio = new Audio(authSrc)
    audioRef.current = audio

    audio.addEventListener("loadedmetadata", () => {
      if (audio.duration && isFinite(audio.duration)) {
        setDuration(audio.duration)
      }
    })

    audio.addEventListener("timeupdate", () => {
      setCurrentTime(audio.currentTime)
    })

    audio.addEventListener("ended", () => {
      setIsPlaying(false)
      setCurrentTime(0)
    })

    return () => {
      audio.pause()
      audio.src = ""
    }
  }, [authSrc])

  const togglePlay = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return

    if (isPlaying) {
      audio.pause()
      setIsPlaying(false)
    } else {
      audio.play().catch(console.error)
      setIsPlaying(true)
    }
  }, [isPlaying])

  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current
    const bar = progressRef.current
    if (!audio || !bar || !duration) return

    const rect = bar.getBoundingClientRect()
    const x = e.clientX - rect.left
    const pct = Math.max(0, Math.min(1, x / rect.width))
    audio.currentTime = pct * duration
    setCurrentTime(pct * duration)
  }, [duration])

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return `${m}:${s.toString().padStart(2, "0")}`
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div className={cn("flex items-center gap-2.5 min-w-[180px] max-w-[260px]", className)}>
      <button
        onClick={togglePlay}
        className={cn(
          "p-2 rounded-full transition-colors shrink-0",
          isMe
            ? "bg-white/20 hover:bg-white/30 text-white"
            : "bg-primary/10 hover:bg-primary/20 text-primary"
        )}
      >
        {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
      </button>

      <div className="flex-1 flex flex-col gap-1">
        <div
          ref={progressRef}
          onClick={handleProgressClick}
          className={cn(
            "h-1.5 rounded-full cursor-pointer relative",
            isMe ? "bg-white/20" : "bg-muted-foreground/20"
          )}
        >
          <div
            className={cn(
              "h-full rounded-full transition-all duration-100",
              isMe ? "bg-white/80" : "bg-primary"
            )}
            style={{ width: `${progress}%` }}
          />
          <div
            className={cn(
              "absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full shadow-sm transition-all",
              isMe ? "bg-white" : "bg-primary"
            )}
            style={{ left: `calc(${progress}% - 6px)` }}
          />
        </div>
        <span className={cn(
          "text-[10px]",
          isMe ? "text-white/70" : "text-muted-foreground"
        )}>
          {isPlaying || currentTime > 0 ? formatTime(currentTime) : formatTime(duration)}
        </span>
      </div>
    </div>
  )
}
