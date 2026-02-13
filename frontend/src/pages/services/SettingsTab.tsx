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
  RadioGroup,
  Badge,
  Drawer,
  Box,
} from '@chakra-ui/react';
import { HiPlus, HiPencil, HiMiniCheckCircle, HiTrash, HiArrowUturnLeft, HiXMark } from 'react-icons/hi2';
import {
  useEnvironmentVariables,
  useSecrets,
  useCreateEnvironmentVariable,
  useUpdateEnvironmentVariable,
  useDeleteEnvironmentVariable,
  useCreateSecret,
  useUpdateSecret,
  useDeleteSecret,
  useUpdateService,
  useProjects,
  useCreateServiceConfig,
  useUpdateServiceConfig,
  useGitOrganizations,
  useGitRepositories,
} from '../../api/client';
import { useEnqueueDeployWorkflow } from '../../api/client';
import { useValidateNewServiceVersion, usePublishServiceVersion } from '../../api/client';
import { graphqlQuery } from '../../api/client';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useServiceDeployments, useServiceVersions, useServices } from '../../api/client';

interface SettingsTabProps {
  serviceId: string;
  serviceName: string;
  serviceDescription?: string | null;
  serviceType: string;
  serviceStatus?: string | null;
  serviceOwner?: string | null;
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
  serviceConfigs?: Array<{
    id: string;
    serviceId: string;
    key: string;
    value?: string | null;
    configData?: string | null;
    createdAt: string;
    updatedAt?: string | null;
  }>;
}

interface EnvVar {
  id?: string;
  tempId?: string;
  key: string;
  value: string;
  isNew?: boolean;
}

interface Secret {
  id?: string;
  tempId?: string;
  key: string;
  value: string;
  isNew?: boolean;
}

