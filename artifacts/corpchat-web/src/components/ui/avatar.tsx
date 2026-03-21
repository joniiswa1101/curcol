import * as React from "react"
import { cn, getInitials } from "@/lib/utils"

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string | null
  alt?: string
  fallback?: string
  size?: "xs" | "sm" | "md" | "lg" | "xl"
  status?: "present" | "break" | "wfh" | "absent" | "off" | null
}

export function Avatar({ src, alt, fallback, size = "md", status, className, ...props }: AvatarProps) {
  const [error, setError] = React.useState(false)

  const sizes = {
    xs: "w-6 h-6 text-[10px]",
    sm: "w-8 h-8 text-xs",
    md: "w-10 h-10 text-sm",
    lg: "w-12 h-12 text-base",
    xl: "w-16 h-16 text-lg",
  }

  const statusColors = {
    present: "bg-status-present",
    break: "bg-status-break",
    wfh: "bg-status-wfh",
    absent: "bg-status-absent",
    off: "bg-status-absent",
  }

  return (
    <div className={cn("relative inline-block", sizes[size], className)} {...props}>
      <div className="w-full h-full rounded-full overflow-hidden bg-primary/10 flex items-center justify-center text-primary font-semibold border-2 border-background shadow-sm">
        {src && !error ? (
          <img 
            src={src} 
            alt={alt || ""} 
            onError={() => setError(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <span>{fallback ? getInitials(fallback) : "?"}</span>
        )}
      </div>
      
      {status && (
        <span 
          className={cn(
            "absolute bottom-0 right-0 block rounded-full ring-2 ring-background",
            statusColors[status],
            size === "sm" ? "w-2.5 h-2.5" : 
            size === "xl" ? "w-4 h-4" : "w-3 h-3"
          )}
          title={status}
        />
      )}
    </div>
  )
}
