import { Card, CardBody, CardHeader } from '@/components/ui/Card';

type Invoice = { date: string; code: string; price: string; format: 'PDF' };

const invoices: Invoice[] = [
  { date: 'March, 01, 2020', code: '#MS-415646', price: '$180', format: 'PDF' },
  { date: 'February, 10, 2020', code: '#RV-126749', price: '$250', format: 'PDF' },
  { date: 'April, 05, 2020', code: '#FB-212562', price: '$560', format: 'PDF' },
  { date: 'June, 25, 2019', code: '#QW-103578', price: '$120', format: 'PDF' },
  { date: 'March, 01, 2019', code: '#AR-803481', price: '$300', format: 'PDF' },
];

export default function Billing() {
  return (
    <div className="grid-1-1">
      <Card>
        <CardHeader>Invoices</CardHeader>
        <CardBody>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--chakra-spacing-xs)' }}>
            {invoices.map((inv) => (
              <div
                key={inv.code}
                className="list-row"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 1fr 1fr auto',
                  gap: 'var(--chakra-spacing-xs)',
                  alignItems: 'center',
                  padding: 'var(--chakra-spacing-sm)',
                }}
              >
                <div className="text-muted" style={{ fontSize: 13 }}>{inv.date}</div>
                <div className="text-muted" style={{ fontSize: 13 }}>{inv.code}</div>
                <div style={{ fontWeight: 700 }}>{inv.price}</div>
                <button
                  style={{
                    height: 28,
                    padding: '0 var(--chakra-spacing-sm)',
                    borderRadius: 'var(--chakra-radii-sm)',
                    border: '1px solid var(--chakra-colors-border)',
                    background: 'var(--chakra-colors-primary-500)',
                    color: 'var(--chakra-colors-white)',
                    cursor: 'pointer',
                    transition: 'opacity 0.15s ease',
                  }}
                  onClick={() => {}}
                  onMouseEnter={(e) => ((e.currentTarget.style.opacity = '0.9'))}
                  onMouseLeave={(e) => ((e.currentTarget.style.opacity = '1'))}
                >
                  {inv.format}
                </button>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>Payment method</CardHeader>
        <CardBody>
          <div style={{ display: 'flex', gap: 'var(--chakra-spacing-sm)' }}>
            <div
              className="list-row"
              style={{
                flex: 1,
                padding: 'var(--chakra-spacing-md)',
              }}
            >
                <div style={{ fontWeight: 600, marginBottom: 'var(--chakra-spacing-xs)', color: 'var(--chakra-colors-fg)' }}>Visa •••• 4210</div>
              <div>Expires 12/29</div>
            </div>
            <div
              className="list-row"
              style={{
                flex: 1,
                padding: 'var(--chakra-spacing-md)',
              }}
            >
                <div style={{ fontWeight: 600, marginBottom: 'var(--chakra-spacing-xs)', color: 'var(--chakra-colors-fg)' }}>Mastercard •••• 9850</div>
              <div>Expires 08/27</div>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}


