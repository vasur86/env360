import * as React from 'react';
import {
  Button,
  Flex,
  Text,
  Input,
  Textarea,
  Dialog,
  Combobox,
  useListCollection,
  useFilter,
  Portal,
  Box,
  Badge,
  Spinner,
} from '@chakra-ui/react';
import { HiPlus, HiPencil, HiMiniCheckCircle, HiTrash, HiArrowUturnLeft, HiGlobeAlt, HiShieldCheck, HiSignal } from 'react-icons/hi2';
import {
  useEnvironmentVariables,
  useSecrets,
  useCreateEnvironmentVariable,
  useUpdateEnvironmentVariable,
  useDeleteEnvironmentVariable,
  useCreateSecret,
  useUpdateSecret,
  useDeleteSecret,
  useUpdateEnvironment,
  useProjects,
  useClusters,
  useEnvironmentDetails,
  useAdminConfigs,
  useEnvSubdomainWorkflow,
  useSetupEnvSubdomain,
} from '../../api/client';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

interface SettingsTabProps {
  environmentId: string;
  environmentName: string;
  environmentType: string;
  environmentUrl?: string | null;
  projectId?: string | null;
  projectName?: string | null;
  canEdit: boolean;
  environmentVariables?: Array<{
    id: string;
    scope: string;
    resourceId: string;
    key: string;
    value?: string | null;
    createdAt: string;
    updatedAt?: string | null;
  }>;
  secrets?: Array<{
    id: string;
    scope: string;
    resourceId: string;
    key: string;
    valueLength?: number | null;
    createdAt: string;
    updatedAt?: string | null;
  }>;
}

interface EnvVar {
  id?: string;
  tempId?: string;
  key: string;
  value: string;
  isNew?: boolean; // Track if this is a new unsaved variable
}

interface Secret {
  id?: string;
  tempId?: string;
  key: string;
  value: string;
  isNew?: boolean; // Track if this is a new unsaved secret
}

