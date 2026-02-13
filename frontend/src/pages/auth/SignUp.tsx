import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Link } from 'react-router-dom';

export default function SignUp() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 'var(--chakra-spacing-xl)' }}>
      <Card style={{ width: 420 }}>
        <CardHeader>Sign Up</CardHeader>
        <CardBody>
          <form
            onSubmit={(e) => {
              e.preventDefault();
            }}
            style={{ display: 'grid', gap: 'var(--chakra-spacing-sm)' }}
          >
            <label style={{ display: 'grid', gap: 'calc(var(--chakra-spacing-xs) - 2px)' }}>
              <span>Full name</span>
              <input
                required
                style={{
                  height: 36,
                  border: '1px solid var(--chakra-colors-border)',
                  borderRadius: 'var(--chakra-radii-md)',
                  background: 'var(--chakra-colors-bg)',
                  color: 'inherit',
                  padding: '0 var(--chakra-spacing-sm)',
                }}
              />
            </label>
            <label style={{ display: 'grid', gap: 'calc(var(--chakra-spacing-xs) - 2px)' }}>
              <span>Email</span>
              <input
                type="email"
                required
                style={{
                  height: 36,
                  border: '1px solid var(--chakra-colors-border)',
                  borderRadius: 'var(--chakra-radii-md)',
                  background: 'var(--chakra-colors-bg)',
                  color: 'inherit',
                  padding: '0 var(--chakra-spacing-sm)',
                }}
              />
            </label>
            <label style={{ display: 'grid', gap: 'calc(var(--chakra-spacing-xs) - 2px)' }}>
              <span>Password</span>
              <input
                type="password"
                required
                style={{
                  height: 36,
                  border: '1px solid var(--chakra-colors-border)',
                  borderRadius: 'var(--chakra-radii-md)',
                  background: 'var(--chakra-colors-bg)',
                  color: 'inherit',
                  padding: '0 var(--chakra-spacing-sm)',
                }}
              />
            </label>
            <button
              type="submit"
              style={{
                height: 36,
                borderRadius: 'var(--chakra-radii-md)',
                border: '1px solid var(--chakra-colors-border)',
                background: 'var(--chakra-colors-primary-500)',
                color: 'var(--chakra-colors-white)',
              }}
            >
              Create account
            </button>
            <div style={{ fontSize: 12 }}>
              Have an account? <Link to="/auth/signin">Sign in</Link>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}


