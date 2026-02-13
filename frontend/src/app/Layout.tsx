import { Outlet, useLocation } from 'react-router-dom';
import { Box, Flex } from '@chakra-ui/react';
import * as React from 'react';
import Sidebar from '@/components/Sidebar';
import Topbar from '@/components/Topbar';
import LogoContainer from '@/components/LogoContainer';
import { breakpoints } from '@/components/ui/theme';
import Footer from '@/components/Footer';
import { useAuth } from '@/contexts/AuthContext';

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

export default function Layout() {
  const [sidebarHovered, setSidebarHovered] = React.useState(false);
  const isNarrow = useMediaQuery(`(max-width: ${breakpoints.lg})`);
  const location = useLocation();
  const { isAuthenticated, isLoading, login } = useAuth();

  // List of public routes that don't require authentication
  const publicRoutes = ['/auth/signin', '/auth/signup', '/auth/callback', '/auth/logout-success'];
  const isPublicRoute = publicRoutes.some(route => location.pathname.startsWith(route));
  
  // Check if current route is an auth page (to hide sidebar and topbar)
  const isAuthPage = location.pathname.startsWith('/auth');

  // Redirect to SSO login if not authenticated and not on a public route
  React.useEffect(() => {
    if (!isLoading && !isAuthenticated && !isPublicRoute) {
      // Redirect to SSO login with current URL as redirect_uri
      const redirectUri = `${window.location.origin}${location.pathname}${location.search}`;
      login(redirectUri);
    }
  }, [isLoading, isAuthenticated, isPublicRoute, login, location]);

  // Show loading while checking authentication
  if (isLoading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh' 
      }}>
        Loading...
      </div>
    );
  }

  // Show redirecting message while redirecting to SSO
  if (!isAuthenticated && !isPublicRoute) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        flexDirection: 'column',
        gap: 'var(--chakra-spacing-sm)'
      }}>
        <div style={{ fontSize: 16 }}>Redirecting to login...</div>
      </div>
    );
  }
  
  // For auth pages, render a simple layout without sidebar and topbar
  if (isAuthPage) {
    return (
      <Box
        minHeight="100vh"
        width="100%"
        color="fg"
        display="flex"
        flexDirection="column"
        overflowX="hidden"
      >
        <Box
          flex="1"
          display="flex"
          flexDirection="column"
          minW={0}
        >
          <Outlet />
        </Box>
      </Box>
    );
  }

  // For regular pages, render full layout with sidebar and topbar
  return (
    <Flex minHeight="100vh" width="100%" color="fg" 
      gap="var(--chakra-spacing-xs)"
      minW="var(--chakra-responsive-breakpoints-sm)"
      // padding="var(--chakra-spacing-xs)"
      overflowX="hidden">
      
      <Sidebar hovered={sidebarHovered} onHoverChange={setSidebarHovered} />      
      <Box
        as="main"
        flex="1"
        zIndex="1"
        display="flex"
        flexDirection="column"
        // let page (window) handle vertical scrolling
        minW={0}
      >               
        <Box 
          display="flex" flexDirection="row" alignItems="center"  position="fixed" top="0" left="0" right="0" zIndex="10"
          padding="var(--chakra-spacing-xs)" gap="calc(var(--chakra-spacing-xs))"
          >
          <LogoContainer onSidebarHover={setSidebarHovered} />
          <Topbar />          
        </Box>
        <Box
          // marginTop="var(--chakra-spacing-xs)"
          // paddingLeft="calc(60px + var(--chakra-spacing-xs))"
          paddingLeft={isNarrow ? "calc(var(--chakra-spacing-sm))" : "calc(56px + var(--chakra-spacing-sm))"}
          paddingRight="var(--chakra-spacing-sm)"
          paddingTop="calc(60px + var(--chakra-spacing-xs)/2)"
          paddingBottom="var(--chakra-spacing-xs)"
          flex="1"
          // allow natural document flow; avoid clipping horizontal
          overflowX="hidden"          
          minW={0}
        >
          <Outlet />      
          <Footer />                
        </Box>
      </Box>
    </Flex>
  );
}
