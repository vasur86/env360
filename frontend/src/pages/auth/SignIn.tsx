import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect } from 'react';

export default function SignIn() {
  const { login, isAuthenticated } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const error = searchParams.get('error');
  
  // Map error codes to user-friendly messages
  const getErrorMessage = (errorCode: string | null) => {
    if (!errorCode) return null;
    const errorMap: Record<string, string> = {
      'oauth_not_configured': 'OAuth is not configured on the server. Please contact your administrator.',
      'no_token': 'No authentication token received. Please try again.',
      'callback_failed': 'Authentication callback failed. Please try again.',
    };
    return errorMap[errorCode] || `Authentication error: ${errorCode}`;
  };

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  const handleSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    // Redirect to OAuth login with frontend callback URL as redirect_uri
    // The backend will redirect back here after successful authentication
    const redirectUri = `${window.location.origin}/auth/callback`;
    login(redirectUri);
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 'var(--chakra-spacing-xl)' }}>
      <Card style={{ width: 420 }}>
        <CardHeader>Sign In</CardHeader>
        <CardBody>
          {error && (
            <div
              style={{
                padding: 'var(--chakra-spacing-sm)',
                marginBottom: 'var(--chakra-spacing-sm)',
                borderRadius: 'var(--chakra-radii-md)',
                background: 'var(--chakra-colors-red-50)',
                color: 'var(--chakra-colors-red-700)',
                fontSize: 14,
              }}
            >
              {getErrorMessage(error)}
            </div>
          )}
          <form
            onSubmit={handleSignIn}
            style={{ display: 'grid', gap: 'var(--chakra-spacing-sm)' }}
          >
            <div style={{ fontSize: 14, color: 'var(--chakra-colors-fg-muted)', marginBottom: 'var(--chakra-spacing-xs)' }}>
              Sign in with your organization account
            </div>
            <button
              type="submit"
              style={{
                height: 40,
                borderRadius: 'var(--chakra-radii-md)',
                border: '1px solid var(--chakra-colors-border)',
                background: 'var(--chakra-colors-primary-500)',
                color: 'var(--chakra-colors-white)',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Sign In with SSO
            </button>
            <div style={{ fontSize: 12, textAlign: 'center', marginTop: 'var(--chakra-spacing-xs)' }}>
              <Link to="/auth/signup" style={{ color: 'var(--chakra-colors-primary-500)' }}>
                Need help?
              </Link>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}


