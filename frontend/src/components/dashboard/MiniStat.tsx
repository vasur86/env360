import type { IconType } from 'react-icons';

type MiniStatProps = {
  label: string;
  value: string | number;
  helper?: string;
  icon?: IconType;
  accent?: string; // CSS color for icon box background
};

export default function MiniStat({ label, value, helper, icon: IconCmp, accent }: MiniStatProps) {
  return (
    <div
      style={{
        border: '1px solid var(--chakra-colors-border)',
        borderRadius: 'var(--chakra-radii-xl)',
        background: 'var(--chakra-colors-bg-subtle)',
        boxShadow: '0px 5px 14px rgba(0, 0, 0, 0.05)',
        padding: 'var(--chakra-spacing-md)',
        display: 'grid',
        gap: 'var(--chakra-spacing-xs)',
        minWidth: 160,
      }}
    >
      {IconCmp ? (
        <span
          style={{
            width: 30,
            height: 30,
            borderRadius: 'var(--chakra-radii-md)',
            background: accent || 'var(--chakra-colors-primary-500)',
            color: 'var(--chakra-colors-white)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <IconCmp size={16} />
        </span>
      ) : null}
      <div style={{ fontSize: 12, opacity: 0.8 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
      {helper ? <div style={{ fontSize: 12, opacity: 0.8 }}>{helper}</div> : null}
    </div>
  );
}


