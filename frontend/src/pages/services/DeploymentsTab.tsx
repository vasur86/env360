import * as React from 'react';
import { Box, Flex, Text, Badge, Button, Drawer, Combobox, useListCollection, useFilter, Portal, Timeline, Tabs, Grid } from '@chakra-ui/react';
import StepDetailDialog from '../../components/StepDetailDialog';
import { useServiceDeployments, useServiceVersions, useServiceDetails, useEnvironments, useDeployService, type DeploymentRecord, type ServiceVersionRecord, type DeployStep, type DownstreamOverride } from '../../api/client';
import { useQueryClient } from '@tanstack/react-query';
import { graphqlQuery } from '../../api/client';
import { useSearchParams } from 'react-router-dom';
import { HiXMark } from 'react-icons/hi2';
import { MdOutput, MdOutlineErrorOutline } from 'react-icons/md';
import { FaRunning, FaCheck} from 'react-icons/fa';
import { FaPause, FaXmark } from 'react-icons/fa6';

function statusToColor(status?: string): string {
  const s = (status || '').toLowerCase();
  if (['succeeded', 'success'].includes(s)) return 'green';
  if (['failed', 'failure', 'error'].includes(s)) return 'red';
  if (['pending', 'queued', 'enqueued', 'created'].includes(s)) return 'yellow';
  if (['running', 'in_progress', 'processing'].includes(s)) return 'blue';
  if (s === 'not_started') return 'gray';
  return 'gray';
}

const TERMINAL_STATUSES = new Set(['error', 'success', 'succeeded', 'failed', 'failure']);

