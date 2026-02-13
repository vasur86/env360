import { Card, CardBody, CardHeader } from '@/components/ui/Card';

export default function Profile() {
  return (
    <div className="grid-1-1">
      <Card>
        <CardHeader>Profile Information</CardHeader>
        <CardBody>
          <div style={{ display: 'grid', gap: 'var(--chakra-spacing-xs)' }}>
            <div>
              <strong>Full Name:</strong> John Doe
            </div>
            <div>
              <strong>Mobile:</strong> (44) 123 1234 123
            </div>
            <div>
              <strong>Email:</strong> john.doe@example.com
            </div>
            <div>
              <strong>Location:</strong> San Francisco, USA
            </div>
            <div>
              <strong>About:</strong> Passionate about cloud infra and developer experience.
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>Team Members</CardHeader>
        <CardBody>
          <ul style={{ margin: 0, paddingLeft: 'var(--chakra-spacing-md)' }}>
            <li>Jane Cooper — UI/UX</li>
            <li>Robert Fox — Backend</li>
            <li>Jenny Wilson — Product</li>
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}


