type StatCardProps = {
  label: string;
  value: number | string;
};

export function StatCard({ label, value }: StatCardProps) {
  return (
    <div
      style={{
        border: '1px solid var(--chakra-colors-border)',
        borderRadius: 'var(--chakra-radii-lg)',
        padding: 'var(--chakra-spacing-md)',
        minWidth: 160,
        background: 'var(--chakra-colors-bg-subtle)',
        boxShadow: '0 2px 8px rgba(2, 6, 23, 0.06)',
      }}
    >
      <div className="text-muted" style={{ fontSize: 12, marginBottom: 'calc(var(--chakra-spacing-xs) - 2px)' }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700 }}>{value}</div>
    </div>
  );
}
