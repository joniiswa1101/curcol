import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuthInit, useAuthStore } from "@/hooks/use-auth";
import { useWebSocket } from "@/hooks/use-websocket";
import { useEffect } from "react";
import { CallProvider } from "@/contexts/CallContext";
import { PresenceProvider } from "@/contexts/PresenceContext";
import { IncomingCallModal } from "@/components/call/IncomingCallModal";
import { ActiveCallOverlay } from "@/components/call/ActiveCallOverlay";

// Pages
import Login from "@/pages/Login";
import Chat from "@/pages/Chat";
import Directory from "@/pages/Directory";
import AdminDashboard from "@/pages/Admin";
import AdminUsers from "@/pages/AdminUsers";
import AdminWhatsApp from "@/pages/AdminWhatsApp";
import Announcements from "@/pages/Announcements";
import Tasks from "@/pages/Tasks";
import Compliance from "@/pages/Compliance";
import CanvasPage from "@/pages/Canvas";
import DigestPage from "@/pages/Digest";
import NotFound from "@/pages/not-found";

// Global fetch override to inject JWT token automatically for generated Orval client
const originalFetch = window.fetch;
window.fetch = async (...args) => {
  const [resource, config] = args;
  const token = localStorage.getItem("curcol_token");
  
  // If calling our /api and we have a token, inject Authorization header
  if (typeof resource === 'string' && resource.startsWith('/api') && token) {
    const newConfig = config || {};
    const headers = new Headers(newConfig.headers || {});
    if (!headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    newConfig.headers = headers;
    return originalFetch(resource, newConfig);
  }
  
  return originalFetch(...args);
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, isLoading } = useAuthStore();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [isLoading, isAuthenticated, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin w-12 h-12 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return isAuthenticated ? <Component /> : null;
}

function MainRouter() {
  const [location, setLocation] = useLocation();
  const { isAuthenticated, isLoading } = useAuthStore();

  useAuthInit();
  useWebSocket();

  // Root redirect logic
  useEffect(() => {
    if (location === "/") {
      if (!isLoading) {
        setLocation(isAuthenticated ? "/chat" : "/login");
      }
    }
  }, [location, isLoading, isAuthenticated, setLocation]);

  if (isLoading && location !== "/login") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse flex flex-col items-center">
           <div className="w-16 h-16 bg-primary/20 rounded-2xl mb-4" />
           <p className="text-muted-foreground font-medium tracking-widest uppercase text-sm">CURCOL</p>
        </div>
      </div>
    );
  }

  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/chat" component={() => <ProtectedRoute component={Chat} />} />
      <Route path="/chat/:id" component={() => <ProtectedRoute component={Chat} />} />
      <Route path="/directory" component={() => <ProtectedRoute component={Directory} />} />
      <Route path="/admin" component={() => <ProtectedRoute component={AdminDashboard} />} />
      <Route path="/admin/users" component={() => <ProtectedRoute component={AdminUsers} />} />
      <Route path="/admin/whatsapp" component={() => <ProtectedRoute component={AdminWhatsApp} />} />
      <Route path="/announcements" component={() => <ProtectedRoute component={Announcements} />} />
      <Route path="/tasks" component={() => <ProtectedRoute component={Tasks} />} />
      <Route path="/compliance" component={() => <ProtectedRoute component={Compliance} />} />
      <Route path="/canvas" component={() => <ProtectedRoute component={CanvasPage} />} />
      <Route path="/digest" component={() => <ProtectedRoute component={DigestPage} />} />
      {location !== "/" && <Route component={NotFound} />}
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <PresenceProvider>
          <CallProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <MainRouter />
            </WouterRouter>
            <IncomingCallModal />
            <ActiveCallOverlay />
          </CallProvider>
        </PresenceProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
