import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useProjectDetails } from '../../api/client';
import { 
  Button, 
  Flex, 
  Text, 
  Box,
  Tabs,
  Breadcrumb,
} from '@chakra-ui/react';
import { Link as RouterLink } from 'react-router-dom';
import { HiPencil, HiTrash, HiSquare3Stack3D, HiArrowLeft, HiCog8Tooth, HiSquares2X2, HiServerStack, HiKey } from 'react-icons/hi2';
import MessageBox from '@/components/MessageBox';
import PermissionsTab from './PermissionsTab';
import SettingsTab from './SettingsTab';

const VALID_TABS = ['settings', 'services', 'environments', 'permissions'] as const;
type TabValue = typeof VALID_TABS[number];

export default function ProjectDetails() {
  const navigate = useNavigate();
  const { projectId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const isNew = projectId === 'new';
  
  // Use consolidated query to fetch project, permissions, env vars, and secrets in one request
  const { data: projectDetails, isLoading } = useProjectDetails(projectId);
  
  // Extract data from consolidated response
  const project = projectDetails?.project || null;
  const permissions = projectDetails?.permissions || null;
  
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
    // TODO: Show create project form
    return <div>Create New Project (form coming soon)</div>;
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
              <HiSquare3Stack3D size={24} color="var(--chakra-colors-sws-secondary)" />  
            </Box>            
            <Text fontSize="sm" fontWeight="bold" color="var(--chakra-colors-sws-secondary)">
              {isLoading ? 'Loading...' : project?.name || ''}
            </Text>
          </Flex>


          {/* Tab Options - Always render to ensure highlighting works */}
          <Tabs.List bg="var(--chakra-colors-sws-secondary)" rounded="l3" p="0">
            <Tabs.Trigger value="settings" py="0" disabled={isLoading || !project}>
              <HiCog8Tooth />
              Settings
            </Tabs.Trigger>
            <Tabs.Trigger value="services" py="0" disabled={isLoading || !project}>
              <HiSquares2X2 />
              Services
            </Tabs.Trigger>
            <Tabs.Trigger value="environments" py="0" disabled={isLoading || !project}>
              <HiServerStack />
              Environments
            </Tabs.Trigger>
            <Tabs.Trigger value="permissions" py="0" disabled={isLoading || !project}>
              <HiKey />
              Permissions
            </Tabs.Trigger>
            <Tabs.Indicator rounded="l2" />
          </Tabs.List>

          {/* Edit Project Button - Commented out, might need it later */}
          {/* <Button 
            variant={"outline"} 
            size="xs" 
            borderColor={canEdit && !isLoading && project ? "var(--chakra-colors-fg)" : "gray.300"}
            disabled={!canEdit || permissionsLoading || isLoading || !project}
            opacity={canEdit && !isLoading && project ? 1 : 0.5}
            cursor={canEdit && !isLoading && project ? "pointer" : "not-allowed"}
            onClick={() => {
              if (canEdit && project) {
                // TODO: Implement edit functionality
                console.log('Edit project');
              }
            }}
          >
             <HiPencil color={canEdit && !isLoading && project ? "var(--chakra-colors-fg)" : "gray.400"} /> 
             <Flex direction="column" align="center" justify="center" gap="0">
               <Text fontSize="xs" color={canEdit && !isLoading && project ? "var(--chakra-colors-fg)" : "gray.400"} lineHeight="1" marginBottom="-1px" fontWeight="bold">Edit</Text>
             </Flex>
           </Button> */}

           {/* Delete Project Button - Commented out, might need it later */}
           {/* <Button 
            variant={"outline"} 
            size="xs" 
            borderColor={canDelete && !isLoading && project ? "red.400" : "gray.300"}
            _hover={canDelete && !isLoading && project ? { bg: "red.100" } : {}}
            disabled={!canDelete || permissionsLoading || isLoading || !project}
            opacity={canDelete && !isLoading && project ? 1 : 0.5}
            cursor={canDelete && !isLoading && project ? "pointer" : "not-allowed"}
            onClick={() => {
              if (canDelete && project) {
                // TODO: Implement delete functionality
                console.log('Delete project');
              }
            }}
          >
             <HiTrash color={canDelete && !isLoading && project ? "red" : "gray.400"} /> 
             <Flex direction="column" align="center" justify="center" gap="0">
               <Text fontSize="xs" color={canDelete && !isLoading && project ? "red.400" : "gray.400"} lineHeight="1" marginBottom="-1px" fontWeight="bold">Delete</Text>
             </Flex>
           </Button> */}
        </Flex>
      </Box>
      
      <Box
        mt="0"
        pt="calc(60px)" // Offset for the fixed header
      >
        {isLoading && <MessageBox type="loading" message="Loading project..."/>}
        {!isLoading && !project && <MessageBox type="error" message="Project not found." />}
        {!isLoading && project && (
          <>
            <Box>
              <Tabs.Content value="settings">
                <SettingsTab
                  projectId={projectId}
                  projectName={project.name}
                  projectDescription={project.description}
                  canEdit={canEdit}
                  environmentVariables={projectDetails?.environmentVariables}
                  secrets={projectDetails?.secrets}
                />
              </Tabs.Content>
              <Tabs.Content value="services">Manage your projects</Tabs.Content>
              <Tabs.Content value="environments">
                Manage your tasks for freelancers
              </Tabs.Content>
              <Tabs.Content value="permissions" pt="0">
                <PermissionsTab 
                  projectId={projectId}
                  projectOwnerId={project.ownerId}
                  canManagePermissions={canDelete || permissions?.isOwner || permissions?.isAdmin || false}
                  resourcePermissions={projectDetails?.resourcePermissions}
                />
              </Tabs.Content>
            </Box>
          </>
        )}      
      </Box>
    </Tabs.Root>
  );
}
