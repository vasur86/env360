import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

/**
 * OAuth callback handler page
 * Handles the redirect from OAuth provider after successful authentication.
 * The backend sets an HTTP-only cookie, so we just need to refresh user info.
 */
export default function OAuthCallback() {
  const navigate = useNavigate();
  const { refreshUser } = useAuth();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Refresh user info (cookie is already set by backend)
        await refreshUser();
        
        // Small delay to ensure cookie is set
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Redirect to home
        navigate('/');
      } catch (error) {
        console.error('Error processing OAuth callback:', error);
        navigate('/auth/signin?error=callback_failed');
      }
    };

    handleCallback();
  }, [navigate, refreshUser]);

  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      height: '100vh',
      flexDirection: 'column',
      gap: 'var(--chakra-spacing-md)'
    }}>
      <div>Completing authentication...</div>
      <div style={{ fontSize: 12, opacity: 0.7 }}>Please wait while we sign you in.</div>
    </div>
  );
}
