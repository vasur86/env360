import * as React from 'react';
import {
  Button,
  Flex,
  Text,
  Input,
  Textarea,
  Dialog,
} from '@chakra-ui/react';
import { HiPlus, HiPencil, HiMiniCheckCircle, HiTrash, HiArrowUturnLeft } from 'react-icons/hi2';
import {
  useEnvironmentVariables,
  useSecrets,
  useCreateEnvironmentVariable,
  useUpdateEnvironmentVariable,
  useDeleteEnvironmentVariable,
  useCreateSecret,
  useUpdateSecret,
  useDeleteSecret,
} from '../../api/client';

interface SettingsTabProps {
  projectId: string;
  projectName: string;
  projectDescription?: string | null;
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
  projectId, 
  projectName, 
  projectDescription, 
  canEdit,
  environmentVariables: envVarsFromProps,
  secrets: secretsFromProps,
}: SettingsTabProps) {
  const [name, setName] = React.useState(projectName);
  const [description, setDescription] = React.useState(projectDescription || '');
  const [isEditingName, setIsEditingName] = React.useState(false);
  const [isEditingDescription, setIsEditingDescription] = React.useState(false);
  
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
  
  // Use data passed from ProjectDetails (from consolidated query)
  // Only use individual queries as fallback if props are not provided
  const { data: envVarsDataFallback, isLoading: envVarsLoading } = useEnvironmentVariables(
    'project', 
    projectId,
    { enabled: !envVarsFromProps } // Disable if data is provided via props
  );
  const { data: secretsDataFallback, isLoading: secretsLoading } = useSecrets(
    'project', 
    projectId,
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
    setName(projectName);
  }, [projectName]);

  React.useEffect(() => {
    setDescription(projectDescription || '');
  }, [projectDescription]);

  const handleAddEnvVar = () => {
    const tempId = genTempId();
    setNewEnvVars([...newEnvVars, { tempId, key: '', value: '', isNew: true }]);
    // Automatically enable editing for new items
    setEditingEnvVars(new Set(editingEnvVars).add(tempId));
  };

  const deleteEnvVarById = async (itemId: string) => {
    const existing = envVars.find(v => v.id === itemId);
    if (existing?.id) {
      await deleteEnvVarMutation.mutateAsync({ id: existing.id, scope: 'project', resourceId: projectId });
      setEditingEnvVars(new Set([...editingEnvVars].filter(id => id !== existing.id)));
      const newEdited = new Map(editedEnvVarValues);
      newEdited.delete(existing.id);
      setEditedEnvVarValues(newEdited);
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
          scope: 'project',
          resourceId: projectId,
        });
        // Remove from editing set and clear edited value
        setEditingEnvVars(prev => new Set([...prev].filter(id => id !== envVar.id)));
        setEditedEnvVarValues(prev => {
          const newMap = new Map(prev);
          newMap.delete(envVar.id!);
          return newMap;
        });
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
        scope: 'project',
        resourceId: projectId,
        key: envVar.key.trim(),
        value: envVar.value || undefined,
      });
      // Remove from new items after successful save
      setNewEnvVars(prev => prev.filter(v => v.tempId !== itemId));
      setEditingEnvVars(prev => new Set([...prev].filter(id => id !== itemId)));
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
      await deleteSecretMutation.mutateAsync({ id: existing.id, scope: 'project', resourceId: projectId });
      setEditingSecrets(new Set([...editingSecrets].filter(id => id !== existing.id)));
      const newEdited = new Map(editedSecretValues);
      newEdited.delete(existing.id);
      setEditedSecretValues(newEdited);
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
          scope: 'project',
          resourceId: projectId,
        });
        // Remove from editing set and clear edited value
        setEditingSecrets(prev => new Set([...prev].filter(id => id !== secret.id)));
        setEditedSecretValues(prev => {
          const newMap = new Map(prev);
          newMap.delete(secret.id!);
          return newMap;
        });
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
        scope: 'project',
        resourceId: projectId,
        key: secret.key.trim(),
        value: secret.value || undefined,
      });
      // Remove from new items after successful save
      setNewSecrets(prev => prev.filter(s => s.tempId !== itemId));
      setEditingSecrets(prev => new Set([...prev].filter(id => id !== itemId)));
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

  const handleSaveDescription = () => {
    // TODO: Implement save mutation
    console.log('Saving description:', description);
    setIsEditingDescription(false);
  };

  return (
    <Flex direction="column" gap="var(--chakra-spacing-sm)">
      {/* Project Name and Description Section */}
      <Flex direction="column" gap="var(--chakra-spacing-md)" bg="var(--chakra-colors-bg-subtle)" rounded="var(--chakra-radii-md)" p="var(--chakra-spacing-sm)">
        <Text fontSize="md" fontWeight="bold">
          Project Information
        </Text>
        
        {/* Name */}
        <Flex direction="column">
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
                setName(projectName);
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

        {/* Description */}
        <Flex direction="column">
          <Text fontSize="sm" fontWeight="medium" color="var(--chakra-colors-fg-muted)">
            Description
          </Text>
          {isEditingDescription && canEdit ? (
            <Flex direction="column" gap="var(--chakra-spacing-xs)">
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                size="sm"
                rows={3}
              />
              <Flex gap="var(--chakra-spacing-xs)">
                <Button size="xs" onClick={handleSaveDescription}>
                  Save
                </Button>
                <Button size="xs" variant="outline" onClick={() => {
                  setDescription(projectDescription || '');
                  setIsEditingDescription(false);
                }}>
                  Cancel
                </Button>
              </Flex>
            </Flex>
          ) : (
            <Flex gap="var(--chakra-spacing-xs)" align="flex-start">
              <Text fontSize="sm" flex="1" color={description ? "var(--chakra-colors-fg)" : "var(--chakra-colors-fg-muted)"}>
                {description || 'No description'}
              </Text>
              {canEdit && (
                <Button size="xs" variant="ghost" onClick={() => setIsEditingDescription(true)}>
                  <HiPencil />
                </Button>
              )}
            </Flex>
          )}
        </Flex>
      </Flex>

      {/* <Separator my="var(--chakra-spacing-md)" /> */}

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
