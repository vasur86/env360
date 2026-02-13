export default function Footer() {
  return (
    <footer
      style={{     
        marginTop: 'var(--chakra-spacing-xs)',
        padding: 'var(--chakra-spacing-sm) var(--chakra-spacing-md)',
        borderTop: '1px solid var(--chakra-colors-border)',
        background: 'var(--chakra-colors-bg-subtle)',
        borderRadius: 'var(--chakra-radii-lg)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--chakra-spacing-xs)' }}>
        <span style={{ fontSize: 12, opacity: 0.8 }}>
          © {new Date().getFullYear()} Synvaraworks Private Limited. All rights reserved.
        </span>
        <div style={{ flex: 1 }} />
        <a
          href="#"
          style={{ fontSize: 12, color: 'var(--chakra-colors-primary-500)', textDecoration: 'none' }}
        >
          Docs
        </a>
        <a
          href="#"
          style={{ fontSize: 12, color: 'var(--chakra-colors-primary-500)', textDecoration: 'none' }}
        >
          Support
        </a>
      </div>
    </footer>
  );
}


