import * as React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useServices, useCreateService, useProjects } from '../../api/client';
import { 
  Button, 
  Flex, 
  Text, 
  Input,
  Textarea,
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

export default function Services() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const projectId = searchParams.get('projectId') || undefined;
  const environmentId = searchParams.get('environmentId') || undefined;
  
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
  const [serviceName, setServiceName] = React.useState('');
  const [serviceDescription, setServiceDescription] = React.useState('');
  const [serviceType, setServiceType] = React.useState('');
  const [selectedProjectId, setSelectedProjectId] = React.useState(projectId || '');
  const [errorModal, setErrorModal] = React.useState<{ isOpen: boolean; title: string; message: string }>({
    isOpen: false,
    title: '',
    message: '',
  });
  const skip = (page - 1) * ITEMS_PER_PAGE;
  
  const { data: servicesData, isLoading, error } = useServices(skip, ITEMS_PER_PAGE, projectId, environmentId, search || undefined);  
  // Fetch projects for the header dropdown (always enabled) and for drawer
  const { data: projectsData } = useProjects(0, 100, undefined, true, { enabled: true }); // Fetch projects with write permission for dropdown
  const createServiceMutation = useCreateService();
     
  const data = servicesData?.items;
  const totalCount = servicesData?.total ?? 0;

  const serviceTypesItems = React.useMemo(() => [
    { value: 'microservice', label: 'Microservice' },
    { value: 'webapp', label: 'Web App' },
    { value: 'database', label: 'Database' },
    { value: 'queue', label: 'Queue' },
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
  
  const { collection: serviceTypesCollection, filter: typeFilter } = useListCollection({
    initialItems: serviceTypesItems,
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

  const handleCreateService = async () => {
    if (!serviceName.trim() || !serviceType.trim() || !selectedProjectId) {
      setErrorModal({
        isOpen: true,
        title: 'Validation Error',
        message: 'Please fill in all required fields (Name, Type, and Project).',
      });
      return;
    }

    try {
      const result = await createServiceMutation.mutateAsync({
        name: serviceName.trim(),
        description: serviceDescription.trim() || undefined,
        type: serviceType.trim(),
        projectId: selectedProjectId,
      });
      
      // Navigate to the new service
      navigate(`/services/${result.createService.id}`);
    } catch (error) {
      console.error('Error creating service:', error);
      let errorMessage = 'An unknown error occurred while creating the service.';
      if (error instanceof Error) {
        errorMessage = error.message;
        if (error.message.includes('fetch') || error.message.includes('network') || error.message.includes('Failed to fetch')) {
          errorMessage = 'Network error: Unable to connect to the server. Please check your internet connection and try again.';
        }
      }
      setErrorModal({
        isOpen: true,
        title: 'Failed to Create Service',
        message: errorMessage,
      });
    }
  };

  return (
    <>
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
              placeholder="Search services..."
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

        {/* Create New Service Button */}
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
          message="No services found"
        />
      )}
      { error && !isLoading && (
        <MessageBox 
          marginTop="calc(60px + var(--chakra-spacing-sm))"
          type="error" 
          message="Error loading services"
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
      {!isLoading && data && data.length > 0 && data?.map((service) => (
        <Box
          key={service.id}
          bg="var(--chakra-colors-white)"
          borderRadius="var(--chakra-radii-md)"
          boxShadow="var(--chakra-shadows-md)"
          p="var(--chakra-spacing-sm)"          
          height="150px"
          display="flex"
          flexDirection="column"
          justifyContent="flex-start"
          cursor="pointer"
          onClick={() => navigate(`/services/${service.id}`)}
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
            Project: {service.project?.name}
          </Text>
          <Text 
            fontSize="md" 
            fontWeight="bold" 
            color="var(--chakra-colors-fg)"
          >
            {service.name}
          </Text>
          <Text 
            fontSize="sm" 
            color="var(--chakra-colors-fg-muted)"
            mb="var(--chakra-spacing-xs)"
          >
            {service.type} • {service.status}
          </Text>
          {service.environments && service.environments.length > 0 && (
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
              Environments: {service.environments.map(e => e.name).join(', ')}
            </Text>
          )}
        </Box>
      ))}
    </Box>

    {/* Create New Service Drawer */}
    <Drawer.Root           
      open={isDrawerOpen} 
      onOpenChange={(e) => {
        setIsDrawerOpen(e.open);
        // Reset form when drawer closes
        if (!e.open) {
          setServiceName('');
          setServiceType('');
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
              <Drawer.Title>New Service</Drawer.Title>
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
                    const newProjectId = details.value[0] || '';
                    setSelectedProjectId(newProjectId);
                  }}
                  onInputValueChange={(e) => drawerProjectsFilter(e.inputValue)}
                  collection={drawerProjectsCollection}
                >
                  <Combobox.Control>
                    <Combobox.Input 
                      placeholder={projectsData?.items && projectsData.items.length > 0 ? 'Select a project' : 'No projects found'}
                      name="service-project"
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
                  placeholder="Enter service name"
                  value={serviceName}
                  onChange={(e) => setServiceName(e.target.value)}
                  size="sm"
                />
              </Box>

              <Box>
                <Text fontSize="sm" mb="var(--chakra-spacing-xs)" fontWeight="medium">
                  Description
                </Text>
                <Textarea
                  placeholder="Enter service description (optional)"
                  value={serviceDescription}
                  onChange={(e) => setServiceDescription(e.target.value)}
                  size="sm"
                  rows={3}
                />
              </Box>

              <Box>
                <Text fontSize="sm" mb="var(--chakra-spacing-xs)" fontWeight="medium">
                  Type *
                </Text>
                <Combobox.Root
                  value={serviceType ? [serviceType] : []}
                  onValueChange={(details) => {
                    setServiceType(details.value[0] || '');
                  }}
                  onInputValueChange={(e) => typeFilter(e.inputValue)}
                  collection={serviceTypesCollection}
                >
                  <Combobox.Control>
                    <Combobox.Input 
                      placeholder="Select service type"
                      name="service-type"
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
                        {serviceTypesCollection.items.map((item: { value: string; label: string }) => (
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
                  onClick={handleCreateService}
                  disabled={!serviceName.trim() || !serviceType.trim() || !selectedProjectId || createServiceMutation.isPending}
                  loading={createServiceMutation.isPending}
                  colorPalette="primary"
                >
                  Create Service
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
