import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { computeOverviewSummary, mockEnvironments, mockProjects, mockServices } from './mockData';
import { useAuth } from '../contexts/AuthContext';

// GraphQL API base URL
const getApiBaseUrl = () => {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  if (import.meta.env.DEV) {
    return '/api/v1';
  }
  return '/api/v1';
};

const API_BASE_URL = getApiBaseUrl();

// GraphQL query helper with timeout
export async function graphqlQuery<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  // Create AbortController for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
  
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/graphql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeoutId);
    // Handle timeout or network errors
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timeout: The server took too long to respond. Please try again.');
    }
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Network error: Unable to connect to the server. Please check your internet connection and try again.');
    }
    throw error;
  }
  
  clearTimeout(timeoutId);

  // Handle authentication errors (401 Unauthorized, 403 Forbidden)
  if (response.status === 401 || response.status === 403) {
    // Clear any stale auth state
    localStorage.removeItem('env360_auth_token');
    localStorage.removeItem('env360_user');
    // Redirect to login with current URL as redirect_uri
    const currentUrl = window.location.href;
    window.location.href = `/api/v1/auth/login?redirect_uri=${encodeURIComponent(currentUrl)}`;
    // Throw error to prevent further processing
    throw new Error('Authentication required');
  }

  if (!response.ok) {
    throw new Error(`GraphQL request failed: ${response.statusText}`);
  }

  const result = await response.json();
  
  if (result.errors) {
    // Check for authentication-related errors in GraphQL response
    const authError = result.errors.find((err: any) => {
      const msg = err.message?.toLowerCase() || '';
      return msg.includes('authentication') ||
        msg.includes('unauthorized') ||
        msg.includes('access denied') ||
        msg.includes('not authenticated') ||
        msg.includes('token expired') ||
        msg.includes('expired token') ||
        msg.includes('invalid token') ||
        msg.includes('token invalid') ||
        msg.includes('jwt expired') ||
        msg.includes('expired jwt');
    });
    
    if (authError) {
      // Clear any stale auth state
      localStorage.removeItem('env360_auth_token');
      localStorage.removeItem('env360_user');
      // Redirect to login with current URL as redirect_uri
      const currentUrl = window.location.href;
      window.location.href = `/api/v1/auth/login?redirect_uri=${encodeURIComponent(currentUrl)}`;
      // Throw error to prevent further processing
      throw new Error('Authentication required');
    }
    
    throw new Error(result.errors[0]?.message || 'GraphQL error');
  }

  return result.data;
}

// GraphQL mutation helper with timeout
export async function graphqlMutation<T>(mutation: string, variables?: Record<string, unknown>): Promise<T> {
  // Create AbortController for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
  
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/graphql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ query: mutation, variables }),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeoutId);
    // Handle timeout or network errors
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timeout: The server took too long to respond. Please try again.');
    }
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error('Network error: Unable to connect to the server. Please check your internet connection and try again.');
    }
    throw error;
  }
  
  clearTimeout(timeoutId);

  // Handle authentication errors (401 Unauthorized, 403 Forbidden)
  if (response.status === 401 || response.status === 403) {
    localStorage.removeItem('env360_auth_token');
    localStorage.removeItem('env360_user');
    const currentUrl = window.location.href;
    window.location.href = `/api/v1/auth/login?redirect_uri=${encodeURIComponent(currentUrl)}`;
    throw new Error('Authentication required');
  }

  if (!response.ok) {
    // Try to get more details from the response
    let errorMessage = `GraphQL mutation failed: ${response.statusText}`;
    try {
      const errorData = await response.text();
      if (errorData) {
        errorMessage = `GraphQL mutation failed: ${response.statusText} - ${errorData}`;
      }
    } catch {
      // If we can't read the response, use the default message
    }
    throw new Error(errorMessage);
  }

  const result = await response.json();
  
  if (result.errors) {
    const authError = result.errors.find((err: any) => {
      const msg = err.message?.toLowerCase() || '';
      return msg.includes('authentication') ||
        msg.includes('unauthorized') ||
        msg.includes('access denied') ||
        msg.includes('not authenticated') ||
        msg.includes('token expired') ||
        msg.includes('expired token') ||
        msg.includes('invalid token') ||
        msg.includes('token invalid') ||
        msg.includes('jwt expired') ||
        msg.includes('expired jwt');
    });
    
    if (authError) {
      localStorage.removeItem('env360_auth_token');
      localStorage.removeItem('env360_user');
      const currentUrl = window.location.href;
      window.location.href = `/api/v1/auth/login?redirect_uri=${encodeURIComponent(currentUrl)}`;
      throw new Error('Authentication required');
    }
    
    throw new Error(result.errors[0]?.message || 'GraphQL error');
  }

  return result.data;
}

export function useOverview() {
  return useQuery({
    queryKey: ['overview'],
    queryFn: async () => {
      // Simulate network latency
      await new Promise((r) => setTimeout(r, 100));
      return computeOverviewSummary();
    },
  });
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  ownerId?: string;
  createdAt?: string;
  updatedAt?: string;
  environments?: Array<{ id: string; name?: string; type?: string; url?: string }>;
  services?: Array<{ id: string; name?: string; type?: string; status?: string }>;
  environmentsCount?: number;
  servicesCount?: number;
}

export interface Environment {
  id: string;
  name: string;
  type: string;
  url?: string;
  projectId: string;
  project?: Project | null;
  createdAt?: string;
  updatedAt?: string;
  services?: Array<{ id: string; name?: string; type?: string; status?: string }>;
  servicesCount?: number;
}

