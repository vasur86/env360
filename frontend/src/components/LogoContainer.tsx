import logoUrl from '@/assets/logo.svg';
import * as React from 'react';
import { FiChevronDown } from 'react-icons/fi';
import { breakpoints } from './ui/theme';

function useMediaQuery(query: string) {
  const [matches, setMatches] = React.useState(false);
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

interface LogoContainerProps {
  onSidebarHover?: (hovered: boolean) => void;
}

export default function LogoContainer({ onSidebarHover }: LogoContainerProps) {
  const [scrolled, setScrolled] = React.useState(false);
  const isNarrow = useMediaQuery(`(max-width: ${breakpoints.lg})`);
  
  React.useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 1);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div
      onMouseEnter={() => onSidebarHover?.(true)}
      onMouseLeave={() => onSidebarHover?.(false)}
      style={{
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--chakra-spacing-xs)',
        background: scrolled
          ? 'linear-gradient(112.83deg, rgba(255, 255, 255, 0.82) 0%, rgba(255, 255, 255, 0.8) 110.84%)'
          : 'var(--chakra-colors-bg-subtle)',
        border: scrolled ? '1.5px solid rgba(255, 255, 255, 0.9)' : '1px solid var(--chakra-colors-border)',
        boxShadow: scrolled ? '0px 7px 23px rgba(0, 0, 0, 0.05)' : 'none',
        filter: 'none',
        backdropFilter: scrolled ? 'saturate(200%) blur(10px)' : 'none',
        borderRadius: 'var(--chakra-radii-md)',
        width: '50px',
        height: '50px',
        minWidth: '50px',
        minHeight: '50px',
        zIndex: 10,
        position: 'relative',
      }}
    >
      <img
        src={logoUrl}
        alt="App logo"
        style={{
          height: 35,
          filter: 'brightness(1.15) saturate(1.2)',
        }}
      />
      
      {/* Bottom Controls Bar - shown on narrow screens */}
      {isNarrow && (
        <div          
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: -5,
            height: 13,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-around',
            background: 'var(--chakra-colors-bg-subtle)',
            // borderTop: '1px solid var(--chakra-colors-border)',
            borderBottomLeftRadius: 'var(--chakra-radii-2xl)',
            borderBottomRightRadius: 'var(--chakra-radii-2xl)',
            cursor: 'pointer',
          }}
        >
          <button
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 13,
              height: 13,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: 'var(--chakra-colors-primary)',
            }}
            title="Menu"
          >
            <FiChevronDown size={13} />
          </button>          
        </div>
      )}
    </div>
  );
}
