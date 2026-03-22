import { useState } from "react"
import { useLocation } from "wouter"
import { useAuthStore } from "@/hooks/use-auth"
import { useLogin } from "@workspace/api-client-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"
import { ShieldCheck, Loader } from "lucide-react"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

const loginSchema = z.object({
  employeeId: z.string().min(1, "Employee ID is required"),
  password: z.string().min(1, "Password is required"),
})

type LoginForm = z.infer<typeof loginSchema>

const cicoLoginSchema = z.object({
  username: z.string().min(1, "Username/Email required"),
  password: z.string().min(1, "Password required"),
})

type CICOLoginForm = z.infer<typeof cicoLoginSchema>

export default function Login() {
  const setAuth = useAuthStore(state => state.setAuth)
  const { toast } = useToast()
  const [, setLocation] = useLocation()
  const [cicoLoading, setCICOLoading] = useState(false)
  const [loginMode, setLoginMode] = useState<"cico" | "local">("cico") // CICO SSO is primary
  
  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { employeeId: "", password: "" }
  })

  const cicoForm = useForm<CICOLoginForm>({
    resolver: zodResolver(cicoLoginSchema),
    defaultValues: { username: "", password: "" }
  })

  const loginMutation = useLogin({
    mutation: {
      onSuccess: (data) => {
        setAuth(data)
        toast({ title: "Welcome back!", description: "Successfully logged in." })
        setLocation("/chat")
      },
      onError: (error) => {
        toast({ 
          variant: "destructive", 
          title: "Login failed", 
          description: error.response?.data?.message || "Invalid credentials" 
        })
      }
    }
  })

  const onSubmit = (data: LoginForm) => {
    loginMutation.mutate({ data })
  }

  const onCICOSubmit = async (data: CICOLoginForm) => {
    setCICOLoading(true)
    try {
      const response = await fetch("/api/auth/sso/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })
      
      let result: any
      try {
        result = await response.json()
      } catch (e) {
        // Failed to parse response
        toast({ variant: "destructive", title: "CICO Login failed", description: "Server error - invalid response format" })
        return
      }

      if (!response.ok) {
        toast({ variant: "destructive", title: "CICO Login failed", description: result.message || "Invalid credentials" })
        return
      }
      setAuth(result)
      toast({ title: "Welcome!", description: "Successfully logged in via CICO." })
      setLocation("/chat")
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: "Network error during CICO login" })
    } finally {
      setCICOLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-full flex bg-background">
      {/* Left side - Visual/Brand */}
      <div className="hidden lg:flex flex-col flex-1 relative bg-sidebar justify-start pt-40 px-12 overflow-visible">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-accent/20 mix-blend-overlay z-10" />
        <img 
          src={`${import.meta.env.BASE_URL}images/login-bg.png`}
          alt="Secure Network Background"
          className="absolute inset-0 w-full h-full object-cover opacity-40"
        />
        <div className="relative z-20 flex flex-col items-center justify-center text-center flex-1">
          {/* Rajawali Logo */}
          <div className="mb-4">
            <img 
              src={`${import.meta.env.BASE_URL}logo-rajawali.png`}
              alt="Rajawali Logo"
              className="h-20 w-auto drop-shadow-lg"
            />
          </div>
          
          {/* CurCol Logo with White Text - Centered */}
          <div>
            <img 
              src={`${import.meta.env.BASE_URL}logo-2-white.svg`}
              alt="Curcol Logo"
              className="h-40 w-auto drop-shadow-lg"
            />
          </div>
          <h1 className="text-5xl font-display font-bold text-white mb-6 leading-tight">
            Connect. Collaborate. <span className="text-accent">Create.</span>
          </h1>
          <p className="text-xl text-white/70">
            The secure internal communication platform for your enterprise, fully integrated with CICO.
          </p>
        </div>
      </div>

      {/* Right side - Form */}
      <div className="flex-1 flex items-center justify-center p-8 sm:p-12 relative">
        <div className="w-full max-w-md space-y-8 relative z-10">
          <div className="text-center lg:text-left">
            <div className="lg:hidden flex flex-col items-center justify-center mb-8 gap-2">
              <img 
                src={`${import.meta.env.BASE_URL}logo-rajawali.png`}
                alt="Rajawali Logo"
                className="h-14 w-auto"
              />
              <img 
                src={`${import.meta.env.BASE_URL}logo-2-white.svg`}
                alt="Curcol Logo"
                className="h-24 w-auto"
              />
            </div>
            <p className="mt-2 text-muted-foreground text-center lg:text-left">Login menggunakan akun CICO Anda.</p>
          </div>

          {/* Login Mode Tabs */}
          <div className="flex gap-2 border border-border rounded-lg p-1 bg-secondary/50">
            <button
              type="button"
              onClick={() => setLoginMode("local")}
              className={`flex-1 px-4 py-2 rounded-md font-medium transition-colors text-sm ${
                loginMode === "local" 
                  ? "bg-primary text-primary-foreground" 
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Lokal
            </button>
            <button
              type="button"
              onClick={() => setLoginMode("cico")}
              className={`flex-1 px-4 py-2 rounded-md font-medium transition-colors text-sm ${
                loginMode === "cico" 
                  ? "bg-primary text-primary-foreground" 
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              CICO SSO
            </button>
          </div>

          {/* LOKAL LOGIN MODE - FALLBACK */}
          {loginMode === "local" && (
            <>
              <div className="flex items-start gap-3 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900 rounded-xl px-4 py-3 text-sm">
                <ShieldCheck className="w-4 h-4 text-yellow-600 dark:text-yellow-500 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold text-yellow-900 dark:text-yellow-200">Login Lokal (Fallback)</p>
                  <p className="text-yellow-700 dark:text-yellow-300 text-xs mt-0.5">
                    Gunakan Employee ID jika CICO SSO gagal. Password = Employee ID. Contoh: EMP001
                  </p>
                </div>
              </div>

              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 mt-2">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-foreground">Employee ID atau Email</label>
                    <Input 
                      {...form.register("employeeId")} 
                      placeholder="Contoh: EMP001 atau admin@corpchat.id" 
                      className="h-12 text-base"
                      autoCapitalize="none"
                      autoCorrect="off"
                    />
                    {form.formState.errors.employeeId && (
                      <p className="text-sm text-destructive">{form.formState.errors.employeeId.message}</p>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-foreground">Password</label>
                    <Input 
                      {...form.register("password")} 
                      type="password" 
                      placeholder="Password lokal (default: Employee ID)" 
                      className="h-12 text-base"
                    />
                    {form.formState.errors.password && (
                      <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>
                    )}
                  </div>
                </div>

                <Button 
                  type="submit" 
                  className="w-full h-12 text-lg" 
                  disabled={loginMutation.isPending}
                >
                  {loginMutation.isPending ? "Memverifikasi..." : "Masuk"}
                </Button>
              </form>
            </>
          )}

          {/* CICO SSO MODE - PRIMARY */}
          {loginMode === "cico" && (
            <>
              <div className="flex items-start gap-3 bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 text-sm">
                <ShieldCheck className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold text-foreground">Login CICO SSO</p>
                  <p className="text-muted-foreground text-xs mt-0.5">
                    Gunakan username/email dan password CICO Anda.
                  </p>
                </div>
              </div>

              <form onSubmit={cicoForm.handleSubmit(onCICOSubmit)} className="space-y-6 mt-2">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-foreground">Username atau Email CICO</label>
                    <Input 
                      {...cicoForm.register("username")} 
                      placeholder="Contoh: john.doe atau john@company.com" 
                      className="h-12 text-base"
                      autoCapitalize="none"
                      autoCorrect="off"
                    />
                    {cicoForm.formState.errors.username && (
                      <p className="text-sm text-destructive">{cicoForm.formState.errors.username.message}</p>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-foreground">Password CICO</label>
                    <Input 
                      {...cicoForm.register("password")} 
                      type="password" 
                      placeholder="Password dari sistem CICO" 
                      className="h-12 text-base"
                    />
                    {cicoForm.formState.errors.password && (
                      <p className="text-sm text-destructive">{cicoForm.formState.errors.password.message}</p>
                    )}
                  </div>
                </div>

                <Button 
                  type="submit" 
                  className="w-full h-12 text-lg" 
                  disabled={cicoLoading}
                >
                  {cicoLoading ? (
                    <>
                      <Loader className="w-5 h-5 animate-spin mr-2" />
                      Memverifikasi...
                    </>
                  ) : (
                    "Masuk via CICO"
                  )}
                </Button>
              </form>
            </>
          )}

          <div className="pt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="w-4 h-4" />
            <span>Koneksi terenkripsi & seluruh aktivitas diaudit</span>
          </div>
        </div>
      </div>
    </div>
  )
}
