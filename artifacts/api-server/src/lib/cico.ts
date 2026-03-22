/**
 * CICO SSO Integration
 * Handle login dan sync dengan CICO system
 */

const CICO_API_URL = "https://cico2025.replit.app";

export interface CICOLoginResponse {
  success: boolean;
  token: string;
  user: {
    id: string;
    email: string;
    username: string;
    fullName: string;
    department: string;
    role: string;
    companyId: string;
  };
}

export interface CICOEmployee {
  employee_id: string;
  user_id: string;
  name: string;
  email: string;
  username: string;
  department: string;
  role: string;
  is_active: boolean;
  timezone: string;
  hire_date: string;
}

export interface CICOEmployeesResponse {
  success: boolean;
  source: string;
  sync_time: string;
  pagination: {
    page: number;
    limit: number;
    total_count: number;
    total_pages: number;
    has_next: boolean;
    has_prev: boolean;
  };
  filters: Record<string, any>;
  employees: CICOEmployee[];
}

/**
 * Login via CICO SSO
 * Spec: POST /api/auth/sso/login
 * Request: { username, password }
 * Response: { success, token, user: { id, email, username, fullName, department, role, companyId } }
 */
async function attemptCICOLogin(username: string, password: string): Promise<CICOLoginResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(`${CICO_API_URL}/api/auth/sso/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    let data: any;
    try {
      data = await response.json();
    } catch (parseError) {
      throw new Error(`CICO returned invalid response (status ${response.status}): ${response.statusText}`);
    }

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error(data.error || "Invalid credentials");
      } else if (response.status === 403) {
        throw new Error(data.error || "User account is inactive");
      } else if (response.status === 400) {
        throw new Error(data.error || "Invalid request format");
      } else {
        throw new Error(data.error || `CICO returned ${response.status}`);
      }
    }

    if (!data.success || !data.token || !data.user) {
      throw new Error("Invalid CICO response format");
    }

    if (!data.user.id || !data.user.email || !data.user.fullName) {
      throw new Error("Missing required user fields from CICO");
    }

    return data;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error) {
      if (error.name === "AbortError" || error.message.includes("abort")) {
        throw new Error("CICO request timeout - server not responding");
      }
      throw error;
    }
    throw new Error("Unknown error connecting to CICO");
  }
}

const RETRYABLE_PATTERNS = [
  "timeout",
  "not responding",
  "invalid response (status 5",
  "ECONNREFUSED",
  "ECONNRESET",
  "fetch failed",
];

function isRetryable(error: Error): boolean {
  const msg = error.message.toLowerCase();
  return RETRYABLE_PATTERNS.some(p => msg.includes(p.toLowerCase()));
}

export async function loginWithCICO(username: string, password: string): Promise<CICOLoginResponse> {
  if (!username || !password) {
    throw new Error("Username and password required");
  }

  const MAX_RETRIES = 3;
  const RETRY_DELAYS = [2000, 3000, 4000];
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await attemptCICOLogin(username, password);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Unknown error");

      if (!isRetryable(lastError) || attempt === MAX_RETRIES) {
        throw lastError;
      }

      const delay = RETRY_DELAYS[attempt] || 3000;
      console.log(`[CICO] Attempt ${attempt + 1} failed (${lastError.message}), retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError || new Error("CICO login failed after retries");
}

/**
 * Verify token dengan CICO
 */
export async function verifyCICOToken(token: string): Promise<CICOLoginResponse["user"] | null> {
  try {
    const response = await fetch(`${CICO_API_URL}/api/auth/sso/validate`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) return null;

    const data = await response.json();
    return data.user || null;
  } catch {
    return null;
  }
}

/**
 * Get employee list dari CICO
 */
export async function getCICOEmployees(
  cicoToken: string,
  page = 1,
  activeOnly = true
): Promise<CICOEmployeesResponse> {
  const response = await fetch(
    `${CICO_API_URL}/api/sync/employees?page=${page}&limit=50&filter=${activeOnly ? "active" : "all"}`,
    {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${cicoToken}`,
        "Content-Type": "application/json",
      },
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to fetch employees from CICO");
  }

  return data;
}

/**
 * Get employee detail dari CICO
 */
export async function getCICOEmployee(
  cicoToken: string,
  employeeId: string
): Promise<CICOEmployee> {
  const response = await fetch(`${CICO_API_URL}/api/sync/employees/${employeeId}`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${cicoToken}`,
      "Content-Type": "application/json",
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error("Employee not found");
  }

  return data;
}