export interface Service {
  id: string;
  name: string;
  description?: string | null;
  type: string;
  projectId: string;
  project?: Project | null;
  environments?: Array<{ id: string; name?: string; type?: string; url?: string }>;
  owner?: string | null;
  status: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ServiceConfig {
  id: string;
  serviceId: string;
  key: string;
  value?: string | null;
  configData?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface GitOrganization {
  name: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}

export interface GitRepository {
  name: string;
  fullName?: string | null;
  description?: string | null;
  private?: boolean;
  defaultBranch?: string | null;
}

interface ProjectsResponse {
  projects: {
    items: Project[];
    total: number;
  };
}

export function useProjects(skip: number = 0, limit: number = 10, search?: string, requireWritePermission: boolean = false, options?: { enabled?: boolean }) {
  // Normalize search to null instead of undefined for stable query key
  const normalizedSearch = search || null;
  
  return useQuery({
    queryKey: ['projects', skip, limit, normalizedSearch, requireWritePermission],
    queryFn: async () => {
      const query = `
        query GetProjects($skip: Int!, $limit: Int!, $search: String, $requireWritePermission: Boolean) {
          projects(skip: $skip, limit: $limit, search: $search, requireWritePermission: $requireWritePermission) {
            items {
              id
              name
              description
              createdAt
              updatedAt
              environments {
                id
              }
              services {
                id
              }
            }
            total
          }
        }
      `;
      
      const data = await graphqlQuery<ProjectsResponse>(query, { skip, limit, search: normalizedSearch || undefined, requireWritePermission });
      // Calculate counts for each project
      return {
        items: data.projects.items.map(project => ({
          ...project,
          environmentsCount: project.environments?.length || 0,
          servicesCount: project.services?.length || 0,
        })),
        total: data.projects.total,
      };
    },
    enabled: options?.enabled !== false,
  });
}

export function useProject(projectId: string) {
  return useQuery({
    queryKey: ['projects', projectId],
    queryFn: async () => {
      if (!projectId || projectId === 'new') {
        return null;
      }
      
      const query = `
        query GetProject($id: String!) {
          project(id: $id) {
            id
            name
            description
            ownerId
            createdAt
            updatedAt
            environments {
              id
              name
              type
              url
            }
            services {
              id
              name
              type
              status
            }
          }
        }
      `;
      
      const data = await graphqlQuery<{ project: Project | null }>(query, { id: projectId });
      if (data.project) {
        return {
          ...data.project,
          environmentsCount: data.project.environments?.length || 0,
          servicesCount: data.project.services?.length || 0,
        };
      }
      return null;
    },
    enabled: !!projectId && projectId !== 'new',
  });
}

interface ProjectDetailsData {
  project: Project;
  permissions: {
    canRead: boolean;
    canWrite: boolean;
    canDelete: boolean;
    isAdmin: boolean;
    isOwner: boolean;
  } | null;
  environmentVariables: EnvironmentVariable[];
  secrets: Secret[];
  resourcePermissions: Array<{
    id: string;
    userId: string;
    scope: string;
    resourceId: string;
    actions: string[];
    grantedAt: string;
    grantedBy: string;
  }>;
}

interface ProjectDetailsResponse {
  projectDetails: ProjectDetailsData | null;
}

export function useProjectDetails(projectId: string) {
  return useQuery({
    queryKey: ['project-details', projectId],
    queryFn: async () => {
      if (!projectId || projectId === 'new') {
        return null;
      }
      
      const query = `
        query GetProjectDetails($id: String!) {
          projectDetails(id: $id) {
            project {
              id
              name
              description
              ownerId
              createdAt
              updatedAt
              environments {
                id
                name
                type
                url
              }
              services {
                id
                name
                type
                status
              }
            }
            permissions {
              canRead
              canWrite
              canDelete
              isAdmin
              isOwner
            }
            environmentVariables {
              id
              scope
              resourceId
              key
              value
              createdAt
              updatedAt
            }
            secrets {
              id
              scope
              resourceId
              key
              valueLength
              createdAt
              updatedAt
            }
            resourcePermissions {
              id
              userId
              scope
              resourceId
              actions
              grantedAt
              grantedBy
            }
          }
        }
      `;
      
      const data = await graphqlQuery<ProjectDetailsResponse>(query, { id: projectId });
      if (data.projectDetails) {
        return {
          ...data.projectDetails,
          project: {
            ...data.projectDetails.project,
            environmentsCount: data.projectDetails.project.environments?.length || 0,
            servicesCount: data.projectDetails.project.services?.length || 0,
          },
        };
      }
      return null;
    },
    enabled: !!projectId && projectId !== 'new',
  });
}

interface ResourcePermission {
  id: string;
  userId: string;
  scope: string;
  resourceId: string;
  actions: string[];
  grantedAt: string;
  grantedBy: string;
}

interface ResourcePermissionsResponse {
  resourcePermissions: ResourcePermission[];
}

export function useProjectPermissions(projectId: string) {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['project-permissions', projectId],
    queryFn: async () => {
      if (!projectId || projectId === 'new' || !user) {
        return { canWrite: false, canDelete: false, isOwner: false, isAdmin: user?.is_admin || false };
      }
      
      // First, get the project to check if user is owner
      // Note: GraphQL field names are typically camelCase in responses
      const projectQuery = `
        query GetProject($id: String!) {
          project(id: $id) {
            id
            ownerId
          }
        }
      `;
      
      const projectData = await graphqlQuery<{ project: { id: string; ownerId?: string } | null }>(projectQuery, { id: projectId });
      const isOwner = projectData.project?.ownerId === user.id;
      const isAdmin = user.is_admin;
      
      // If user is owner or admin, they have all permissions
      if (isOwner || isAdmin) {
        return { canWrite: true, canDelete: true, isOwner, isAdmin };
      }
      
      // Otherwise, check resource permissions
      // Note: GraphQL field names may be camelCase or snake_case depending on Strawberry configuration
      const permissionsQuery = `
        query GetResourcePermissions($userId: String, $scope: String, $resourceId: String) {
          resourcePermissions(userId: $userId, scope: $scope, resourceId: $resourceId) {
            id
            userId
            scope
            resourceId
            actions
          }
        }
      `;
      
      try {
        const permissionsData = await graphqlQuery<ResourcePermissionsResponse>(permissionsQuery, {
          userId: user.id,
          scope: 'project',
          resourceId: projectId,
        });
        
        const permissions = permissionsData.resourcePermissions || [];
        const actions = permissions.flatMap(p => p.actions || []);
        
        const canWrite = actions.includes('write') || actions.includes('admin');
        const canDelete = actions.includes('admin');
        
        return { canWrite, canDelete, isOwner, isAdmin };
      } catch (error) {
        // If permission check fails, user has no permissions
        console.error('Error checking permissions:', error);
        return { canWrite: false, canDelete: false, isOwner, isAdmin };
      }
    },
    enabled: !!projectId && projectId !== 'new' && !!user,
  });
}

export function useEnvironments(skip: number = 0, limit: number = 10, projectId?: string, search?: string) {
  return useQuery({
    queryKey: ['environments', skip, limit, projectId, search],
    queryFn: async () => {
      const query = `
        query GetEnvironments($skip: Int!, $limit: Int!, $projectId: String) {
          environments(skip: $skip, limit: $limit, projectId: $projectId) {
            items {
              id
              name
              type
              url
              projectId
              project {
                id
                name
              }
              createdAt
              updatedAt
              services {
                id
                name
                type
                status
              }
            }
            total
          }
        }
      `;
      
      const data = await graphqlQuery<{ environments: { items: Environment[]; total: number } }>(query, {
        skip,
        limit,
        projectId: projectId || undefined,
      });
      
      // Filter by search if provided
      let items = data.environments.items;
      if (search) {
        const searchLower = search.toLowerCase();
        items = items.filter(
          (env) =>
            env.name?.toLowerCase().includes(searchLower) ||
            env.type?.toLowerCase().includes(searchLower) ||
            env.url?.toLowerCase().includes(searchLower)
        );
      }
      
      return {
        items: items.map((env) => ({
          ...env,
          servicesCount: env.services?.length || 0,
        })),
        total: data.environments.total,
      };
    },
  });
}

export function useEnvironment(environmentId: string) {
  return useQuery({
    queryKey: ['environments', environmentId],
    queryFn: async () => {
      if (!environmentId || environmentId === 'new') {
        return null;
      }
      
      const query = `
        query GetEnvironment($id: String!) {
          environment(id: $id) {
            id
            name
            type
            url
            projectId
            createdAt
            updatedAt
            services {
              id
              name
              type
              status
            }
          }
        }
      `;
      
      const data = await graphqlQuery<{ environment: Environment | null }>(query, { id: environmentId });
      if (data.environment) {
        return {
          ...data.environment,
          servicesCount: data.environment.services?.length || 0,
        };
      }
      return null;
    },
    enabled: !!environmentId && environmentId !== 'new',
  });
}

interface EnvironmentDetailsData {
  environment: Environment;
  permissions: {
    canRead: boolean;
    canWrite: boolean;
    canDelete: boolean;
    isAdmin: boolean;
    isOwner: boolean;
  };
  environmentVariables: EnvironmentVariable[];
  secrets: Secret[];
  resourcePermissions: ResourcePermission[];
}

interface EnvironmentDetailsResponse {
  environmentDetails: EnvironmentDetailsData;
}