export default function DeploymentsTab({ serviceId, autoOpenNew, onCloseNew }: { serviceId: string; autoOpenNew?: boolean; onCloseNew?: () => void }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [deploymentsData, setDeploymentsData] = React.useState<DeploymentRecord[]>([]);
  // Determine if any deployment is still in-progress (non-terminal status)
  const shouldPoll = React.useMemo(() => {
    return deploymentsData.some((d) => !TERMINAL_STATUSES.has((d.status || '').toLowerCase()));
  }, [deploymentsData]);
  const { data: deployments, isLoading: loadingDeployments } = useServiceDeployments(serviceId, shouldPoll ? 5000 : false);
  // Keep local state in sync
  React.useEffect(() => {
    if (deployments) setDeploymentsData(deployments);
  }, [deployments]);

  // Auto-open a specific deployment from `did` query param (e.g. linked from Versions tab)
  const didHandledRef = React.useRef(false);
  React.useEffect(() => {
    if (didHandledRef.current) return;
    const did = searchParams.get('did');
    if (did && deployments && deployments.length > 0) {
      const match = deployments.find((d) => d.id === did);
      if (match) {
        didHandledRef.current = true;
        setViewDeployment(match);
        setIsDrawerOpen(true);
        // Remove did from URL to avoid re-opening on re-render
        const params = new URLSearchParams(searchParams);
        params.delete('did');
        setSearchParams(params, { replace: true });
      }
    }
  }, [searchParams, deployments]);
  const { data: versions, isLoading: loadingVersions } = useServiceVersions(serviceId);
  const { data: serviceDetails } = useServiceDetails(serviceId);
  const projectIdForService = serviceDetails?.service?.projectId || serviceDetails?.service?.project?.id || '';
  const { data: envListData } = useEnvironments(0, 100, projectIdForService || undefined);
  const envs = (envListData?.items || []).filter((e: any) => projectIdForService ? e.projectId === projectIdForService : false);

  const queryClient = useQueryClient();
  const [isDrawerOpen, setIsDrawerOpen] = React.useState<boolean>(!!autoOpenNew);
  const [viewDeployment, setViewDeployment] = React.useState<DeploymentRecord | null>(null);
  const [toast, setToast] = React.useState<{ message: string; status: 'success' | 'error' | null }>({ message: '', status: null });
  React.useEffect(() => {
    if (autoOpenNew) setIsDrawerOpen(true);
  }, [autoOpenNew]);
  const closeDrawer = () => {
    setIsDrawerOpen(false);
    setViewDeployment(null);
    setSelectedEnv('');
    setSelectedVersionId('');
    setDsOverrides({});
    // Reset combobox filters so all items are visible on next open
    filter('');
    verFilter('');
    if (onCloseNew) onCloseNew();
  };

  // Environment selection
  const { contains } = useFilter({ sensitivity: 'base' });
  const { collection, filter, set } = useListCollection<{ value: string; label: string }>({
    initialItems: [],
    filter: contains,
  });
  const envById = React.useMemo(() => {
    const m = new Map<string, any>();
    (envs || []).forEach((e: any) => m.set(e.id, e));
    return m;
  }, [envs]);
  // Compute dropdown options; avoid unnecessary state updates to prevent re-render loops
  const envOptions = React.useMemo(() => {
    if (!projectIdForService) return [];
    const order = ['development', 'testing', 'staging', 'production'];
    const list = (envs || []).slice();
    list.sort((a: any, b: any) => {
      const at = String(a?.type || '').toLowerCase();
      const bt = String(b?.type || '').toLowerCase();
      return order.indexOf(at) - order.indexOf(bt);
    });
    return list.map((e: any) => ({ value: e.id, label: e.name || e.id }));
  }, [envs, projectIdForService]);
  const prevOptionsKeyRef = React.useRef<string>('');
  React.useEffect(() => {
    const key = JSON.stringify(envOptions);
    if (key !== prevOptionsKeyRef.current) {
      prevOptionsKeyRef.current = key;
      set(envOptions);
    }
  }, [envOptions, set]);
  const [selectedEnv, setSelectedEnv] = React.useState<string>('');
  // Version selection
  const versionItems = React.useMemo(() => {
    const list = (versions || []).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return list.map((v) => ({ value: v.id, label: v.versionLabel }));
  }, [versions]);
  const { collection: verCollection, filter: verFilter, set: setVerCollection } = useListCollection<{ value: string; label: string }>({
    initialItems: [],
    filter: contains,
  });
  React.useEffect(() => {
    setVerCollection(versionItems);
  }, [versionItems, setVerCollection]);
  const [selectedVersionId, setSelectedVersionId] = React.useState<string>('');
  const [proceedOverride, setProceedOverride] = React.useState<boolean>(false);

  // Downstream version overrides
  const downstreamConfig: Array<{ serviceId: string; serviceName: string }> = React.useMemo(() => {
    const cfgs = serviceDetails?.serviceConfigs || [];
    const dsCfg = cfgs.find((c: any) => c.key === 'downstream_services');
    if (!dsCfg?.value) return [];
    try { return JSON.parse(dsCfg.value); } catch { return []; }
  }, [serviceDetails]);
  const [dsOverrides, setDsOverrides] = React.useState<Record<string, string>>({});
  React.useEffect(() => {
    // Reset override confirmation when selections change
    setProceedOverride(false);
  }, [selectedEnv, selectedVersionId]);
  const existingDeployment = React.useMemo(() => {
    if (!deployments || !selectedEnv || !selectedVersionId) return undefined;
    return deployments.find((d) => d.environmentId === selectedEnv && d.versionId === selectedVersionId);
  }, [deployments, selectedEnv, selectedVersionId]);
  const canDeploy = !!selectedEnv && !!selectedVersionId && (!existingDeployment || proceedOverride);
  // Workflow status for viewed deployment
  const [wfDetails, setWfDetails] = React.useState<{
    workflowId?: string;
    workflowStatus?: string;
    steps?: Array<{
      functionId: number;
      functionName: string;
      status: string;
      output?: any;
      error?: any;
      startedAtEpochMs?: string | null;
      completedAtEpochMs?: string | null;
    }>;
  } | null>(null);

  // Summary helpers
  const formatDuration = React.useCallback((ms: number) => {
    if (!isFinite(ms) || ms < 0) return '-';
    const s = Math.floor(ms / 1000);
    const hours = Math.floor(s / 3600);
    const minutes = Math.floor((s % 3600) / 60);
    const seconds = s % 60;
    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
  }, []);
  const summaryStartMs = React.useMemo(() => {
    const list = (wfDetails?.steps || [])
      .map((st) => (st.startedAtEpochMs ? Number(st.startedAtEpochMs) : NaN))
      .filter((n) => Number.isFinite(n));
    return list.length ? Math.min(...list) : undefined;
  }, [wfDetails?.steps]);
  const summaryEndMs = React.useMemo(() => {
    const list = (wfDetails?.steps || [])
      .map((st) => (st.completedAtEpochMs ? Number(st.completedAtEpochMs) : NaN))
      .filter((n) => Number.isFinite(n));
    return list.length ? Math.max(...list) : undefined;
  }, [wfDetails?.steps]);
  const summaryDuration = React.useMemo(() => {
    if (summaryStartMs == null || !Number.isFinite(summaryStartMs)) return undefined;
    const end = Number.isFinite(summaryEndMs as any) ? (summaryEndMs as number) : Date.now();
    return end - (summaryStartMs as number);
  }, [summaryStartMs, summaryEndMs]);

  // Steps from the deployment record (empty if no deployment selected or no steps stored)
  const DEPLOY_STEPS: DeployStep[] = React.useMemo(() => {
    return viewDeployment?.steps && viewDeployment.steps.length > 0 ? viewDeployment.steps : [];
  }, [viewDeployment?.steps]);
  const getStepStatus = React.useCallback((functionName: string) => {
    const s = (wfDetails?.steps || []).find(
      (st) => (st.functionName || '').toLowerCase() === (functionName || '').toLowerCase()
    );
    return s?.status || 'NOT_STARTED';
  }, [wfDetails?.steps]);
  const getStepData = React.useCallback((functionName: string) => {
    return (wfDetails?.steps || []).find(
      (st) => (st.functionName || '').toLowerCase() === (functionName || '').toLowerCase()
    );
  }, [wfDetails?.steps]);
  // Set of function names that exist in the current workflow steps
  const workflowFnSet = React.useMemo(() => {
    return new Set((wfDetails?.steps || []).map((st) => (st.functionName || '').toLowerCase()));
  }, [wfDetails?.steps]);  
  React.useEffect(() => {
    let cancelled = false;
    const fetchWorkflow = async () => {
      const wid = viewDeployment?.workflowUuid;
      if (!viewDeployment || !wid) { setWfDetails(null); return; }
      try {
        const query = `
          query Workflow($workflowId: String!) {
            workflow(workflowId: $workflowId) {
              workflowId
              workflowStatus
              steps {
                functionId
                functionName
                status
                output
                error
                startedAtEpochMs
                completedAtEpochMs
              }
            }
          }
        `;
        const res = await graphqlQuery<{ workflow: { workflowId: string; workflowStatus: string; steps: any[] } }>(query, { workflowId: wid });
        if (!cancelled) {
          setWfDetails(res?.workflow || null);
        }
      } catch {
        if (!cancelled) setWfDetails(null);
      }
    };
    fetchWorkflow();
    // Poll every 15s while status is not a terminal state (ERROR / SUCCESS)
    const status = (wfDetails?.workflowStatus || '').toUpperCase();
    const isTerminal = status === 'ERROR' || status === 'SUCCESS';
    let interval: number | undefined;
    if (!isTerminal && viewDeployment?.workflowUuid) {
      interval = window.setInterval(fetchWorkflow, 5000);
    }
    return () => { cancelled = true; if (interval) window.clearInterval(interval); };
  }, [viewDeployment, wfDetails?.workflowStatus]);


  const versionLabelById = React.useMemo(() => {
    const map = new Map<string, string>();
    (versions || []).forEach((v: ServiceVersionRecord) => {
      map.set(v.id, v.versionLabel);
    });
    return map;
  }, [versions]);
  const deployService = useDeployService();
  // Tabs: All + environments (ordered: development, testing, staging, production)
  const [activeEnvTab, setActiveEnvTab] = React.useState<string>('all');
  const orderedEnvIds = React.useMemo(() => {
    const order = ['development', 'testing', 'staging', 'production'];
    const envList = (envs || []).slice();
    envList.sort((a: any, b: any) => order.indexOf(String(a?.type || '').toLowerCase()) - order.indexOf(String(b?.type || '').toLowerCase()));
    return envList.map((e: any) => e.id);
  }, [envs]);
  const listForTab = React.useMemo(() => {
    if (!deployments) return [];
    if (activeEnvTab === 'all') return deployments;
    return deployments.filter((d) => d.environmentId === activeEnvTab);
  }, [deployments, activeEnvTab]);
  const displayList = React.useMemo(() => {
    return (listForTab || []).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [listForTab]);

  if (loadingDeployments || loadingVersions) {
    return <Text fontSize="sm" color="var(--chakra-colors-fg-muted)">Loading deployments...</Text>;
  }

  return (
    <Flex direction="column" gap="var(--chakra-spacing-xs)"  bg="var(--chakra-colors-bg-subtle)" rounded="var(--chakra-radii-md)" p="var(--chakra-spacing-sm)" mt="var(--chakra-spacing-sm)" >            
      {toast.status && (
        <Box
          position="fixed"
          top="80px"
          right="20px"
          zIndex={1000}
          bg={toast.status === 'success' ? 'green.50' : 'red.50'}
          border="1px solid"
          borderColor={toast.status === 'success' ? 'green.200' : 'red.200'}
          color={toast.status === 'success' ? 'green.700' : 'red.700'}
          p="var(--chakra-spacing-xs)"
          borderRadius="var(--chakra-radii-sm)"
          boxShadow="var(--chakra-shadows-md)"
        >
          <Text fontSize="sm" fontWeight="bold">{toast.status === 'success' ? 'Success' : 'Error'}</Text>
          <Text fontSize="xs">{toast.message}</Text>
        </Box>
      )}
      <Button size="xs" alignSelf="flex-end" onClick={() => { setViewDeployment(null); setIsDrawerOpen(true); }}>New Deployment</Button>
      <Tabs.Root value={activeEnvTab} onValueChange={(e) => setActiveEnvTab(e.value)} size="sm" variant="outline">
        <Tabs.List>
          <Tabs.Trigger value="all">All</Tabs.Trigger>
          {orderedEnvIds.map((eid) => (
            <Tabs.Trigger key={eid} value={eid}>
              {envById.get(eid)?.name || eid}
            </Tabs.Trigger>
          ))}
          <Tabs.Indicator />
        </Tabs.List>      
      </Tabs.Root>
      {/* Tab content: deployments list (or empty state) for the active tab */}
      {displayList.length === 0 ? (
        <Flex align="center" justify="center" minH="120px">
          <Text fontSize="md" color="var(--chakra-colors-fg-muted)">No deployments yet.</Text>
        </Flex>
      ) : (
        <Box mt="var(--chakra-spacing-xs)" display="flex" flexDirection="column" gap="var(--chakra-spacing-xs)">
          {displayList.map((d: DeploymentRecord) => {
            const versionLabel = versionLabelById.get(d.versionId) || d.versionId;
            const color = statusToColor(d.status);
            return (
              <Flex
                key={d.id}
                align="center"
                justify="space-between"
                p="var(--chakra-spacing-xs)"
                border="1px solid var(--chakra-colors-border)"
                borderRadius="var(--chakra-radii-sm)"
                bg="var(--chakra-colors-white)"
                cursor="pointer"
                onClick={() => { setViewDeployment(d); setIsDrawerOpen(true); }}
                _hover={{ boxShadow: 'var(--chakra-shadows-md)' }}
              >
                <Flex direction="column">
                  <Text fontSize="sm" fontWeight="bold">Version {versionLabel}{d.subversionIndex > 0 ? <Text as="span" fontSize="sm" fontWeight="normal" color="gray.500"> ({d.subversionIndex}) - redeployed</Text> : ''}</Text>
                  <Text fontSize="xs" color="var(--chakra-colors-fg-muted)">Started: {new Date(d.createdAt).toLocaleString()}</Text>
                  {d.completedAt && (
                    <Text fontSize="xs" color="var(--chakra-colors-fg-muted)">Completed: {new Date(d.completedAt).toLocaleString()}</Text>
                  )}
                </Flex>
                <Badge
                  size="sm"
                  colorPalette={color}
                  variant="subtle"
                  fontWeight="bold"
                  w="fit-content"
                  alignSelf="flex-start"
                >
                  {d.status}
                </Badge>
              </Flex>
            );
          })}
        </Box>
      )}      
      <Drawer.Root open={isDrawerOpen} onOpenChange={(e) => { if (!e.open) closeDrawer(); }} size="sm">
        <Drawer.Backdrop />
        <Drawer.Positioner>
          <Drawer.Content style={{ boxShadow: 'var(--chakra-shadows-md)'  }}>
            <Drawer.Header style={{ boxShadow: 'var(--chakra-shadows-md)', padding: 'var(--chakra-spacing-sm)'}}>
              <Flex justify="space-between" align="center" width="100%">
                <Drawer.Title>{viewDeployment ? 'Deployment Details' : 'New Deployment'}</Drawer.Title>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => closeDrawer()}                  
                  aria-label="Close drawer"
                  mr="var(--chakra-spacing-sm)"
                >
                  <HiXMark />
                </Button>
              </Flex>
            </Drawer.Header>
            <Drawer.Body style={{ paddingLeft: 'var(--chakra-spacing-sm)', 
                        marginTop: 'var(--chakra-spacing-md)',                         
                        paddingBottom:"var(--chakra-spacing-xl)", 
                        paddingRight: viewDeployment ? "var(--chakra-spacing-xs)" : "var(--chakra-spacing-lg)",
              }}>
              {!viewDeployment ? (
              <Timeline.Root size="md" colorPalette="gray" variant="subtle" style={{ paddingLeft: 'var(--chakra-spacing-xs)' }}>
                <Timeline.Item>
                  <Timeline.Connector>
                    <Timeline.Separator />
                    <Timeline.Indicator bg="blue.100" color="blue.700"><FaRunning /></Timeline.Indicator>
                  </Timeline.Connector>
                  <Timeline.Content>
                    <Timeline.Title>Version / Environment</Timeline.Title>
                    <Timeline.Description>
                      {/* Version selection */}
                      <Combobox.Root
                        value={selectedVersionId ? [selectedVersionId] : []}
                        onValueChange={(d: { value: string[] }) => setSelectedVersionId(d.value[0] || '')}
                        onInputValueChange={(e) => verFilter(e.inputValue)}
                        collection={verCollection}
                      >
                        <Combobox.Control>
                          <Combobox.Input placeholder="Select version" />
                          <Combobox.IndicatorGroup>
                            <Combobox.ClearTrigger />
                            <Combobox.Trigger />
                          </Combobox.IndicatorGroup>
                        </Combobox.Control>
                        <Portal>
                          <Combobox.Positioner>
                            <Combobox.Content>
                              <Combobox.Empty>No versions</Combobox.Empty>
                              {verCollection.items.map((it) => (
                                <Combobox.Item key={it.value} item={it}>
                                  {it.label}
                                  <Combobox.ItemIndicator />
                                </Combobox.Item>
                              ))}
                            </Combobox.Content>
                          </Combobox.Positioner>
                        </Portal>
                      </Combobox.Root>
                    </Timeline.Description>
                    <Timeline.Description>
                      {/* Environment selection */}
                      <Combobox.Root
                        value={selectedEnv ? [selectedEnv] : []}
                        onValueChange={(d: { value: string[] }) => setSelectedEnv(d.value[0] || '')}
                        onInputValueChange={(e) => filter(e.inputValue)}
                        collection={collection}
                      >
                        <Combobox.Control>
                          <Combobox.Input placeholder="Select environment" />
                          <Combobox.IndicatorGroup>
                            <Combobox.ClearTrigger />
                            <Combobox.Trigger />
                          </Combobox.IndicatorGroup>
                        </Combobox.Control>
                        <Portal>
                          <Combobox.Positioner>
                            <Combobox.Content>
                              <Combobox.Empty>No environments</Combobox.Empty>
                            {collection.items.map((it) => {
                              const env = envById.get(it.value);
                              const type = env?.type || '';
                              return (
                                <Combobox.Item key={it.value} item={it}>
                                  <Flex align="center" justify="space-between" gap="var(--chakra-spacing-sm)" width="100%">
                                    <Text>{it.label}</Text>
                                    {type && (
                                      <Badge size="xs" variant="subtle" fontWeight="bold">
                                        {String(type)}
                                      </Badge>
                                    )}
                                  </Flex>
                                  <Combobox.ItemIndicator />
                                </Combobox.Item>
                              );
                            })}
                            </Combobox.Content>
                          </Combobox.Positioner>
                        </Portal>
                      </Combobox.Root>
                    </Timeline.Description>
                    <Timeline.Description>
                      {/* Existing deployment status or readiness message */}
                      {selectedVersionId && selectedEnv ? (
                        existingDeployment ? (
                          <Flex direction="column" gap="2px" mt="var(--chakra-spacing-2xs)">
                            <Text fontSize="xs" color="var(--chakra-colors-fg-muted)">
                              Deployment exists for this version/environment. Status: {existingDeployment.status}
                            </Text>
                            <Flex align="center" gap="6px">
                              <input
                                type="checkbox"
                                checked={proceedOverride}
                                onChange={(e) => setProceedOverride(e.currentTarget.checked)}
                                style={{ width: '12px', height: '12px', cursor: 'pointer' }}
                              />
                              <Text fontSize="xs" color="var(--chakra-colors-fg-muted)">
                                Proceed anyway (override)
                              </Text>
                            </Flex>
                          </Flex>
                        ) : (
                          <Text fontSize="xs" color="var(--chakra-colors-fg-muted)" mt="var(--chakra-spacing-2xs)">
                            New version ready to be deployed.
                          </Text>
                        )
                      ) : null}
                    </Timeline.Description>
                  {/* Downstream version overrides */}
                  {downstreamConfig.length > 0 && (
                    <Timeline.Description>
                      <Text fontSize="xs" fontWeight="bold" mt="var(--chakra-spacing-xs)" mb="var(--chakra-spacing-2xs)">
                        Downstream Version Overrides
                      </Text>
                      <Flex direction="column" gap="var(--chakra-spacing-2xs)">
                        {downstreamConfig.map((ds) => (
                          <Flex key={ds.serviceId} align="center" gap="var(--chakra-spacing-xs)">
                            <Text fontSize="xs" minW="100px" color="var(--chakra-colors-fg-muted)">{ds.serviceName}</Text>
                            <input
                              placeholder="version (e.g. v1)"
                              value={dsOverrides[ds.serviceId] || ''}
                              onChange={(e) => setDsOverrides((prev) => ({ ...prev, [ds.serviceId]: e.target.value }))}
                              style={{
                                flex: 1,
                                fontSize: 'var(--chakra-fontSizes-xs)',
                                padding: '2px 6px',
                                borderRadius: 'var(--chakra-radii-sm)',
                                border: '1px solid var(--chakra-colors-border)',
                                height: '26px',
                              }}
                            />
                          </Flex>
                        ))}
                      </Flex>
                    </Timeline.Description>
                  )}
                  <Timeline.Description>
                    <Flex justify="flex-end" mt="var(--chakra-spacing-xs)">
                      <Button
                        size="xs"
                        onClick={async () => {
                          if (!canDeploy) return;
                          // Build downstream overrides payload
                          const overrides: DownstreamOverride[] = downstreamConfig
                            .filter((ds) => dsOverrides[ds.serviceId])
                            .map((ds) => ({
                              serviceId: ds.serviceId,
                              serviceName: ds.serviceName,
                              version: dsOverrides[ds.serviceId],
                            }));
                          try {
                            await deployService.mutateAsync({
                              versionId: selectedVersionId,
                              environmentId: selectedEnv,
                              serviceId,
                              downstreamOverrides: overrides.length > 0 ? overrides : undefined,
                            });
                            // success notification
                            setToast({ message: 'Deployment enqueued successfully.', status: 'success' });
                            setTimeout(() => setToast({ message: '', status: null }), 4000);
                            // refresh deployments and switch drawer to details of the new deployment
                            await queryClient.refetchQueries({ queryKey: ['service-deployments', serviceId] });
                            const list = (queryClient.getQueryData<DeploymentRecord[]>(['service-deployments', serviceId]) || []).slice();
                            const match = list
                              .filter((d) => d.environmentId === selectedEnv && d.versionId === selectedVersionId)
                              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
                            if (match) {
                              setViewDeployment(match);
                            }
                          } catch (e) {
                            // noop; could show toast
                          }
                        }}
                        disabled={!canDeploy || deployService.isPending}
                        loading={deployService.isPending}
                      >
                        Deploy
                      </Button>
                    </Flex>
                  </Timeline.Description>
                  </Timeline.Content>
                </Timeline.Item>

                {/* Static steps for new deployment (show all steps; no workflow exists yet) */}
                {DEPLOY_STEPS.map((step) => {
                  const s = getStepStatus(step.fn).toString().toLowerCase();
                  return (
                    <Timeline.Item key={`new-${step.label}`}>
                      <Timeline.Connector>
                        <Timeline.Separator />
                        <Timeline.Indicator bg="gray.200" color="gray.500"><FaPause /></Timeline.Indicator>
                      </Timeline.Connector>
                      <Timeline.Content gap="var(--chakra-spacing-2xs)">
                        <Timeline.Title>{step.label}</Timeline.Title>
                        {step.desc ? <Text fontSize="xs" color="var(--chakra-colors-fg-muted)">{step.desc}</Text> : null}
                        <Timeline.Description mt="var(--chakra-spacing-xs)">
                          <Badge variant="subtle" colorPalette={statusToColor(s)} fontWeight="bold">
                            {s}
                          </Badge>
                        </Timeline.Description>
                      </Timeline.Content>
                    </Timeline.Item>
                  );
                })}
              </Timeline.Root>
              ) : (
                <>
                  {/* Summary card above the timeline */}
                  <Box
                    mb="var(--chakra-spacing-lg)"
                    p="var(--chakra-spacing-xs)"
                    bg="var(--chakra-colors-white)"
                    border="1px solid var(--chakra-colors-border)"
                    borderRadius="var(--chakra-radii-sm)"
                    boxShadow="var(--chakra-shadows-sm)"
                  >
                    <Flex align="center" justify="space-between" mb="var(--chakra-spacing-xs)">
                      <Text fontSize="sm" fontWeight="bold">Deployment Summary</Text>
                      <Badge
                        size="sm"
                        colorPalette={statusToColor(wfDetails?.workflowStatus)}
                        variant="subtle"
                        fontWeight="bold"
                        w="fit-content"
                      >
                        {wfDetails?.workflowStatus || 'unknown'}
                      </Badge>
                    </Flex>
                    <Grid templateColumns="120px 1fr" columnGap="var(--chakra-spacing-sm)" rowGap="6px" alignItems="center">
                      <Text fontSize="sm" color="var(--chakra-colors-fg-muted)">Service Name</Text>
                      <Text fontSize="sm" fontWeight="bold">
                        {serviceDetails?.service?.name || (serviceDetails?.service?.id || serviceId)}
                      </Text>
                      <Text fontSize="sm" color="var(--chakra-colors-fg-muted)">Start Time</Text>
                      <Text fontSize="sm" fontWeight="bold">
                        {summaryStartMs ? new Date(summaryStartMs).toLocaleString() : '-'}
                      </Text>
                      <Text fontSize="sm" color="var(--chakra-colors-fg-muted)">Duration</Text>
                      <Text fontSize="sm" fontWeight="bold">
                        {summaryDuration != null ? formatDuration(summaryDuration) : '-'}
                      </Text>
                    </Grid>
                  </Box>
                  <Timeline.Root size="md" colorPalette="gray" variant="subtle" style={{ paddingLeft: 'var(--chakra-spacing-xs)' }}>
                  <Timeline.Item>
                  <Timeline.Connector><Timeline.Separator /><Timeline.Indicator bg="green.100" color="green.700">
                    <FaCheck/>
                    </Timeline.Indicator></Timeline.Connector>
                    <Timeline.Content>
                      <Timeline.Title>Version / Environment</Timeline.Title>
                      <Timeline.Description>
                        <Grid templateColumns="100px 1fr" columnGap="var(--chakra-spacing-sm)" rowGap="10px" alignItems="center">
                          <Text fontSize="sm" color="var(--chakra-colors-fg-muted)">Version</Text>
                          <Text fontSize="sm" fontWeight="bold">
                            {(versionLabelById.get(viewDeployment!.versionId) || viewDeployment!.versionId)}
                          </Text>
                          <Text fontSize="sm" color="var(--chakra-colors-fg-muted)">Environment</Text>
                          <Text fontSize="sm" fontWeight="bold">
                            {(envById.get(viewDeployment!.environmentId || '')?.name) || (viewDeployment!.environmentId || '')}
                          </Text>
                        </Grid>
                      </Timeline.Description>
                    </Timeline.Content>
                  </Timeline.Item>
                  {/* Static steps driven by workflow summary - rendered from shared DEPLOY_STEPS */}
                  {DEPLOY_STEPS.map((step) => {
                    const fnExists = workflowFnSet.has(step.fn.toLowerCase());
                    const hasRecordSteps = !!(viewDeployment?.steps && viewDeployment.steps.length > 0);
                    const s = fnExists ? getStepStatus(step.fn).toString().toLowerCase() : (hasRecordSteps ? 'not_started' : 'skipped');
                    const stepData = getStepData(step.fn);
                    return (
                      <Timeline.Item key={`exist-${step.label}`}>
                        <Timeline.Connector><Timeline.Separator /><Timeline.Indicator
                          bg={s === 'success' ? 'green.100' : s === 'failure' ? 'red.100' : (s === 'not_started' || s === 'skipped') ? 'gray.200' : 'blue.100'}
                          color={s === 'success' ? 'green.700' : s === 'failure' ? 'red.700' : (s === 'not_started' || s === 'skipped') ? 'gray.500' : 'blue.700'}
                        >
                          {s === 'success' ? <FaCheck /> : ((s === 'not_started' || s === 'skipped') ? <FaPause /> : (s === 'failure' ? <FaXmark /> : <FaRunning />))}
                        </Timeline.Indicator></Timeline.Connector>
                        <Timeline.Content gap="var(--chakra-spacing-2xs)">
                          <Timeline.Title>{step.label}</Timeline.Title>
                          {step.desc ? <Text fontSize="xs" color="var(--chakra-colors-fg-muted)">{step.desc}</Text> : null}
                          <Timeline.Description mt="var(--chakra-spacing-xs)">
                            <Badge variant="subtle" colorPalette={statusToColor(s)} fontWeight="bold">
                              {s}
                            </Badge>
                            <Flex mt="var(--chakra-spacing-xs)">
                              <StepDetailDialog data={stepData?.output} label="Output" icon={<MdOutput />} color="blue.600" />
                              <StepDetailDialog data={stepData?.error} label="Error" icon={<MdOutlineErrorOutline />} color="red.600" />
                            </Flex>
                          </Timeline.Description>
                        </Timeline.Content>
                      </Timeline.Item>
                    );
                  })}
                  </Timeline.Root>
                </>
              )}
            </Drawer.Body>
          </Drawer.Content>
        </Drawer.Positioner>
      </Drawer.Root>

      
    </Flex>
  );
}

