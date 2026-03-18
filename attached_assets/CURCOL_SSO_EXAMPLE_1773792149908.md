# CurCol SSO Implementation Example

This document provides example code for implementing SSO authentication in CurCol using CICO as the authentication backend.

---

## 1. Setup: Store SSO Configuration

Create `client/src/config/sso.ts`:

```typescript
// Configuration for SSO integration with CICO
export const SSO_CONFIG = {
  CICO_API_URL: process.env.VITE_CICO_API_URL || 'https://cico-domain.com',
  TOKEN_STORAGE_KEY: 'sso_token',
  USER_STORAGE_KEY: 'user_profile',
  TOKEN_EXPIRY_KEY: 'token_expiry',
  
  // Endpoints
  ENDPOINTS: {
    VALIDATE_TOKEN: '/api/auth/sso/validate',
    LOGIN: '/api/auth/sso/login',
    REFRESH_TOKEN: '/api/auth/sso/refresh',
  }
};

export type SSOUser = {
  id: string;
  email: string;
  username: string;
  fullName: string;
  department: string;
  role: 'employee' | 'manager' | 'admin';
  companyId: string;
};
```

---

## 2. SSO Service Layer

Create `client/src/lib/ssoService.ts`:

```typescript
import { SSO_CONFIG, type SSOUser } from '@/config/sso';

class SSOService {
  /**
   * Store SSO token and user data in local storage
   */
  storeToken(token: string, user: SSOUser): void {
    localStorage.setItem(SSO_CONFIG.TOKEN_STORAGE_KEY, token);
    localStorage.setItem(SSO_CONFIG.USER_STORAGE_KEY, JSON.stringify(user));
    
    // Store expiry time (24 hours from now)
    const expiryTime = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    localStorage.setItem(SSO_CONFIG.TOKEN_EXPIRY_KEY, expiryTime);
  }

  /**
   * Retrieve stored token
   */
  getToken(): string | null {
    return localStorage.getItem(SSO_CONFIG.TOKEN_STORAGE_KEY);
  }

  /**
   * Retrieve stored user data
   */
  getUser(): SSOUser | null {
    const userJson = localStorage.getItem(SSO_CONFIG.USER_STORAGE_KEY);
    if (!userJson) return null;
    try {
      return JSON.parse(userJson);
    } catch {
      return null;
    }
  }

  /**
   * Check if token exists and is not expired
   */
  isAuthenticated(): boolean {
    const token = this.getToken();
    const expiryStr = localStorage.getItem(SSO_CONFIG.TOKEN_EXPIRY_KEY);
    
    if (!token || !expiryStr) return false;
    
    const expiry = new Date(expiryStr);
    const now = new Date();
    
    // Return true if token exists and expiry is in the future
    return now < expiry;
  }

  /**
   * Check if token is expiring soon (within 1 hour)
   */
  isTokenExpiringSoon(): boolean {
    const expiryStr = localStorage.getItem(SSO_CONFIG.TOKEN_EXPIRY_KEY);
    if (!expiryStr) return true;
    
    const expiry = new Date(expiryStr);
    const now = new Date();
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
    
    return expiry < oneHourFromNow;
  }

  /**
   * Clear all stored SSO data
   */
  clearToken(): void {
    localStorage.removeItem(SSO_CONFIG.TOKEN_STORAGE_KEY);
    localStorage.removeItem(SSO_CONFIG.USER_STORAGE_KEY);
    localStorage.removeItem(SSO_CONFIG.TOKEN_EXPIRY_KEY);
  }

  /**
   * Validate token with CICO backend
   */
  async validateToken(token: string): Promise<{ valid: boolean; user?: SSOUser }> {
    try {
      const response = await fetch(
        `${SSO_CONFIG.CICO_API_URL}${SSO_CONFIG.ENDPOINTS.VALIDATE_TOKEN}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        return { valid: false };
      }

      const data = await response.json();
      return { valid: true, user: data.user };
    } catch (error) {
      console.error('Token validation error:', error);
      return { valid: false };
    }
  }

  /**
   * Login with username and password
   */
  async login(username: string, password: string): Promise<{ success: boolean; token?: string; user?: SSOUser; error?: string }> {
    try {
      const response = await fetch(
        `${SSO_CONFIG.CICO_API_URL}${SSO_CONFIG.ENDPOINTS.LOGIN}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        }
      );

      if (!response.ok) {
        const error = await response.json();
        return { success: false, error: error.error || 'Login failed' };
      }

      const data = await response.json();
      
      if (data.token && data.user) {
        this.storeToken(data.token, data.user);
      }

      return { success: true, token: data.token, user: data.user };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'Network error' };
    }
  }

  /**
   * Refresh token if expiring soon
   */
  async refreshToken(expiredToken?: string): Promise<{ success: boolean; token?: string; user?: SSOUser; error?: string }> {
    try {
      const token = expiredToken || this.getToken();
      if (!token) {
        return { success: false, error: 'No token to refresh' };
      }

      const response = await fetch(
        `${SSO_CONFIG.CICO_API_URL}${SSO_CONFIG.ENDPOINTS.REFRESH_TOKEN}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })
        }
      );

      if (!response.ok) {
        return { success: false, error: 'Token refresh failed' };
      }

      const data = await response.json();
      
      if (data.token && data.user) {
        this.storeToken(data.token, data.user);
      }

      return { success: true, token: data.token, user: data.user };
    } catch (error) {
      console.error('Token refresh error:', error);
      return { success: false, error: 'Network error' };
    }
  }

  /**
   * Logout - clear all SSO data
   */
  logout(): void {
    this.clearToken();
  }
}