export function useEnvironmentDetails(environmentId: string) {
  return useQuery({
    queryKey: ['environment-details', environmentId],
    queryFn: async () => {
      if (!environmentId || environmentId === 'new') {
        return null;
      }
      
      const query = `
        query GetEnvironmentDetails($id: String!) {
          environmentDetails(id: $id) {
            environment {
              id
              name
              type
              url
              clusterId
              cluster { id name environmentType }
              projectId
              project {
                id
                name
                description
                ownerId
                createdAt
                updatedAt
              }
              createdAt
              updatedAt
              services {
                id
                name
                type
                status
              }
            }
            permissions {
              canRead
              canWrite
              canDelete
              isAdmin
              isOwner
            }
            environmentVariables {
              id
              scope
              resourceId
              key
              value
              createdAt
              updatedAt
            }
            secrets {
              id
              scope
              resourceId
              key
              valueLength
              createdAt
              updatedAt
            }
            resourcePermissions {
              id
              userId
              scope
              resourceId
              actions
              grantedAt
              grantedBy
            }
          }
        }
      `;
      
      const data = await graphqlQuery<EnvironmentDetailsResponse>(query, { id: environmentId });
      if (data.environmentDetails) {
        return {
          ...data.environmentDetails,
          environment: {
            ...data.environmentDetails.environment,
            servicesCount: data.environmentDetails.environment.services?.length || 0,
          },
        };
      }
      return null;
    },
    enabled: !!environmentId && environmentId !== 'new',
  });
}

interface ServiceDetailsData {
  service: Service;
  permissions: {
    canRead: boolean;
    canWrite: boolean;
    canDelete: boolean;
    isAdmin: boolean;
    isOwner: boolean;
  };
  environmentVariables: EnvironmentVariable[];
  secrets: Secret[];
  serviceConfigs: ServiceConfig[];
  resourcePermissions: ResourcePermission[];
}

interface ServiceDetailsResponse {
  serviceDetails: ServiceDetailsData;
}

export function useServiceDetails(serviceId: string) {
  return useQuery({
    queryKey: ['service-details', serviceId],
    queryFn: async () => {
      if (!serviceId || serviceId === 'new') {
        return null;
      }
      
      const query = `
        query GetServiceDetails($id: String!) {
          serviceDetails(id: $id) {
            service {
              id
              name
              description
              type
              projectId
              project {
                id
                name
                description
                ownerId
                createdAt
                updatedAt
              }
              environments {
                id
                name
              }
              owner
              status
              createdAt
              updatedAt
            }
            permissions {
              canRead
              canWrite
              canDelete
              isAdmin
              isOwner
            }
            environmentVariables {
              id
              scope
              resourceId
              key
              value
              createdAt
              updatedAt
            }
            secrets {
              id
              scope
              resourceId
              key
              valueLength
              createdAt
              updatedAt
            }
            serviceConfigs {
              id
              serviceId
              key
              value
              configData
              createdAt
              updatedAt
            }
            resourcePermissions {
              id
              userId
              scope
              resourceId
              actions
              grantedAt
              grantedBy
            }
          }
        }
      `;
      
      const data = await graphqlQuery<ServiceDetailsResponse>(query, { id: serviceId });
      if (data.serviceDetails) {
        return data.serviceDetails;
      }
      return null;
    },
    enabled: !!serviceId && serviceId !== 'new',
  });
}

export interface DeployStep {
  label: string;
  fn: string;
  desc?: string | null;
}

export interface DownstreamOverride {
  serviceId: string;
  serviceName: string;
  version: string;
}

export interface DeploymentRecord {
  id: string;
  serviceId: string;
  versionId: string;
  workflowUuid?: string | null;
  environmentId: string;
  steps?: DeployStep[] | null;
  downstreamOverrides?: string | null;  // JSON string of DownstreamOverride[]
  status: string;
  createdAt: string;
  completedAt?: string | null;
  subversionIndex: number;
}

export function useServiceDeployments(serviceId: string, refetchInterval?: number | false) {
  return useQuery({
    queryKey: ['service-deployments', serviceId],
    queryFn: async () => {
      if (!serviceId || serviceId === 'new') return [] as DeploymentRecord[];
      const query = `
        query GetServiceDeployments($serviceId: String!, $limit: Int) {
          serviceDeployments(serviceId: $serviceId, limit: $limit) {
            id
            serviceId
            versionId
            workflowUuid
            environmentId
            steps { label fn desc }
            downstreamOverrides
            status
            createdAt
            completedAt
            subversionIndex
          }
        }
      `;
      const data = await graphqlQuery<{ serviceDeployments: DeploymentRecord[] }>(query, { serviceId, limit: 50 });
      return data.serviceDeployments || [];
    },
    enabled: !!serviceId && serviceId !== 'new',
    staleTime: 30000,
    refetchInterval: refetchInterval ?? false,
  });
}

export function useAddDeployment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { serviceId: string; environmentId: string }) => {
      const mutation = `
        mutation AddDeployment($serviceId: String!, $environmentId: String!) {
          addDeployment(serviceId: $serviceId, environmentId: $environmentId) {
            id
            serviceId
            versionId
            environmentId
            steps { label fn desc }
            status
            createdAt
            completedAt
          }
        }
      `;
      return await graphqlMutation<{ addDeployment: DeploymentRecord }>(mutation, {
        serviceId: input.serviceId,
        environmentId: input.environmentId,
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['service-deployments', variables.serviceId] });
    },
  });
}

export function useDeployService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      versionId: string;
      environmentId: string;
      serviceId?: string;
      downstreamOverrides?: DownstreamOverride[];
    }) => {
      const mutation = `
        mutation DeployService($versionId: String!, $environmentId: String!, $downstreamOverrides: [DownstreamOverrideInput!]) {
          deployService(versionId: $versionId, environmentId: $environmentId, downstreamOverrides: $downstreamOverrides)
        }
      `;
      return await graphqlMutation<{ deployService: boolean }>(
        mutation,
        {
          versionId: input.versionId,
          environmentId: input.environmentId,
          downstreamOverrides: input.downstreamOverrides || undefined,
        }
      );
    },
    onSuccess: (_, variables) => {
      if ((variables as any).serviceId) {
        queryClient.invalidateQueries({ queryKey: ['service-deployments', (variables as any).serviceId] });
      } else {
        queryClient.invalidateQueries({ queryKey: ['service-deployments'] });
      }
    },
  });
}

export interface ServiceVersionRecord {
  id: string;
  serviceId: string;
  versionId?: string; // not in schema; placeholder if needed elsewhere
  versionLabel: string;
  configHash?: string | null;
  specJson?: string | null;
  createdAt: string;
}

export function useServiceVersions(serviceId: string) {
  return useQuery({
    queryKey: ['service-versions', serviceId],
    queryFn: async () => {
      if (!serviceId || serviceId === 'new') return [] as ServiceVersionRecord[];
      const query = `
        query GetServiceVersions($serviceId: String!) {
          serviceVersions(serviceId: $serviceId) {
            id
            serviceId
            versionLabel
            configHash
            specJson
            createdAt
          }
        }
      `;
      const data = await graphqlQuery<{ serviceVersions: ServiceVersionRecord[] }>(query, { serviceId });
      return data.serviceVersions || [];
    },
    enabled: !!serviceId && serviceId !== 'new',
    staleTime: 30000,
  });
}

