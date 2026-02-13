import * as React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useEnvironments, useCreateEnvironment, useProjects } from '../../api/client';
import { 
  Button, 
  Flex, 
  Text, 
  Input,
  IconButton,
  Box,
  InputGroup,
  Menu,
  Portal,
  Pagination,
  Separator,
  ButtonGroup,
  Drawer,
  Dialog,
  Combobox,
  useListCollection,
  useFilter,
} from '@chakra-ui/react';
import { FaSearch } from 'react-icons/fa';
import { HiChevronLeft, HiChevronRight, HiSortAscending, HiTrash, HiViewGridAdd } from 'react-icons/hi';
import { HiXMark } from 'react-icons/hi2';
import MessageBox from '../../components/MessageBox';

const ITEMS_PER_PAGE = 25;

export default function Environments() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const projectId = searchParams.get('projectId') || undefined;
  
  // Handle project filter change
  const handleProjectFilterChange = (newProjectId: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (newProjectId) {
      newParams.set('projectId', newProjectId);
    } else {
      newParams.delete('projectId');
    }
    setSearchParams(newParams);
    setPage(1); // Reset to first page when filter changes
  };
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState('');
  const [sortField, setSortField] = React.useState('name');
  const [sortOrder, setSortOrder] = React.useState<'asc' | 'desc'>('asc');
  const [includeDeleted, setIncludeDeleted] = React.useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = React.useState(false);
  const [environmentName, setEnvironmentName] = React.useState('');
  const [environmentType, setEnvironmentType] = React.useState('');
  const [selectedProjectId, setSelectedProjectId] = React.useState(projectId || '');
  const [errorModal, setErrorModal] = React.useState<{ isOpen: boolean; title: string; message: string }>({
    isOpen: false,
    title: '',
    message: '',
  });
  const skip = (page - 1) * ITEMS_PER_PAGE;
  
  const { data: environmentsData, isLoading, error } = useEnvironments(skip, ITEMS_PER_PAGE, projectId, search || undefined);  
  // Fetch projects for the header dropdown (always enabled) and for drawer
  const { data: projectsData } = useProjects(0, 100, undefined, true, { enabled: true }); // Fetch projects with write permission for dropdown
  const createEnvironmentMutation = useCreateEnvironment();
     
  const data = environmentsData?.items;
  const totalCount = environmentsData?.total ?? 0;
  console.log(data);

  const environmentTypesItems = React.useMemo(() => [
    { value: 'development', label: 'Development' },
    { value: 'testing', label: 'Testing' },
    { value: 'staging', label: 'Staging' },
    { value: 'production', label: 'Production' },
    { value: 'sandbox', label: 'Sandbox' },
  ], []);

  // Use filter hook for Combobox filtering
  const { contains: projectsContains } = useFilter({ sensitivity: "base" });
  const { contains: typeContains } = useFilter({ sensitivity: "base" });

  // Create collections for Combobox using useListCollection hook with filter
  // Separate collections for header (with "All Projects" option) and drawer (without)
  // IMPORTANT: Use empty initialItems and update collection with set() when data arrives (async pattern)
  // This ensures the collection updates reactively when projectsData changes
  
  // Header collection - includes "All Projects" option
  const { collection: headerProjectsCollection, filter: headerProjectsFilter, set: setHeaderProjectsCollection } = useListCollection<{ value: string; label: string }>({
    initialItems: [],
    filter: projectsContains,
  });
  
  // Drawer collection - only projects, no "All Projects" option
  const { collection: drawerProjectsCollection, filter: drawerProjectsFilter, set: setDrawerProjectsCollection } = useListCollection<{ value: string; label: string }>({
    initialItems: [],
    filter: projectsContains,
  });
  
  // Update collections when projectsData changes (async pattern from Chakra UI docs)
  React.useEffect(() => {
    const projectItems = projectsData?.items && projectsData.items.length > 0
      ? projectsData.items.map((project) => ({
          value: project.id,
          label: project.name,
        }))
      : [];
    
    // Header collection: add "All Projects" at the beginning
    setHeaderProjectsCollection([
      { value: '', label: 'All Projects' },
      ...projectItems,
    ]);
    
    // Drawer collection: only projects, no "All Projects"
    setDrawerProjectsCollection(projectItems);
  }, [projectsData?.items, setHeaderProjectsCollection, setDrawerProjectsCollection]);
  
  const { collection: environmentTypesCollection, filter: typeFilter } = useListCollection({
    initialItems: environmentTypesItems,
    filter: typeContains,
  });

  const sortFields = [
    { value: 'name', label: 'Name' },
    { value: 'created', label: 'Created Date' },
    { value: 'updated', label: 'Updated Date' },
  ];

  const handleSortChange = (field: string, order: 'asc' | 'desc') => {
    setSortField(field);
    setSortOrder(order);
    // TODO: Apply sorting to the query
  };

  const handleCreateEnvironment = async () => {
    if (!environmentName.trim()) {
      setErrorModal({
        isOpen: true,
        title: 'Validation Error',
        message: 'Environment name is required',
      });
      return;
    }

    if (!environmentType.trim()) {
      setErrorModal({
        isOpen: true,
        title: 'Validation Error',
        message: 'Environment type is required',
      });
      return;
    }

    if (!selectedProjectId) {
      setErrorModal({
        isOpen: true,
        title: 'Validation Error',
        message: 'Project is required',
      });
      return;
    }

    try {
      const result = await createEnvironmentMutation.mutateAsync({
        name: environmentName.trim(),
        type: environmentType.trim(),
        projectId: selectedProjectId,
      });
      
      // Close drawer and reset form
      setIsDrawerOpen(false);
      setEnvironmentName('');
      setEnvironmentType('');
      setSelectedProjectId(projectId || '');
      
      // Navigate to the new environment
      navigate(`/environments/${result.createEnvironment.id}`);
    } catch (error: any) {
      setErrorModal({
        isOpen: true,
        title: 'Failed to Create Environment',
        message: error?.message || 'An error occurred while creating the environment',
      });
    }
  };

  return (    
    <>
    <Box 
      p="var(--chakra-spacing-sm)" 
      borderRadius="var(--chakra-radii-md)" 
      // boxShadow="var(--chakra-shadows-md)" 
      bg="var(--chakra-colors-sws-primary)"
      mb="var(--chakra-spacing-sm)"
      position="fixed" top="66px" left="calc(56px + var(--chakra-spacing-sm))" right="var(--chakra-spacing-sm)" zIndex="10"
    >
      <Flex direction="row" justify="flex-end" align="center" 
            gap="var(--chakra-spacing-sm)" wrap="wrap">
        <Flex align="center" gap="var(--chakra-spacing-xs)" flex="1" grow={1}>
          {/* Project Filter Dropdown */}
          <Combobox.Root
            value={projectId ? [projectId] : []}
            onValueChange={(details) => {
              const newValue = details.value[0] || '';
              handleProjectFilterChange(newValue);
            }}
            onInputValueChange={(e) => {              
              headerProjectsFilter(e.inputValue);
            }}
            size="sm"
            maxW="200px"
            minW="150px"
            collection={headerProjectsCollection}
          >
            <Combobox.Control>
              <Combobox.Input 
                placeholder="All Projects"
                bg="var(--chakra-colors-sws-secondary)"
                borderRadius="var(--chakra-radii-sm)"
                name="project-filter"
                autoComplete="off"
                data-extension-ignore="true"
              />
              <Combobox.IndicatorGroup>
                <Combobox.ClearTrigger />
                <Combobox.Trigger />
              </Combobox.IndicatorGroup>
            </Combobox.Control>
            <Portal>
              <Combobox.Positioner>
                <Combobox.Content>
                  <Combobox.Empty>No projects found</Combobox.Empty>
                  {headerProjectsCollection.items.map((item: { value: string; label: string }) => (
                    <Combobox.Item key={item.value} item={item}>
                      {item.label}
                      <Combobox.ItemIndicator />
                    </Combobox.Item>
                  ))}
                </Combobox.Content>
              </Combobox.Positioner>
            </Portal>
          </Combobox.Root>
          
          <InputGroup startElement={<FaSearch />} maxW="300px" minW="150px" bg="var(--chakra-colors-sws-secondary)" borderRadius="var(--chakra-radii-sm)">
            <Input
              size="sm"
              placeholder="Search environments..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                }
              }}
              flex="1"
            />
          </InputGroup>                      
        </Flex>        

        <Flex align="center" gap="var(--chakra-spacing-xs)">
          <Pagination.Root 
            count={totalCount} 
            pageSize={ITEMS_PER_PAGE} 
            defaultPage={page}
            siblingCount={2}
            onPageChange={(details) => setPage(details.page)}
          >
            <ButtonGroup variant="outline" size="xs">
              <Pagination.PrevTrigger asChild>
                <IconButton aria-label="Previous page" disabled={page === 1} 
                    bg="var(--chakra-colors-sws-secondary)">
                  <HiChevronLeft />
                </IconButton>
              </Pagination.PrevTrigger>

              <Pagination.Items
                render={(pageItem) => {
                  const isCurrentPage = pageItem.value === page;
                  return (
                    <Pagination.Item 
                      key={pageItem.value} 
                      type={pageItem.type}
                      value={pageItem.value}
                      asChild
                    >
                      <IconButton 
                        variant={isCurrentPage ? "solid" : "outline"}                        
                        aria-label={`Go to page ${pageItem.value}`}
                        bg={isCurrentPage ? "var(--chakra-colors-sws-selected)" : "var(--chakra-colors-sws-secondary)"}
                      >
                        {pageItem.value}
                      </IconButton>
                    </Pagination.Item>
                  );
                }}
              />

              <Pagination.NextTrigger asChild>
                <IconButton 
                  aria-label="Next page" 
                  disabled={!data || data.length < ITEMS_PER_PAGE}
                  bg="var(--chakra-colors-sws-secondary)"
                >
                  <HiChevronRight />
                </IconButton>
              </Pagination.NextTrigger>
            </ButtonGroup>
          </Pagination.Root>
        </Flex>
        
        <Separator 
          orientation="vertical"
          height="20px"
        />

         {/* Include Deleted Button */}
         <Button variant={"outline"} size="xs"  bg="var(--chakra-colors-sws-secondary)"
              onClick={() => setIncludeDeleted(!includeDeleted)} borderColor={includeDeleted ? "red" : "gray.400"}>
             <HiTrash/> 
             <Flex direction="column" align="center" justify="center" gap="0">
               <Text fontSize="10px" color={includeDeleted ? "red" : "gray.400"} lineHeight="1" marginBottom="-1px" fontWeight="bold">Include</Text>
               <Text fontSize="10px" color={includeDeleted ? "red" : "gray.400"} lineHeight="1" fontWeight="bold">Deleted</Text>
             </Flex>
             
           </Button>

        {/* Sort Button */}
        <Flex as="label" align="center" gap="var(--chakra-spacing-xs)">
          <Menu.Root>
            <Menu.Trigger asChild>
              <Button variant="outline" size="xs" borderColor="gray.400" bg='var(--chakra-colors-sws-secondary)'>
                <HiSortAscending color="gray.600" /> 
                <Text fontSize="sm" color="var(--chakra-colors-fg-muted)">Sort</Text>
              </Button>
            </Menu.Trigger>
            <Portal>
              <Menu.Positioner>
                <Menu.Content minW="12rem">
                  {sortFields.map((field) => (
                    <Menu.ItemGroup key={field.value} title={field.label}>
                      <Menu.RadioItem
                        value={`${field.value}-asc`}
                        onClick={() => handleSortChange(field.value, 'asc')}
                      >
                        Ascending
                        {sortField === field.value && sortOrder === 'asc' && <Menu.ItemIndicator />}
                      </Menu.RadioItem>
                      <Menu.RadioItem
                        value={`${field.value}-desc`}
                        onClick={() => handleSortChange(field.value, 'desc')}
                      >
                        Descending
                        {sortField === field.value && sortOrder === 'desc' && <Menu.ItemIndicator />}
                      </Menu.RadioItem>
                    </Menu.ItemGroup>
                  ))}
                </Menu.Content>
              </Menu.Positioner>
            </Portal>
          </Menu.Root>
        </Flex>

        {/* Create New Environment Button */}
        <Button 
          variant="solid" 
          size="xs"
          onClick={() => setIsDrawerOpen(true)}
        >
            <HiViewGridAdd /> 
            <Text fontSize="sm" color="var(--chakra-colors-bg-subtle)">New</Text>
          </Button>
      </Flex>      
    </Box>    
    { data && data.length === 0 && (
        <MessageBox 
          marginTop="calc(60px + var(--chakra-spacing-sm))"
          type="warning" 
          message="No environments found"
        />
      )}
      { error && !isLoading && (
        <MessageBox 
          marginTop="calc(60px + var(--chakra-spacing-sm))"
          type="error" 
          message="Error loading environments"
        />
      )}
    { isLoading && (
        <MessageBox   
          marginTop="calc(60px + var(--chakra-spacing-sm))"
          type="loading" 
          message=""
        />
      )}
    <Box
      mt="var(--chakra-spacing-sm)"
      pt="60px"
      minH="250px"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
        gap: 'var(--chakra-spacing-sm)',
      }}
    >      
      {!isLoading && data && data.length > 0 && data?.map((environment) => (
        <Box
          key={environment.id}
          bg="var(--chakra-colors-white)"
          borderRadius="var(--chakra-radii-md)"
          boxShadow="var(--chakra-shadows-md)"
          p="var(--chakra-spacing-sm)"          
          height="150px"
          display="flex"
          flexDirection="column"
          justifyContent="flex-start"
          cursor="pointer"
          onClick={() => navigate(`/environments/${environment.id}`)}
          style={{
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow = 'var(--chakra-shadows-lg)';
            e.currentTarget.style.transform = 'translateY(-2px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = 'var(--chakra-shadows-md)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          <Text 
            fontSize="xs" 
            fontWeight="bold" 
            color="var(--chakra-colors-gray-500)"
          >
            Project: {environment.project?.name}
          </Text>
          <Text 
            fontSize="md" 
            fontWeight="bold" 
            color="var(--chakra-colors-fg)"
          >
            {environment.name}
          </Text>
          <Text 
            fontSize="sm" 
            color="var(--chakra-colors-fg-muted)"
            mb="var(--chakra-spacing-xs)"
          >
            {environment.type}
          </Text>
          {environment.url && (
            <Text 
              fontSize="xs" 
              color="var(--chakra-colors-fg-muted)"
              style={{
                display: '-webkit-box',
                WebkitLineClamp: 1,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
              mb="var(--chakra-spacing-xs)"
            >
              {environment.url}
            </Text>
          )}
          <Flex gap="var(--chakra-spacing-xs)" mt="auto">
            <Box
              bg="var(--chakra-colors-bg-subtle)"
              borderRadius="var(--chakra-radii-sm)"
              px="var(--chakra-spacing-xs)"
              py="calc(var(--chakra-spacing-xs) / 2)"
              display="inline-flex"
              alignItems="center"
              gap="calc(var(--chakra-spacing-xs) / 2)"
            >
              <Text fontSize="xs" color="var(--chakra-colors-fg-muted)">Services</Text>
              <Text fontSize="sm" fontWeight="bold" color="var(--chakra-colors-fg)">
                {environment.servicesCount ?? 0}
              </Text>
            </Box>
          </Flex>
        </Box>
      ))}
    </Box>

    {/* Create New Environment Drawer */}
    <Drawer.Root           
      open={isDrawerOpen} 
      onOpenChange={(e) => {
        setIsDrawerOpen(e.open);
        // Reset form when drawer closes
        if (!e.open) {
          setEnvironmentName('');
          setEnvironmentType('');
          setSelectedProjectId(projectId || '');
        }
      }} 
      placement="end"
      size="sm"
    >
      <Drawer.Backdrop />
      <Drawer.Positioner>
        <Drawer.Content>
          <Drawer.Header style={{ boxShadow: 'var(--chakra-shadows-md)', padding: 'var(--chakra-spacing-sm)'}}>
            <Flex justify="space-between" align="center" width="100%">
              <Drawer.Title>New Environment</Drawer.Title>
              <Button
                size="xs"
                variant="ghost"
                onClick={() => setIsDrawerOpen(false)}
                aria-label="Close drawer"
                mr="var(--chakra-spacing-sm)"
              >
                <HiXMark />
              </Button>
            </Flex>
          </Drawer.Header>
          <Drawer.Body style={{ paddingLeft: 'var(--chakra-spacing-sm)', marginTop: 'var(--chakra-spacing-md)'}}>
            <Flex direction="column" gap="var(--chakra-spacing-md)" alignItems="stretch">
              <Box>
                <Text fontSize="sm" mb="var(--chakra-spacing-xs)" fontWeight="medium">
                  Project *
                </Text>                                
                <Combobox.Root
                  value={selectedProjectId ? [selectedProjectId] : []}
                  onValueChange={(details) => {
                    setSelectedProjectId(details.value[0] || '');
                  }}
                  onInputValueChange={(e) => drawerProjectsFilter(e.inputValue)}
                  collection={drawerProjectsCollection}
                >
                  <Combobox.Control>
                    <Combobox.Input 
                      placeholder={projectsData?.items && projectsData.items.length > 0 ? 'Select a project' : 'No projects found'}
                      name="environment-project"
                      autoComplete="off"
                      data-extension-ignore="true"
                    />
                    <Combobox.IndicatorGroup>
                      <Combobox.ClearTrigger />
                      <Combobox.Trigger />
                    </Combobox.IndicatorGroup>
                  </Combobox.Control>
                  <Portal>
                    <Combobox.Positioner>
                      <Combobox.Content>
                        <Combobox.Empty>No projects found</Combobox.Empty>
                        {drawerProjectsCollection.items.map((item: { value: string; label: string }) => (
                          <Combobox.Item key={item.value} item={item}>
                            {item.label}
                            <Combobox.ItemIndicator />
                          </Combobox.Item>
                        ))}
                      </Combobox.Content>
                    </Combobox.Positioner>
                  </Portal>
                </Combobox.Root>
              </Box>

              <Box>
                <Text fontSize="sm" mb="var(--chakra-spacing-xs)" fontWeight="medium">
                  Name *
                </Text>
                <Input
                  placeholder="Enter environment name"
                  value={environmentName}
                  onChange={(e) => setEnvironmentName(e.target.value)}
                  size="sm"
                />
              </Box>

              <Box>
                <Text fontSize="sm" mb="var(--chakra-spacing-xs)" fontWeight="medium">
                  Type *
                </Text>
                <Combobox.Root
                  value={environmentType ? [environmentType] : []}
                  onValueChange={(details) => {
                    setEnvironmentType(details.value[0] || '');
                  }}
                  onInputValueChange={(e) => typeFilter(e.inputValue)}
                  collection={environmentTypesCollection}
                >
                  <Combobox.Control>
                    <Combobox.Input 
                      placeholder="Select environment type"
                      name="environment-type"
                      autoComplete="off"
                      data-extension-ignore="true"
                    />
                    <Combobox.IndicatorGroup>
                      <Combobox.ClearTrigger />
                      <Combobox.Trigger />
                    </Combobox.IndicatorGroup>
                  </Combobox.Control>
                  <Portal>
                    <Combobox.Positioner>
                      <Combobox.Content>
                        <Combobox.Empty>No types found</Combobox.Empty>
                        {environmentTypesCollection.items.map((item: { value: string; label: string }) => (
                          <Combobox.Item key={item.value} item={item}>
                            {item.label}
                          </Combobox.Item>
                        ))}
                      </Combobox.Content>
                    </Combobox.Positioner>
                  </Portal>
                </Combobox.Root>
              </Box>

              <Flex justify="center" mt="var(--chakra-spacing-md)">
                <Button
                  size="sm"
                  onClick={handleCreateEnvironment}
                  disabled={!environmentName.trim() || !environmentType.trim() || !selectedProjectId || createEnvironmentMutation.isPending}
                  loading={createEnvironmentMutation.isPending}
                  colorPalette="primary"
                >
                  Create Environment
                </Button>
              </Flex>
            </Flex>
          </Drawer.Body>
        </Drawer.Content>
      </Drawer.Positioner>
    </Drawer.Root>

    {/* Error Modal */}
    <Dialog.Root open={errorModal.isOpen} onOpenChange={(e) => setErrorModal({ ...errorModal, isOpen: e.open })}>
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content>
          <Dialog.Header>
            <Dialog.Title>{errorModal.title}</Dialog.Title>
          </Dialog.Header>
          <Dialog.Body>
            <Text>{errorModal.message}</Text>
          </Dialog.Body>
          <Dialog.Footer>
            <Button onClick={() => setErrorModal({ ...errorModal, isOpen: false })}>Close</Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Positioner>
    </Dialog.Root>
    </>
  );
}
