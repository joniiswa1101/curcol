import { useState, useRef, useCallback, useEffect } from "react"
import { Mic, Square, Trash2, Send } from "lucide-react"
import { cn } from "@/lib/utils"

interface VoiceRecorderProps {
  onRecorded: (blob: Blob, duration: number) => void
  onCancel: () => void
  disabled?: boolean
}

export function VoiceRecorder({ onRecorded, onCancel, disabled }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [duration, setDuration] = useState(0)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
      if (audioUrl) URL.revokeObjectURL(audioUrl)
    }
  }, [audioUrl])

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "audio/webm"

      const mediaRecorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType })
        setAudioBlob(blob)
        setAudioUrl(URL.createObjectURL(blob))
        stream.getTracks().forEach(t => t.stop())
      }

      mediaRecorder.start(100)
      setIsRecording(true)
      setDuration(0)

      timerRef.current = setInterval(() => {
        setDuration(d => d + 1)
      }, 1000)
    } catch (err) {
      console.error("Microphone access denied:", err)
      alert("Izin mikrofon diperlukan untuk merekam pesan suara.")
    }
  }, [])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [isRecording])

  const handleSend = useCallback(() => {
    if (audioBlob) {
      onRecorded(audioBlob, duration)
      setAudioBlob(null)
      setAudioUrl(null)
      setDuration(0)
    }
  }, [audioBlob, duration, onRecorded])

  const handleDiscard = useCallback(() => {
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    setAudioBlob(null)
    setAudioUrl(null)
    setDuration(0)
    if (isRecording) stopRecording()
    onCancel()
  }, [audioUrl, isRecording, stopRecording, onCancel])

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${m}:${s.toString().padStart(2, "0")}`
  }

  if (audioBlob && audioUrl) {
    return (
      <div className="flex items-center gap-3 w-full px-2">
        <button
          onClick={handleDiscard}
          className="p-2 rounded-full hover:bg-destructive/10 text-destructive transition-colors"
          title="Hapus rekaman"
        >
          <Trash2 className="w-5 h-5" />
        </button>

        <div className="flex-1 flex items-center gap-2 bg-muted/50 rounded-full px-3 py-1.5">
          <audio src={audioUrl} controls className="h-8 w-full max-w-[250px]" />
          <span className="text-xs text-muted-foreground whitespace-nowrap">{formatTime(duration)}</span>
        </div>

        <button
          onClick={handleSend}
          disabled={disabled}
          className="p-2 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          title="Kirim pesan suara"
        >
          <Send className="w-5 h-5" />
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 w-full px-2">
      <button
        onClick={handleDiscard}
        className="p-2 rounded-full hover:bg-destructive/10 text-destructive transition-colors"
        title="Batal"
      >
        <Trash2 className="w-5 h-5" />
      </button>

      <div className="flex-1 flex items-center justify-center gap-3">
        {isRecording && (
          <>
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-sm font-medium text-red-500">
              Merekam... {formatTime(duration)}
            </span>
          </>
        )}
        {!isRecording && (
          <span className="text-sm text-muted-foreground">Tekan mikrofon untuk mulai merekam</span>
        )}
      </div>

      {isRecording ? (
        <button
          onClick={stopRecording}
          className="p-3 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors animate-pulse"
          title="Berhenti merekam"
        >
          <Square className="w-5 h-5" />
        </button>
      ) : (
        <button
          onClick={startRecording}
          disabled={disabled}
          className="p-3 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          title="Mulai merekam"
        >
          <Mic className="w-5 h-5" />
        </button>
      )}
    </div>
  )
}