export function usePublishServiceVersion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { serviceId: string }) => {
      const mutation = `
        mutation PublishServiceVersion($serviceId: String!) {
          publishServiceVersion(serviceId: $serviceId) {
            ok
            message
            version {
              id
              serviceId
              versionLabel
            }
          }
        }
      `;
      return await graphqlMutation<{ publishServiceVersion: { ok: boolean; message: string; version?: { id: string; serviceId: string; versionLabel: string } | null } }>(
        mutation,
        { serviceId: input.serviceId }
      );
    },
    onSuccess: (_res, variables) => {
      // Refresh versions and deployments list for that service
      queryClient.invalidateQueries({ queryKey: ['service-versions', variables.serviceId] });
      queryClient.invalidateQueries({ queryKey: ['service-deployments', variables.serviceId] });
      queryClient.invalidateQueries({ queryKey: ['service-details', variables.serviceId] });
    },
  });
}

// Version validation (diff) types
export interface KeyChange {
  key: string;
  changed: boolean;
}
export interface SectionChangeStatus {
  master: boolean;
  keys: KeyChange[];
}
export interface SectionDiff {
  previous?: string | null;
  current?: string | null;
  changed: SectionChangeStatus;
}
export interface OverallChangeStatus {
  master: boolean;
  config: boolean;
  variables: boolean;
  secrets: boolean;
}
export interface ValidateNewVersionResult {
  config: SectionDiff;
  variables: SectionDiff;
  secrets: SectionDiff;
  matchingVersionLabels: string[];
  overall: OverallChangeStatus;
}

export function useValidateNewServiceVersion(serviceId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['validate-new-service-version', serviceId],
    queryFn: async () => {
      const query = `
        query ValidateNewServiceVersion($serviceId: String!) {
          validateNewServiceVersion(serviceId: $serviceId) {
            overall { master config variables secrets }
            matchingVersionLabels
            config {
              previous
              current
              changed {
                master
                keys { key changed }
              }
            }
            variables {
              previous
              current
              changed {
                master
                keys { key changed }
              }
            }
            secrets {
              previous
              current
              changed {
                master
                keys { key changed }
              }
            }
          }
        }
      `;
      const data = await graphqlQuery<{ validateNewServiceVersion: ValidateNewVersionResult }>(query, { serviceId });
      return data.validateNewServiceVersion;
    },
    enabled: !!serviceId && serviceId !== 'new' && (options?.enabled ?? true),
    staleTime: 10000,
  });
}

interface ServicesResponse {
  services: {
    items: Service[];
    total: number;
  };
}

export function useServices(skip: number = 0, limit: number = 10, projectId?: string, environmentId?: string, search?: string) {
  return useQuery({
    queryKey: ['services', skip, limit, projectId, environmentId, search],
    queryFn: async () => {
      const query = `
        query GetServices($skip: Int!, $limit: Int!, $projectId: String, $environmentId: String) {
          services(skip: $skip, limit: $limit, projectId: $projectId, environmentId: $environmentId) {
            items {
              id
              name
              description
              type
              projectId
              project {
                id
                name
              }
              environments {
                id
                name
                type
                url
              }
              owner
              status
              createdAt
              updatedAt
            }
            total
          }
        }
      `;
      
      const data = await graphqlQuery<ServicesResponse>(query, {
        skip,
        limit,
        projectId: projectId || undefined,
        environmentId: environmentId || undefined,
      });
      
      // Apply client-side search if provided
      let filteredItems = data.services.items;
      if (search) {
        const searchLower = search.toLowerCase();
        filteredItems = filteredItems.filter((service) =>
          service.name.toLowerCase().includes(searchLower) ||
          service.type.toLowerCase().includes(searchLower) ||
          service.status.toLowerCase().includes(searchLower)
        );
      }
      
      return {
        items: filteredItems,
        total: data.services.total,
      };
    },
  });
}

export function useService(serviceId: string) {
  return useQuery({
    queryKey: ['services', serviceId],
    queryFn: async () => {
      if (!serviceId || serviceId === 'new') {
        return null;
      }
      
      const query = `
        query GetService($id: String!) {
          service(id: $id) {
            id
            name
            description
            type
            projectId
            project {
              id
              name
              description
              ownerId
            }
            environments {
              id
              name
              type
              url
            }
                     owner
                     status
                     createdAt
                     updatedAt
                   }
                 }
               `;
               
               const data = await graphqlQuery<{ service: Service | null }>(query, { id: serviceId });
               if (data.service) {
                 return data.service;
               }
               return null;
    },
    enabled: !!serviceId && serviceId !== 'new',
  });
}

interface User {
  id: string;
  email: string;
  name: string;
  is_active: boolean;
  is_admin: boolean;
}

interface UsersResponse {
  users: {
    items: User[];
    total: number;
  };
}

export function useUsers(search?: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['users', search],
    queryFn: async () => {
      const query = `
        query GetUsers($skip: Int!, $limit: Int!, $search: String) {
          users(skip: $skip, limit: $limit, search: $search) {
            items {
              id
              email
              name
              isActive
              isAdmin
            }
            total
          }
        }
      `;
      
      const data = await graphqlQuery<UsersResponse>(query, { skip: 0, limit: 100, search });
      return data.users;
    },
    enabled: options?.enabled !== false,
  });
}

export function useUsersByIds(userIds: string[], options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['users-by-ids', userIds.sort().join(',')],
    queryFn: async () => {
      if (userIds.length === 0) return [];
      
      const query = `
        query GetUsersByIds($ids: [String!]!) {
          usersByIds(ids: $ids) {
            id
            name
            email
            isActive
            isAdmin
          }
        }
      `;
      
      const data = await graphqlQuery<{ usersByIds: User[] }>(query, { ids: userIds });
      return data.usersByIds || [];
    },
    enabled: options?.enabled !== false && userIds.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes cache
  });
}

interface ProjectResourcePermission {
  id: string;
  userId: string;
  scope: string;
  resourceId: string;
  actions: string[];
  grantedAt: string;
  grantedBy: string;
}

interface ProjectResourcePermissionsResponse {
  resourcePermissions: ProjectResourcePermission[];
}

export function useEnvironmentResourcePermissions(environmentId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['environment-resource-permissions', environmentId],
    queryFn: async () => {
      if (!environmentId || environmentId === 'new') {
        return [];
      }
      
      const query = `
        query GetEnvironmentResourcePermissions($scope: String!, $resourceId: String!) {
          resourcePermissions(scope: $scope, resourceId: $resourceId) {
            id
            userId
            scope
            resourceId
            actions
            grantedAt
            grantedBy
          }
        }
      `;
      
      const data = await graphqlQuery<ResourcePermissionsResponse>(query, {
        scope: 'environment',
        resourceId: environmentId,
      });
      
      return data.resourcePermissions || [];
    },
    enabled: options?.enabled !== false && !!environmentId && environmentId !== 'new',
  });
}

export function useServiceResourcePermissions(serviceId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['service-resource-permissions', serviceId],
    queryFn: async () => {
      if (!serviceId || serviceId === 'new') {
        return [];
      }
      
      const query = `
        query GetServiceResourcePermissions($scope: String!, $resourceId: String!) {
          resourcePermissions(scope: $scope, resourceId: $resourceId) {
            id
            userId
            scope
            resourceId
            actions
            grantedAt
            grantedBy
          }
        }
      `;
      
      const data = await graphqlQuery<ResourcePermissionsResponse>(query, {
        scope: 'service',
        resourceId: serviceId,
      });
      
      return data.resourcePermissions || [];
    },
    enabled: options?.enabled !== false && !!serviceId && serviceId !== 'new',
  });
}

