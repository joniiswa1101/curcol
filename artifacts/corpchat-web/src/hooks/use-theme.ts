import { useState, useEffect } from "react"

type Theme = "light" | "dark"

function getStoredTheme(): Theme {
  const stored = localStorage.getItem("curcol_theme")
  if (stored === "dark" || stored === "light") return stored
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getStoredTheme)

  useEffect(() => {
    const root = document.documentElement
    if (theme === "dark") {
      root.classList.add("dark")
    } else {
      root.classList.remove("dark")
    }
    localStorage.setItem("curcol_theme", theme)
  }, [theme])

  const toggleTheme = () => setThemeState(prev => prev === "dark" ? "light" : "dark")

  return { theme, toggleTheme }
}
