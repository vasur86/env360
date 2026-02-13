import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface User {
  id: string;
  email: string;
  name: string;
  is_active: boolean;
  is_admin: boolean;
  is_super_admin?: boolean;
  image?: string; // Optional user profile image URL
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (redirectUri?: string) => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const fetchUserRef = React.useRef<Promise<User | null> | null>(null);
  const isMountedRef = React.useRef(true);

  // Fetch user info from backend (cookie-based auth)
  const fetchUser = async (): Promise<User | null> => {
    // If there's already a fetch in progress, return that promise instead of making a new request
    if (fetchUserRef.current) {
      return fetchUserRef.current;
    }

    const fetchPromise = (async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/auth/me`, {
          method: 'GET',
          credentials: 'include', // Include cookies in request
          headers: {
            'Content-Type': 'application/json',
          },
        });

        // Handle authentication errors
        if (response.status === 401 || response.status === 403) {
          // Clear any stale auth state
          localStorage.removeItem('env360_auth_token');
          localStorage.removeItem('env360_user');
          // Redirect to login with current URL as redirect_uri
          const currentUrl = window.location.href;
          window.location.href = `${API_BASE_URL}/auth/login?redirect_uri=${encodeURIComponent(currentUrl)}`;
          return null;
        }

        if (response.ok) {
          const userData = await response.json();
          return userData;
        } else {
          return null;
        }
      } catch (error) {
        console.error('Error fetching user:', error);
        return null;
      } finally {
        // Clear the ref after the fetch completes
        fetchUserRef.current = null;
      }
    })();

    fetchUserRef.current = fetchPromise;
    return fetchPromise;
  };

  // Load auth state on mount
  useEffect(() => {
    isMountedRef.current = true;
    const loadAuth = async () => {
      const userData = await fetchUser();
      // Only update state if component is still mounted
      if (isMountedRef.current) {
        setUser(userData);
        setIsLoading(false);
      }
    };
    loadAuth();

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const login = (redirectUri?: string) => {
    // Build the OAuth login URL with redirect_uri
    const currentUrl = redirectUri || window.location.href;
    const loginUrl = `${API_BASE_URL}/auth/login?redirect_uri=${encodeURIComponent(currentUrl)}`;
    
    // Redirect to OAuth login
    window.location.href = loginUrl;
  };

  const logout = async () => {
    try {
      // Call backend logout endpoint to clear cookie
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include', // Include cookies in request
        headers: {
          'Content-Type': 'application/json',
        },
      });
    } catch (error) {
      console.error('Error logging out:', error);
    }
    // Redirect to logout success page immediately
    // This prevents the Layout from showing "Redirecting to login..." message
    // The state will be cleared when the new page loads
    window.location.href = '/auth/logout-success';
  };

  const refreshUser = async () => {
    const userData = await fetchUser();
    setUser(userData);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