export function useProjectResourcePermissions(projectId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['project-resource-permissions', projectId],
    queryFn: async () => {
      if (!projectId || projectId === 'new') {
        return [];
      }
      
      const query = `
        query GetProjectResourcePermissions($scope: String, $resourceId: String) {
          resourcePermissions(scope: $scope, resourceId: $resourceId) {
            id
            userId
            scope
            resourceId
            actions
            grantedAt
            grantedBy
          }
        }
      `;
      
      const data = await graphqlQuery<ProjectResourcePermissionsResponse>(query, {
        scope: 'project',
        resourceId: projectId,
      });
      
      return data.resourcePermissions || [];
    },
    enabled: options?.enabled !== false && !!projectId && projectId !== 'new',
  });
}

export function useGrantResourcePermission() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (input: { userId: string; scope: string; resourceId: string; actions: string[] }) => {
      const mutation = `
        mutation GrantResourcePermission($input: ResourcePermissionCreateInput!) {
          grantResourcePermission(input: $input) {
            id
            userId
            scope
            resourceId
            actions
            grantedAt
            grantedBy
          }
        }
      `;
      
      return await graphqlMutation<{ grantResourcePermission: ProjectResourcePermission }>(mutation, {
        input: {
          userId: input.userId,
          scope: input.scope,
          resourceId: input.resourceId,
          actions: input.actions,
        },
      });
    },
    onSuccess: (_, variables) => {
      // Invalidate and refetch permissions based on scope
      if (variables.scope === 'project') {
        queryClient.invalidateQueries({ queryKey: ['project-resource-permissions', variables.resourceId] });
        queryClient.refetchQueries({ queryKey: ['project-resource-permissions', variables.resourceId] });
        // Also invalidate project-details to refresh consolidated data
        queryClient.invalidateQueries({ queryKey: ['project-details', variables.resourceId] });
        queryClient.refetchQueries({ queryKey: ['project-details', variables.resourceId] });
      } else if (variables.scope === 'environment') {
        queryClient.invalidateQueries({ queryKey: ['environment-resource-permissions', variables.resourceId] });
        queryClient.refetchQueries({ queryKey: ['environment-resource-permissions', variables.resourceId] });
        // Also invalidate environment-details to refresh consolidated data
        queryClient.invalidateQueries({ queryKey: ['environment-details', variables.resourceId] });
        queryClient.refetchQueries({ queryKey: ['environment-details', variables.resourceId] });
      }
      // Also invalidate users-by-ids queries since a new user might be added to permissions
      queryClient.invalidateQueries({ queryKey: ['users-by-ids'] });
    },
  });
}

export function useRevokeResourcePermission() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (variables: { permissionId: string; resourceId: string; scope?: string }) => {
      const mutation = `
        mutation RevokeResourcePermission($id: String!) {
          revokeResourcePermission(id: $id)
        }
      `;
      
      return await graphqlMutation<{ revokeResourcePermission: boolean }>(mutation, {
        id: variables.permissionId,
      });
    },
    onSuccess: (_, variables) => {
      // Invalidate and refetch permissions based on scope
      const scope = variables.scope || 'project'; // Default to project if not provided
      if (scope === 'project') {
        queryClient.invalidateQueries({ queryKey: ['project-resource-permissions', variables.resourceId] });
        queryClient.refetchQueries({ queryKey: ['project-resource-permissions', variables.resourceId] });
        // Also invalidate project-details to refresh consolidated data
        queryClient.invalidateQueries({ queryKey: ['project-details', variables.resourceId] });
        queryClient.refetchQueries({ queryKey: ['project-details', variables.resourceId] });
      } else if (scope === 'environment') {
        queryClient.invalidateQueries({ queryKey: ['environment-resource-permissions', variables.resourceId] });
        queryClient.refetchQueries({ queryKey: ['environment-resource-permissions', variables.resourceId] });
        // Also invalidate environment-details to refresh consolidated data
        queryClient.invalidateQueries({ queryKey: ['environment-details', variables.resourceId] });
        queryClient.refetchQueries({ queryKey: ['environment-details', variables.resourceId] });
      }
      // Also invalidate users-by-ids queries since permissions changed
      queryClient.invalidateQueries({ queryKey: ['users-by-ids'] });
    },
  });
}

// Environment Variables and Secrets

interface EnvironmentVariable {
  id: string;
  scope: string;
  resourceId: string;
  key: string;
  value?: string | null;
  createdAt: string;
  updatedAt?: string | null;
}

interface Secret {
  id: string;
  scope: string;
  resourceId: string;
  key: string;
  valueLength?: number | null;  // Length of the secret value (for masking display)
  createdAt: string;
  updatedAt?: string | null;
}

interface EnvironmentVariablesResponse {
  environmentVariables: EnvironmentVariable[];
}

interface SecretsResponse {
  secrets: Secret[];
}

export function useEnvironmentVariables(scope: string, resourceId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['environment-variables', scope, resourceId],
    queryFn: async () => {
      if (!resourceId) {
        return [];
      }
      
      const query = `
        query GetEnvironmentVariables($scope: String!, $resourceId: String!) {
          environmentVariables(scope: $scope, resourceId: $resourceId) {
            id
            scope
            resourceId
            key
            value
            createdAt
            updatedAt
          }
        }
      `;
      
      const data = await graphqlQuery<EnvironmentVariablesResponse>(query, {
        scope,
        resourceId,
      });
      
      return data.environmentVariables || [];
    },
    enabled: options?.enabled !== false && !!resourceId,
  });
}

export function useSecrets(scope: string, resourceId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['secrets', scope, resourceId],
    queryFn: async () => {
      if (!resourceId) {
        return [];
      }
      
      const query = `
        query GetSecrets($scope: String!, $resourceId: String!) {
          secrets(scope: $scope, resourceId: $resourceId) {
            id
            scope
            resourceId
            key
            valueLength
            createdAt
            updatedAt
          }
        }
      `;
      
      const data = await graphqlQuery<SecretsResponse>(query, {
        scope,
        resourceId,
      });
      
      return data.secrets || [];
    },
    enabled: options?.enabled !== false && !!resourceId,
  });
}

export function useCreateEnvironmentVariable() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (input: { scope: string; resourceId: string; key: string; value?: string }) => {
      const mutation = `
        mutation CreateEnvironmentVariable($input: EnvironmentVariableCreateInput!) {
          createEnvironmentVariable(input: $input) {
            id
            scope
            resourceId
            key
            value
            createdAt
            updatedAt
          }
        }
      `;
      
      return await graphqlMutation<{ createEnvironmentVariable: EnvironmentVariable }>(mutation, {
        input,
      });
    },
    onSuccess: (_, variables) => {
      // Invalidate individual query
      queryClient.invalidateQueries({ queryKey: ['environment-variables', variables.scope, variables.resourceId] });
      // Invalidate and refetch consolidated queries based on scope
      if (variables.scope === 'project') {
        queryClient.invalidateQueries({ queryKey: ['project-details', variables.resourceId] });
        queryClient.refetchQueries({ queryKey: ['project-details', variables.resourceId] });
      } else if (variables.scope === 'environment') {
        queryClient.invalidateQueries({ queryKey: ['environment-details', variables.resourceId] });
        queryClient.refetchQueries({ queryKey: ['environment-details', variables.resourceId] });
      }
    },
  });
}

