import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useServiceDetails } from '../../api/client';
import { 
  Button, 
  Flex, 
  Text, 
  Box,
  Tabs,
} from '@chakra-ui/react';
import { HiCog8Tooth, HiKey, HiInboxArrowDown, HiRectangleStack } from 'react-icons/hi2';
import MessageBox from '@/components/MessageBox';
import PermissionsTab from './PermissionsTab';
import SettingsTab from './SettingsTab';
import DeploymentsTab from './DeploymentsTab';
import VersionsTab from './VersionsTab';

const VALID_TABS = ['settings', 'versions', 'deployments', 'permissions'] as const;
type TabValue = typeof VALID_TABS[number];

export default function ServiceDetails() {
  const navigate = useNavigate();
  const { serviceId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const isNew = serviceId === 'new';
  
  // Use consolidated query to fetch service, permissions, env vars, and secrets in one request
  const { data: serviceDetails, isLoading } = useServiceDetails(serviceId);
  
  // Extract data from consolidated response
  const service = serviceDetails?.service || null;
  const permissions = serviceDetails?.permissions || null;
  
  // Determine if buttons should be disabled
  const canEdit = permissions?.canWrite || false;
  const canDelete = permissions?.canDelete || false;
  
  // Get tab from URL query params, default to 'settings'
  const getTabFromUrl = (): TabValue => {
    const tabFromUrl = searchParams.get('tab') || 'settings';
    return VALID_TABS.includes(tabFromUrl as TabValue) ? (tabFromUrl as TabValue) : 'settings';
  };
  
  // Track if tab change is from user interaction (to avoid syncing back from URL)
  const isUserChangeRef = useRef(false);
  
  const [activeTab, setActiveTab] = useState<TabValue>(() => {
    // Initialize from URL on mount
    const tabFromUrl = searchParams.get('tab') || 'settings';
    return VALID_TABS.includes(tabFromUrl as TabValue) ? (tabFromUrl as TabValue) : 'settings';
  });
  const autoOpenNew = (searchParams.get('new') || '').toLowerCase() === '1' || (searchParams.get('new') || '').toLowerCase() === 'true';
  const clearNewParam = () => {
    const params: Record<string, string> = {};
    params.tab = 'deployments';
    setSearchParams(params, { replace: true });
  };

  // Ensure URL has tab param on initial mount
  useEffect(() => {
    if (!searchParams.get('tab')) {
      setSearchParams({ tab: activeTab }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync tab state when URL query param changes (e.g., browser back/forward or direct navigation)
  // Skip syncing if the change came from user interaction
  useEffect(() => {
    if (isUserChangeRef.current) {
      isUserChangeRef.current = false;
      return;
    }
    const tabFromUrl = getTabFromUrl();
    if (tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  if (isNew) {
    // TODO: Show create service form
    return <div>Create New Service (form coming soon)</div>;
  }

  const handleTabChange = (value: string) => {
    if (VALID_TABS.includes(value as TabValue)) {
      const newTab = value as TabValue;
      isUserChangeRef.current = true;
      setActiveTab(newTab);
      // Update URL query param when user changes tab
      setSearchParams({ tab: newTab }, { replace: true });
    }
  };

  return (
    <Tabs.Root value={activeTab} onValueChange={(e) => handleTabChange(e.value)} variant="plain" size="sm">
      <Box 
        p="var(--chakra-spacing-sm)" 
        borderRadius="var(--chakra-radii-md)" 
        bg="var(--chakra-colors-sws-primary)"
        mb="var(--chakra-spacing-sm)"
        position="fixed" 
        top="66px" 
        left="calc(56px + var(--chakra-spacing-sm))" 
        right="var(--chakra-spacing-sm)" 
        zIndex="10"
      >
        <Flex direction="row" justify="space-between" align="center" 
              gap="var(--chakra-spacing-sm)" wrap="wrap">
          <Flex align="center" gap="var(--chakra-spacing-xs)" flex="1" minW="200px">
            <Box>
              <HiCog8Tooth size={24} color="var(--chakra-colors-sws-secondary)" />  
            </Box>            
            <Text fontSize="sm" fontWeight="bold" color="var(--chakra-colors-sws-secondary)">
              {isLoading ? 'Loading...' : service?.name || ''}
            </Text>
          </Flex>

          {/* <Flex align="center" gap="var(--chakra-spacing-xs)" flex="1">            
            <Button
              size="xs"
              onClick={() => {
                // Jump to Settings tab for deployment actions
                setSearchParams({ tab: 'settings' }, { replace: true });
              }}
            >
              Deploy
            </Button>
          </Flex> */}

          {/* Tab Options - Always render to ensure highlighting works */}
          <Tabs.List bg="var(--chakra-colors-sws-secondary)" rounded="l3" p="0">
            <Tabs.Trigger value="settings" py="0" disabled={isLoading || !service}>
              <HiCog8Tooth size={16} />
              Settings
            </Tabs.Trigger>
            <Tabs.Trigger value="versions" py="0" disabled={isLoading || !service}>
              <HiRectangleStack size={16} />
              Versions
            </Tabs.Trigger>
            <Tabs.Trigger value="deployments" py="0" disabled={isLoading || !service}>
              <HiInboxArrowDown size={16} />
              Deployments
            </Tabs.Trigger>
            <Tabs.Trigger value="permissions" py="0" disabled={isLoading || !service}>
              <HiKey size={16} />
              Permissions
            </Tabs.Trigger>
            <Tabs.Indicator rounded="l2" />
          </Tabs.List>
        </Flex>
      </Box>
      
      <Box
        mt="0"
        pt="calc(60px)" // Offset for the fixed header
      >
        {isLoading && <MessageBox type="loading" message="Loading service..."/>}
        {!isLoading && !service && <MessageBox type="error" message="Service not found." />}
        {!isLoading && service && (
          <>
            <Box>
              <Tabs.Content value="settings">
                <SettingsTab
                  serviceId={serviceId}
                  serviceName={service.name}
                  serviceDescription={service.description}
                  serviceType={service.type}
                  serviceStatus={service.status}
                  serviceOwner={service.owner}
                  projectId={service.projectId || service.project?.id}
                  projectName={service.project?.name}
                  canEdit={canEdit}
                  environmentVariables={serviceDetails?.environmentVariables}
                  secrets={serviceDetails?.secrets}
                  serviceConfigs={(serviceDetails?.serviceConfigs || []).map((v) => ({
                    ...v,
                    createdAt: v.createdAt || '',
                  }))}
                />
              </Tabs.Content>
              <Tabs.Content value="versions" pt="0">
                <VersionsTab serviceId={serviceId} />
              </Tabs.Content>
              <Tabs.Content value="deployments" pt="0">
                <DeploymentsTab
                  serviceId={serviceId}
                  autoOpenNew={autoOpenNew}
                  onCloseNew={clearNewParam}
                />
              </Tabs.Content>
              <Tabs.Content value="permissions" pt="0">
                <PermissionsTab 
                  serviceId={serviceId}
                  serviceOwnerId={service?.project?.ownerId} // Service owner is the project owner
                  projectId={service?.projectId || service?.project?.id} // Project ID to fetch project-level permissions
                  projectCreatedAt={service?.project?.createdAt} // Project created_at for owner permission
                  projectUpdatedAt={service?.project?.updatedAt} // Project updated_at for owner permission
                  canManagePermissions={canDelete || permissions?.isOwner || permissions?.isAdmin || false}
                  resourcePermissions={serviceDetails?.resourcePermissions}
                />
              </Tabs.Content>
            </Box>
          </>
        )}      
      </Box>
    </Tabs.Root>
  );
}