export default function SettingsTab({ 
  environmentId, 
  environmentName, 
  environmentType,
  environmentUrl: _environmentUrl,
  projectId,
  projectName,
  canEdit,
  environmentVariables: envVarsFromProps,
  secrets: secretsFromProps,
}: SettingsTabProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = !!(user?.is_admin || user?.is_super_admin);

  // Admin configs for base domain
  const { data: adminConfigs } = useAdminConfigs();
  const baseDomain = React.useMemo(() => {
    const cfg = adminConfigs?.find((c: { key: string; value?: string | null }) => c.key === 'base_domain');
    return cfg?.value || 'env360.synvaraworks.com';
  }, [adminConfigs]);

  // Normalize name for DNS-1123 compatibility
  const normalizeName = (n: string) => n.toLowerCase().replace(/\//g, '-').replace(/_/g, '-').replace(/ /g, '-');

  // Environment subdomain workflow status
  const { data: envWorkflow } = useEnvSubdomainWorkflow(environmentId);
  const setupEnvSubdomain = useSetupEnvSubdomain();

  const certStatus = React.useMemo<'not_started' | 'pending' | 'success' | 'error'>(() => {
    if (!envWorkflow) return 'not_started';
    const step = envWorkflow.steps?.find((s) => s.functionName === 'apply_env_certificate');
    if (!step) {
      // Workflow exists but step not reached yet
      if (envWorkflow.workflowStatus === 'SUCCESS') return 'success';
      if (envWorkflow.workflowStatus === 'ERROR') return 'error';
      return 'pending';
    }
    if (step.error) return 'error';
    if (step.output) return 'success';
    return 'pending';
  }, [envWorkflow]);

  const gatewayStatus = React.useMemo<'not_started' | 'pending' | 'success' | 'error'>(() => {
    if (!envWorkflow) return 'not_started';
    const step = envWorkflow.steps?.find((s) => s.functionName === 'apply_env_gateway');
    if (!step) {
      if (envWorkflow.workflowStatus === 'SUCCESS') return 'success';
      if (envWorkflow.workflowStatus === 'ERROR') return 'error';
      return 'pending';
    }
    if (step.error) return 'error';
    if (step.output) return 'success';
    return 'pending';
  }, [envWorkflow]);

  const [name, setName] = React.useState(environmentName);
  const [type, setType] = React.useState(environmentType);
  const [selectedProjectId, setSelectedProjectId] = React.useState(projectId || '');
  const [selectedClusterId, setSelectedClusterId] = React.useState<string>('');
  const [isEditingCluster, setIsEditingCluster] = React.useState(false);
  const [selectedClusterDraftId, setSelectedClusterDraftId] = React.useState<string>('');
  
  // Update selectedProjectId when projectId prop changes
  React.useEffect(() => {
    if (projectId) {
      setSelectedProjectId(projectId);
    }
  }, [projectId]);
  const [isEditingName, setIsEditingName] = React.useState(false);
  const [isEditingType, setIsEditingType] = React.useState(false);
  const [isEditingProject, setIsEditingProject] = React.useState(false);
  
  // Fetch projects for the project selector (always enabled if user can edit)
  const { data: projectsData, isLoading: projectsLoading } = useProjects(0, 100, undefined, true, { enabled: canEdit });
  
  // Use filter hook for Combobox filtering
  const { contains: projectsContains } = useFilter({ sensitivity: "base" });
  
  // Create collection for project Combobox
  const { collection: projectsCollection, filter: projectsFilter, set: setProjectsCollection } = useListCollection<{ value: string; label: string }>({
    initialItems: [],
    filter: projectsContains,
  });
  // Create collection for cluster Combobox
  const { contains: clustersContains } = useFilter({ sensitivity: "base" });
  const { collection: clustersCollection, filter: clustersFilter, set: setClustersCollection } = useListCollection<{ value: string; label: string }>({
    initialItems: [],
    filter: clustersContains,
  });
  
  // Update collection when projectsData changes
  React.useEffect(() => {
    const projectsItems = projectsData?.items && projectsData.items.length > 0
      ? projectsData.items.map((project) => ({
          value: project.id,
          label: project.name,
        }))
      : [];
    setProjectsCollection(projectsItems);
  }, [projectsData?.items, setProjectsCollection]);
  
  // Load clusters (admin-only) and update collection
  const { data: clustersData, isLoading: clustersLoading, error: clustersError } = useClusters();
  // Load environment details to hydrate cluster mapping on mount/refresh
  const { data: envDetails } = useEnvironmentDetails(environmentId);
  // Normalize env type values (e.g., dev->development, prod->production)
  const normalizeEnvType = React.useCallback((s?: string | null) => {
    if (!s) return '';
    const t = String(s).toLowerCase();
    if (t === 'dev') return 'development';
    if (t === 'prod') return 'production';
    return t;
  }, []);
  React.useEffect(() => {
    if (!clustersData || !Array.isArray(clustersData)) {
      setClustersCollection([]);
      return;
    }
    const envTypeNorm = normalizeEnvType(type);
    const items = clustersData
      .filter((c) => normalizeEnvType((c as any).environmentType) === envTypeNorm)
      .map((c) => ({
        value: c.id,
        label: c.name,
      }));
    setClustersCollection(items);
  }, [clustersData, type, setClustersCollection, normalizeEnvType]);
  
  // Initialize cluster selection from server
  React.useEffect(() => {
    const cid = (envDetails as any)?.environment?.clusterId as string | undefined;
    if (cid && !isEditingCluster) {
      setSelectedClusterId(cid);
      setSelectedClusterDraftId(cid);
    }
  }, [envDetails, isEditingCluster]);
  
  // Error modal state
  const [errorModal, setErrorModal] = React.useState<{ isOpen: boolean; title: string; message: string }>({
    isOpen: false,
    title: '',
    message: '',
  });

  type ConfirmKind = 'envVarClear' | 'envVarDelete' | 'secretClear' | 'secretDelete';
  const [confirmModal, setConfirmModal] = React.useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    confirmColorPalette?: string;
    kind?: ConfirmKind;
    itemId?: string;
  }>({
    isOpen: false,
    title: '',
    message: '',
    confirmLabel: 'Confirm',
    confirmColorPalette: undefined,
    kind: undefined,
    itemId: undefined,
  });
  
  const queryClient = useQueryClient();
  
  // Use data passed from ProjectDetails (from consolidated query)
  // Only use individual queries as fallback if props are not provided
  const { data: envVarsDataFallback, isLoading: envVarsLoading } = useEnvironmentVariables(
    'environment', 
    environmentId,
    { enabled: !envVarsFromProps } // Disable if data is provided via props
  );
  const { data: secretsDataFallback, isLoading: secretsLoading } = useSecrets(
    'environment', 
    environmentId,
    { enabled: !secretsFromProps } // Disable if data is provided via props
  );
  
  // Use props data if available, otherwise fall back to individual queries
  const envVarsData = envVarsFromProps || envVarsDataFallback;
  const secretsData = secretsFromProps || secretsDataFallback;
  
  // Local state for unsaved new items
  const [newEnvVars, setNewEnvVars] = React.useState<EnvVar[]>([]);
  const [newSecrets, setNewSecrets] = React.useState<Secret[]>([]);
  
  // Track which items are being edited and their edited values
  const [editingEnvVars, setEditingEnvVars] = React.useState<Set<string>>(new Set());
  const [editingSecrets, setEditingSecrets] = React.useState<Set<string>>(new Set());
  const [editedEnvVarValues, setEditedEnvVarValues] = React.useState<Map<string, string>>(new Map());
  const [editedSecretValues, setEditedSecretValues] = React.useState<Map<string, string>>(new Map());

  const genTempId = React.useCallback(() => {
    // stable id for new rows so actions don’t break when list changes
    const cryptoAny = globalThis.crypto as unknown as { randomUUID?: () => string } | undefined;
    if (cryptoAny?.randomUUID) return cryptoAny.randomUUID();
    return `tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }, []);
  
  // Mutations
  const createEnvVarMutation = useCreateEnvironmentVariable();
  const updateEnvVarMutation = useUpdateEnvironmentVariable();
  const deleteEnvVarMutation = useDeleteEnvironmentVariable();
  const createSecretMutation = useCreateSecret();
  const updateSecretMutation = useUpdateSecret();
  const deleteSecretMutation = useDeleteSecret();
  const updateEnvironmentMutation = useUpdateEnvironment();
  
  // Combine fetched data with new unsaved items, applying edited values
  const envVars = React.useMemo(() => {
    const fetched: EnvVar[] = (envVarsData || []).map((v) => {
      const editedValue = editedEnvVarValues.get(v.id);
      return {
        id: v.id,
        tempId: undefined,
        key: v.key,
        value: editedValue !== undefined ? editedValue : (v.value || ''),
      };
    });
    return [...fetched, ...newEnvVars];
  }, [envVarsData, newEnvVars, editedEnvVarValues]);
  
  const secrets = React.useMemo(() => {
    const fetched: Secret[] = (secretsData || []).map((s) => {
      const editedValue = editedSecretValues.get(s.id);
      // For existing secrets, use edited value if available, otherwise create masked value based on length
      const displayValue = editedValue !== undefined 
        ? editedValue 
        : (s.valueLength ? '•'.repeat(s.valueLength) : '');
      return {
        id: s.id,
        tempId: undefined,
        key: s.key,
        value: displayValue,
      };
    });
    return [...fetched, ...newSecrets];
  }, [secretsData, newSecrets, editedSecretValues]);

  // Sync with props when they change
  React.useEffect(() => {
    setName(environmentName);
  }, [environmentName]);

  React.useEffect(() => {
    setType(environmentType);
  }, [environmentType]);

  const handleAddEnvVar = () => {
    const tempId = genTempId();
    setNewEnvVars([...newEnvVars, { tempId, key: '', value: '', isNew: true }]);
    // Automatically enable editing for new items
    setEditingEnvVars(new Set(editingEnvVars).add(tempId));
  };

  const deleteEnvVarById = async (itemId: string) => {
    const existing = envVars.find(v => v.id === itemId);
    if (existing?.id) {
      await deleteEnvVarMutation.mutateAsync({ id: existing.id, scope: 'environment', resourceId: environmentId });
      setEditingEnvVars(new Set([...editingEnvVars].filter(id => id !== existing.id)));
      const newEdited = new Map(editedEnvVarValues);
      newEdited.delete(existing.id);
      setEditedEnvVarValues(newEdited);
      // Refetch fallback queries if they're enabled
      if (!envVarsFromProps) {
        await queryClient.refetchQueries({ queryKey: ['environment-variables', 'environment', environmentId] });
      }
      return;
    }

    // new (unsaved) row
    setNewEnvVars(newEnvVars.filter(v => v.tempId !== itemId));
    setEditingEnvVars(new Set([...editingEnvVars].filter(id => id !== itemId)));
  };

  const handleRequestDeleteEnvVar = (itemId: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete environment variable?',
      message: 'This will remove the key/value pair. This action cannot be undone.',
      confirmLabel: 'Delete',
      confirmColorPalette: 'red',
      kind: 'envVarDelete',
      itemId,
    });
  };

  const handleRequestClearEnvVar = (itemId: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Discard changes?',
      message: 'This will reset the value back to the last saved value.',
      confirmLabel: 'Discard',
      confirmColorPalette: undefined,
      kind: 'envVarClear',
      itemId,
    });
  };

  const handleUpdateEnvVar = (index: number, field: 'key' | 'value', value: string) => {
    const envVar = envVars[index];
    if (envVar.id) {
      // Update existing variable - only update value, key cannot be changed
      if (field === 'value') {
        // Track edited value in the map
        setEditedEnvVarValues(new Map(editedEnvVarValues).set(envVar.id, value));
      }
    } else {
      // Update new item
      const itemId = envVar.tempId ?? `new-${index}`;
      const updated = newEnvVars.map(v => (v.tempId === itemId ? { ...v, [field]: value } : v));
      setNewEnvVars(updated);
    }
  };

  const handleEditEnvVar = (index: number) => {
    const envVar = envVars[index];
    const itemId = envVar.id ?? envVar.tempId ?? `new-${index}`;
    setEditingEnvVars(new Set(editingEnvVars).add(itemId));
  };

  const handleSaveEnvVarValue = async (index: number) => {
    const envVar = envVars[index];
    if (envVar.id) {
      // Save existing variable value
      try {
        await updateEnvVarMutation.mutateAsync({
          id: envVar.id,
          value: envVar.value || undefined, // Convert empty string to undefined
          scope: 'environment',
          resourceId: environmentId,
        });
        // Remove from editing set and clear edited value
        setEditingEnvVars(prev => new Set([...prev].filter(id => id !== envVar.id)));
        setEditedEnvVarValues(prev => {
          const newMap = new Map(prev);
          newMap.delete(envVar.id!);
          return newMap;
        });
        // Refetch fallback queries if they're enabled
        if (!envVarsFromProps) {
          await queryClient.refetchQueries({ queryKey: ['environment-variables', 'environment', environmentId] });
        }
      } catch (error) {
        console.error('Error updating environment variable:', error);
        let errorMessage = 'An unknown error occurred while updating the environment variable.';
        if (error instanceof Error) {
          errorMessage = error.message;
          // Check for network errors
          if (error.message.includes('fetch') || error.message.includes('network') || error.message.includes('Failed to fetch')) {
            errorMessage = 'Network error: Unable to connect to the server. Please check your internet connection and try again.';
          }
        }
        setErrorModal({
          isOpen: true,
          title: 'Failed to Update Environment Variable',
          message: errorMessage,
        });
      }
    } else {
      // Save new variable
      await handleSaveEnvVar(index);
    }
  };

  const handleSaveEnvVar = async (index: number) => {
    const envVar = envVars[index];
    if (!envVar.key.trim()) {
      setErrorModal({
        isOpen: true,
        title: 'Validation Error',
        message: 'Key is required for environment variables.',
      });
      return;
    }
    
    if (envVar.id) {
      // Already saved, nothing to do
      return;
    }
    
    const itemId = envVar.tempId ?? `new-${index}`;
    
    try {
      await createEnvVarMutation.mutateAsync({
        scope: 'environment',
        resourceId: environmentId,
        key: envVar.key.trim(),
        value: envVar.value || undefined,
      });
      // Remove from new items after successful save
      setNewEnvVars(prev => prev.filter(v => v.tempId !== itemId));
      setEditingEnvVars(prev => new Set([...prev].filter(id => id !== itemId)));
      // Refetch fallback queries if they're enabled
      if (!envVarsFromProps) {
        await queryClient.refetchQueries({ queryKey: ['environment-variables', 'environment', environmentId] });
      }
    } catch (error) {
      console.error('Error saving environment variable:', error);
      setErrorModal({
        isOpen: true,
        title: 'Failed to Save Environment Variable',
        message: error instanceof Error ? error.message : 'An unknown error occurred while saving the environment variable.',
      });
    }
  };

  const handleAddSecret = () => {
    const tempId = genTempId();
    setNewSecrets([...newSecrets, { tempId, key: '', value: '', isNew: true }]);
    // Automatically enable editing for new items
    setEditingSecrets(new Set(editingSecrets).add(tempId));
  };

  const deleteSecretById = async (itemId: string) => {
    const existing = secrets.find(s => s.id === itemId);
    if (existing?.id) {
      await deleteSecretMutation.mutateAsync({ id: existing.id, scope: 'environment', resourceId: environmentId });
      setEditingSecrets(new Set([...editingSecrets].filter(id => id !== existing.id)));
      const newEdited = new Map(editedSecretValues);
      newEdited.delete(existing.id);
      setEditedSecretValues(newEdited);
      // Refetch fallback queries if they're enabled
      if (!secretsFromProps) {
        await queryClient.refetchQueries({ queryKey: ['secrets', 'environment', environmentId] });
      }
      return;
    }

    setNewSecrets(newSecrets.filter(s => s.tempId !== itemId));
    setEditingSecrets(new Set([...editingSecrets].filter(id => id !== itemId)));
  };

  const handleRequestDeleteSecret = (itemId: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete secret?',
      message: 'This will remove the key/value pair. This action cannot be undone.',
      confirmLabel: 'Delete',
      confirmColorPalette: 'red',
      kind: 'secretDelete',
      itemId,
    });
  };

  const handleRequestClearSecret = (itemId: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Discard changes?',
      message: 'This will reset the value back to the last saved value.',
      confirmLabel: 'Discard',
      confirmColorPalette: undefined,
      kind: 'secretClear',
      itemId,
    });
  };

  const handleUpdateSecret = (index: number, field: 'key' | 'value', value: string) => {
    const secret = secrets[index];
    if (secret.id) {
      // Update existing secret - only update value, key cannot be changed
      if (field === 'value') {
        // Track edited value in the map
        setEditedSecretValues(new Map(editedSecretValues).set(secret.id, value));
      }
    } else {
      // Update new item
      const itemId = secret.tempId ?? `new-${index}`;
      const updated = newSecrets.map(s => (s.tempId === itemId ? { ...s, [field]: value } : s));
      setNewSecrets(updated);
    }
  };

  const handleEditSecret = (index: number) => {
    const secret = secrets[index];
    const itemId = secret.id ?? secret.tempId ?? `new-${index}`;
    setEditingSecrets(new Set(editingSecrets).add(itemId));
    // Clear the edited value when entering edit mode so the field is empty
    if (secret.id) {
      setEditedSecretValues(prev => {
        const newMap = new Map(prev);
        newMap.set(secret.id!, ''); // Clear the value
        return newMap;
      });
    }
  };

  const handleSaveSecretValue = async (index: number) => {
    const secret = secrets[index];
    if (secret.id) {
      // Save existing secret value
      try {
        await updateSecretMutation.mutateAsync({
          id: secret.id,
          value: secret.value || undefined, // Convert empty string to undefined
          scope: 'environment',
          resourceId: environmentId,
        });
        // Remove from editing set and clear edited value
        setEditingSecrets(prev => new Set([...prev].filter(id => id !== secret.id)));
        setEditedSecretValues(prev => {
          const newMap = new Map(prev);
          newMap.delete(secret.id!);
          return newMap;
        });
        // Refetch fallback queries if they're enabled
        if (!secretsFromProps) {
          await queryClient.refetchQueries({ queryKey: ['secrets', 'environment', environmentId] });
        }
      } catch (error) {
        console.error('Error updating secret:', error);
        let errorMessage = 'An unknown error occurred while updating the secret.';
        if (error instanceof Error) {
          errorMessage = error.message;
          // Check for network errors
          if (error.message.includes('fetch') || error.message.includes('network') || error.message.includes('Failed to fetch')) {
            errorMessage = 'Network error: Unable to connect to the server. Please check your internet connection and try again.';
          }
        }
        setErrorModal({
          isOpen: true,
          title: 'Failed to Update Secret',
          message: errorMessage,
        });
      }
    } else {
      // Save new secret
      await handleSaveSecret(index);
    }
  };

  const handleSaveSecret = async (index: number) => {
    const secret = secrets[index];
    if (!secret.key.trim()) {
      setErrorModal({
        isOpen: true,
        title: 'Validation Error',
        message: 'Key is required for secrets.',
      });
      return;
    }
    
    if (secret.id) {
      // Already saved, nothing to do
      return;
    }
    
    const itemId = secret.tempId ?? `new-${index}`;
    
    try {
      await createSecretMutation.mutateAsync({
        scope: 'environment',
        resourceId: environmentId,
        key: secret.key.trim(),
        value: secret.value || undefined,
      });
      // Remove from new items after successful save
      setNewSecrets(prev => prev.filter(s => s.tempId !== itemId));
      setEditingSecrets(prev => new Set([...prev].filter(id => id !== itemId)));
      // Refetch fallback queries if they're enabled
      if (!secretsFromProps) {
        await queryClient.refetchQueries({ queryKey: ['secrets', 'environment', environmentId] });
      }
    } catch (error) {
      console.error('Error saving secret:', error);
      setErrorModal({
        isOpen: true,
        title: 'Failed to Save Secret',
        message: error instanceof Error ? error.message : 'An unknown error occurred while saving the secret.',
      });
    }
  };

  const confirmAndRun = async () => {
    const kind = confirmModal.kind;
    const itemId = confirmModal.itemId;
    if (!kind || !itemId) {
      setConfirmModal({ ...confirmModal, isOpen: false });
      return;
    }

    try {
      if (kind === 'envVarClear') {
        // only meaningful for existing rows
        setEditingEnvVars(new Set([...editingEnvVars].filter(id => id !== itemId)));
        const next = new Map(editedEnvVarValues);
        next.delete(itemId);
        setEditedEnvVarValues(next);
      } else if (kind === 'envVarDelete') {
        await deleteEnvVarById(itemId);
      } else if (kind === 'secretClear') {
        setEditingSecrets(new Set([...editingSecrets].filter(id => id !== itemId)));
        const next = new Map(editedSecretValues);
        next.delete(itemId);
        setEditedSecretValues(next);
      } else if (kind === 'secretDelete') {
        await deleteSecretById(itemId);
      }
    } catch (e) {
      console.error('Confirm action failed', e);
      setErrorModal({
        isOpen: true,
        title: 'Action failed',
        message: e instanceof Error ? e.message : 'Unknown error',
      });
    } finally {
      setConfirmModal({ ...confirmModal, isOpen: false, kind: undefined, itemId: undefined });
    }
  };

  const handleSaveName = () => {
    // TODO: Implement save mutation
    console.log('Saving name:', name);
    setIsEditingName(false);
  };

  const handleSaveType = async () => {
    try {
      await updateEnvironmentMutation.mutateAsync({
        id: environmentId,
        type: type,
      });
      setIsEditingType(false);
    } catch (error) {
      console.error('Error updating environment type:', error);
      let errorMessage = 'An unknown error occurred while updating the environment type.';
      if (error instanceof Error) {
        errorMessage = error.message;
        if (error.message.includes('fetch') || error.message.includes('network') || error.message.includes('Failed to fetch')) {
          errorMessage = 'Network error: Unable to connect to the server. Please check your internet connection and try again.';
        }
      }
      setErrorModal({
        isOpen: true,
        title: 'Failed to Update Environment Type',
        message: errorMessage,
      });
    }
  };
  
  const handleSaveProject = async () => {
    if (!selectedProjectId) {
      setErrorModal({
        isOpen: true,
        title: 'Invalid Project',
        message: 'Please select a project.',
      });
      return;
    }
    
    try {
      await updateEnvironmentMutation.mutateAsync({
        id: environmentId,
        projectId: selectedProjectId,
      });
      setIsEditingProject(false);
      // Navigate to the new project's environment page
      navigate(`/environments/${environmentId}`);
    } catch (error) {
      console.error('Error updating environment project:', error);
      let errorMessage = 'An unknown error occurred while updating the environment project.';
      if (error instanceof Error) {
        errorMessage = error.message;
        if (error.message.includes('fetch') || error.message.includes('network') || error.message.includes('Failed to fetch')) {
          errorMessage = 'Network error: Unable to connect to the server. Please check your internet connection and try again.';
        }
      }
      setErrorModal({
        isOpen: true,
        title: 'Failed to Update Environment Project',
        message: errorMessage,
      });
    }
  };


  return (
    <Flex direction="column" gap="var(--chakra-spacing-sm)">
      {/* Environment Information Section */}
      <Flex direction="column" gap="var(--chakra-spacing-md)" bg="var(--chakra-colors-bg-subtle)" rounded="var(--chakra-radii-md)" p="var(--chakra-spacing-sm)">
        <Text fontSize="md" fontWeight="bold">
          Environment Information
        </Text>
        
        {/* Project */}
        {projectId && (
          <Flex direction="column" gap="var(--chakra-spacing-2xs)">
            <Text fontSize="sm" fontWeight="medium" color="var(--chakra-colors-fg-muted)">
              Project
            </Text>
            {isEditingProject && canEdit ? (
              <Flex gap="var(--chakra-spacing-xs)" align="center">
                <Combobox.Root
                  value={selectedProjectId ? [selectedProjectId] : []}
                  onValueChange={(details: { value: string[] }) => {
                    setSelectedProjectId(details.value[0] || '');
                  }}
                  onInputValueChange={(e) => projectsFilter(e.inputValue)}
                  collection={projectsCollection}
                  style={{ flex: 1 }}
                  disabled={projectsLoading}
                >
                  <Combobox.Control>
                    <Combobox.Input 
                      placeholder={
                        projectsLoading 
                          ? 'Loading projects...' 
                          : (projectsData?.items && projectsData.items.length > 0 
                              ? 'Select a project' 
                              : 'No projects found')
                      }
                      name="environment-project"
                      autoComplete="off"
                      data-extension-ignore="true"
                      disabled={projectsLoading}
                    />
                    <Combobox.IndicatorGroup>
                      <Combobox.ClearTrigger />
                      <Combobox.Trigger />
                    </Combobox.IndicatorGroup>
                  </Combobox.Control>
                  <Portal>
                    <Combobox.Positioner>
                      <Combobox.Content>
                        <Combobox.Empty>
                          {projectsLoading 
                            ? 'Loading projects...' 
                            : (projectsData?.items && projectsData.items.length === 0 
                                ? 'No projects available' 
                                : 'No projects found')}
                        </Combobox.Empty>
                        {projectsCollection.items.map((item: { value: string; label: string }) => (
                          <Combobox.Item key={item.value} item={item}>
                            {item.label}
                            <Combobox.ItemIndicator />
                          </Combobox.Item>
                        ))}
                      </Combobox.Content>
                    </Combobox.Positioner>
                  </Portal>
                </Combobox.Root>
                <Button size="xs" onClick={handleSaveProject} disabled={updateEnvironmentMutation.isPending}>
                  Save
                </Button>
                <Button size="xs" variant="outline" onClick={() => {
                  setSelectedProjectId(projectId || '');
                  setIsEditingProject(false);
                }}>
                  Cancel
                </Button>
              </Flex>
            ) : (
              <Flex gap="var(--chakra-spacing-xs)" align="center">
                <Text 
                  fontSize="sm" 
                  flex="1"
                  color="var(--chakra-colors-blue-500)"
                  cursor="pointer"
                  onClick={() => navigate(`/projects/${projectId}`)}
                  _hover={{ textDecoration: 'underline' }}
                >
                  {projectName || 'Loading...'}
                </Text>
                {canEdit && (
                  <Button size="xs" variant="ghost" onClick={() => setIsEditingProject(true)}>
                    <HiPencil />
                  </Button>
                )}
              </Flex>
            )}
          </Flex>
        )}
        
        {/* Name */}
        <Flex direction="column" gap="var(--chakra-spacing-2xs)">
          <Text fontSize="sm" fontWeight="medium" color="var(--chakra-colors-fg-muted)">
            Name
          </Text>
          {isEditingName && canEdit ? (
            <Flex gap="var(--chakra-spacing-xs)" align="center">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                size="sm"
                flex="1"
              />
              <Button size="xs" onClick={handleSaveName}>
                Save
              </Button>
              <Button size="xs" variant="outline" onClick={() => {
                setName(environmentName);
                setIsEditingName(false);
              }}>
                Cancel
              </Button>
            </Flex>
          ) : (
            <Flex gap="var(--chakra-spacing-xs)" align="center">
              <Text fontSize="sm" flex="1">{name}</Text>
              {canEdit && (
                <Button size="xs" variant="ghost" onClick={() => setIsEditingName(true)}>
                  <HiPencil />
                </Button>
              )}
            </Flex>
          )}
        </Flex>

        {/* Type */}
        <Flex direction="column">
          <Text fontSize="sm" fontWeight="medium" color="var(--chakra-colors-fg-muted)">
            Type
          </Text>
          {isEditingType && canEdit ? (
            <Flex gap="var(--chakra-spacing-xs)" align="center">
              <Input
                value={type}
                onChange={(e) => setType(e.target.value)}
                size="sm"
                flex="1"
              />
              <Button size="xs" onClick={handleSaveType}>
                Save
              </Button>
              <Button size="xs" variant="outline" onClick={() => {
                setType(environmentType);
                setIsEditingType(false);
              }}>
                Cancel
              </Button>
            </Flex>
          ) : (
            <Flex gap="var(--chakra-spacing-xs)" align="center">
              <Text fontSize="sm" flex="1">{type}</Text>
              {canEdit && (
                <Button size="xs" variant="ghost" onClick={() => setIsEditingType(true)}>
                  <HiPencil />
                </Button>
              )}
            </Flex>
          )}
        </Flex>
      
      {/* Cluster mapping (admin-only for now) */}
      {isAdmin && (
        <Flex direction="column" gap="var(--chakra-spacing-2xs)">
          <Text fontSize="sm" fontWeight="medium" color="var(--chakra-colors-fg-muted)">
            Kubernetes Cluster
          </Text>
          {isEditingCluster && canEdit ? (
            <Flex gap="var(--chakra-spacing-xs)" align="center">
              <Combobox.Root
                value={selectedClusterDraftId ? [selectedClusterDraftId] : []}
                onValueChange={(details: { value: string[] }) => {
                  setSelectedClusterDraftId(details.value[0] || '');
                }}
                onInputValueChange={(e) => clustersFilter(e.inputValue)}
                collection={clustersCollection}
                style={{ flex: 1 }}
                disabled={clustersLoading || !!clustersError}
              >
                <Combobox.Control>
                  <Combobox.Input 
                    placeholder={
                      clustersLoading 
                        ? 'Loading clusters...' 
                        : (clustersCollection.items.length > 0 
                            ? 'Select a cluster' 
                            : (!!clustersError ? 'Unable to load clusters' : 'No clusters found'))
                    }
                    name="environment-cluster"
                    autoComplete="off"
                    data-extension-ignore="true"
                    disabled={clustersLoading || !!clustersError}
                  />
                  <Combobox.IndicatorGroup>
                    <Combobox.ClearTrigger />
                    <Combobox.Trigger />
                  </Combobox.IndicatorGroup>
                </Combobox.Control>
                <Portal>
                  <Combobox.Positioner>
                    <Combobox.Content>
                      <Combobox.Empty>
                        {clustersLoading 
                          ? 'Loading clusters...' 
                          : (clustersCollection.items.length === 0 
                              ? (!!clustersError ? 'Unable to load clusters' : 'No clusters available') 
                              : 'No clusters found')}
                      </Combobox.Empty>
                      {clustersCollection.items.map((item: { value: string; label: string }) => (
                        <Combobox.Item key={item.value} item={item}>
                          {item.label}
                          <Combobox.ItemIndicator />
                        </Combobox.Item>
                      ))}
                    </Combobox.Content>
                  </Combobox.Positioner>
                </Portal>
              </Combobox.Root>
              <Button
                size="xs"
                onClick={async () => {
                  try {
                    await updateEnvironmentMutation.mutateAsync({
                      id: environmentId,
                      clusterId: (selectedClusterDraftId || null),
                    });
                    setSelectedClusterId(selectedClusterDraftId || '');
                    setIsEditingCluster(false);
                  } catch (e) {
                    setErrorModal({
                      isOpen: true,
                      title: 'Failed to Update Cluster Mapping',
                      message: e instanceof Error ? e.message : 'Unknown error',
                    });
                  }
                }}
                disabled={clustersLoading}
              >
                Save
              </Button>
              <Button
                size="xs"
                variant="outline"
                onClick={() => {
                  setSelectedClusterDraftId(selectedClusterId || '');
                  setIsEditingCluster(false);
                }}
              >
                Cancel
              </Button>
            </Flex>
          ) : (
            <Flex gap="var(--chakra-spacing-xs)" align="center">
              <Text fontSize="sm" flex="1">
                {(clustersCollection.items.find((it: { value: string; label: string }) => it.value === selectedClusterId)?.label) || 'Not mapped'}
              </Text>
              {canEdit && (
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => {
                    setSelectedClusterDraftId(selectedClusterId || '');
                    setIsEditingCluster(true);
                  }}
                >
                  <HiPencil />
                </Button>
              )}
            </Flex>
          )}
        </Flex>
      )}

      </Flex>

      {/* Domain Section */}
      <Flex direction="column" gap="var(--chakra-spacing-md)" bg="var(--chakra-colors-bg-subtle)" rounded="var(--chakra-radii-md)" p="var(--chakra-spacing-sm)">
        <Flex justify="space-between" align="center">
          <Text fontSize="md" fontWeight="bold">
            Domain
          </Text>
          {canEdit && (
            <Button
              size="xs"
              onClick={async () => {
                await setupEnvSubdomain.mutateAsync(environmentId);
              }}
              loading={setupEnvSubdomain.isPending}
            >
              Setup Domain
            </Button>
          )}
        </Flex>

        {/* Certificate */}
        <Flex direction="column" gap="var(--chakra-spacing-2xs)">
          <Text fontSize="sm" fontWeight="medium" color="var(--chakra-colors-fg-muted)">
            Certificate
          </Text>
          <Flex align="center" gap="var(--chakra-spacing-xs)">
            {certStatus === 'success' && (
              <>
                <Box color="var(--chakra-colors-green-500)"><HiShieldCheck size={20} /></Box>
                <Badge size="sm" colorPalette="green" fontWeight="bold">Active</Badge>
              </>
            )}
            {certStatus === 'pending' && (
              <>
                <Spinner size="xs" />
                <Badge size="sm" colorPalette="yellow" fontWeight="bold">Provisioning</Badge>
              </>
            )}
            {certStatus === 'error' && (
              <>
                <Box color="var(--chakra-colors-red-500)"><HiShieldCheck size={20} /></Box>
                <Badge size="sm" colorPalette="red" fontWeight="bold">Failed</Badge>
              </>
            )}
            {certStatus === 'not_started' && (
              <>
                <Box color="var(--chakra-colors-fg-muted)"><HiShieldCheck size={20} /></Box>
                <Badge size="sm" colorPalette="gray" fontWeight="bold">Not Configured</Badge>
              </>
            )}
          </Flex>
        </Flex>

        {/* Listener / Gateway */}
        <Flex direction="column" gap="var(--chakra-spacing-2xs)">
          <Text fontSize="sm" fontWeight="medium" color="var(--chakra-colors-fg-muted)">
            Listener / Gateway
          </Text>
          <Flex align="center" gap="var(--chakra-spacing-xs)">
            {gatewayStatus === 'success' && (
              <>
                <Box color="var(--chakra-colors-blue-500)"><HiSignal size={20} /></Box>
                <Badge size="sm" colorPalette="blue" fontWeight="bold">Configured</Badge>
              </>
            )}
            {gatewayStatus === 'pending' && (
              <>
                <Spinner size="xs" />
                <Badge size="sm" colorPalette="yellow" fontWeight="bold">Provisioning</Badge>
              </>
            )}
            {gatewayStatus === 'error' && (
              <>
                <Box color="var(--chakra-colors-red-500)"><HiSignal size={20} /></Box>
                <Badge size="sm" colorPalette="red" fontWeight="bold">Failed</Badge>
              </>
            )}
            {gatewayStatus === 'not_started' && (
              <>
                <Box color="var(--chakra-colors-fg-muted)"><HiSignal size={20} /></Box>
                <Badge size="sm" colorPalette="gray" fontWeight="bold">Not Configured</Badge>
              </>
            )}
          </Flex>
        </Flex>

        {/* Base Domain */}
        <Flex direction="column" gap="var(--chakra-spacing-2xs)">
          <Text fontSize="sm" fontWeight="medium" color="var(--chakra-colors-fg-muted)">
            Base Domain
          </Text>
          <Flex align="center" gap="var(--chakra-spacing-xs)">
            {certStatus === 'success' && gatewayStatus === 'success' ? (
              <>
                <Box color="var(--chakra-colors-fg-muted)">
                  <HiGlobeAlt size={20} />
                </Box>
                <Text fontSize="sm" fontWeight="medium">
                  {normalizeName(environmentName)}.{normalizeName(projectName || '')}.{baseDomain}
                </Text>
              </>
            ) : (
              <>
                <Box color="var(--chakra-colors-fg-muted)">
                  <HiGlobeAlt size={20} />
                </Box>
                <Badge size="sm" colorPalette="gray" fontWeight="bold">Not Configured</Badge>
              </>
            )}
          </Flex>
        </Flex>
      </Flex>

      {/* Environment Variables Section */}
      <Flex direction="column" gap="var(--chakra-spacing-md)" bg="var(--chakra-colors-bg-subtle)" rounded="var(--chakra-radii-md)" p="var(--chakra-spacing-sm)">
        <Flex justify="space-between" align="center">
          <Text fontSize="md" fontWeight="bold">
            Variables
          </Text>
          {canEdit && (
            <Button size="xs" onClick={handleAddEnvVar}>
              <HiPlus />
              Add Variable
            </Button>
          )}
        </Flex>

        {envVarsLoading ? (
          <Text fontSize="sm" color="var(--chakra-colors-fg-muted)" fontStyle="italic">
            Loading...
          </Text>
        ) : envVars.length === 0 ? (
          <Text fontSize="sm" color="var(--chakra-colors-fg-muted)" fontStyle="italic">
            No environment variables configured
          </Text>
        ) : (
          <Flex direction="column" gap="var(--chakra-spacing-xs)">
            {envVars.map((envVar, index) => {
              const itemId = envVar.id ?? envVar.tempId ?? `new-${index}`;
              const isEditing = editingEnvVars.has(itemId);
              const isNew = !envVar.id;
              const canClear = !isNew && editedEnvVarValues.has(itemId);
              
              return (
                <Flex key={itemId} gap="var(--chakra-spacing-xs)" align="center">
                  <Input
                    placeholder="Key"
                    value={envVar.key}
                    onChange={(e) => handleUpdateEnvVar(index, 'key', e.target.value)}
                    size="sm"
                    flex="1"
                    disabled={!canEdit || !!envVar.id}
                  />
                  <Input
                    placeholder="Value"
                    value={envVar.value}
                    onChange={(e) => handleUpdateEnvVar(index, 'value', e.target.value)}
                    size="sm"
                    flex="1"
                    disabled={!canEdit || !isEditing}
                  />
                  {canEdit && (
                    <>
                      {isEditing ? (
                        <>
                          <Button
                            size="xs"
                            variant="ghost"
                            colorPalette="green"
                            onClick={() => handleSaveEnvVarValue(index)}
                            disabled={isNew && (!envVar.key.trim() || createEnvVarMutation.isPending)}
                            loading={isNew ? createEnvVarMutation.isPending : updateEnvVarMutation.isPending}
                          >
                            <HiMiniCheckCircle />
                          </Button>
                          {!isNew && (
                            <Button
                              size="xs"
                              variant="ghost"
                              colorPalette="blue"
                              onClick={() => handleRequestClearEnvVar(itemId)}
                              disabled={!canClear}
                            >
                              <HiArrowUturnLeft />
                            </Button>
                          )}
                        </>
                      ) : (
                        <Button size="xs" variant="ghost" onClick={() => handleEditEnvVar(index)}>
                          <HiPencil />
                        </Button>
                      )}
                      <Button
                        size="xs"
                        variant="ghost"
                        colorPalette="red"
                        onClick={() => handleRequestDeleteEnvVar(itemId)}
                        disabled={deleteEnvVarMutation.isPending}
                      >
                        <HiTrash />
                      </Button>
                    </>
                  )}
                </Flex>
              );
            })}
          </Flex>
        )}
      </Flex>

      {/* <Separator my="var(--chakra-spacing-md)" /> */}

      {/* Secrets Section */}
      <Flex direction="column" gap="var(--chakra-spacing-md)" bg="var(--chakra-colors-bg-subtle)" rounded="var(--chakra-radii-md)" p="var(--chakra-spacing-sm)">
        <Flex justify="space-between" align="center">
          <Text fontSize="md" fontWeight="bold">
            Secrets
          </Text>
          {canEdit && (
            <Button size="xs" onClick={handleAddSecret}>
              <HiPlus />
              Add Secret
            </Button>
          )}
        </Flex>

        {secretsLoading ? (
          <Text fontSize="sm" color="var(--chakra-colors-fg-muted)" fontStyle="italic">
            Loading...
          </Text>
        ) : secrets.length === 0 ? (
          <Text fontSize="sm" color="var(--chakra-colors-fg-muted)" fontStyle="italic">
            No secrets configured
          </Text>
        ) : (
          <Flex direction="column" gap="var(--chakra-spacing-xs)">
            {secrets.map((secret, index) => {
              const itemId = secret.id ?? secret.tempId ?? `new-${index}`;
              const isEditing = editingSecrets.has(itemId);
              const isNew = !secret.id;
              const canClear = !isNew && editedSecretValues.has(itemId);
              
              return (
                <Flex key={itemId} gap="var(--chakra-spacing-xs)" align="center">
                  <Input
                    placeholder="Key"
                    value={secret.key}
                    onChange={(e) => handleUpdateSecret(index, 'key', e.target.value)}
                    size="sm"
                    flex="1"
                    disabled={!canEdit || !!secret.id}
                  />
                  <Input
                    type="password"
                    placeholder="Value"
                    value={secret.value}
                    onChange={(e) => handleUpdateSecret(index, 'value', e.target.value)}
                    size="sm"
                    flex="1"
                    disabled={!canEdit || !isEditing}
                  />
                  {canEdit && (
                    <>
                      {isEditing ? (
                        <>
                          <Button
                            size="xs"
                            variant="ghost"
                            colorPalette="green"
                            onClick={() => handleSaveSecretValue(index)}
                            disabled={isNew && (!secret.key.trim() || createSecretMutation.isPending)}
                            loading={isNew ? createSecretMutation.isPending : updateSecretMutation.isPending}
                          >
                            <HiMiniCheckCircle />
                          </Button>
                          {!isNew && (
                            <Button
                              size="xs"
                              variant="ghost"
                              colorPalette="blue"
                              onClick={() => handleRequestClearSecret(itemId)}
                              disabled={!canClear}
                            >
                              <HiArrowUturnLeft />
                            </Button>
                          )}
                        </>
                      ) : (
                        <Button size="xs" variant="ghost" onClick={() => handleEditSecret(index)}>
                          <HiPencil />
                        </Button>
                      )}
                      <Button
                        size="xs"
                        variant="ghost"
                        colorPalette="red"
                        onClick={() => handleRequestDeleteSecret(itemId)}
                        disabled={deleteSecretMutation.isPending}
                      >
                        <HiTrash />
                      </Button>
                    </>
                  )}
                </Flex>
              );
            })}
          </Flex>
        )}
      </Flex>

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
              <Button onClick={() => setErrorModal({ ...errorModal, isOpen: false })}>
                Close
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Dialog.Root>

      {/* Confirm Modal (Clear/Delete) */}
      <Dialog.Root open={confirmModal.isOpen} onOpenChange={(e) => setConfirmModal({ ...confirmModal, isOpen: e.open })}>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>{confirmModal.title}</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
              <Text>{confirmModal.message}</Text>
            </Dialog.Body>
            <Dialog.Footer>
              <Flex gap="var(--chakra-spacing-xs)">
                <Button variant="outline" onClick={() => setConfirmModal({ ...confirmModal, isOpen: false })}>
                  Cancel
                </Button>
                <Button colorPalette={confirmModal.confirmColorPalette} onClick={confirmAndRun}>
                  {confirmModal.confirmLabel}
                </Button>
              </Flex>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Dialog.Root>
    </Flex>
  );
}
