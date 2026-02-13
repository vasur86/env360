import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjects, useCreateProject } from '../../api/client';
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
  Card,
  CardHeader,
  CardBody,
  ButtonGroup,
  Pagination,
  Separator,
  Drawer,
  Dialog,
} from '@chakra-ui/react';
import { Breadcrumb } from '@chakra-ui/react';
import { Link as RouterLink } from 'react-router-dom';
import { FaPlus, FaSearch, FaChevronLeft, FaChevronRight, FaSortUp } from 'react-icons/fa';
import { HiChevronLeft, HiChevronRight, HiSortAscending, HiTrash, HiViewGridAdd } from 'react-icons/hi';
import { HiXMark } from 'react-icons/hi2';
import MessageBox from '../../components/MessageBox';

const ITEMS_PER_PAGE = 25;

// Helper to get initials from project name
const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
};

// Helper to format date
const formatDate = (dateString?: string) => {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' });
};

export default function Projects() {
  const navigate = useNavigate();
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState('');
  const [sortField, setSortField] = React.useState('name');
  const [sortOrder, setSortOrder] = React.useState<'asc' | 'desc'>('asc');
  const [includeDeleted, setIncludeDeleted] = React.useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = React.useState(false);
  const [projectName, setProjectName] = React.useState('');
  const [projectDescription, setProjectDescription] = React.useState('');
  const [errorModal, setErrorModal] = React.useState<{ isOpen: boolean; title: string; message: string }>({
    isOpen: false,
    title: '',
    message: '',
  });
  const skip = (page - 1) * ITEMS_PER_PAGE;
  
  const { data: projectsData, isLoading, error } = useProjects(skip, ITEMS_PER_PAGE, search || undefined);
  const createProjectMutation = useCreateProject();
     
  const data = projectsData?.items;
  const totalCount = projectsData?.total ?? 0;
  const textColor = 'var(--chakra-colors-fg)';

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

  const handleCreateProject = async () => {
    if (!projectName.trim()) {
      setErrorModal({
        isOpen: true,
        title: 'Validation Error',
        message: 'Project name is required',
      });
      return;
    }

    try {
      const result = await createProjectMutation.mutateAsync({
        name: projectName.trim(),
        description: projectDescription.trim() || undefined,
      });
      
      // Close drawer and reset form
      setIsDrawerOpen(false);
      setProjectName('');
      setProjectDescription('');
      
      // Navigate to the new project
      navigate(`/projects/${result.createProject.id}`);
    } catch (error: any) {
      setErrorModal({
        isOpen: true,
        title: 'Failed to Create Project',
        message: error?.message || 'An error occurred while creating the project',
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
      <Flex direction="row" justify="space-between" align="center" 
            gap="var(--chakra-spacing-sm)" wrap="wrap">
        {/* Breadcrumbs moved to Topbar */}
        <Flex align="center" gap="var(--chakra-spacing-xs)" flex="1" grow={1}>          
          <InputGroup startElement={<FaSearch />} maxW="300px" minW="150px" bg="var(--chakra-colors-sws-secondary)" borderRadius="var(--chakra-radii-sm)">
            <Input
              size="sm"
              placeholder="Search projects..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  // Search is already reactive via onChange, no need for handleSearch
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
          // bg="var(--chakra-colors-sws-secondary)"
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

        {/* Create New Project Button */}
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
          message="No projects found"
        />
      )}
      { error && !isLoading && (
        <MessageBox 
          marginTop="calc(60px + var(--chakra-spacing-sm))"
          type="error" 
          message="Error loading projects"
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
      {!isLoading && data && data.length > 0 && data?.map((project) => (
        <Box
          key={project.id}
          bg="var(--chakra-colors-white)"
          borderRadius="var(--chakra-radii-md)"
          boxShadow="var(--chakra-shadows-md)"
          p="var(--chakra-spacing-sm)"          
          height="150px"
          display="flex"
          flexDirection="column"
          justifyContent="flex-start"
          cursor="pointer"
          onClick={() => navigate(`/projects/${project.id}`)}
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
            fontSize="md" 
            fontWeight="bold" 
            color="var(--chakra-colors-fg)"
            // mb="var(--chakra-spacing-xs)"
          >
            {project.name}
          </Text>
          {project.description && (
            <Text 
              fontSize="sm" 
              color="var(--chakra-colors-fg-muted)"
              lineHeight="1.5"
              style={{
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
              mb="var(--chakra-spacing-xs)"
            >
              {project.description}
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
              <Text fontSize="xs" color="var(--chakra-colors-fg-muted)">Envs</Text>
              <Text fontSize="sm" fontWeight="bold" color="var(--chakra-colors-fg)">
                {project.environmentsCount ?? 0}
              </Text>
            </Box>
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
                {project.servicesCount ?? 0}
              </Text>
            </Box>
          </Flex>
        </Box>
      ))}
    </Box>

    {/* Create New Project Drawer */}
    <Drawer.Root           
      open={isDrawerOpen} 
      onOpenChange={(e) => {
        setIsDrawerOpen(e.open);
        // Reset form when drawer closes
        if (!e.open) {
          setProjectName('');
          setProjectDescription('');
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
              <Drawer.Title>New Project</Drawer.Title>
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
                  Name *
                </Text>
                <Input
                  placeholder="Enter project name"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  size="sm"
                />
              </Box>

              <Box>
                <Text fontSize="sm" mb="var(--chakra-spacing-xs)" fontWeight="medium">
                  Description
                </Text>
                <Textarea
                  placeholder="Enter project description (optional)"
                  value={projectDescription}
                  onChange={(e) => setProjectDescription(e.target.value)}
                  size="sm"
                  rows={4}
                />
              </Box>

              <Flex justify="center" mt="var(--chakra-spacing-md)">
                <Button
                  size="sm"
                  onClick={handleCreateProject}
                  disabled={!projectName.trim() || createProjectMutation.isPending}
                  loading={createProjectMutation.isPending}
                  colorPalette="primary"
                >
                  Create Project
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
