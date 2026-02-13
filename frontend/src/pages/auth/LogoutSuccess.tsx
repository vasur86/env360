import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@chakra-ui/react';
import { useNavigate } from 'react-router-dom';

export default function LogoutSuccess() {
  const navigate = useNavigate();

  const handleSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    // Redirect to home page, which will trigger SSO login if not authenticated
    // The ProtectedRoute will handle the redirect to SSO
    navigate('/');
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 'var(--chakra-spacing-xl)' }}>
      <Card style={{ width: 420 }}>
        <CardHeader>Logged Out Successfully</CardHeader>
        <CardBody>
          <div
            style={{
              padding: 'var(--chakra-spacing-md)',
              marginBottom: 'var(--chakra-spacing-md)',
              borderRadius: 'var(--chakra-radii-md)',
              background: 'var(--chakra-colors-green-50)',
              color: 'var(--chakra-colors-green-700)',
              fontSize: 14,
              textAlign: 'center',
            }}
          >
            You have been successfully logged out.
          </div>
          <form
            onSubmit={handleSignIn}
            style={{ display: 'grid', gap: 'var(--chakra-spacing-sm)' }}
          >            
            <Button
              type="submit"
              colorPalette="primary"
              size="md"
              width="100%"
            >
              Sign in again to continue
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