export function useUpdateEnvironmentVariable() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (variables: { id: string; value?: string; scope: string; resourceId: string }) => {
      const mutation = `
        mutation UpdateEnvironmentVariable($id: String!, $input: EnvironmentVariableUpdateInput!) {
          updateEnvironmentVariable(id: $id, input: $input) {
            id
            scope
            resourceId
            key
            value
            createdAt
            updatedAt
          }
        }
      `;
      
      return await graphqlMutation<{ updateEnvironmentVariable: EnvironmentVariable }>(mutation, {
        id: variables.id,
        input: { value: variables.value },
      });
    },
    onSuccess: (_, variables) => {
      // Invalidate individual query
      queryClient.invalidateQueries({ queryKey: ['environment-variables', variables.scope, variables.resourceId] });
      // Invalidate and refetch consolidated queries based on scope
      if (variables.scope === 'project') {
        queryClient.invalidateQueries({ queryKey: ['project-details', variables.resourceId] });
        queryClient.refetchQueries({ queryKey: ['project-details', variables.resourceId] });
      } else if (variables.scope === 'environment') {
        queryClient.invalidateQueries({ queryKey: ['environment-details', variables.resourceId] });
        queryClient.refetchQueries({ queryKey: ['environment-details', variables.resourceId] });
      }
    },
  });
}

export function useDeleteEnvironmentVariable() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (variables: { id: string; scope: string; resourceId: string }) => {
      const mutation = `
        mutation DeleteEnvironmentVariable($id: String!) {
          deleteEnvironmentVariable(id: $id)
        }
      `;
      
      return await graphqlMutation<{ deleteEnvironmentVariable: boolean }>(mutation, {
        id: variables.id,
      });
    },
    onSuccess: (_, variables) => {
      // Invalidate individual query
      queryClient.invalidateQueries({ queryKey: ['environment-variables', variables.scope, variables.resourceId] });
      // Invalidate and refetch consolidated queries based on scope
      if (variables.scope === 'project') {
        queryClient.invalidateQueries({ queryKey: ['project-details', variables.resourceId] });
        queryClient.refetchQueries({ queryKey: ['project-details', variables.resourceId] });
      } else if (variables.scope === 'environment') {
        queryClient.invalidateQueries({ queryKey: ['environment-details', variables.resourceId] });
        queryClient.refetchQueries({ queryKey: ['environment-details', variables.resourceId] });
      }
    },
  });
}

export function useCreateSecret() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (input: { scope: string; resourceId: string; key: string; value?: string }) => {
      const mutation = `
        mutation CreateSecret($input: SecretCreateInput!) {
          createSecret(input: $input) {
            id
            scope
            resourceId
            key
            valueLength
            createdAt
            updatedAt
          }
        }
      `;
      
      return await graphqlMutation<{ createSecret: Secret }>(mutation, {
        input,
      });
    },
    onSuccess: (_, variables) => {
      // Invalidate individual query
      queryClient.invalidateQueries({ queryKey: ['secrets', variables.scope, variables.resourceId] });
      // Invalidate and refetch consolidated queries based on scope
      if (variables.scope === 'project') {
        queryClient.invalidateQueries({ queryKey: ['project-details', variables.resourceId] });
        queryClient.refetchQueries({ queryKey: ['project-details', variables.resourceId] });
      } else if (variables.scope === 'environment') {
        queryClient.invalidateQueries({ queryKey: ['environment-details', variables.resourceId] });
        queryClient.refetchQueries({ queryKey: ['environment-details', variables.resourceId] });
      }
    },
  });
}

export function useUpdateSecret() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (variables: { id: string; value?: string; scope: string; resourceId: string }) => {
      const mutation = `
        mutation UpdateSecret($id: String!, $input: SecretUpdateInput!) {
          updateSecret(id: $id, input: $input) {
            id
            scope
            resourceId
            key
            valueLength
            createdAt
            updatedAt
          }
        }
      `;
      
      return await graphqlMutation<{ updateSecret: Secret }>(mutation, {
        id: variables.id,
        input: { value: variables.value },
      });
    },
    onSuccess: (_, variables) => {
      // Invalidate individual query
      queryClient.invalidateQueries({ queryKey: ['secrets', variables.scope, variables.resourceId] });
      // Invalidate and refetch consolidated queries based on scope
      if (variables.scope === 'project') {
        queryClient.invalidateQueries({ queryKey: ['project-details', variables.resourceId] });
        queryClient.refetchQueries({ queryKey: ['project-details', variables.resourceId] });
      } else if (variables.scope === 'environment') {
        queryClient.invalidateQueries({ queryKey: ['environment-details', variables.resourceId] });
        queryClient.refetchQueries({ queryKey: ['environment-details', variables.resourceId] });
      }
    },
  });
}

export function useDeleteSecret() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (variables: { id: string; scope: string; resourceId: string }) => {
      const mutation = `
        mutation DeleteSecret($id: String!) {
          deleteSecret(id: $id)
        }
      `;
      
      return await graphqlMutation<{ deleteSecret: boolean }>(mutation, {
        id: variables.id,
      });
    },
    onSuccess: (_, variables) => {
      // Invalidate individual query
      queryClient.invalidateQueries({ queryKey: ['secrets', variables.scope, variables.resourceId] });
      // Invalidate and refetch consolidated queries based on scope
      if (variables.scope === 'project') {
        queryClient.invalidateQueries({ queryKey: ['project-details', variables.resourceId] });
        queryClient.refetchQueries({ queryKey: ['project-details', variables.resourceId] });
      } else if (variables.scope === 'environment') {
        queryClient.invalidateQueries({ queryKey: ['environment-details', variables.resourceId] });
        queryClient.refetchQueries({ queryKey: ['environment-details', variables.resourceId] });
      }
    },
  });
}

// Project and Environment Mutations

export function useCreateProject() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (input: { name: string; description?: string }) => {
      const mutation = `
        mutation CreateProject($input: ProjectCreateInput!) {
          createProject(input: $input) {
            id
            name
            description
            ownerId
            createdAt
            updatedAt
          }
        }
      `;
      
      return await graphqlMutation<{ createProject: Project }>(mutation, {
        input: {
          name: input.name,
          description: input.description || null,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function useCreateEnvironment() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (input: { name: string; type: string; url?: string; projectId: string }) => {
      const mutation = `
        mutation CreateEnvironment($input: EnvironmentCreateInput!) {
          createEnvironment(input: $input) {
            id
            name
            type
            url
            projectId
            createdAt
            updatedAt
          }
        }
      `;
      
      return await graphqlMutation<{ createEnvironment: Environment }>(mutation, {
        input: {
          name: input.name,
          type: input.type,
          url: input.url || null,
          projectId: input.projectId,
        },
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['environments'] });
      queryClient.invalidateQueries({ queryKey: ['project-details', variables.projectId] });
    },
  });
}

export function useUpdateEnvironment() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (variables: { id: string; name?: string; type?: string; url?: string; projectId?: string; clusterId?: string | null }) => {
      const mutation = `
        mutation UpdateEnvironment($id: String!, $input: EnvironmentUpdateInput!) {
          updateEnvironment(id: $id, input: $input) {
            id
            name
            type
            url
            clusterId
            cluster { id name }
            projectId
            project {
              id
              name
            }
            createdAt
            updatedAt
          }
        }
      `;
      
      return await graphqlMutation<{ updateEnvironment: Environment }>(mutation, {
        id: variables.id,
        input: {
          name: variables.name,
          type: variables.type,
          url: variables.url,
          projectId: variables.projectId,
          clusterId: variables.clusterId ?? null,
        },
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['environments'] });
      queryClient.invalidateQueries({ queryKey: ['environment-details', variables.id] });
      if (variables.projectId) {
        queryClient.invalidateQueries({ queryKey: ['project-details', variables.projectId] });
      }
    },
  });
}

