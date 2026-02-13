/**
 * Authentication API client
 */

// Use proxy in development (relative URL), or full URL in production
// In dev: Vite proxy forwards /api to backend
// In prod: Use full API URL or configure nginx to proxy
const getApiBaseUrl = () => {
  // If VITE_API_BASE_URL is set, use it (for production or custom setup)
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  // In development, use relative URL to leverage Vite proxy
  if (import.meta.env.DEV) {
    return '/api/v1';
  }
  // Fallback for production without env var (assumes same origin or nginx proxy)
  return '/api/v1';
};

const API_BASE_URL = getApiBaseUrl();

export interface User {
  id: string;
  email: string;
  name: string;
  is_active: boolean;
  is_admin: boolean;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

/**
 * Get current user info
 */
export async function getCurrentUser(token: string): Promise<User> {
  const response = await fetch(`${API_BASE_URL}/auth/me`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    credentials: 'include', // Include cookies for authentication
  });

  if (!response.ok) {
    throw new Error('Failed to get user info');
  }

  return response.json();
}

/**
 * Create API client with authentication
 */
export function createApiClient(token: string | null) {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return {
    get: async <T>(url: string): Promise<T> => {
      const response = await fetch(`${API_BASE_URL}${url}`, {
        method: 'GET',
        headers,
        credentials: 'include', // Include cookies for authentication
      });

      if (!response.ok) {
        if (response.status === 401) {
          // Token expired or invalid, clear auth
          localStorage.removeItem('env360_auth_token');
          localStorage.removeItem('env360_user');
          window.location.href = '/auth/signin';
        }
        throw new Error(`API request failed: ${response.statusText}`);
      }

      return response.json();
    },
    post: async <T>(url: string, data?: unknown): Promise<T> => {
      const response = await fetch(`${API_BASE_URL}${url}`, {
        method: 'POST',
        headers,
        credentials: 'include', // Include cookies for authentication
        body: data ? JSON.stringify(data) : undefined,
      });

      if (!response.ok) {
        if (response.status === 401) {
          localStorage.removeItem('env360_auth_token');
          localStorage.removeItem('env360_user');
          window.location.href = '/auth/signin';
        }
        throw new Error(`API request failed: ${response.statusText}`);
      }

      return response.json();
    },
    put: async <T>(url: string, data?: unknown): Promise<T> => {
      const response = await fetch(`${API_BASE_URL}${url}`, {
        method: 'PUT',
        headers,
        credentials: 'include', // Include cookies for authentication
        body: data ? JSON.stringify(data) : undefined,
      });

      if (!response.ok) {
        if (response.status === 401) {
          localStorage.removeItem('env360_auth_token');
          localStorage.removeItem('env360_user');
          window.location.href = '/auth/signin';
        }
        throw new Error(`API request failed: ${response.statusText}`);
      }

      return response.json();
    },
    delete: async <T>(url: string): Promise<T> => {
      const response = await fetch(`${API_BASE_URL}${url}`, {
        method: 'DELETE',
        headers,
        credentials: 'include', // Include cookies for authentication
      });

      if (!response.ok) {
        if (response.status === 401) {
          localStorage.removeItem('env360_auth_token');
          localStorage.removeItem('env360_user');
          window.location.href = '/auth/signin';
        }
        throw new Error(`API request failed: ${response.statusText}`);
      }

      return response.json();
    },
  };
}