export default function SettingsTab({ 
  serviceId, 
  serviceName, 
  serviceDescription,
  serviceType,
  serviceStatus,
  serviceOwner,
  projectId,
  projectName,
  canEdit,
  environmentVariables: envVarsFromProps,
  secrets: secretsFromProps,
  serviceConfigs: serviceConfigsFromProps,
}: SettingsTabProps) {
  const navigate = useNavigate();
  const [name, setName] = React.useState(serviceName);
  const [description, setDescription] = React.useState(serviceDescription || '');
  const [type, setType] = React.useState(serviceType);
  const [selectedProjectId, setSelectedProjectId] = React.useState(projectId || '');
  
  // Source configuration state
  const getConfigValue = (key: string) => {
    return serviceConfigsFromProps?.find(c => c.key === key)?.value || null;
  };
  
  const [sourceType, setSourceType] = React.useState<'docker' | 'git'>(() => {
    const stored = getConfigValue('source_type');
    return (stored === 'git' ? 'git' : 'docker') as 'docker' | 'git';
  });
  const [dockerImage, setDockerImage] = React.useState(() => getConfigValue('docker_image') || '');
  const [gitType, setGitType] = React.useState<'github' | 'bitbucket' | 'gitlab'>(() => {
    const stored = getConfigValue('git_type');
    return (stored === 'github' || stored === 'bitbucket' || stored === 'gitlab' ? stored : 'github') as 'github' | 'bitbucket' | 'gitlab';
  });
  const [gitOrg, setGitOrg] = React.useState(() => getConfigValue('git_org') || '');
  const [gitRepo, setGitRepo] = React.useState(() => getConfigValue('git_repo') || '');
  
  // Validation state (e.g., missing docker image)
  const [validationErrors, setValidationErrors] = React.useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = React.useState<{ dockerImage?: string }>({});

  // Versioning state (stored via serviceConfigs)
  const parseVersionNumber = (v: string | null): number => {
    if (!v) return 0;
    const m = /^v?(\d+)$/i.exec(v.trim());
    if (!m) return 0;
    return parseInt(m[1], 10) || 0;
  };
  const normalizeVersion = (v: string | null): string => {
    const n = parseVersionNumber(v);
    return `v${Math.max(1, n)}`;
  };
  // Current Version represents last deployed version; null until first deploy
  const [currentVersion, setCurrentVersion] = React.useState<string | null>(null);
  // Drift is computed by comparing head vs deployed config hash
  const [hasDrift, setHasDrift] = React.useState<boolean>(false);

  React.useEffect(() => {
    if (projectId) {
      setSelectedProjectId(projectId);
    }
  }, [projectId]);
  
  const [isEditingName, setIsEditingName] = React.useState(false);
  const [isEditingDescription, setIsEditingDescription] = React.useState(false);
  const [isEditingType, setIsEditingType] = React.useState(false);
  const [isEditingProject, setIsEditingProject] = React.useState(false);
  const [isEditingSource, setIsEditingSource] = React.useState(false);
  const [isEditingPorts, setIsEditingPorts] = React.useState(false);
  const [isEditingDownstream, setIsEditingDownstream] = React.useState(false);

  // Port configuration state
  interface PortEntry {
    containerPort: number | '';
    protocol: string;
  }
  const parsePorts = (): PortEntry[] => {
    const raw = getConfigValue('ports');
    if (!raw) return [];
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr.map((p: any) => ({
        containerPort: typeof p.containerPort === 'number' ? p.containerPort : '',
        protocol: p.protocol || 'TCP',
      }));
    } catch { /* ignore */ }
    return [];
  };
  const [ports, setPorts] = React.useState<PortEntry[]>(parsePorts);

  // Downstream services configuration (service dependencies without version/env)
  interface DownstreamEntry {
    serviceId: string;
    serviceName: string;
  }
  const parseDownstream = (): DownstreamEntry[] => {
    const raw = getConfigValue('downstream_services');
    if (!raw) return [];
    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr.map((d: any) => ({
        serviceId: d.serviceId || '',
        serviceName: d.serviceName || '',
      }));
    } catch { /* ignore */ }
    return [];
  };
  const [downstreamServices, setDownstreamServices] = React.useState<DownstreamEntry[]>(parseDownstream);

  // Publish drawer and validation data
  const [isPublishOpen, setIsPublishOpen] = React.useState(false);
  const { data: validateData, isLoading: validateLoading } = useValidateNewServiceVersion(serviceId);
  const publishMutation = usePublishServiceVersion();
  const safeParse = React.useCallback((s?: string | null) => {
    if (!s) return null;
    try { return JSON.parse(s); } catch { return null; }
  }, []);
  const formatLabel = React.useCallback((s: string) => {
    return String(s).replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }, []);
  const renderValue = (v: any) => {
    if (v === null || v === undefined) return <Text fontSize="sm" color="var(--chakra-colors-fg-muted)" fontStyle="italic">--blank--</Text>;
    if (typeof v === 'object') {
      return (
        <Text fontSize="sm" fontFamily="mono" whiteSpace="pre-wrap">
          {JSON.stringify(v, null, 2)}
        </Text>
      );
    }
    return <Text fontSize="sm">{String(v)}</Text>;
  };
  const renderSectionBox = (title: string, diff?: { previous?: string | null; current?: string | null; changed?: { master?: boolean; keys?: Array<{ key: string; changed: boolean }> } }) => {
    if (!diff) return null;
    const currRaw = safeParse(diff.current) ?? {};
    const prevRaw = safeParse(diff.previous) ?? {};
    const normalizeKey = (k: string) => String(k).toLowerCase().replace(/[_\s-]/g, '');
    const makeIgnore = () => {
      const t = title.toLowerCase();
      const base = new Set<string>(['createdat', 'updatedat', 'deletedat']);
      if (t.includes('project')) {
        ['ownerid', 'owner'].forEach((k) => base.add(k));
      }
      if (t.includes('service')) {
        ['projectid', 'status', 'owner'].forEach((k) => base.add(k));
      }
      if (t.includes('config')) {
        ['deployedconfighash', 'headconfighash', 'version'].forEach((k) => base.add(k));
      }
      return base;
    };
    const ignore = makeIgnore();
    const isNumericKey = (k: string) => /^\d+$/.test(String(k));
    const allowService = new Set<string>(['id', 'name', 'description', 'type']);
    const filterObject = (obj: any) => {
      if (!obj || typeof obj !== 'object') return obj;
      const out: Record<string, any> = {};
      Object.keys(obj).forEach((k) => {
        const nk = normalizeKey(k);
        // Skip audit/ignored, numeric-only keys, and non-standard fields for service
        if (ignore.has(nk)) return;
        if (isNumericKey(k)) return;
        if (title.toLowerCase().includes('service') && !allowService.has(nk)) return;
        out[k] = obj[k];
      });
      return out;
    };
    const deriveBaseObject = (raw: any) => {
      if (title.toLowerCase().includes('service') && Array.isArray(raw) && raw.length === 1 && typeof raw[0] === 'object') {
        return raw[0];
      }
      return raw;
    };
    const curr = filterObject(deriveBaseObject(currRaw));
    const prev = filterObject(deriveBaseObject(prevRaw));
    const changedMap = new Map<string, boolean>();
    (diff.changed?.keys || []).forEach((k) => changedMap.set(k.key, !!k.changed));
    const keys = Array.from(new Set([...Object.keys(prev || {}), ...Object.keys(curr || {})])).sort();
    return (
      <Flex direction="column" gap="var(--chakra-spacing-2xs)" rounded="var(--chakra-radii-md)" p="var(--chakra-spacing-sm)" 
        border="1px solid var(--chakra-colors-border)" boxShadow="var(--chakra-shadows-sm)"
      >
        <Text fontSize="sm" fontWeight="bold" color="var(--chakra-colors-text-title)" py="var(--chakra-spacing-xs)">{title}</Text>
        <Box borderTop="1px solid var(--chakra-colors-border)" my="4px" py="4px" />
        {keys.length === 0 ? (
          <Text fontSize="xs" color="var(--chakra-colors-fg-muted)">No data</Text>
        ) : (
          <Flex direction="column" gap="var(--chakra-spacing-xs)">
            {keys.map((k) => {
              const changed = changedMap.get(k) === true;
              const cv = curr ? curr[k] : undefined;
              const pv = prev ? prev[k] : undefined;
              return (
                <Box key={k} bg={changed ? "yellow.100" : "var(--chakra-colors-bg-subtle)"} rounded="var(--chakra-radii-sm)" p="var(--chakra-spacing-xs)">
                  <Flex align="center" gap="var(--chakra-spacing-xs)" mb="2px">
                    <Text fontSize="sm" color="var(--chakra-colors-fg-muted)">{formatLabel(k)}</Text>
                  </Flex>
                  <Flex direction="row" gap="6px" align="flex-start" wrap="wrap">
                    {(!changed) ? (
                      <>
                        {renderValue(cv)}
                        <Text as="span" fontSize="xs" fontStyle="italic" color="var(--chakra-colors-fg-muted)">
                          (No change)
                        </Text>
                      </>
                    ) : (
                      <>
                        <Text
                          as="span"
                          fontSize="xs"
                          color="var(--chakra-colors-fg-muted)"
                          textDecoration="line-through"
                        >
                          {pv === null || pv === undefined
                            ? <Text as="span" fontStyle="italic">--blank--</Text>
                            : (typeof pv === 'object' ? JSON.stringify(pv, null, 2) : String(pv))}
                        </Text>
                        {renderValue(cv)}
                      </>
                    )}
                  </Flex>
                </Box>
              );
            })}
          </Flex>
        )}
      </Flex>
    );
  };
  
  const { data: projectsData, isLoading: projectsLoading } = useProjects(0, 100, undefined, true, { enabled: canEdit });
  
  const { contains: projectsContains } = useFilter({ sensitivity: "base" });
  const { contains: gitTypesContains } = useFilter({ sensitivity: "base" });
  
  const { collection: projectsCollection, filter: projectsFilter, set: setProjectsCollection } = useListCollection<{ value: string; label: string }>({
    initialItems: [],
    filter: projectsContains,
  });
  
  const gitTypesItems = React.useMemo(() => [
    { value: 'github', label: 'GitHub' },
    { value: 'bitbucket', label: 'Bitbucket' },
    { value: 'gitlab', label: 'GitLab' },
  ], []);
  
  const { collection: gitTypesCollection, filter: gitTypesFilter } = useListCollection<{ value: string; label: string }>({
    initialItems: gitTypesItems,
    filter: gitTypesContains,
  });
  
  // Fetch Git organizations when Git type is selected
  const { data: gitOrganizationsData, isLoading: gitOrganizationsLoading } = useGitOrganizations(gitType);
  
  const gitOrganizationsItems = React.useMemo(() => {
    return (gitOrganizationsData || []).map((org) => ({
      value: org.name,
      label: org.displayName || org.name,
    }));
  }, [gitOrganizationsData]);
  
  const { contains: gitOrgsContains } = useFilter({ sensitivity: "base" });
  const { collection: gitOrgsCollection, filter: gitOrgsFilter, set: setGitOrgsCollection } = useListCollection<{ value: string; label: string }>({
    initialItems: [],
    filter: gitOrgsContains,
  });
  
  React.useEffect(() => {
    setGitOrgsCollection(gitOrganizationsItems);
  }, [gitOrganizationsItems, setGitOrgsCollection]);
  
  // Fetch Git repositories when organization is selected
  const { data: gitRepositoriesData, isLoading: gitRepositoriesLoading } = useGitRepositories(gitType, gitOrg);
  
  const gitRepositoriesItems = React.useMemo(() => {
    return (gitRepositoriesData || []).map((repo) => ({
      value: repo.name,
      label: repo.fullName || repo.name,
    }));
  }, [gitRepositoriesData]);
  
  const { contains: gitReposContains } = useFilter({ sensitivity: "base" });
  const { collection: gitReposCollection, filter: gitReposFilter, set: setGitReposCollection } = useListCollection<{ value: string; label: string }>({
    initialItems: [],
    filter: gitReposContains,
  });
  
  React.useEffect(() => {
    setGitReposCollection(gitRepositoriesItems);
  }, [gitRepositoriesItems, setGitReposCollection]);
  
  
  React.useEffect(() => {
    const projectsItems = projectsData?.items && projectsData.items.length > 0
      ? projectsData.items.map((project) => ({
          value: project.id,
          label: project.name,
        }))
      : [];
    setProjectsCollection(projectsItems);
  }, [projectsData?.items, setProjectsCollection]);
  
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
  
  const { data: envVarsDataFallback, isLoading: envVarsLoading } = useEnvironmentVariables(
    'service', 
    serviceId,
    { enabled: !envVarsFromProps }
  );
  const { data: secretsDataFallback, isLoading: secretsLoading } = useSecrets(
    'service', 
    serviceId,
    { enabled: !secretsFromProps }
  );
  
  const envVarsData = envVarsFromProps || envVarsDataFallback;
  const secretsData = secretsFromProps || secretsDataFallback;
  
  const [newEnvVars, setNewEnvVars] = React.useState<EnvVar[]>([]);
  const [newSecrets, setNewSecrets] = React.useState<Secret[]>([]);
  
  const [editingEnvVars, setEditingEnvVars] = React.useState<Set<string>>(new Set());
  const [editingSecrets, setEditingSecrets] = React.useState<Set<string>>(new Set());
  const [editedEnvVarValues, setEditedEnvVarValues] = React.useState<Map<string, string>>(new Map());
  const [editedSecretValues, setEditedSecretValues] = React.useState<Map<string, string>>(new Map());

  const genTempId = React.useCallback(() => {
    const cryptoAny = globalThis.crypto as unknown as { randomUUID?: () => string } | undefined;
    if (cryptoAny?.randomUUID) return cryptoAny.randomUUID();
    return `tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }, []);
  
  const createEnvVarMutation = useCreateEnvironmentVariable();
  const updateEnvVarMutation = useUpdateEnvironmentVariable();
  const deleteEnvVarMutation = useDeleteEnvironmentVariable();
  const createSecretMutation = useCreateSecret();
  const updateSecretMutation = useUpdateSecret();
  const deleteSecretMutation = useDeleteSecret();
  const updateServiceMutation = useUpdateService();
  const createServiceConfigMutation = useCreateServiceConfig();
  const updateServiceConfigMutation = useUpdateServiceConfig();
  const enqueueDeployWorkflow = useEnqueueDeployWorkflow();
  const { data: deployments } = useServiceDeployments(serviceId);
  const { data: versions } = useServiceVersions(serviceId);
  const lastDeployedVersion: string | null = React.useMemo(() => {
    if (!deployments || deployments.length === 0) return null;
    const succeeded = deployments.find(d => (d.status || '').toLowerCase() === 'succeeded');
    const target = succeeded ?? deployments[0];
    const match = (versions || []).find(v => v.id === target.versionId);
    return match?.versionLabel ? (match.versionLabel.startsWith('v') ? match.versionLabel : `v${match.versionLabel}`) : null;
  }, [deployments, versions]);

  const lastDeployedStatus: string | null = React.useMemo(() => {
    if (!deployments || deployments.length === 0) return null;
    const status = (deployments[0].status || '').toString();
    if (!status) return null;
    return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
  }, [deployments]);

  React.useEffect(() => {
    setCurrentVersion(lastDeployedVersion);
  }, [lastDeployedVersion]);
  const hasNeverDeployed = React.useMemo(() => {
    // Treat undefined as "not yet loaded" → assume never deployed so UI stays enabled for first deploy
    return (deployments?.length ?? 0) === 0;
  }, [deployments]);
  
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

  React.useEffect(() => {
    setName(serviceName);
  }, [serviceName]);

  React.useEffect(() => {
    setDescription(serviceDescription || '');
  }, [serviceDescription]);

  React.useEffect(() => {
    setType(serviceType);
  }, [serviceType]);
  
  // Update source config state when serviceConfigs change
  React.useEffect(() => {
    if (serviceConfigsFromProps) {
      const sourceTypeValue = getConfigValue('source_type');
      if (sourceTypeValue) {
        setSourceType(sourceTypeValue === 'git' ? 'git' : 'docker');
      }
      setDockerImage(getConfigValue('docker_image') || '');
      const gitTypeValue = getConfigValue('git_type');
      if (gitTypeValue === 'github' || gitTypeValue === 'bitbucket' || gitTypeValue === 'gitlab') {
        setGitType(gitTypeValue);
      }
      setGitOrg(getConfigValue('git_org') || '');
      setGitRepo(getConfigValue('git_repo') || '');
    }
  }, [serviceConfigsFromProps]);

  // Recompute validation errors when source inputs change
  React.useEffect(() => {
    const errors: string[] = [];
    const fields: { dockerImage?: string } = {};
    if (sourceType === 'docker') {
      const err = validateDockerImage(dockerImage);
      if (err) {
        errors.push(err);
        fields.dockerImage = err;
      }
    }
    setValidationErrors(errors);
    setFieldErrors(fields);
  }, [sourceType, dockerImage]);

  // Hash helpers to track configuration drift
  const sha256Hex = async (input: string): Promise<string> => {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const digest = await (globalThis.crypto || (globalThis as any).msCrypto).subtle.digest('SHA-256', data);
    const bytes = Array.from(new Uint8Array(digest));
    return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
  };

  const computeHeadSpecString = (): string => {
    // Prefer cached consolidated service-details if available for consistency
    const cached = queryClient.getQueryData<any>(['service-details', serviceId]);
    const cfgs: Array<{ key: string; value?: string | null }> =
      cached?.serviceDetails?.serviceConfigs || serviceConfigsFromProps || [];
    const cfgMap = new Map<string, string | null | undefined>();
    for (const c of cfgs) {
      cfgMap.set(c.key, c.value);
    }
    const sType = (cfgMap.get('source_type') as string) || sourceType;
    const dImg = (cfgMap.get('docker_image') as string) || dockerImage || '';
    const gType = (cfgMap.get('git_type') as string) || gitType || '';
    const gOrg = (cfgMap.get('git_org') as string) || gitOrg || '';
    const gRepo = (cfgMap.get('git_repo') as string) || gitRepo || '';

    // Environment variables and secrets from cached details; fall back to hook data if needed
    const envs: Array<{ key: string; value?: string | null; scope?: string; resourceId?: string }> =
      cached?.environmentVariables || [];
    const secs: Array<{ key: string; valueLength?: number | null; scope?: string; resourceId?: string }> =
      cached?.secrets || [];

    // Only include service-scoped for this service
    const envPairs = envs
      .filter((e) => e.scope === 'service' && e.resourceId === serviceId)
      .map((e) => ({ key: e.key, value: e.value ?? '' }))
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

    // For secrets, avoid plaintext; use key + length as a change indicator
    const secPairs = secs
      .filter((s) => s.scope === 'service' && s.resourceId === serviceId)
      .map((s) => ({ key: s.key, valueLength: s.valueLength || 0 }))
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

    const spec = {
      sourceType: sType,
      dockerImage: sType === 'docker' ? dImg : '',
      git: sType === 'git' ? { type: gType, org: gOrg, repo: gRepo } : null,
      envVars: envPairs,
      secrets: secPairs,
    };
    return JSON.stringify(spec);
  };

  const updateVersionMetadataOnChange = async () => {
    // Ensure we have the latest details before computing
    await queryClient.refetchQueries({ queryKey: ['service-details', serviceId] });

    const headStr = computeHeadSpecString();
    const headHash = await sha256Hex(headStr);

    // Read current config values (from props or cache)
    const cached = queryClient.getQueryData<any>(['service-details', serviceId]);
    const cfgs: Array<{ key: string; value?: string | null; id?: string }> =
      cached?.serviceDetails?.serviceConfigs || serviceConfigsFromProps || [];
    const getCfg = (k: string) => cfgs.find((c) => c.key === k)?.value || null;
    normalizeVersion((getCfg('version') as string) || currentVersion || 'v1');
    const deployedHash = (getCfg('deployed_config_hash') as string) || '';
    const headStored = (getCfg('head_config_hash') as string) || '';

    if (headHash !== deployedHash) {
      // Drift exists: set head hash and flag
      await saveServiceConfig('head_config_hash', headHash);
      setHasDrift(true);
    } else {
      // No drift: align latest with current
      if (headStored !== headHash) {
        await saveServiceConfig('head_config_hash', headHash);
      }
      setHasDrift(false);
    }

    // Re-validate to refresh Publish New Version button visibility
    await queryClient.invalidateQueries({ queryKey: ['validate-new-service-version', serviceId] });
  };

  // Initialize versioning for services: compute head hash; don't set version until first deploy
  React.useEffect(() => {
    const init = async () => {
      // Compute and store head hash; don't set deployed hash until deploy occurs
      await updateVersionMetadataOnChange();
    };
    // Run once when configs first arrive
    if (serviceConfigsFromProps) {
      void init();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceConfigsFromProps?.length]);

  const handleAddEnvVar = () => {
    const tempId = genTempId();
    setNewEnvVars([...newEnvVars, { tempId, key: '', value: '', isNew: true }]);
    setEditingEnvVars(new Set(editingEnvVars).add(tempId));
  };

  const deleteEnvVarById = async (itemId: string) => {
    const existing = envVars.find(v => v.id === itemId);
    if (existing?.id) {
      await deleteEnvVarMutation.mutateAsync({ id: existing.id, scope: 'service', resourceId: serviceId });
      setEditingEnvVars(new Set([...editingEnvVars].filter(id => id !== existing.id)));
      const newEdited = new Map(editedEnvVarValues);
      newEdited.delete(existing.id);
      setEditedEnvVarValues(newEdited);
      if (!envVarsFromProps) {
        await queryClient.refetchQueries({ queryKey: ['environment-variables', 'service', serviceId] });
      }
      await updateVersionMetadataOnChange();
      return;
    }
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
      if (field === 'value') {
        setEditedEnvVarValues(new Map(editedEnvVarValues).set(envVar.id, value));
      }
    } else {
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
      try {
        await updateEnvVarMutation.mutateAsync({
          id: envVar.id,
          value: envVar.value || undefined,
          scope: 'service',
          resourceId: serviceId,
        });
        setEditingEnvVars(prev => new Set([...prev].filter(id => id !== envVar.id)));
        setEditedEnvVarValues(prev => {
          const newMap = new Map(prev);
          newMap.delete(envVar.id!);
          return newMap;
        });
        if (!envVarsFromProps) {
          await queryClient.refetchQueries({ queryKey: ['environment-variables', 'service', serviceId] });
        }
        await updateVersionMetadataOnChange();
      } catch (error) {
        console.error('Error updating environment variable:', error);
        let errorMessage = 'An unknown error occurred while updating the environment variable.';
        if (error instanceof Error) {
          errorMessage = error.message;
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
      return;
    }
    
    const itemId = envVar.tempId ?? `new-${index}`;
    
    try {
      await createEnvVarMutation.mutateAsync({
        scope: 'service',
        resourceId: serviceId,
        key: envVar.key.trim(),
        value: envVar.value || undefined,
      });
      setNewEnvVars(prev => prev.filter(v => v.tempId !== itemId));
      setEditingEnvVars(prev => new Set([...prev].filter(id => id !== itemId)));
      if (!envVarsFromProps) {
        await queryClient.refetchQueries({ queryKey: ['environment-variables', 'service', serviceId] });
      }
      await updateVersionMetadataOnChange();
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
    setEditingSecrets(new Set(editingSecrets).add(tempId));
  };

  const deleteSecretById = async (itemId: string) => {
    const existing = secrets.find(s => s.id === itemId);
    if (existing?.id) {
      await deleteSecretMutation.mutateAsync({ id: existing.id, scope: 'service', resourceId: serviceId });
      setEditingSecrets(new Set([...editingSecrets].filter(id => id !== existing.id)));
      const newEdited = new Map(editedSecretValues);
      newEdited.delete(existing.id);
      setEditedSecretValues(newEdited);
      if (!secretsFromProps) {
        await queryClient.refetchQueries({ queryKey: ['secrets', 'service', serviceId] });
      }
      await updateVersionMetadataOnChange();
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
      if (field === 'value') {
        setEditedSecretValues(new Map(editedSecretValues).set(secret.id, value));
      }
    } else {
      const itemId = secret.tempId ?? `new-${index}`;
      const updated = newSecrets.map(s => (s.tempId === itemId ? { ...s, [field]: value } : s));
      setNewSecrets(updated);
    }
  };

  const handleEditSecret = (index: number) => {
    const secret = secrets[index];
    const itemId = secret.id ?? secret.tempId ?? `new-${index}`;
    setEditingSecrets(new Set(editingSecrets).add(itemId));
    if (secret.id) {
      setEditedSecretValues(prev => {
        const newMap = new Map(prev);
        newMap.set(secret.id!, '');
        return newMap;
      });
    }
  };

  const handleSaveSecretValue = async (index: number) => {
    const secret = secrets[index];
    if (secret.id) {
      try {
        await updateSecretMutation.mutateAsync({
          id: secret.id,
          value: secret.value || undefined,
          scope: 'service',
          resourceId: serviceId,
        });
        setEditingSecrets(prev => new Set([...prev].filter(id => id !== secret.id)));
        setEditedSecretValues(prev => {
          const newMap = new Map(prev);
          newMap.delete(secret.id!);
          return newMap;
        });
        if (!secretsFromProps) {
          await queryClient.refetchQueries({ queryKey: ['secrets', 'service', serviceId] });
        }
        await updateVersionMetadataOnChange();
      } catch (error) {
        console.error('Error updating secret:', error);
        let errorMessage = 'An unknown error occurred while updating the secret.';
        if (error instanceof Error) {
          errorMessage = error.message;
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
      return;
    }
    
    const itemId = secret.tempId ?? `new-${index}`;
    
    try {
      await createSecretMutation.mutateAsync({
        scope: 'service',
        resourceId: serviceId,
        key: secret.key.trim(),
        value: secret.value || undefined,
      });
      setNewSecrets(prev => prev.filter(s => s.tempId !== itemId));
      setEditingSecrets(prev => new Set([...prev].filter(id => id !== itemId)));
      if (!secretsFromProps) {
        await queryClient.refetchQueries({ queryKey: ['secrets', 'service', serviceId] });
      }
      await updateVersionMetadataOnChange();
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

  const handleSaveName = async () => {
    try {
      await updateServiceMutation.mutateAsync({
        id: serviceId,
        name: name,
      });
      setIsEditingName(false);
    } catch (error) {
      console.error('Error updating service name:', error);
      let errorMessage = 'An unknown error occurred while updating the service name.';
      if (error instanceof Error) {
        errorMessage = error.message;
        if (error.message.includes('fetch') || error.message.includes('network') || error.message.includes('Failed to fetch')) {
          errorMessage = 'Network error: Unable to connect to the server. Please check your internet connection and try again.';
        }
      }
      setErrorModal({
        isOpen: true,
        title: 'Failed to Update Service Name',
        message: errorMessage,
      });
    }
  };

  const handleSaveDescription = async () => {
    try {
      await updateServiceMutation.mutateAsync({
        id: serviceId,
        description: description || undefined,
      });
      setIsEditingDescription(false);
    } catch (error) {
      console.error('Error updating service description:', error);
      let errorMessage = 'An unknown error occurred while updating the service description.';
      if (error instanceof Error) {
        errorMessage = error.message;
        if (error.message.includes('fetch') || error.message.includes('network') || error.message.includes('Failed to fetch')) {
          errorMessage = 'Network error: Unable to connect to the server. Please check your internet connection and try again.';
        }
      }
      setErrorModal({
        isOpen: true,
        title: 'Failed to Update Service Description',
        message: errorMessage,
      });
    }
  };

  const handleSaveType = async () => {
    try {
      await updateServiceMutation.mutateAsync({
        id: serviceId,
        type: type,
      });
      setIsEditingType(false);
    } catch (error) {
      console.error('Error updating service type:', error);
      let errorMessage = 'An unknown error occurred while updating the service type.';
      if (error instanceof Error) {
        errorMessage = error.message;
        if (error.message.includes('fetch') || error.message.includes('network') || error.message.includes('Failed to fetch')) {
          errorMessage = 'Network error: Unable to connect to the server. Please check your internet connection and try again.';
        }
      }
      setErrorModal({
        isOpen: true,
        title: 'Failed to Update Service Type',
        message: errorMessage,
      });
    }
  };

  // Helper to save or update a service config (conflict-safe upsert)
  const saveServiceConfig = async (key: string, value: string) => {
    const getExistingId = (): string | undefined => {
      const fromProps = serviceConfigsFromProps?.find(c => c.key === key)?.id;
      if (fromProps) return fromProps;
      const cached = queryClient.getQueryData<any>(['service-details', serviceId]);
      const cachedId = cached?.serviceConfigs?.find((c: { key: string; id: string }) => c.key === key)?.id;
      return cachedId;
    };
    const tryUpdate = async () => {
      const existingId = getExistingId();
      if (!existingId) return false;
      await updateServiceConfigMutation.mutateAsync({
        id: existingId,
        serviceId,
        value: value || undefined,
      });
      return true;
    };
    // First attempt update if we already have the id
    const updated = await tryUpdate();
    if (updated) return;
    // Otherwise, try create
    try {
      await createServiceConfigMutation.mutateAsync({
        serviceId,
        key,
        value: value || undefined,
      });
      return;
    } catch (error) {
      const raw = error instanceof Error ? (error.message || '') : '';
      const msg = raw.toLowerCase();
      const isDuplicate =
        msg.includes('already exists') ||
        msg.includes('exists for this service') ||
        msg.includes('duplicate') ||
        msg.includes('configuration key');
      if (!isDuplicate) throw error;
      // On duplicate, refetch latest configs and update
      await queryClient.refetchQueries({ queryKey: ['service-details', serviceId] });
      const updatedOk = await tryUpdate();
      if (!updatedOk) {
        // As a final fallback, query just the config ids and try update
        try {
          const data = await graphqlQuery<{ serviceDetails: { serviceConfigs: Array<{ id: string; key: string }> } }>(
            `
              query GetServiceConfigIds($id: String!) {
                serviceDetails(id: $id) {
                  serviceConfigs { id key }
                }
              }
            `,
            { id: serviceId }
          );
          const found = data?.serviceDetails?.serviceConfigs?.find((c) => c.key === key)?.id;
          if (!found) {
            throw error;
          }
          await updateServiceConfigMutation.mutateAsync({
            id: found,
            serviceId,
            value: value || undefined,
          });
        } catch {
          throw error;
        }
      }
    }
  };

  // Validate Docker image URI
  const validateDockerImage = (image: string): string | null => {
    if (!image || image.trim() === '') {
      return 'Docker image is required';
    }
    
    const trimmed = image.trim();
    
    // Basic Docker image URI pattern:
    // - Can be: image, image:tag, registry/image, registry/image:tag, registry:port/image, registry:port/image:tag
    // - Valid characters: alphanumeric, dots, hyphens, underscores, colons, slashes
    // - Cannot start or end with a colon, dot, or slash
    // - Cannot have consecutive dots, colons, or slashes
    
    // Check for empty after trim
    if (trimmed.length === 0) {
      return 'Docker image cannot be empty';
    }
    
    // Check for invalid characters (no spaces, special chars except allowed ones)
    if (!/^[a-zA-Z0-9._/-]+(:[a-zA-Z0-9._-]+)?$/.test(trimmed)) {
      return 'Invalid Docker image format. Use format: image:tag or registry/image:tag';
    }
    
    // Check for invalid patterns
    if (trimmed.startsWith(':') || trimmed.endsWith(':') || 
        trimmed.startsWith('/') || trimmed.endsWith('/') ||
        trimmed.startsWith('.') || trimmed.endsWith('.')) {
      return 'Docker image cannot start or end with :, /, or .';
    }
    
    // Check for consecutive separators
    if (/[:/]{2,}/.test(trimmed) || /\.{2,}/.test(trimmed)) {
      return 'Docker image contains invalid consecutive separators';
    }
    
    // Check if it looks like a valid Docker image
    // Should have at least one alphanumeric character
    if (!/[a-zA-Z0-9]/.test(trimmed)) {
      return 'Docker image must contain at least one alphanumeric character';
    }
    
    // If it contains a colon, validate the tag part
    if (trimmed.includes(':')) {
      const parts = trimmed.split(':');
      if (parts.length > 2) {
        return 'Docker image can only have one tag separator (:)';
      }
      const [imagePart, tagPart] = parts;
      if (!imagePart || imagePart.trim() === '') {
        return 'Docker image name cannot be empty';
      }
      if (!tagPart || tagPart.trim() === '') {
        return 'Docker image tag cannot be empty';
      }
    }
    
    return null; // Valid
  };

  const handleSaveSource = async () => {
    try {
      // Validate Docker image if source type is docker
      if (sourceType === 'docker') {
        const dockerImageError = validateDockerImage(dockerImage);
        if (dockerImageError) {
          setErrorModal({
            isOpen: true,
            title: 'Invalid Docker Image',
            message: dockerImageError,
          });
          return;
        }
      }
      
      // Save source_type
      await saveServiceConfig('source_type', sourceType);
      
      if (sourceType === 'docker') {
        // Save docker_image, clear git configs
        await saveServiceConfig('docker_image', dockerImage.trim());
        // Clear git configs if they exist
        const gitTypeConfig = serviceConfigsFromProps?.find(c => c.key === 'git_type');
        const gitOrgConfig = serviceConfigsFromProps?.find(c => c.key === 'git_org');
        const gitRepoConfig = serviceConfigsFromProps?.find(c => c.key === 'git_repo');
        if (gitTypeConfig) {
          await updateServiceConfigMutation.mutateAsync({
            id: gitTypeConfig.id,
            serviceId: serviceId,
            value: undefined,
          });
        }
        if (gitOrgConfig) {
          await updateServiceConfigMutation.mutateAsync({
            id: gitOrgConfig.id,
            serviceId: serviceId,
            value: undefined,
          });
        }
        if (gitRepoConfig) {
          await updateServiceConfigMutation.mutateAsync({
            id: gitRepoConfig.id,
            serviceId: serviceId,
            value: undefined,
          });
        }
      } else {
        // Save git configs, clear docker_image
        await saveServiceConfig('git_type', gitType);
        await saveServiceConfig('git_org', gitOrg);
        await saveServiceConfig('git_repo', gitRepo);
        // Clear docker_image if it exists
        const dockerImageConfig = serviceConfigsFromProps?.find(c => c.key === 'docker_image');
        if (dockerImageConfig) {
          await updateServiceConfigMutation.mutateAsync({
            id: dockerImageConfig.id,
            serviceId: serviceId,
            value: undefined,
          });
        }
      }
      // Ensure latest data is loaded and update local state immediately
      await queryClient.refetchQueries({ queryKey: ['service-details', serviceId] });
      const cached = queryClient.getQueryData<any>(['service-details', serviceId]);
      const latestDockerImage =
        cached?.serviceDetails?.serviceConfigs?.find((c: { key: string; value?: string | null }) => c.key === 'docker_image')
          ?.value || null;
      if (sourceType === 'docker' && latestDockerImage !== null) {
        setDockerImage(latestDockerImage);
      }
      await updateVersionMetadataOnChange();
      setIsEditingSource(false);
    } catch (error) {
      console.error('Error updating service source:', error);
      let errorMessage = 'An unknown error occurred while updating the service source.';
      if (error instanceof Error) {
        errorMessage = error.message;
        if (error.message.includes('fetch') || error.message.includes('network') || error.message.includes('Failed to fetch')) {
          errorMessage = 'Network error: Unable to connect to the server. Please check your internet connection and try again.';
        }
      }
      setErrorModal({
        isOpen: true,
        title: 'Failed to Update Service Source',
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
      await updateServiceMutation.mutateAsync({
        id: serviceId,
        projectId: selectedProjectId,
      });
      setIsEditingProject(false);
      navigate(`/services/${serviceId}`);
    } catch (error) {
      console.error('Error updating service project:', error);
      let errorMessage = 'An unknown error occurred while updating the service project.';
      if (error instanceof Error) {
        errorMessage = error.message;
        if (error.message.includes('fetch') || error.message.includes('network') || error.message.includes('Failed to fetch')) {
          errorMessage = 'Network error: Unable to connect to the server. Please check your internet connection and try again.';
        }
      }
      setErrorModal({
        isOpen: true,
        title: 'Failed to Update Service Project',
        message: errorMessage,
      });
    }
  };

  // Port helpers
  const handleAddPort = () => {
    setPorts([...ports, { containerPort: 80, protocol: 'TCP' }]);
  };
  const handleRemovePort = (idx: number) => {
    setPorts(ports.filter((_, i) => i !== idx));
  };
  const handlePortChange = (idx: number, field: keyof PortEntry, value: string | number) => {
    setPorts(ports.map((p, i) => i === idx ? { ...p, [field]: value } : p));
  };
  const handleSavePorts = async () => {
    try {
      const cleaned = ports
        .filter(p => p.containerPort !== '')
        .map(p => ({
          name: `port-${p.containerPort}`,
          containerPort: Number(p.containerPort),
          protocol: p.protocol || 'TCP',
        }));
      const portNumbers = cleaned.map(p => p.containerPort);
      const duplicates = portNumbers.filter((v, i) => portNumbers.indexOf(v) !== i);
      if (duplicates.length > 0) {
        setErrorModal({
          isOpen: true,
          title: 'Duplicate Ports',
          message: `Port numbers must be unique. Duplicate: ${[...new Set(duplicates)].join(', ')}`,
        });
        return;
      }
      await saveServiceConfig('ports', JSON.stringify(cleaned));
      await queryClient.refetchQueries({ queryKey: ['service-details', serviceId] });
      await updateVersionMetadataOnChange();
      setIsEditingPorts(false);
    } catch (error) {
      console.error('Error saving ports:', error);
      setErrorModal({
        isOpen: true,
        title: 'Failed to Save Ports',
        message: error instanceof Error ? error.message : 'An unknown error occurred.',
      });
    }
  };

  // Downstream services handlers
  const handleAddDownstream = () => {
    setDownstreamServices([...downstreamServices, { serviceId: '', serviceName: '' }]);
  };
  const handleRemoveDownstream = (idx: number) => {
    setDownstreamServices(downstreamServices.filter((_, i) => i !== idx));
  };
  const handleDownstreamSelect = (idx: number, svcId: string, svcName: string) => {
    const updated = [...downstreamServices];
    updated[idx] = { serviceId: svcId, serviceName: svcName };
    setDownstreamServices(updated);
  };
  const handleSaveDownstream = async () => {
    try {
      const cleaned = downstreamServices.filter(d => d.serviceId);
      // Check for duplicates
      const ids = cleaned.map(d => d.serviceId);
      const dupes = ids.filter((v, i) => ids.indexOf(v) !== i);
      if (dupes.length > 0) {
        setErrorModal({
          isOpen: true,
          title: 'Duplicate Services',
          message: 'Each downstream service can only be added once.',
        });
        return;
      }
      await saveServiceConfig('downstream_services', JSON.stringify(cleaned));
      await queryClient.refetchQueries({ queryKey: ['service-details', serviceId] });
      await updateVersionMetadataOnChange();
      setIsEditingDownstream(false);
    } catch (error) {
      console.error('Error saving downstream services:', error);
      setErrorModal({
        isOpen: true,
        title: 'Failed to Save Downstream Services',
        message: error instanceof Error ? error.message : 'An unknown error occurred.',
      });
    }
  };

  // Fetch services in the same project for the downstream dropdown
  const { data: projectServicesData } = useServices(0, 100, selectedProjectId || undefined);
  const projectServices = React.useMemo(() => {
    // Exclude the current service from the list
    return (projectServicesData?.items || []).filter((s: any) => s.id !== serviceId);
  }, [projectServicesData, serviceId]);

  return (
    <Flex direction="column" gap="var(--chakra-spacing-sm)">
      <Flex direction="column" gap="var(--chakra-spacing-md)" bg="var(--chakra-colors-bg-subtle)" rounded="var(--chakra-radii-md)" p="var(--chakra-spacing-sm)">
        <Flex align="center" justify="space-between">
          <Text fontSize="md" fontWeight="bold">
            Service Information
          </Text>
          {canEdit && validateData?.overall?.master && ports.length > 0 && (
            <Button
              size="xs"
              onClick={() => {
                setIsPublishOpen(true);
              }}
            >
              Publish New Version
            </Button>
          )}
        </Flex>
        
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
                      name="service-project"
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
                <Button size="xs" onClick={handleSaveProject} disabled={updateServiceMutation.isPending}>
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
                setName(serviceName);
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

        <Flex direction="column" gap="var(--chakra-spacing-2xs)">
          <Text fontSize="sm" fontWeight="medium" color="var(--chakra-colors-fg-muted)">
            Description
          </Text>
          {isEditingDescription && canEdit ? (
            <Flex gap="var(--chakra-spacing-xs)" align="flex-start" direction="column">
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                size="sm"
                rows={3}
                flex="1"
                width="100%"
              />
              <Flex gap="var(--chakra-spacing-xs)">
                <Button size="xs" onClick={handleSaveDescription}>
                  Save
                </Button>
                <Button size="xs" variant="outline" onClick={() => {
                  setDescription(serviceDescription || '');
                  setIsEditingDescription(false);
                }}>
                  Cancel
                </Button>
              </Flex>
            </Flex>
          ) : (
            <Flex gap="var(--chakra-spacing-xs)" align="center">
              <Text fontSize="sm" flex="1">{description || 'No description'}</Text>
              {canEdit && (
                <Button size="xs" variant="ghost" onClick={() => setIsEditingDescription(true)}>
                  <HiPencil />
                </Button>
              )}
            </Flex>
          )}
        </Flex>

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
                setType(serviceType);
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
      </Flex>

      

      {/* Source Section */}
      <Flex direction="column" gap="var(--chakra-spacing-md)" bg="var(--chakra-colors-bg-subtle)" rounded="var(--chakra-radii-md)" p="var(--chakra-spacing-sm)">
        <Flex justify="space-between" align="center">
          <Text fontSize="md" fontWeight="bold">
            Source
          </Text>
          {!isEditingSource && canEdit && (
            <Button size="xs" variant="ghost" onClick={() => setIsEditingSource(true)}>
              <HiPencil />
            </Button>
          )}
        </Flex>

        {isEditingSource && canEdit ? (
          <Flex direction="column" gap="var(--chakra-spacing-md)">
            <RadioGroup.Root
              value={sourceType}
              onValueChange={(e) => setSourceType(e.value as 'docker' | 'git')}
            >
              <Flex gap="var(--chakra-spacing-md)">
                <RadioGroup.Item value="docker">
                  <RadioGroup.ItemControl />
                  <RadioGroup.ItemText>Docker Image</RadioGroup.ItemText>
                </RadioGroup.Item>
                <RadioGroup.Item value="git">
                  <RadioGroup.ItemControl />
                  <RadioGroup.ItemText>Git</RadioGroup.ItemText>
                </RadioGroup.Item>
              </Flex>
            </RadioGroup.Root>

            {sourceType === 'docker' ? (
              <Flex direction="column" gap="var(--chakra-spacing-2xs)">
                <Flex align="center" gap="var(--chakra-spacing-xs)">
                  <Text fontSize="sm" fontWeight="medium" color="var(--chakra-colors-fg-muted)">
                    Docker Image <Text as="span" color="red.500">*</Text>
                  </Text>
                  {fieldErrors.dockerImage && (
                    <Text fontSize="xs" color="red.500">{fieldErrors.dockerImage}</Text>
                  )}
                </Flex>
                <Input
                  value={dockerImage}
                  onChange={(e) => setDockerImage(e.target.value)}
                  size="sm"
                  placeholder="e.g., nginx:latest or registry.example.com/image:tag"
                  borderColor={fieldErrors.dockerImage ? 'red.500' : undefined}
                  _focus={{
                    borderColor: fieldErrors.dockerImage ? 'red.500' : undefined,
                  }}
                />
              </Flex>
            ) : (
              <Flex direction="column" gap="var(--chakra-spacing-md)">
                <Flex direction="column" gap="var(--chakra-spacing-2xs)">
                  <Text fontSize="sm" fontWeight="medium" color="var(--chakra-colors-fg-muted)">
                    Git Type
                  </Text>
                  <Combobox.Root
                    collection={gitTypesCollection}
                    onInputValueChange={(e) => gitTypesFilter(e.inputValue)}
                    value={[gitType]}
                    onValueChange={(details) => {
                      if (details.value.length > 0) {
                        setGitType(details.value[0] as 'github' | 'bitbucket' | 'gitlab');
                      }
                    }}
                    width="100%"
                  >
                    <Combobox.Control>
                      <Combobox.Input
                        placeholder="Select Git type"
                        name="git-type"
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
                          <Combobox.Empty>No Git types found</Combobox.Empty>
                          {gitTypesCollection.items.map((item) => (
                            <Combobox.Item item={item} key={item.value}>
                              {item.label}
                              <Combobox.ItemIndicator />
                            </Combobox.Item>
                          ))}
                        </Combobox.Content>
                      </Combobox.Positioner>
                    </Portal>
                  </Combobox.Root>
                </Flex>

                <Flex direction="column" gap="var(--chakra-spacing-2xs)">
                  <Text fontSize="sm" fontWeight="medium" color="var(--chakra-colors-fg-muted)">
                    Organization
                  </Text>
                  <Combobox.Root
                    collection={gitOrgsCollection}
                    onInputValueChange={(e) => gitOrgsFilter(e.inputValue)}
                    value={gitOrg ? [gitOrg] : []}
                    onValueChange={(details) => {
                      if (details.value.length > 0) {
                        setGitOrg(details.value[0]);
                        setGitRepo(''); // Reset repo when org changes
                      } else {
                        setGitOrg('');
                        setGitRepo('');
                      }
                    }}
                    width="100%"
                    disabled={gitOrganizationsLoading}
                  >
                    <Combobox.Control>
                      <Combobox.Input
                        placeholder={gitOrganizationsLoading ? "Loading organizations..." : "Select organization"}
                        name="git-org"
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
                          <Combobox.Empty>
                            {gitOrganizationsLoading ? "Loading organizations..." : "No organizations found"}
                          </Combobox.Empty>
                          {gitOrgsCollection.items.map((item) => (
                            <Combobox.Item item={item} key={item.value}>
                              {item.label}
                              <Combobox.ItemIndicator />
                            </Combobox.Item>
                          ))}
                        </Combobox.Content>
                      </Combobox.Positioner>
                    </Portal>
                  </Combobox.Root>
                </Flex>

                <Flex direction="column" gap="var(--chakra-spacing-2xs)">
                  <Text fontSize="sm" fontWeight="medium" color="var(--chakra-colors-fg-muted)">
                    Repository
                  </Text>
                  <Combobox.Root
                    collection={gitReposCollection}
                    onInputValueChange={(e) => gitReposFilter(e.inputValue)}
                    value={gitRepo ? [gitRepo] : []}
                    onValueChange={(details) => {
                      if (details.value.length > 0) {
                        setGitRepo(details.value[0]);
                      } else {
                        setGitRepo('');
                      }
                    }}
                    width="100%"
                    disabled={!gitOrg || gitRepositoriesLoading}
                  >
                    <Combobox.Control>
                      <Combobox.Input
                        placeholder={
                          !gitOrg 
                            ? "Select organization first" 
                            : gitRepositoriesLoading 
                            ? "Loading repositories..." 
                            : "Select repository"
                        }
                        name="git-repo"
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
                          <Combobox.Empty>
                            {!gitOrg 
                              ? "Select an organization first" 
                              : gitRepositoriesLoading 
                              ? "Loading repositories..." 
                              : "No repositories found"}
                          </Combobox.Empty>
                          {gitReposCollection.items.map((item) => (
                            <Combobox.Item item={item} key={item.value}>
                              {item.label}
                              <Combobox.ItemIndicator />
                            </Combobox.Item>
                          ))}
                        </Combobox.Content>
                      </Combobox.Positioner>
                    </Portal>
                  </Combobox.Root>
                </Flex>
              </Flex>
            )}

            <Flex gap="var(--chakra-spacing-xs)">
              <Button 
                size="xs" 
                onClick={handleSaveSource}
                disabled={sourceType === 'docker' && (dockerImage.trim() === '' || validateDockerImage(dockerImage) !== null)}
              >
                Save
              </Button>
              <Button size="xs" variant="outline" onClick={() => {
                // Reset to original values
                const originalSourceType = getConfigValue('source_type');
                setSourceType((originalSourceType === 'git' ? 'git' : 'docker') as 'docker' | 'git');
                setDockerImage(getConfigValue('docker_image') || '');
                const originalGitType = getConfigValue('git_type');
                if (originalGitType === 'github' || originalGitType === 'bitbucket' || originalGitType === 'gitlab') {
                  setGitType(originalGitType);
                }
                setGitOrg(getConfigValue('git_org') || '');
                setGitRepo(getConfigValue('git_repo') || '');
                setIsEditingSource(false);
              }}>
                Cancel
              </Button>
            </Flex>
          </Flex>
        ) : (
          <Flex direction="column" gap="var(--chakra-spacing-md)" >
            <Flex direction="column">
              <Text fontSize="sm" fontWeight="medium" color="var(--chakra-colors-fg-muted)">
                Source Type
              </Text>
              <Text fontSize="sm">{sourceType === 'docker' ? 'Docker Image' : 'Git'}</Text>
            </Flex>
              {sourceType === 'docker' ? (
                <Flex direction="column">
                  <Flex align="center" gap="var(--chakra-spacing-xs)">
                    <Text fontSize="sm" fontWeight="medium" color="var(--chakra-colors-fg-muted)">
                      Docker Image
                    </Text>
                    {fieldErrors.dockerImage && (
                      <Text fontSize="xs" color="red.500">{fieldErrors.dockerImage}</Text>
                    )}
                  </Flex>
                  <Text fontSize="sm">{dockerImage || 'No docker image configured'}</Text>
                </Flex>              
            ) : (
              <>
                <Text fontSize="sm" fontWeight="medium" color="var(--chakra-colors-fg-muted)">
                  Git Type
                </Text>
                <Text fontSize="sm">{gitType.charAt(0).toUpperCase() + gitType.slice(1)}</Text>
                <Text fontSize="sm" fontWeight="medium" color="var(--chakra-colors-fg-muted)">
                  Organization
                </Text>
                <Text fontSize="sm">{gitOrg || 'No organization configured'}</Text>
                <Text fontSize="sm" fontWeight="medium" color="var(--chakra-colors-fg-muted)">
                  Repository
                </Text>
                <Text fontSize="sm">{gitRepo || 'No repository configured'}</Text>
              </>
            )}
            </Flex>          
        )}
      </Flex>

      {/* Ports Section */}
      <Flex direction="column" gap="var(--chakra-spacing-md)" bg="var(--chakra-colors-bg-subtle)" rounded="var(--chakra-radii-md)" p="var(--chakra-spacing-sm)">
        <Flex justify="space-between" align="center">
          <Text fontSize="md" fontWeight="bold">
            Ports
          </Text>
          {!isEditingPorts && canEdit && (
            <Button size="xs" variant="ghost" onClick={() => setIsEditingPorts(true)}>
              <HiPencil />
            </Button>
          )}
        </Flex>

        {isEditingPorts && canEdit ? (
          <Flex direction="column" gap="var(--chakra-spacing-sm)">
            {ports.length === 0 && (
              <Text fontSize="sm" color="var(--chakra-colors-fg-muted)" fontStyle="italic">
                No ports configured. Click "Add Port" to get started.
              </Text>
            )}
            {ports.map((port, idx) => (
              <Flex key={idx} gap="var(--chakra-spacing-xs)" align="center">
                <Input
                  placeholder="Port"
                  type="number"
                  value={port.containerPort}
                  onChange={(e) => handlePortChange(idx, 'containerPort', e.target.value ? Number(e.target.value) : '')}
                  size="sm"
                  width="100px"
                />
                <select
                  value="TCP"
                  disabled
                  style={{
                    fontSize: 'var(--chakra-fontSizes-sm)',
                    padding: '4px 8px',
                    borderRadius: 'var(--chakra-radii-sm)',
                    border: '1px solid var(--chakra-colors-border)',
                    background: 'var(--chakra-colors-bg)',
                    height: '32px',
                    opacity: 0.6,
                    cursor: 'not-allowed',
                  }}
                >
                  <option value="TCP">TCP</option>
                </select>
                <Button size="xs" variant="ghost" colorPalette="red" onClick={() => handleRemovePort(idx)}>
                  <HiTrash />
                </Button>
              </Flex>
            ))}
            <Flex gap="var(--chakra-spacing-xs)">
              <Button size="xs" variant="outline" onClick={handleAddPort}>
                <HiPlus /> Add Port
              </Button>
            </Flex>
            <Flex gap="var(--chakra-spacing-xs)">
              <Button size="xs" onClick={handleSavePorts}>
                Save
              </Button>
              <Button size="xs" variant="outline" onClick={() => {
                setPorts(parsePorts());
                setIsEditingPorts(false);
              }}>
                Cancel
              </Button>
            </Flex>
          </Flex>
        ) : (
          <Flex direction="column" gap="var(--chakra-spacing-xs)">
            {ports.length === 0 ? (
              <Text fontSize="sm" color="var(--chakra-colors-fg-muted)" fontStyle="italic">
                No ports configured
              </Text>
            ) : (
              ports.map((port, idx) => (
                <Flex key={idx} gap="var(--chakra-spacing-sm)" align="center">
                  <Text fontSize="sm">{port.containerPort}</Text>
                  <Text fontSize="xs" color="var(--chakra-colors-fg-muted)">/{port.protocol}</Text>
                </Flex>
              ))
            )}
          </Flex>
        )}
      </Flex>

      {/* Downstream Services section */}
      <Flex direction="column" gap="var(--chakra-spacing-md)" bg="var(--chakra-colors-bg-subtle)" rounded="var(--chakra-radii-md)" p="var(--chakra-spacing-sm)">
        <Flex justify="space-between" align="center">
          <Text fontSize="md" fontWeight="bold">
            Downstream Services
          </Text>
          {canEdit && !isEditingDownstream && (
            <Button size="xs" variant="ghost" onClick={() => setIsEditingDownstream(true)}>
              <HiPencil />
            </Button>
          )}
        </Flex>
        {isEditingDownstream ? (
          <Flex direction="column" gap="var(--chakra-spacing-xs)">
            {downstreamServices.map((ds, idx) => (
              <Flex key={idx} gap="var(--chakra-spacing-xs)" align="center">
                <select
                  value={ds.serviceId}
                  onChange={(e) => {
                    const selected = projectServices.find((s: any) => s.id === e.target.value);
                    handleDownstreamSelect(idx, e.target.value, selected?.name || '');
                  }}
                  style={{
                    flex: 1,
                    fontSize: 'var(--chakra-fontSizes-sm)',
                    padding: '4px 8px',
                    borderRadius: 'var(--chakra-radii-sm)',
                    border: '1px solid var(--chakra-colors-border)',
                    background: 'var(--chakra-colors-bg)',
                    height: '32px',
                  }}
                >
                  <option value="">Select service...</option>
                  {projectServices.map((s: any) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <Button size="xs" variant="ghost" colorPalette="red" onClick={() => handleRemoveDownstream(idx)}>
                  <HiTrash />
                </Button>
              </Flex>
            ))}
            <Flex gap="var(--chakra-spacing-xs)">
              <Button size="xs" variant="outline" onClick={handleAddDownstream}>
                <HiPlus /> Add Service
              </Button>
            </Flex>
            <Flex gap="var(--chakra-spacing-xs)">
              <Button size="xs" onClick={handleSaveDownstream}>
                Save
              </Button>
              <Button size="xs" variant="outline" onClick={() => {
                setDownstreamServices(parseDownstream());
                setIsEditingDownstream(false);
              }}>
                Cancel
              </Button>
            </Flex>
          </Flex>
        ) : (
          <Flex direction="column" gap="var(--chakra-spacing-xs)">
            {downstreamServices.length === 0 ? (
              <Text fontSize="sm" color="var(--chakra-colors-fg-muted)" fontStyle="italic">
                No downstream services configured
              </Text>
            ) : (
              downstreamServices.map((ds, idx) => (
                <Text key={idx} fontSize="sm">{ds.serviceName || ds.serviceId}</Text>
              ))
            )}
          </Flex>
        )}
      </Flex>

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
      
      {/* Publish New Version Drawer */}
      <Drawer.Root open={isPublishOpen} onOpenChange={(e) => setIsPublishOpen(e.open)} placement="end" size="sm">
        <Drawer.Backdrop />
        <Drawer.Positioner>
          <Drawer.Content>
            <Drawer.Header style={{ boxShadow: 'var(--chakra-shadows-md)', padding: 'var(--chakra-spacing-sm)'}}>
              <Flex justify="space-between" align="center" width="100%">
                <Drawer.Title>Review Changes</Drawer.Title>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => setIsPublishOpen(false)}
                  aria-label="Close drawer"
                  mr="var(--chakra-spacing-sm)"
                >
                  <HiXMark />
                </Button>
              </Flex>
            </Drawer.Header>
            <Drawer.Body style={{ paddingLeft: 'var(--chakra-spacing-sm)', marginTop: 'var(--chakra-spacing-md)'}}>
              {validateLoading ? (
                <Text fontSize="sm" color="var(--chakra-colors-fg-muted)">Loading...</Text>
              ) : (
                <Flex direction="column" gap="var(--chakra-spacing-xs)">
                  {validateData && !validateData.overall?.master && (
                    <Box bg="green.50" rounded="var(--chakra-radii-sm)" p="var(--chakra-spacing-2xs)">
                      <Text fontSize="xs" color="green.700" fontWeight="medium">
                        No changes from previous version.
                      </Text>
                    </Box>
                  )}
                  {ports.length === 0 && (
                    <Box bg="red.50" rounded="var(--chakra-radii-sm)" p="var(--chakra-spacing-2xs)">
                      <Text fontSize="xs" color="red.700" fontWeight="medium">
                        At least one port is required to publish a new version.
                      </Text>
                    </Box>
                  )}
                  {validateData?.matchingVersionLabels && validateData.matchingVersionLabels.length > 0 && (
                    <Box bg="yellow.50" rounded="var(--chakra-radii-sm)" p="var(--chakra-spacing-2xs)">
                      <Text fontSize="xs" color="yellow.700">
                        Matches existing version{validateData.matchingVersionLabels.length > 1 ? 's' : ''}: {validateData.matchingVersionLabels.join(', ')}
                      </Text>
                    </Box>
                  )}
                  {renderSectionBox('Config', validateData?.config)}
                  {renderSectionBox('Variables', validateData?.variables)}
                  {renderSectionBox('Secrets', validateData?.secrets)}
                </Flex>
              )}
            </Drawer.Body>
            <Drawer.Footer>
              <Flex justify="flex-end" gap="var(--chakra-spacing-sm)" width="100%">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsPublishOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={async () => {
                    try {
                      await publishMutation.mutateAsync({ serviceId });
                      setIsPublishOpen(false);
                      // Re-validate so button hides if no more changes
                      await queryClient.invalidateQueries({ queryKey: ['validate-new-service-version', serviceId] });
                    } catch {
                      // no-op
                    }
                  }}
                  loading={publishMutation.isPending}
                  disabled={
                    validateLoading ||
                    publishMutation.isPending ||
                    !(validateData?.overall?.master) ||
                    ports.length === 0
                  }
                  colorPalette="primary"
                >
                  Publish
                </Button>
              </Flex>
            </Drawer.Footer>
          </Drawer.Content>
        </Drawer.Positioner>
      </Drawer.Root>
    </Flex>
  );
}