export function useCreateService() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (input: { name: string; description?: string; type: string; projectId: string; environmentIds?: string[]; owner?: string; status?: string }) => {
      const mutation = `
        mutation CreateService($input: ServiceCreateInput!) {
          createService(input: $input) {
            id
            name
            description
            type
            projectId
            owner
            status
            createdAt
            updatedAt
          }
        }
      `;
      
      return await graphqlMutation<{ createService: Service }>(mutation, {
        input: {
          name: input.name,
          description: input.description || null,
          type: input.type,
          projectId: input.projectId,
          environmentIds: input.environmentIds || null,
          owner: input.owner || null,
          status: input.status || 'unknown',
        },
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
      queryClient.invalidateQueries({ queryKey: ['project-details', variables.projectId] });
    },
  });
}

export function useUpdateService() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (variables: { id: string; name?: string; description?: string; type?: string; projectId?: string; environmentIds?: string[]; owner?: string; status?: string }) => {
      const mutation = `
        mutation UpdateService($id: String!, $input: ServiceUpdateInput!) {
          updateService(id: $id, input: $input) {
            id
            name
            description
            type
            projectId
            project {
              id
              name
            }
            owner
            status
            createdAt
            updatedAt
          }
        }
      `;
      
      return await graphqlMutation<{ updateService: Service }>(mutation, {
        id: variables.id,
        input: {
          name: variables.name,
          description: variables.description,
          type: variables.type,
          projectId: variables.projectId,
          environmentIds: variables.environmentIds,
          owner: variables.owner,
          status: variables.status,
        },
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
      queryClient.invalidateQueries({ queryKey: ['service-details', variables.id] });
      if (variables.projectId) {
        queryClient.invalidateQueries({ queryKey: ['project-details', variables.projectId] });
      }
    },
  });
}

export function useCreateServiceConfig() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (input: { serviceId: string; key: string; value?: string; configData?: string }) => {
      const mutation = `
        mutation CreateServiceConfig($input: ServiceConfigCreateInput!) {
          createServiceConfig(input: $input) {
            id
            serviceId
            key
            value
            configData
            createdAt
            updatedAt
          }
        }
      `;
      
      return await graphqlMutation<{ createServiceConfig: ServiceConfig }>(mutation, {
        input: {
          serviceId: input.serviceId,
          key: input.key,
          value: input.value || null,
          configData: input.configData || null,
        },
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['service-details', variables.serviceId] });
      queryClient.refetchQueries({ queryKey: ['service-details', variables.serviceId] });
    },
  });
}

export function useEnqueueDeployWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { serviceId: string }) => {
      const mutation = `
        mutation EnqueueDeploy($serviceId: String!) {
          enqueueDeployWorkflow(serviceId: $serviceId)
        }
      `;
      return await graphqlMutation<{ enqueueDeployWorkflow: boolean }>(mutation, {
        serviceId: input.serviceId,
      });
    },
    onSuccess: (_, variables) => {
      // Invalidate related queries so UI can refresh status
      queryClient.invalidateQueries({ queryKey: ['service-deployments', variables.serviceId] });
      queryClient.invalidateQueries({ queryKey: ['service-details', variables.serviceId] });
    },
  });
}

export function useGitOrganizations(gitType: string) {
  return useQuery({
    queryKey: ['git-organizations', gitType],
    queryFn: async () => {
      if (!gitType) {
        return [];
      }
      
      const query = `
        query GetGitOrganizations($gitType: String!) {
          gitOrganizations(gitType: $gitType) {
            name
            displayName
            avatarUrl
          }
        }
      `;
      
      const data = await graphqlQuery<{ gitOrganizations: GitOrganization[] }>(query, { gitType });
      return data.gitOrganizations || [];
    },
    enabled: !!gitType && (gitType === 'github' || gitType === 'bitbucket' || gitType === 'gitlab'),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}

export function useGitRepositories(gitType: string, organization: string) {
  return useQuery({
    queryKey: ['git-repositories', gitType, organization],
    queryFn: async () => {
      if (!gitType || !organization) {
        return [];
      }
      
      const query = `
        query GetGitRepositories($gitType: String!, $organization: String!) {
          gitRepositories(gitType: $gitType, organization: $organization) {
            name
            fullName
            description
            private
            defaultBranch
          }
        }
      `;
      
      const data = await graphqlQuery<{ gitRepositories: GitRepository[] }>(query, { gitType, organization });
      return data.gitRepositories || [];
    },
    enabled: !!gitType && !!organization && (gitType === 'github' || gitType === 'bitbucket' || gitType === 'gitlab'),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}

export function useUpdateServiceConfig() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (variables: { id: string; serviceId: string; value?: string; configData?: string }) => {
      const mutation = `
        mutation UpdateServiceConfig($id: String!, $input: ServiceConfigUpdateInput!) {
          updateServiceConfig(id: $id, input: $input) {
            id
            serviceId
            key
            value
            configData
            createdAt
            updatedAt
          }
        }
      `;
      
      return await graphqlMutation<{ updateServiceConfig: ServiceConfig }>(mutation, {
        id: variables.id,
        input: {
          value: variables.value,
          configData: variables.configData,
        },
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['service-details', variables.serviceId] });
      queryClient.refetchQueries({ queryKey: ['service-details', variables.serviceId] });
    },
  });
}

// Versioning & Deployments
export function useCreateServiceVersionAndDeployment() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (input: { serviceId: string; versionLabel: string; configHash: string; specJson?: string }) => {
      const mutation = `
        mutation CreateServiceVersionAndDeployment($serviceId: String!, $versionLabel: String!, $configHash: String!, $specJson: String) {
          createServiceVersionAndDeployment(serviceId: $serviceId, versionLabel: $versionLabel, configHash: $configHash, specJson: $specJson) {
            id
            serviceId
            versionId
            status
            createdAt
            completedAt
          }
        }
      `;
      return await graphqlMutation<{ createServiceVersionAndDeployment: any }>(mutation, {
        serviceId: input.serviceId,
        versionLabel: input.versionLabel,
        configHash: input.configHash,
        specJson: input.specJson ?? null,
      });
    },
    onSuccess: (_, variables) => {
      // Invalidate service-details and any version/deployment lists if added later
      queryClient.invalidateQueries({ queryKey: ['service-details', variables.serviceId] });
    },
  });
}

// Admin: Kubernetes Clusters
export interface ClusterRecord {
  id: string;
  name: string;
  description?: string | null;
  apiUrl: string;
  authMethod: string;
  environmentType?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  apiHealth?: { ok: boolean; message?: string | null } | null;
  clusterConnection?: { ok: boolean; message?: string | null } | null;
}

export function useClusters() {
  return useQuery({
    queryKey: ['admin-clusters'],
    queryFn: async () => {
      const query = `
        query GetClusters {
          clusters {
            id
            name
            description
            apiUrl
            authMethod
            environmentType
            createdAt
            updatedAt
            apiHealth { ok message }
            clusterConnection { ok message }
          }
        }
      `;
      const data = await graphqlQuery<{ clusters: ClusterRecord[] }>(query);
      return data.clusters || [];
    },
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });
}

