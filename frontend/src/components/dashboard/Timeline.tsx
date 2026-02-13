type Item = {
  title: string;
  date: string;
  color: string;
};

type Props = {
  items: Item[];
};

export default function Timeline({ items }: Props) {
  return (
    <div style={{ display: 'grid', gap: 'var(--chakra-spacing-sm)' }}>
      {items.map((item, idx) => (
        <div
          key={idx}
          className="list-row"
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--chakra-spacing-sm)', padding: 'var(--chakra-spacing-sm)' }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 'var(--chakra-radii-full)',
              background: item.color,
              display: 'inline-block',
            }}
          />
          <div style={{ display: 'grid' }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{item.title}</span>
            <span className="text-muted" style={{ fontSize: 12 }}>{item.date}</span>
          </div>
        </div>
      ))}
    </div>
  );
}


