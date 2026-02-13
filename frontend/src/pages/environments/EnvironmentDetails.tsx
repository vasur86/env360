import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useEnvironmentDetails } from '../../api/client';
import { 
  Button, 
  Flex, 
  Text, 
  Box,
  Tabs,
  Breadcrumb,
} from '@chakra-ui/react';
import { Link as RouterLink } from 'react-router-dom';
import { HiPencil, HiTrash, HiServerStack, HiCog8Tooth, HiSquares2X2, HiKey } from 'react-icons/hi2';
import MessageBox from '@/components/MessageBox';
import PermissionsTab from './PermissionsTab';
import SettingsTab from './SettingsTab';
import ServicesTab from './ServicesTab';

const VALID_TABS = ['settings', 'services', 'permissions'] as const;
type TabValue = typeof VALID_TABS[number];

export default function EnvironmentDetails() {
  const navigate = useNavigate();
  const { environmentId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const isNew = environmentId === 'new';
  
  // Use consolidated query to fetch environment, permissions, env vars, and secrets in one request
  const { data: environmentDetails, isLoading } = useEnvironmentDetails(environmentId);
  
  // Extract data from consolidated response
  const environment = environmentDetails?.environment || null;
  const permissions = environmentDetails?.permissions || null;
  
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
    // TODO: Show create environment form
    return <div>Create New Environment (form coming soon)</div>;
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
        // boxShadow="var(--chakra-shadows-md)" 
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
              <HiServerStack size={24} color="var(--chakra-colors-sws-secondary)" />  
            </Box>            
            <Text fontSize="sm" fontWeight="bold" color="var(--chakra-colors-sws-secondary)">
              {isLoading ? 'Loading...' : environment?.name || ''}
            </Text>
          </Flex>


          {/* Tab Options - Always render to ensure highlighting works */}
          <Tabs.List bg="var(--chakra-colors-sws-secondary)" rounded="l3" p="0">
            <Tabs.Trigger value="settings" py="0" disabled={isLoading || !environment}>
              <HiCog8Tooth />
              Settings
            </Tabs.Trigger>
            <Tabs.Trigger value="services" py="0" disabled={isLoading || !environment}>
              <HiSquares2X2 />
              Services
            </Tabs.Trigger>
            <Tabs.Trigger value="permissions" py="0" disabled={isLoading || !environment}>
              <HiKey />
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
        {isLoading && <MessageBox type="loading" message="Loading environment..."/>}
        {!isLoading && !environment && <MessageBox type="error" message="Environment not found." />}
        {!isLoading && environment && (
          <>
            <Box>
              <Tabs.Content value="settings">
                <SettingsTab
                  environmentId={environmentId}
                  environmentName={environment.name}
                  environmentType={environment.type}
                  environmentUrl={environment.url}
                  projectId={environment.projectId || environment.project?.id}
                  projectName={environment.project?.name}
                  canEdit={canEdit}
                  environmentVariables={environmentDetails?.environmentVariables}
                  secrets={environmentDetails?.secrets}
                />
              </Tabs.Content>
              <Tabs.Content value="services">
                <ServicesTab environmentId={environmentId} />
              </Tabs.Content>
              <Tabs.Content value="permissions" pt="0">
                <PermissionsTab 
                  environmentId={environmentId}
                  environmentOwnerId={environment?.project?.ownerId} // Environment owner is the project owner
                  projectId={environment?.projectId || environment?.project?.id} // Project ID to fetch project-level permissions
                  projectCreatedAt={environment?.project?.createdAt} // Project created_at for owner permission
                  projectUpdatedAt={environment?.project?.updatedAt} // Project updated_at for owner permission
                  canManagePermissions={canDelete || permissions?.isOwner || permissions?.isAdmin || false}
                  resourcePermissions={environmentDetails?.resourcePermissions}
                />
              </Tabs.Content>
            </Box>
          </>
        )}      
      </Box>
    </Tabs.Root>
  );
}