export function useAddCluster() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      apiUrl: string;
      authMethod: 'kubeconfig' | 'token' | 'serviceAccount' | 'clientCert';
      environmentType?: string;
      description?: string;
      kubeconfigContent?: string;
      token?: string;
      clientKey?: string;
      clientCert?: string;
      clientCaCert?: string;
    }) => {
      const mutation = `
        mutation AddCluster($input: ClusterCreateInput!) {
          addCluster(input: $input) {
            id
            name
            description
            apiUrl
            authMethod
            environmentType
            createdAt
            updatedAt
          }
        }
      `;
      return await graphqlMutation<{ addCluster: ClusterRecord }>(mutation, {
        input: {
          name: input.name,
          apiUrl: input.apiUrl,
          authMethod: input.authMethod,
          environmentType: input.environmentType ?? null,
          description: input.description ?? null,
          kubeconfigContent: input.kubeconfigContent ?? null,
          token: input.token ?? null,
          clientKey: input.clientKey ?? null,
          clientCert: input.clientCert ?? null,
          clientCaCert: input.clientCaCert ?? null,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-clusters'] });
    },
  });
}

export function useUpdateCluster() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      name?: string;
      apiUrl?: string;
      authMethod?: 'kubeconfig' | 'token' | 'serviceAccount' | 'clientCert';
      environmentType?: string;
      description?: string;
      kubeconfigContent?: string;
      token?: string;
      clientKey?: string;
      clientCert?: string;
      clientCaCert?: string;
    }) => {
      const mutation = `
        mutation UpdateCluster($input: ClusterUpdateInput!) {
          updateCluster(input: $input) {
            id
            name
            description
            apiUrl
            authMethod
            environmentType
            createdAt
            updatedAt
          }
        }
      `;
      return await graphqlMutation<{ updateCluster: ClusterRecord }>(mutation, {
        input: {
          id: input.id,
          name: input.name ?? null,
          apiUrl: input.apiUrl ?? null,
          authMethod: input.authMethod ?? null,
          environmentType: input.environmentType ?? null,
          description: input.description ?? null,
          kubeconfigContent: input.kubeconfigContent ?? null,
          token: input.token ?? null,
          clientKey: input.clientKey ?? null,
          clientCert: input.clientCert ?? null,
          clientCaCert: input.clientCaCert ?? null,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-clusters'] });
    },
  });
}

export function useKubernetesClusterConnection() {
  return useMutation({
    mutationFn: async (input: {
      name: string;
      apiUrl: string;
      authMethod: 'kubeconfig' | 'token' | 'serviceAccount' | 'clientCert';
      description?: string;
      kubeconfigContent?: string;
      token?: string;
      clientKey?: string;
      clientCert?: string;
      clientCaCert?: string;
    }) => {
      const mutation = `
        mutation KubernetesClusterConnection($input: ClusterCreateInput!) {
          kubernetesClusterConnection(input: $input) {
            ok
            message
          }
        }
      `;
      return await graphqlMutation<{ kubernetesClusterConnection: { ok: boolean; message?: string } }>(mutation, {
        input,
      });
    },
  });
}

export function useKubernetesApiHealth() {
  return useMutation({
    mutationFn: async (input: { clusterId: string }) => {
      const query = `
        query KubernetesApiHealth($clusterId: String!) {
          kubernetesApiHealth(clusterId: $clusterId) {
            ok
            message
          }
        }
      `;
      return await graphqlQuery<{ kubernetesApiHealth: { ok: boolean; message?: string } }>(query, {
        clusterId: input.clusterId,
      });
    },
  });
}

export function useKubernetesClusterConnectionQuery() {
  return useMutation({
    mutationFn: async (input: { clusterId: string }) => {
      const query = `
        query KubernetesClusterConnection($clusterId: String!) {
          kubernetesClusterConnection(clusterId: $clusterId) {
            ok
            message
          }
        }
      `;
      return await graphqlQuery<{ kubernetesClusterConnection: { ok: boolean; message?: string } }>(query, {
        clusterId: input.clusterId,
      });
    },
  });
}

// ─── Admin Config ────────────────────────────────────────────────────────────

export interface AdminConfigRecord {
  id: string;
  key: string;
  value?: string | null;
  configData?: string | null;
  createdAt: string;
  updatedAt?: string | null;
}

export function useAdminConfigs() {
  return useQuery({
    queryKey: ['admin-configs'],
    queryFn: async () => {
      const query = `
        query AdminConfigs {
          adminConfigs {
            id
            key
            value
            configData
            createdAt
            updatedAt
          }
        }
      `;
      const data = await graphqlQuery<{ adminConfigs: AdminConfigRecord[] }>(query);
      return data.adminConfigs;
    },
    refetchOnWindowFocus: false,
  });
}

export function useCreateAdminConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { key: string; value?: string; configData?: string }) => {
      const mutation = `
        mutation CreateAdminConfig($input: AdminConfigCreateInput!) {
          createAdminConfig(input: $input) {
            id
            key
            value
            configData
            createdAt
            updatedAt
          }
        }
      `;
      return await graphqlMutation<{ createAdminConfig: AdminConfigRecord }>(mutation, {
        input: {
          key: input.key,
          value: input.value ?? null,
          configData: input.configData ?? null,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-configs'] });
    },
  });
}

export function useUpdateAdminConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { key: string; value?: string; configData?: string }) => {
      const mutation = `
        mutation UpdateAdminConfig($key: String!, $input: AdminConfigUpdateInput!) {
          updateAdminConfig(key: $key, input: $input) {
            id
            key
            value
            configData
            createdAt
            updatedAt
          }
        }
      `;
      return await graphqlMutation<{ updateAdminConfig: AdminConfigRecord }>(mutation, {
        key: input.key,
        input: {
          value: input.value ?? null,
          configData: input.configData ?? null,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-configs'] });
    },
  });
}

export function useDeleteAdminConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (key: string) => {
      const mutation = `
        mutation DeleteAdminConfig($key: String!) {
          deleteAdminConfig(key: $key)
        }
      `;
      return await graphqlMutation<{ deleteAdminConfig: boolean }>(mutation, { key });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-configs'] });
    },
  });
}

// --- Environment Subdomain Workflow ---

export interface EnvWorkflowStep {
  functionId: number;
  functionName: string;
  output?: string | null;
  error?: string | null;
  startedAtEpochMs?: string | null;
  completedAtEpochMs?: string | null;
}

export interface EnvSubdomainWorkflow {
  workflowId: string;
  workflowStatus: string;
  steps: EnvWorkflowStep[];
}

export function useEnvSubdomainWorkflow(environmentId: string) {
  return useQuery({
    queryKey: ['env-subdomain-workflow', environmentId],
    queryFn: async () => {
      const query = `
        query EnvSubdomainWorkflow($environmentId: String!) {
          envSubdomainWorkflow(environmentId: $environmentId) {
            workflowId
            workflowStatus
            steps {
              functionId
              functionName
              output
              error
              startedAtEpochMs
              completedAtEpochMs
            }
          }
        }
      `;
      const data = await graphqlQuery<{ envSubdomainWorkflow: EnvSubdomainWorkflow | null }>(query, { environmentId });
      return data.envSubdomainWorkflow;
    },
    enabled: !!environmentId,
    refetchOnWindowFocus: false,
  });
}

export function useSetupEnvSubdomain() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (environmentId: string) => {
      const mutation = `
        mutation SetupEnvSubdomain($environmentId: String!) {
          setupEnvSubdomain(environmentId: $environmentId)
        }
      `;
      return await graphqlMutation<{ setupEnvSubdomain: boolean }>(mutation, { environmentId });
    },
    onSuccess: (_data, environmentId) => {
      queryClient.invalidateQueries({ queryKey: ['env-subdomain-workflow', environmentId] });
    },
  });
}
