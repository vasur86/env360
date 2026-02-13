type Txn = {
  name: string;
  date: string;
  price: string;
  direction: 'in' | 'out' | 'pending';
};

type Props = {
  items: Txn[];
};

export default function Transactions({ items }: Props) {
  const badgeBg = (d: Txn['direction']) =>
    d === 'in'
      ? 'var(--chakra-colors-green-500)'
      : d === 'out'
      ? 'var(--chakra-colors-red-500)'
      : 'var(--chakra-colors-bg-muted)';
  return (
    <div style={{ display: 'grid', gap: 'var(--chakra-spacing-sm)' }}>
      {items.map((t, idx) => (
        <div
          key={idx}
          className="list-row"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto auto',
            gap: 'var(--chakra-spacing-xs)',
            alignItems: 'center',
            padding: 'var(--chakra-spacing-sm)',
          }}
        >
          <div>
            <div style={{ fontWeight: 600 }}>{t.name}</div>
            <div className="text-muted" style={{ fontSize: 12 }}>{t.date}</div>
          </div>
          <div
            style={{
              height: 24,
              borderRadius: 'var(--chakra-radii-full)',
              background: badgeBg(t.direction),
              color: 'var(--chakra-colors-white)',
              fontSize: 12,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 var(--chakra-spacing-sm)',
            }}
          >
            {t.direction === 'in' ? 'In' : t.direction === 'out' ? 'Out' : 'Pending'}
          </div>
          <div style={{ fontWeight: 700 }}>{t.price}</div>
        </div>
      ))}
    </div>
  );
}