export const ssoService = new SSOService();
```

---

## 3. API Request Wrapper with SSO

Update `client/src/lib/api.ts`:

```typescript
import { ssoService } from './ssoService';
import { SSO_CONFIG } from '@/config/sso';

const CICO_API_URL = SSO_CONFIG.CICO_API_URL;

/**
 * Enhanced API request with SSO token support
 */
export async function apiRequest(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: any
): Promise<Response> {
  const token = ssoService.getToken();

  if (!token && !['login', 'refresh'].some(p => path.includes(p))) {
    // Token required but missing
    ssoService.logout();
    throw new Error('Authentication required');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const fullUrl = `${CICO_API_URL}${path}`;

  let response = await fetch(fullUrl, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  // Handle token expiration - retry with refresh
  if (response.status === 401) {
    const errorData = await response.json();
    if (errorData.error === 'Token expired') {
      // Try to refresh token
      const refreshResult = await ssoService.refreshToken();
      if (refreshResult.success && refreshResult.token) {
        // Retry request with new token
        const newHeaders = {
          ...headers,
          'Authorization': `Bearer ${refreshResult.token}`
        };
        response = await fetch(fullUrl, {
          method,
          headers: newHeaders,
          body: body ? JSON.stringify(body) : undefined,
        });
      } else {
        // Refresh failed, redirect to login
        ssoService.logout();
        window.location.href = '/login';
      }
    }
  }

  return response;
}

/**
 * Convenience methods for common HTTP verbs
 */
export const api = {
  get: (path: string) => apiRequest('GET', path),
  post: (path: string, body?: any) => apiRequest('POST', path, body),
  put: (path: string, body?: any) => apiRequest('PUT', path, body),
  patch: (path: string, body?: any) => apiRequest('PATCH', path, body),
  delete: (path: string) => apiRequest('DELETE', path),
};
```

---

## 4. SSO Login Hook

Create `client/src/hooks/useSSOLogin.ts`:

```typescript
import { useState } from 'react';
import { ssoService, type SSOUser } from '@/lib/ssoService';

interface LoginState {
  loading: boolean;
  error: string | null;
  user: SSOUser | null;
}

export function useSSOLogin() {
  const [state, setState] = useState<LoginState>({
    loading: false,
    error: null,
    user: ssoService.getUser(),
  });

  const login = async (username: string, password: string) => {
    setState({ loading: true, error: null, user: null });

    const result = await ssoService.login(username, password);

    if (result.success && result.user) {
      setState({
        loading: false,
        error: null,
        user: result.user,
      });
      return true;
    } else {
      setState({
        loading: false,
        error: result.error || 'Login failed',
        user: null,
      });
      return false;
    }
  };

  const logout = () => {
    ssoService.logout();
    setState({
      loading: false,
      error: null,
      user: null,
    });
  };

  return {
    ...state,
    login,
    logout,
    isAuthenticated: ssoService.isAuthenticated(),
  };
}
```

---

## 5. SSO Login Page Component

Create `client/src/pages/auth-sso-page.tsx`:

```typescript
import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { ssoService } from '@/lib/ssoService';
import { useSSOLogin } from '@/hooks/useSSOLogin';

export function AuthSSOPage() {
  const [, navigate] = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { login, loading, error } = useSSOLogin();

  useEffect(() => {
    // Check if there's a token in URL parameters (redirect from CICO)
    const url = new URL(window.location);
    const token = url.searchParams.get('token');

    if (token) {
      handleSSOToken(token);
    }
  }, []);

  const handleSSOToken = async (token: string) => {
    // Validate token
    const { valid, user } = await ssoService.validateToken(token);
    if (valid && user) {
      ssoService.storeToken(token, user);
      navigate('/');
    } else {
      // Invalid token, show login form
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await login(username, password);
    if (success) {
      navigate('/');
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <Card className="w-full max-w-md p-8">
        <h1 className="text-2xl font-bold mb-6">CurCol Login</h1>

        {error && (
          <div className="p-3 mb-4 bg-red-100 text-red-700 rounded">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              Username atau Email
            </label>
            <Input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="username atau email"
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Password
            </label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="password"
              disabled={loading}
            />
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={loading}
          >
            {loading ? 'Logging in...' : 'Login'}
          </Button>
        </form>

        <p className="text-sm text-gray-600 mt-4 text-center">
          Menggunakan akun CICO Anda untuk login
        </p>
      </Card>
    </div>
  );
}
```

---

## 6. Auth Guard Hook

Create `client/src/hooks/useAuthGuard.ts`:

```typescript
import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { ssoService } from '@/lib/ssoService';

/**
 * Hook to protect routes that require authentication
 */
export function useAuthGuard() {
  const [, navigate] = useLocation();

  useEffect(() => {
    const token = ssoService.getToken();
    
    if (!token) {
      // No token, redirect to login
      navigate('/auth/sso');
      return;
    }

    // Check if token is expiring soon
    if (ssoService.isTokenExpiringSoon()) {
      ssoService.refreshToken().then((result) => {
        if (!result.success) {
          navigate('/auth/sso');
        }
      });
    }
  }, [navigate]);

  return {
    user: ssoService.getUser(),
    isAuthenticated: ssoService.isAuthenticated(),
  };
}
```

---

## 7. Register SSO Routes

Update `client/src/App.tsx`:

```typescript
import { Switch, Route, Redirect } from 'wouter';
import { AuthSSOPage } from '@/pages/auth-sso-page';
import { HomePage } from '@/pages/home-page';
import { useAuthGuard } from '@/hooks/useAuthGuard';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthGuard();
  return isAuthenticated ? <>{children}</> : <Redirect to="/auth/sso" />;
}

export default function App() {
  return (
    <Switch>
      <Route path="/auth/sso" component={AuthSSOPage} />
      <Route path="/">
        <ProtectedRoute>
          <HomePage />
        </ProtectedRoute>
      </Route>
    </Switch>
  );
}
```

---

## 8. Environment Variables

Add to `.env` (or `.env.local`):

```env
VITE_CICO_API_URL=https://cico-domain.com
```

---

## Usage Flow

1. User opens CurCol app
2. App checks for SSO token in localStorage
3. If no token or token expired, redirect to `/auth/sso`
4. User can either:
   - **Option A**: Click "Login with CICO" (redirects to CICO login)
   - **Option B**: Enter credentials directly (local SSO login)
5. After login, CICO generates token and redirects back to CurCol
6. CurCol validates token and stores it
7. User is authenticated and can access CurCol
8. Token automatically refreshed before expiry

---

## Testing

### Test Direct Login
```bash
curl -X POST https://cico-domain.com/api/auth/sso/login \
  -H "Content-Type: application/json" \
  -d '{"username": "johndoe", "password": "password123"}'
```

### Test Token Validation
```bash
curl -X POST https://cico-domain.com/api/auth/sso/validate \
  -H "Authorization: Bearer eyJhbGc..."
```

### Test Token Refresh
```bash
curl -X POST https://cico-domain.com/api/auth/sso/refresh \
  -H "Content-Type: application/json" \
  -d '{"token": "eyJhbGc..."}'
```

---

## Next Steps

1. Copy these examples into your CurCol codebase
2. Update `VITE_CICO_API_URL` environment variable
3. Implement additional CurCol features using SSO user context
4. Add CORS configuration on CICO server to allow CurCol domain
5. Test complete login flow
6. Deploy to production with HTTPS
