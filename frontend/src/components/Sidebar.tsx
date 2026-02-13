import { NavLink } from 'react-router-dom';
// no Chakra primitives used here to keep test environment simple
import * as React from 'react';
import type { IconType } from 'react-icons';
import { breakpoints } from './ui/theme';
import { Flex, Text } from '@chakra-ui/react';
import {
  HiHome, HiOutlineHome,  
  HiSquare3Stack3D,
  HiOutlineSquare3Stack3D,
  HiServerStack,
  HiOutlineServerStack,  
  HiMiniSquare3Stack3D,  
  HiSquares2X2,
  HiOutlineSquares2X2,
  HiCog8Tooth,
  HiOutlineCog8Tooth
} from 'react-icons/hi2';

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

interface SidebarProps {
  hovered?: boolean;
  onHoverChange?: (hovered: boolean) => void;
}

export default function Sidebar({ hovered = false, onHoverChange }: SidebarProps) {
  // Always collapsed; collapse upward on narrow screens unless hovered
  const collapsed = true;
  const isHidden = useMediaQuery(`(max-width: ${breakpoints.lg})`);
  const collapsedWidth = '50px';
  const expandedWidth = '260px';
  
  // Calculate height: collapse to 0 when hidden and not hovered
  const fullHeight = 'calc(100vh - 50px - 2*var(--chakra-spacing-xs) - var(--chakra-spacing-xs)/2)';
  const sidebarHeight = isHidden && !hovered ? '0' : fullHeight;

  const linkBaseStyle: React.CSSProperties = {
    padding: 'calc(var(--chakra-spacing-xs) - 2px) var(--chakra-spacing-xs)',
    borderRadius: 'var(--chakra-radii-sm)',
    alignItems: 'center',
    justifyContent: 'center',
    textDecoration: 'none',
    color: 'var(--chakra-colors-primary)',
    display: 'block',
    backgroundColor: 'transparent',
  };

  const navItems: Array<{ to: string; label: string; solidIcon: IconType; outlineIcon: IconType }> = [
    { to: '/', label: 'Home', solidIcon: HiHome, outlineIcon: HiOutlineHome },
    // { to: '/tables', label: 'Tables', icon: FiTable },
    // { to: '/billing', label: 'Billing', icon: FiCreditCard },
    // { to: '/profile', label: 'Profile', icon: FiUser },
    // { to: '/rtl', label: 'RTL', icon: FiGlobe },
    { to: '/projects', label: 'Projects', solidIcon: HiSquare3Stack3D, outlineIcon: HiOutlineSquare3Stack3D },
    { to: '/environments', label: 'Envs', solidIcon: HiServerStack, outlineIcon: HiOutlineServerStack },
    { to: '/services', label: 'Services', solidIcon: HiSquares2X2, outlineIcon: HiOutlineSquares2X2}, 
    { to: '/admin', label: 'Admin', solidIcon: HiCog8Tooth, outlineIcon: HiOutlineCog8Tooth},
    // { to: '/about', label: 'About', solidIcon: HiInformationCircle, outlineIcon: HiOutlineInformationCircle },
  ];

  return (
    <aside
      onMouseEnter={() => {
        if (isHidden) {
          onHoverChange?.(true);
        }
      }}
      onMouseLeave={() => {
        if (isHidden) {
          onHoverChange?.(false);
        }
      }}
      style={{
        width: collapsed ? collapsedWidth : expandedWidth,
        padding: isHidden && !hovered ? '0' : 'calc(var(--chakra-spacing-xs) / 2)',
        gap: 'calc(var(--chakra-spacing-xs) / 2)',
        transition: 'width 0.2s ease, height 0.3s ease, padding 0.3s ease, opacity 0.2s ease',
        backgroundColor: 'var(--chakra-colors-bg-subtle)',
        border: isHidden && !hovered ? 'none' : '1px solid var(--chakra-colors-border)',
        borderRadius: 'var(--chakra-radii-md)',                
        boxShadow: isHidden && !hovered ? 'none' : '0px 5px 14px rgba(0, 0, 0, 0.05)',
        position: 'fixed',
        marginTop: 'var(--chakra-spacing-xs)',
        marginBottom: 'var(--chakra-spacing-xs)',
        marginLeft: 'var(--chakra-spacing-xs)',
        // marginRight: 'var(--chakra-spacing-xs)',
        top: 'calc(50px + var(--chakra-spacing-xs)/2)',
        left: '0',
        height: sidebarHeight,
        overflow: isHidden && !hovered ? 'hidden' : 'visible',
        zIndex: hovered ? 20 : 10,
        opacity: hovered ? 1 : (isHidden ? 0 : 1),
        pointerEvents: hovered || !isHidden ? 'auto' : 'none',
      }}
    >      
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'calc(var(--chakra-spacing-xs) / 2)'         
      }}>
        {navItems.map(({ to, label, solidIcon: IconCmp, outlineIcon: OutlineIconCmp }) => {
          return (            
              <NavLink
                key={to}
                to={to}
                style={({ isActive }) => ({
                  ...linkBaseStyle,                
                })}
                title={collapsed ? label : undefined}
              >
                {({ isActive }) => (
                  <Flex direction="column" align="center" justify="center" gap="0px">
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 28,
                        height: 28,
                        borderRadius: 'var(--chakra-radii-md)',
                        // background: isActive ? 'var(--chakra-colors-primary)' : 'var(--chakra-colors-primary-500)',                    
                      }}
                    >
                      {isActive ? <IconCmp size={24} color="var(--chakra-colors-sws-primary)" /> : <OutlineIconCmp size={24} color="var(--chakra-colors-gray-500)" />}                  
                    </span>                                
                    <Text 
                          fontSize="10px" 
                          fontWeight="bold"
                          color={isActive ? "var(--chakra-colors-primary)" : "var(--chakra-colors-gray-500)"} 
                          mt="-3px">{label}</Text>
                  </Flex>
                )}
              </NavLink>                          
          );
        })}
      </div>
    </aside>
  );
}
