import * as React from 'react';
import { useLocation, useSearchParams, useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { FiPower } from 'react-icons/fi';
import { Button, Breadcrumb } from '@chakra-ui/react';
import { useProjectDetails, useEnvironmentDetails, useServiceDetails } from '@/api/client';

export default function Topbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const pathname = location.pathname;
  const search = location.search;
  const [scrolled, setScrolled] = React.useState(false);
  const [showUserMenu, setShowUserMenu] = React.useState(false);
  const userMenuRef = React.useRef<HTMLDivElement>(null);
  const isSecondary = pathname !== '/';
  const { user, logout, isAuthenticated } = useAuth();

  // Get user initials from name
  const getUserInitials = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  // Close menu when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };

    if (showUserMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showUserMenu]);

  React.useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 1);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Derive breadcrumbs
  // Supported:
  // - /projects → Home / Projects
  // - /projects/:projectId( ?tab=environments ) → Home / Projects / <projectName> OR Home / <projectName> / Environments
  // - /environments/:environmentId → Home / <projectName> / Environments / <environmentName>
  let crumbs: Array<{ label: string; onClick?: () => void }> = [{ label: 'Home', onClick: () => navigate('/') }];
  let title = 'Dashboard';

  const projMatch = pathname.match(/^\/projects\/([^/]+)/);
  const envDetailMatch = pathname.match(/^\/environments\/([^/]+)/);
  const svcDetailMatch = pathname.match(/^\/services\/([^/]+)/);

  // Data hooks for names
  const projectId = projMatch?.[1];
  const environmentId = envDetailMatch?.[1];
  const { data: projectDetails } = useProjectDetails(projectId || '');
  const { data: environmentDetails } = useEnvironmentDetails(environmentId || '');
  const serviceId = svcDetailMatch?.[1];
  const { data: serviceDetails } = useServiceDetails(serviceId || '');

  if (pathname === '/environments') {
    // Environments list page
    crumbs = [{ label: 'Home', onClick: () => navigate('/') }];
    title = 'Environments';
  } else if (pathname === '/services') {
    // Services list page
    crumbs = [{ label: 'Home', onClick: () => navigate('/') }];
    title = 'Services';
  } else if (pathname === '/projects') {
    crumbs = [
      { label: 'Home', onClick: () => navigate('/') },
    ];
    title = 'Projects';
  } else if (projectId) {
    const projectName = projectDetails?.project?.name || 'Project';
    const params = new URLSearchParams(search);
    const tab = params.get('tab') || '';
    if (tab === 'environments') {
      // Environments tab (Project): Breadcrumbs => Home; Title => Environments
      crumbs = [{ label: 'Home', onClick: () => navigate('/') }];
      title = 'Environments';
    } else {
      // Project details: Breadcrumbs => Home / Projects; Title => project name
      crumbs = [
        { label: 'Home', onClick: () => navigate('/') },
        { label: 'Projects', onClick: () => navigate('/projects') },
      ];
      title = projectName;
    }
  } else if (environmentId) {
    const env = environmentDetails?.environment;
    const envName = env?.name || 'Environment';
    const projIdForEnv = env?.projectId || env?.project?.id || '';
    const projNameForEnv = env?.project?.name || 'Project';
    crumbs = [
      { label: 'Home', onClick: () => navigate('/') },
      { label: projNameForEnv, onClick: () => navigate(`/projects/${projIdForEnv}`) },
      { label: 'Environments', onClick: () => navigate(`/projects/${projIdForEnv}?tab=environments`) },
    ];
    title = envName;
  } else if (serviceId) {
    const svc = serviceDetails?.service;
    const svcName = svc?.name || 'Service';
    const projIdForSvc = svc?.projectId || svc?.project?.id || '';
    const projNameForSvc = svc?.project?.name || 'Project';
    // Breadcrumbs: Home / <projectName> / Services
    crumbs = [
      { label: 'Home', onClick: () => navigate('/') },
      { label: projNameForSvc, onClick: () => navigate(`/projects/${projIdForSvc}`) },
      { label: 'Services', onClick: () => navigate(`/projects/${projIdForSvc}?tab=services`) },
    ];
    // Title: service name
    title = svcName;
  } else if (pathname === '/projects') {
    crumbs = [
      { label: 'Home', onClick: () => navigate('/') },
    ];
    title = 'Projects';
  } else {
    // Fallback
    title = 'Dashboard';
  }

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        // gap: 'var(--chakra-spacing-sm)',
        padding: 'var(--chakra-spacing-xs)',
        backgroundColor: "var(--chakra-colors-bg)",
        // background: 
        //   scrolled || isSecondary
        //     ? 'linear-gradient(112.83deg, rgba(255, 255, 255, 0.82) 0%, rgba(255, 255, 255, 0.8) 110.84%)'
        //     : 'var(--chakra-colors-bg-subtle)',
        // border:
        //   scrolled || isSecondary ? '1.5px solid rgba(255, 255, 255, 0.9)' : '1px solid var(--chakra-colors-border)',
        boxShadow: scrolled || isSecondary ? '0px 7px 23px rgba(0, 0, 0, 0.05)' : 'none',
        filter: 'none',
        // backdropFilter: scrolled || isSecondary ? 'saturate(200%) blur(10px)' : 'none',
        borderRadius: 'var(--chakra-radii-md)',
        flexGrow: 1,
        // margin: 'var(--chakra-spacing-xs)',        
        // width: 'calc(100% - 3*var(--chakra-spacing-xs) - 60px)',        
        height: '50px',
        zIndex: 10,        
      }}
    >      
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'calc(var(--chakra-spacing-xs) / 16)' }}>
        <div style={{ fontSize: 12, opacity: 0.8, color: 'var(--chakra-colors-fg)' }}>
          <Breadcrumb.Root>
            <Breadcrumb.List display="flex" alignItems="center" gap="4px">
              {crumbs.map((c, idx) => (
                <React.Fragment key={idx}>
                  <Breadcrumb.Item>
                    {c.onClick ? (
                      <Breadcrumb.Link onClick={c.onClick} style={{ cursor: 'pointer' }}>
                        {c.label}
                      </Breadcrumb.Link>
                    ) : (
                      <Breadcrumb.Link>{c.label}</Breadcrumb.Link>
                    )}
                  </Breadcrumb.Item>
                  {idx < crumbs.length - 1 && <Breadcrumb.Separator />}
                </React.Fragment>
              ))}
            </Breadcrumb.List>
          </Breadcrumb.Root>
        </div>
        <strong style={{ fontSize: 14, color: 'var(--chakra-colors-fg)' }}>{title}</strong>
      </div>
      <div style={{ flex: 1 }} />
      <input
        placeholder="Search"
        style={{
          height: 32,
          minWidth: 220,
          borderRadius: 'var(--chakra-radii-md)',
          border: '1px solid var(--chakra-colors-border)',
          background: isSecondary ? 'var(--chakra-colors-white)' : 'var(--chakra-colors-bg)',
          color: isSecondary ? 'var(--chakra-colors-fg)' : 'var(--chakra-colors-fg)',
          padding: '0 var(--chakra-spacing-sm)',
        }}
      />
      {isAuthenticated && user && (
        <div 
          ref={userMenuRef}
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 'var(--chakra-spacing-sm)',
            marginLeft: 'var(--chakra-spacing-sm)',
            position: 'relative',
          }}
          onMouseEnter={() => setShowUserMenu(true)}
          onMouseLeave={() => setShowUserMenu(false)}
        >
          <Button
            colorPalette="primary"
            size="sm"
            borderRadius="full"
            padding="0"
            flexShrink={0}
            style={{
              width: '32px',
              height: '32px',
              minWidth: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            <span style={{ 
              display: 'inline-block',
              lineHeight: 1,
              userSelect: 'none',
            }}>
              {getUserInitials(user.name)}
            </span>
          </Button>
          {/* Invisible bridge to maintain hover area */}
          {showUserMenu && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                width: 32,
                height: '4px',
                pointerEvents: 'auto',
              }}
            />
          )}
          {showUserMenu && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                right: 0,
                padding: 'var(--chakra-spacing-md)',
                minWidth: 200,
                background: 'var(--chakra-colors-bg-subtle)',
                border: '1px solid var(--chakra-colors-border)',
                borderRadius: 'var(--chakra-radii-md)',
                boxShadow: '0px 7px 23px rgba(0, 0, 0, 0.1)',
                zIndex: 11,
                pointerEvents: 'auto',
              }}
            >
              <div style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                gap: 'var(--chakra-spacing-sm)' 
              }}>
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 'var(--chakra-spacing-sm)',
                  paddingBottom: 'var(--chakra-spacing-sm)',
                  borderBottom: '1px solid var(--chakra-colors-border)',
                }}>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{user.name}</span>
                    <span style={{ fontSize: 12, opacity: 0.7, color: 'var(--chakra-colors-fg-muted)' }}>
                      {user.email}
                    </span>
                  </div>
                </div>
                <Button
                  onClick={logout}
                  colorPalette="secondary"
                  variant="ghost"
                  size="sm"
                  title="Logout"
                  style={{
                    height: 32,
                    padding: '0 var(--chakra-spacing-sm)',
                    fontSize: 14,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--chakra-spacing-xs)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = 'var(--chakra-colors-red-500)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'var(--chakra-colors-fg)';
                  }}
                >
                  <FiPower style={{ fontSize: 18 }} />
                  <span>Logout</span>
                </Button>                
              </div>
            </div>
          )}          
        </div>
      )}
    </header>
  );
}


