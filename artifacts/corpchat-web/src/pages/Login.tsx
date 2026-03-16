import { useState } from "react"
import { useAuthStore } from "@/hooks/use-auth"
import { useLogin } from "@workspace/api-client-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"
import { MessageSquare, ShieldCheck } from "lucide-react"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

const loginSchema = z.object({
  employeeId: z.string().min(1, "Employee ID is required"),
  password: z.string().min(1, "Password is required"),
})

type LoginForm = z.infer<typeof loginSchema>

export default function Login() {
  const setAuth = useAuthStore(state => state.setAuth)
  const { toast } = useToast()
  
  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { employeeId: "", password: "" }
  })

  const loginMutation = useLogin({
    mutation: {
      onSuccess: (data) => {
        setAuth(data)
        toast({ title: "Welcome back!", description: "Successfully logged in." })
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

  return (
    <div className="min-h-screen w-full flex bg-background">
      {/* Left side - Visual/Brand */}
      <div className="hidden lg:flex flex-1 relative bg-sidebar items-center justify-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-accent/20 mix-blend-overlay z-10" />
        <img 
          src={`${import.meta.env.BASE_URL}images/login-bg.png`}
          alt="Secure Network Background"
          className="absolute inset-0 w-full h-full object-cover opacity-40"
        />
        <div className="relative z-20 flex flex-col items-center text-center p-12 max-w-2xl">
          <div className="w-24 h-24 bg-white/10 backdrop-blur-xl rounded-3xl flex items-center justify-center shadow-2xl mb-8 border border-white/20">
            <MessageSquare className="w-12 h-12 text-white" />
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
            <div className="lg:hidden flex justify-center mb-6">
              <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center">
                <MessageSquare className="w-8 h-8 text-primary" />
              </div>
            </div>
            <h2 className="text-3xl font-display font-bold text-foreground">Sign in to CorpChat</h2>
            <p className="mt-2 text-muted-foreground">Enter your employee credentials to access your workspace.</p>
          </div>

          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 mt-8">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground">Employee ID</label>
                <Input 
                  {...form.register("employeeId")} 
                  placeholder="e.g. EMP-001" 
                  className="h-12 text-base"
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
                  placeholder="••••••••" 
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
              {loginMutation.isPending ? "Authenticating..." : "Sign In"}
            </Button>
          </form>

          <div className="pt-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="w-4 h-4" />
            <span>Secure Enterprise Connection</span>
          </div>
        </div>
      </div>
    </div>
  )
}
