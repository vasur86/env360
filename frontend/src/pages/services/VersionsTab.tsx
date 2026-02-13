import * as React from 'react';
import { Box, Flex, Text, Timeline, Table, Button } from '@chakra-ui/react';
import { useServiceVersions, useServiceDeployments, useServiceDetails, useEnvironments, useAdminConfigs, type ServiceVersionRecord } from '../../api/client';
import { HiArrowTopRightOnSquare } from 'react-icons/hi2';

/** Mirror the backend _normalize_name for DNS-1123 style names */
function normalizeName(name: string): string {
  return name.toLowerCase().replace(/\//g, '-').replace(/_/g, '-').replace(/ /g, '-');
}

export default function VersionsTab({ serviceId }: { serviceId: string }) {
  const { data: versions, isLoading } = useServiceVersions(serviceId);
  const { data: deployments } = useServiceDeployments(serviceId);
  const { data: serviceDetails } = useServiceDetails(serviceId);
  const projectId = serviceDetails?.service?.projectId || serviceDetails?.service?.project?.id || '';
  const { data: envListData } = useEnvironments(0, 100, projectId || undefined);
  const envs = (envListData?.items || []).filter((e: any) => projectId ? e.projectId === projectId : false);
  const { data: adminConfigs } = useAdminConfigs();

  const baseDomain = React.useMemo(() => {
    const cfg = (adminConfigs || []).find((c) => c.key === 'base_domain');
    return cfg?.value || 'env360.synvaraworks.com';
  }, [adminConfigs]);

  const projectName = serviceDetails?.service?.project?.name || '';
  const serviceName = serviceDetails?.service?.name || '';

  /** Build the external route URL: https://<baseDomain>/<project>/<env>/<service>/<version> */
  const buildRouteUrl = React.useCallback(
    (versionLabel: string, envName: string) => {
      if (!projectName || !serviceName || !envName) return '';
      return `https://${baseDomain}/${normalizeName(projectName)}/${normalizeName(envName)}/${normalizeName(serviceName)}/${versionLabel}`;
    },
    [baseDomain, projectName, serviceName],
  );

  // Map: environmentId -> environment
  const envById = React.useMemo(() => {
    const m = new Map<string, any>();
    (envs || []).forEach((e: any) => m.set(e.id, e));
    return m;
  }, [envs]);

  // Map: versionId -> latest deployment per environment
  const deploymentsByVersion = React.useMemo(() => {
    const m = new Map<string, typeof deployments>();
    (deployments || []).forEach((d) => {
      const list = m.get(d.versionId) || [];
      // Keep only the latest per environmentId
      const existing = list.findIndex((e) => e.environmentId === d.environmentId);
      if (existing >= 0) {
        // Replace if newer
        if (d.createdAt > list[existing].createdAt) {
          list[existing] = d;
        }
      } else {
        list.push(d);
      }
      m.set(d.versionId, list);
    });
    return m;
  }, [deployments]);

  const items = React.useMemo(() => {
    const list = (versions || []).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return list;
  }, [versions]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!selectedId && items.length > 0) {
      setSelectedId(items[0].id);
    }
  }, [items, selectedId]);
  const selected = React.useMemo(() => items.find((v) => v.id === selectedId) || null, [items, selectedId]);
  const parsedSpec = React.useMemo(() => {
    if (!selected?.specJson) return null;
    try {
      return JSON.parse(selected.specJson as string);
    } catch {
      return null;
    }
  }, [selected?.specJson]);
  const formatSectionLabel = React.useCallback((s: string) => {
    return String(s)
      .replace(/[_-]/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }, []);
  const renderPrimitive = (v: any) => (
    <Text fontSize="sm" fontFamily="mono" color="var(--chakra-colors-fg)">
      {typeof v === 'string' ? v : JSON.stringify(v)}
    </Text>
  );
  const renderObjectFields = (obj: any) => {
    const entries = Object.entries(obj || {});
    if (entries.length === 0) {
      return <Text fontSize="xs" color="var(--chakra-colors-fg-muted)">No data</Text>;
    }
    return (
      <Table.Root size="sm" variant="line" colorPalette="gray">
        <Table.Body>
          {entries.map(([k, v]) => (
            <Table.Row key={k} bg="transparent">
              <Table.Cell width="150px">
                <Text fontSize="sm" color="var(--chakra-colors-fg-muted)">{formatSectionLabel(k)}</Text>
              </Table.Cell>
              <Table.Cell>
                {typeof v === 'object' && v !== null ? (
                  <Text fontSize="sm" fontFamily="mono" whiteSpace="pre-wrap">
                    {JSON.stringify(v, null, 2)}
                  </Text>
                ) : (
                  renderPrimitive(v)
                )}
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    );
  };
  const renderSection = (sectionKey: string, value: any) => {
    console.log('renderSection', sectionKey, value);
    if (Array.isArray(value)) {
      // For service, treat array as a single object (first item)
      if (String(sectionKey).toLowerCase().includes('service')) {
        const first = value[0];
        if (!first) {
          return <Text fontSize="xs" color="var(--chakra-colors-fg-muted)">No data</Text>;
        }
        return typeof first === 'object' && first !== null ? renderObjectFields(first) : renderPrimitive(first);
      }
      if (value.length === 0) {
        return <Text fontSize="xs" color="var(--chakra-colors-fg-muted)">No items</Text>;
      }
      return (
        <Flex direction="column" gap="6px">
          {value.map((item, idx) => (
            <Box key={idx} p="var(--chakra-spacing-2xs)" bg="var(--chakra-colors-white)" borderRadius="var(--chakra-radii-sm)">
              {typeof item === 'object' && item !== null ? renderObjectFields(item) : renderPrimitive(item)}
            </Box>
          ))}
        </Flex>
      );
    }
    if (typeof value === 'object' && value !== null) {
      return renderObjectFields(value);
    }
    return renderPrimitive(value);
  };
  const normalizeFieldKey = (k: string) => String(k).toLowerCase().replace(/[_\s-]/g, '');
  const cleanValueForSection = (sectionKey: string, value: any) => {
    const sec = String(sectionKey).toLowerCase();
    let ignore: Set<string> | null = null;
    if (sec.includes('config')) {
      ignore = new Set(['deployedconfighash', 'headconfighash', 'version']);
    } else if (sec.includes('project')) {
      ignore = new Set(['createdat', 'deletedat', 'ownerid', 'updatedat']);
    } else if (sec.includes('service')) {
      ignore = new Set(['createdat', 'deletedat', 'projectid', 'status', 'updatedat']);
    }
    if (!ignore) return value;
    if (Array.isArray(value)) {
      return value.map((v) => (typeof v === 'object' && v !== null ? Object.fromEntries(Object.entries(v).filter(([k]) => !ignore!.has(normalizeFieldKey(k)))) : v));
    }
    if (typeof value === 'object' && value !== null) {
      return Object.fromEntries(Object.entries(value).filter(([k]) => !ignore!.has(normalizeFieldKey(k))));
    }
    return value;
  };

  if (isLoading) {
    return <Text fontSize="sm" color="var(--chakra-colors-fg-muted)">Loading versions...</Text>;
  }

  return (
    <Flex direction="column" gap="var(--chakra-spacing-xs)" mt="var(--chakra-spacing-sm)">
      {(!items || items.length === 0) ? (
        <Flex align="center" justify="center" minH="120px">
          <Text fontSize="md" color="var(--chakra-colors-fg-muted)">No versions yet.</Text>
        </Flex>
      ) : (
         <Flex direction="row" gap="var(--chakra-spacing-xs)">
          <Flex direction="column" gap="var(--chakra-spacing-xs)" bg="var(--chakra-colors-bg-subtle)" rounded="var(--chakra-radii-md)" p="var(--chakra-spacing-sm)">
            <Text fontSize="md" color="var(--chakra-colors-text-title)">Versions</Text>
            <Timeline.Root size="sm" colorPalette="gray" variant="subtle" maxWidth="175px">
              {items.map((v: ServiceVersionRecord) => (
                 <Timeline.Item key={v.id} onClick={() => setSelectedId(v.id)}>
                  <Timeline.Connector>
                    <Timeline.Separator />
                     <Timeline.Indicator  bg={selectedId === v.id ? 'black' : 'gray.400'}/>
                  </Timeline.Connector>
                  <Timeline.Content>
                     <Timeline.Title fontSize="sm" fontWeight="bold" cursor="pointer">
                       {v.versionLabel}
                     </Timeline.Title>
                    <Timeline.Description>
                      <Flex align="center" justify="space-between" gap="var(--chakra-spacing-sm)">
                        <Text fontSize="xs" color="var(--chakra-colors-fg-muted)">
                            {new Date(v.createdAt).toLocaleString()}
                        </Text>                        
                      </Flex>
                      {/* {(deploymentsByVersion.get(v.id) || []).length > 0 && (
                        <Flex gap="4px" mt="4px" wrap="wrap">
                          {(deploymentsByVersion.get(v.id) || []).map((dep) => {
                            const env = envById.get(dep.environmentId);
                            const envName = env?.name || dep.environmentId;
                            const statusColor =
                              ['succeeded', 'success'].includes((dep.status || '').toLowerCase()) ? 'green' :
                              ['failed', 'failure', 'error'].includes((dep.status || '').toLowerCase()) ? 'red' :
                              ['pending', 'queued', 'enqueued', 'created'].includes((dep.status || '').toLowerCase()) ? 'yellow' :
                              ['running', 'in_progress', 'processing'].includes((dep.status || '').toLowerCase()) ? 'blue' : 'gray';
                            return (
                              <Button
                                key={dep.id}
                                size="2xs"
                                variant="outline"
                                colorPalette={statusColor}
                                fontSize="xs"
                                onClick={() => window.open(buildRouteUrl(v.versionLabel), '_blank')}
                              >
                                {envName} <HiArrowTopRightOnSquare />
                              </Button>
                            );
                          })}
                        </Flex>
                      )} */}
                    </Timeline.Description>
                  </Timeline.Content>
                </Timeline.Item>
              ))}
            </Timeline.Root>
          </Flex>
          <Flex direction="column" grow="1" gap="var(--chakra-spacing-xs)" bg="var(--chakra-colors-bg-subtle)" rounded="var(--chakra-radii-md)" p="var(--chakra-spacing-sm)">
            <Text fontSize="md" color="var(--chakra-colors-text-title)">Version Details: {selected?.versionLabel}</Text>
             {selected ? (
               <>                 
                 <Text fontSize="xs" color="var(--chakra-colors-fg-muted)">
                   Created: {new Date(selected.createdAt).toLocaleString()}
                 </Text>                 
                {parsedSpec ? (
                  <Flex direction="column" gap="var(--chakra-spacing-xs)">
                    {Object.entries(parsedSpec).map(([section, value]) => {
                      const cleaned = cleanValueForSection(section, value);
                      return (
                        <Box key={section} bg="var(--chakra-colors-bg-subtle)" borderRadius="var(--chakra-radii-md)" p="var(--chakra-spacing-xs)">
                          <Text fontSize="sm" fontWeight="bold" color="var(--chakra-colors-gray-500)" mb="4px">{formatSectionLabel(section)}</Text>
                          {renderSection(section, cleaned)}
                        </Box>
                      );
                    })}
                  </Flex>
                ) : (
                  selected?.specJson && (
                    <Box bg="var(--chakra-colors-bg-subtle)" borderRadius="var(--chakra-radii-md)" p="var(--chakra-spacing-xs)">
                      <Text fontSize="sm" fontWeight="bold" color="var(--chakra-colors-gray-500)" mb="4px">Spec</Text>
                      {renderSection('spec', selected.specJson)}
                    </Box>
                  )
                )}
               </>
             ) : (
               <Text fontSize="sm" color="var(--chakra-colors-fg-muted)">Select a version to view details.</Text>
             )}
          </Flex>
        </Flex>
      )}
    </Flex>
  );
}

