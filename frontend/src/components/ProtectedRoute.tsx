import { ReactNode, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

interface ProtectedRouteProps {
  children: ReactNode;
  requireAdmin?: boolean;
}

/**
 * Protected route component that requires authentication
 * Automatically redirects to SSO login if not authenticated
 */
export default function ProtectedRoute({ children, requireAdmin = false }: ProtectedRouteProps) {
  const { isAuthenticated, user, isLoading, login } = useAuth();
  const location = useLocation();

  // Redirect to SSO login if not authenticated (after loading completes)
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      // Redirect to SSO login with current URL as redirect_uri
      const redirectUri = `${window.location.origin}${location.pathname}${location.search}`;
      login(redirectUri);
    }
  }, [isLoading, isAuthenticated, login, location]);

  if (isLoading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh' 
      }}>
        Loading...
      </div>
    );
  }

  // If not authenticated, the useEffect will handle redirect
  // Show loading while redirect is happening
  if (!isAuthenticated) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh' 
      }}>
        Redirecting to login...
      </div>
    );
  }

  if (requireAdmin && !user?.is_admin) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        flexDirection: 'column',
        gap: 'var(--chakra-spacing-sm)'
      }}>
        <div style={{ fontSize: 18, fontWeight: 500 }}>Access Denied</div>
        <div style={{ fontSize: 14, color: 'var(--chakra-colors-fg-muted)' }}>
          Admin access required
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
