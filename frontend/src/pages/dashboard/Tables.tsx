import { Card, CardBody, CardHeader } from '@/components/ui/Card';

type Row = {
  name: string;
  role: string;
  status: 'Online' | 'Offline' | 'Working' | 'Canceled' | 'Done';
  date: string;
};

const rows: Row[] = [
  { name: 'Esthera Jackson', role: 'Manager', status: 'Online', date: '14/06/21' },
  { name: 'Alexa Liras', role: 'Programmer', status: 'Offline', date: '12/05/21' },
  { name: 'Laurent Michael', role: 'Executive', status: 'Online', date: '07/06/21' },
  { name: 'Freduardo Hill', role: 'Manager', status: 'Online', date: '14/11/21' },
  { name: 'Daniel Thomas', role: 'Programmer', status: 'Offline', date: '21/01/21' },
];

export default function Tables() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--chakra-spacing-md)' }}>
      <Card>
        <CardHeader>Members table</CardHeader>
        <CardBody>
          <div style={{ overflowX: 'auto' }}>
            <table
              className="table-hover"
              style={{
                width: '100%',
                minWidth: 640,
                borderCollapse: 'separate',
                borderSpacing: 0,
              }}
            >
              <thead>
                <tr>
                  <th
                    className="text-muted"
                    style={{ textAlign: 'left', padding: 'var(--chakra-spacing-sm)', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}
                  >
                    Name
                  </th>
                  <th
                    className="text-muted"
                    style={{ textAlign: 'left', padding: 'var(--chakra-spacing-sm)', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}
                  >
                    Role
                  </th>
                  <th
                    className="text-muted"
                    style={{ textAlign: 'left', padding: 'var(--chakra-spacing-sm)', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}
                  >
                    Status
                  </th>
                  <th
                    className="text-muted"
                    style={{ textAlign: 'left', padding: 'var(--chakra-spacing-sm)', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}
                  >
                    Date
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const badgeColor =
                    r.status === 'Online'
                      ? 'var(--chakra-colors-green-500)'
                      : r.status === 'Done'
                      ? 'var(--chakra-colors-green-500)'
                      : r.status === 'Working'
                      ? 'var(--chakra-colors-primary-500)'
                      : r.status === 'Canceled'
                      ? 'var(--chakra-colors-red-500)'
                      : 'var(--chakra-colors-gray-400)';
                  return (
                    <tr
                      key={r.name}
                      style={{
                        borderTop: '1px solid var(--chakra-colors-border)',
                      }}
                    >
                      <td style={{ padding: 'var(--chakra-spacing-sm)', fontSize: 14, fontWeight: 600 }}>{r.name}</td>
                      <td style={{ padding: 'var(--chakra-spacing-sm)', fontSize: 14 }}>{r.role}</td>
                      <td style={{ padding: 'var(--chakra-spacing-sm)' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: 'calc(var(--chakra-spacing-xs) / 2) var(--chakra-spacing-sm)',
                            borderRadius: 'var(--chakra-radii-full)',
                            background: badgeColor,
                            color: 'var(--chakra-colors-white)',
                            fontSize: 12,
                          }}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="text-muted" style={{ padding: 'var(--chakra-spacing-sm)', fontSize: 13 }}>{r.date}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}


