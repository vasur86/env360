import { useMemo, useState } from 'react';
import { Box, Button, Flex, Input, RadioCard, Group, Text, Textarea, Drawer, Badge } from '@chakra-ui/react';
import { useAuth } from '@/contexts/AuthContext';
import { useClusters, useAddCluster, useUpdateCluster, type ClusterRecord } from '@/api/client';
import { SiKubernetes } from 'react-icons/si';
import { HiPencil, HiMiniLink, HiMiniKey, HiXMark } from 'react-icons/hi2';
import { Tooltip } from '@/components/ui/tooltip';

export default function Clusters() {
  const { user } = useAuth();
  const isAdmin = !!(user?.is_admin || user?.is_super_admin);
  const [toast, setToast] = useState<{ message: string; status: 'success' | 'error' | null }>({ message: '', status: null });

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [clusterName, setClusterName] = useState('');
  const [apiUrl, setApiUrl] = useState('');
  const [description, setDescription] = useState('');
  const [envType, setEnvType] = useState<string>('development');
  const [authMethod, setAuthMethod] = useState<'kubeconfig' | 'token' | 'serviceAccount' | 'clientCert'>('kubeconfig');
  const [kubeconfigName, setKubeconfigName] = useState('');
  const [kubeconfigContent, setKubeconfigContent] = useState('');
  const [saToken, setSaToken] = useState('');
  const [clientKey, setClientKey] = useState('');
  const [clientCert, setClientCert] = useState('');
  const [clientCaCrt, setClientCaCrt] = useState('');
  const addCluster = useAddCluster();
  const updateCluster = useUpdateCluster();
  const [editingCluster, setEditingCluster] = useState<ClusterRecord | null>(null);
  const [testMsg, setTestMsg] = useState<string>('');
  const [testOk, setTestOk] = useState<boolean | null>(null);

  const kube_auth_options = [
    {
      value: 'kubeconfig',
      title: 'Kubeconfig file',
      description: 'Upload a kubeconfig file',
    },
    {
      value: 'token',
      title: 'Token',
      description: 'Use a bearer token',
    },
    {
      value: 'serviceAccount',
      title: 'Service Account',
      description: 'Enter the service account token',
    },
    {
      value: 'clientCert',
      title: 'Client Certificate',
      description: 'Enter the client key, certificate and CA certificate',
    },
  ];

  return (
    <Box
      bg="var(--chakra-colors-white)"
      borderRadius="var(--chakra-radii-md)"
      boxShadow="var(--chakra-shadows-md)"
      p="var(--chakra-spacing-sm)"
    >
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
          onAnimationEnd={() => {}}
        >
          <Text fontSize="sm" fontWeight="bold">{toast.status === 'success' ? 'Success' : 'Error'}</Text>
          <Text fontSize="xs">{toast.message}</Text>
        </Box>
      )}
      <Flex justify="space-between" align="center" mb="var(--chakra-spacing-sm)">
        <Box>
          <Text fontSize="sm" fontWeight="bold" color="var(--chakra-colors-fg)">Kubernetes Clusters</Text>
          <Text fontSize="xs" color="var(--chakra-colors-fg-muted)">Configure and manage clusters.</Text>
        </Box>
        {isAdmin && (
          <Button
            size="xs"
            onClick={() => {
              setEditingCluster(null);
              setClusterName('');
              setApiUrl('');
              setDescription('');
              setAuthMethod('kubeconfig');
              setEnvType('development');
              setKubeconfigName('');
              setKubeconfigContent('');
              setSaToken('');
              setClientKey('');
              setClientCert('');
              setClientCaCrt('');
              setIsDrawerOpen(true);
            }}
          >
            + Add Cluster
          </Button>
        )}
      </Flex>

      {/* Existing clusters list */}
      <ClusterList
        onEdit={(c) => {
          if (!isAdmin) return;
          setEditingCluster(c);
          setClusterName(c.name || '');
          setApiUrl(c.apiUrl || '');
          setDescription((c.description as string) || '');
          setAuthMethod((c.authMethod as any) || 'kubeconfig');
          setEnvType((c.environmentType as any) || 'development');
          setKubeconfigName('');
          setKubeconfigContent('');
          setSaToken('');
          setClientKey('');
          setClientCert('');
          setClientCaCrt('');
          setIsDrawerOpen(true);
        }}
        canEdit={isAdmin}
      />

      {isAdmin && (
        <Drawer.Root
          open={isDrawerOpen}
          onOpenChange={(e) => setIsDrawerOpen(e.open)}
          placement="end"          
          size="sm"
        >
          <Drawer.Backdrop />
          <Drawer.Positioner>
            <Drawer.Content>
              <Drawer.Header style={{ boxShadow: 'var(--chakra-shadows-md)', padding: 'var(--chakra-spacing-sm)'}}>
                <Flex justify="space-between" align="center" width="100%">
                  <Drawer.Title>{editingCluster ? 'Edit Kubernetes Cluster' : 'Add Kubernetes Cluster'}</Drawer.Title>
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
                <Flex direction="column" gap="var(--chakra-spacing-md)">
                  <Box>
                    <Text fontSize="sm" mb="var(--chakra-spacing-2xs)" fontWeight="medium">
                      Cluster Name *
                    </Text>
                    <Input
                      placeholder="e.g., prod-cluster-us-east-1"
                      value={clusterName}
                      onChange={(e) => setClusterName(e.target.value)}
                      size="sm"
                      required
                    />
                  </Box>

                  <Box>
                    <Text fontSize="sm" mb="var(--chakra-spacing-2xs)" fontWeight="medium">
                      Kubernetes API URL *
                    </Text>
                    <Input
                      placeholder="https://<host>:<port>"
                      value={apiUrl}
                      onChange={(e) => setApiUrl(e.target.value)}
                      size="sm"
                      required
                    />
                  </Box>

                  <Box>
                    <Text fontSize="sm" mb="var(--chakra-spacing-2xs)" fontWeight="medium">
                      Description
                    </Text>
                    <Textarea
                      placeholder="Optional description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      size="sm"
                      rows={3}
                    />
                  </Box>
                  
                  <Box>
                    <Text fontSize="sm" mb="var(--chakra-spacing-2xs)" fontWeight="medium">
                      Environment Type
                    </Text>
                    <RadioCard.Root
                      defaultValue={envType || ''}
                      gap="1"
                      maxW="sm"
                      size="sm"
                      onValueChange={(e) => setEnvType(e.value || '')}
                    >
                      <Group attached orientation="vertical">
                        {['development','testing','staging','production','sandbox'].map((t) => (
                          <RadioCard.Item key={t} value={t} width="full">
                            <RadioCard.ItemHiddenInput />
                            <RadioCard.ItemControl>
                              <RadioCard.ItemIndicator />
                              <RadioCard.ItemContent>
                                <RadioCard.ItemText>{t}</RadioCard.ItemText>
                              </RadioCard.ItemContent>
                            </RadioCard.ItemControl>
                          </RadioCard.Item>
                        ))}
                      </Group>
                    </RadioCard.Root>
                  </Box>

                  <Box mb="var(--chakra-spacing-sm)">
                    <RadioCard.Root
                      defaultValue={authMethod}
                      gap="1"
                      maxW="sm"
                      size="sm"
                      onValueChange={(e) => setAuthMethod(e.value as 'kubeconfig' | 'token' | 'serviceAccount' | 'clientCert')}
                    >
                      <RadioCard.Label>Authentication Method</RadioCard.Label>
                      <Group attached orientation="vertical">
                        {kube_auth_options.map((item) => (
                          <RadioCard.Item key={item.value} value={item.value} width="full">
                            <RadioCard.ItemHiddenInput />
                            <RadioCard.ItemControl>
                              <RadioCard.ItemIndicator />
                              <RadioCard.ItemContent>
                                <RadioCard.ItemText>{item.title}</RadioCard.ItemText>
                                <RadioCard.ItemDescription>
                                  {item.description}
                                </RadioCard.ItemDescription>
                              </RadioCard.ItemContent>
                            </RadioCard.ItemControl>
                          </RadioCard.Item>
                        ))}
                      </Group>
                    </RadioCard.Root>
                  </Box>

                  {authMethod === 'kubeconfig' && (
                    <Box>
                      <Text fontSize="sm" mb="var(--chakra-spacing-2xs)" fontWeight="medium">
                        Kubeconfig
                      </Text>
                      <Input
                        type="file"
                        // accept=".yaml,.yml"
                        size="sm"
                        required
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setKubeconfigName(file.name);
                          const text = await file.text();
                          setKubeconfigContent(text);
                        }}
                      />
                      {kubeconfigName && (
                        <Text fontSize="xs" color="var(--chakra-colors-fg-muted)" mt="var(--chakra-spacing-xs)">
                          Selected: {kubeconfigName}
                        </Text>
                      )}
                      {!kubeconfigContent && (
                        <Text fontSize="xs" color="red.500" mt="var(--chakra-spacing-2xs)">
                          Kubeconfig file is required.
                        </Text>
                      )}
                    </Box>
                  )}

                  {authMethod === 'token' && (
                    <Flex gap="var(--chakra-spacing-sm)" direction="column">
                      <Box>
                        <Text fontSize="sm" mb="var(--chakra-spacing-xs)" fontWeight="medium">Bearer Token</Text>
                        <Textarea
                          placeholder="Paste the bearer token"
                          value={saToken}
                          onChange={(e) => setSaToken(e.target.value)}
                          size="sm"
                          rows={3}
                          required
                        />
                        {!saToken.trim() && (
                          <Text fontSize="xs" color="red.500" mt="var(--chakra-spacing-2xs)">
                            Token is required.
                          </Text>
                        )}
                      </Box>
                    </Flex>
                  )}

                  {authMethod === 'serviceAccount' && (
                    <Flex gap="var(--chakra-spacing-sm)" direction="column">
                      <Box>
                        <Text fontSize="sm" mb="var(--chakra-spacing-xs)" fontWeight="medium">Service Account Token</Text>
                        <Textarea
                          placeholder="Paste the bearer token"
                          value={saToken}
                          onChange={(e) => setSaToken(e.target.value)}
                          size="sm"
                          rows={3}
                          required
                        />
                        {!saToken.trim() && (
                          <Text fontSize="xs" color="red.500" mt="var(--chakra-spacing-2xs)">
                            Service account token is required.
                          </Text>
                        )}
                      </Box>
                    </Flex>
                  )}

                  {authMethod === 'clientCert' && (
                    <Flex gap="var(--chakra-spacing-sm)" direction="column">
                      <Box>
                        <Text fontSize="sm" mb="var(--chakra-spacing-xs)" fontWeight="medium">Client Key (PEM)</Text>
                        <Textarea
                          placeholder="-----BEGIN PRIVATE KEY----- ... -----END PRIVATE KEY-----"
                          value={clientKey}
                          onChange={(e) => setClientKey(e.target.value)}
                          size="sm"
                          rows={5}
                          required
                        />
                        {!clientKey.trim() && (
                          <Text fontSize="xs" color="red.500" mt="var(--chakra-spacing-2xs)">
                            Client key is required.
                          </Text>
                        )}
                      </Box>
                      <Box>
                        <Text fontSize="sm" mb="var(--chakra-spacing-xs)" fontWeight="medium">Client Certificate (PEM)</Text>
                        <Textarea
                          placeholder="-----BEGIN CERTIFICATE----- ... -----END CERTIFICATE-----"
                          value={clientCert}
                          onChange={(e) => setClientCert(e.target.value)}
                          size="sm"
                          rows={4}
                          required
                        />
                        {!clientCert.trim() && (
                          <Text fontSize="xs" color="red.500" mt="var(--chakra-spacing-2xs)">
                            Client certificate is required.
                          </Text>
                        )}
                      </Box>
                      <Box>
                        <Text fontSize="sm" mb="var(--chakra-spacing-xs)" fontWeight="medium">CA Certificate (PEM)</Text>
                        <Textarea
                          placeholder="-----BEGIN CERTIFICATE----- ... -----END CERTIFICATE-----"
                          value={clientCaCrt}
                          onChange={(e) => setClientCaCrt(e.target.value)}
                          size="sm"
                          rows={4}
                          required
                        />
                        {!clientCaCrt.trim() && (
                          <Text fontSize="xs" color="red.500" mt="var(--chakra-spacing-2xs)">
                            CA certificate is required.
                          </Text>
                        )}
                      </Box>
                    </Flex>
                  )}
                </Flex>
              </Drawer.Body>
              <Drawer.Footer>
                <Flex justify="flex-end" gap="var(--chakra-spacing-sm)" width="100%">
                  <Button variant="outline" size="sm" onClick={() => setIsDrawerOpen(false)}>Cancel</Button>                  
                  <Button
                    size="sm"
                    onClick={async () => {
                      const name = clusterName.trim();
                      const apiUrlVal = apiUrl.trim();
                      const desc = description.trim();
                      const envTypeVal = envType.trim() || undefined;
                      if (!name || !apiUrlVal) return;
                      try {
                        if (editingCluster) {
                          const payload: any = {
                            id: editingCluster.id,
                            name,
                            apiUrl: apiUrlVal,
                            description: desc || undefined,
                            authMethod,
                            environmentType: envTypeVal,
                          };
                          if (authMethod === 'kubeconfig') {
                            payload.kubeconfigContent = kubeconfigContent || undefined;
                          } else if (authMethod === 'token' || authMethod === 'serviceAccount') {
                            payload.token = saToken || undefined;
                          } else if (authMethod === 'clientCert') {
                            payload.clientKey = clientKey || undefined;
                            payload.clientCert = clientCert || undefined;
                            payload.clientCaCert = clientCaCrt || undefined;
                          }
                          await updateCluster.mutateAsync(payload);
                        } else {
                          const base: any = {
                            name,
                            apiUrl: apiUrlVal,
                            authMethod,
                            description: desc || undefined,
                            environmentType: envTypeVal,
                          };
                          if (authMethod === 'kubeconfig') {
                            base.kubeconfigContent = kubeconfigContent || undefined;
                          } else if (authMethod === 'token' || authMethod === 'serviceAccount') {
                            base.token = saToken || undefined;
                          } else if (authMethod === 'clientCert') {
                            base.clientKey = clientKey || undefined;
                            base.clientCert = clientCert || undefined;
                            base.clientCaCert = clientCaCrt || undefined;
                          }
                          await addCluster.mutateAsync(base);
                        }
                        setIsDrawerOpen(false);
                        setEditingCluster(null);
                        setToast({ message: editingCluster ? 'Cluster updated successfully.' : 'Cluster added successfully.', status: 'success' });
                        setTimeout(() => setToast({ message: '', status: null }), 4000);
                      } catch (e: any) {
                        setToast({ message: e?.message || 'An unexpected error occurred.', status: 'error' });
                        setTimeout(() => setToast({ message: '', status: null }), 5000);
                      }
                    }}
                    disabled={
                      !clusterName.trim() ||
                      !apiUrl.trim() ||
                      (authMethod === 'kubeconfig' && !kubeconfigContent) ||
                      ((authMethod === 'token' || authMethod === 'serviceAccount') && !saToken.trim()) ||
                      (authMethod === 'clientCert' && (!clientKey.trim() || !clientCert.trim() || !clientCaCrt.trim())) ||
                      addCluster.isPending ||
                      updateCluster.isPending
                    }
                    loading={addCluster.isPending || updateCluster.isPending}
                    colorPalette="primary"
                  >
                    {editingCluster ? 'Save Changes' : 'Add Cluster'}
                  </Button>
                </Flex>
                {testOk !== null && (
                  <Box
                    mt="var(--chakra-spacing-sm)"
                    bg={testOk ? 'green.50' : 'red.50'}
                    border="1px solid"
                    borderColor={testOk ? 'green.200' : 'red.200'}
                    color={testOk ? 'green.700' : 'red.700'}
                    p="var(--chakra-spacing-xs)"
                    borderRadius="var(--chakra-radii-sm)"
                  >
                    <Text fontSize="sm" fontWeight="medium">
                      {testOk ? 'Connection test passed' : 'Connection test failed'}
                    </Text>
                    <Text fontSize="xs">{testMsg}</Text>
                  </Box>
                )}
              </Drawer.Footer>
            </Drawer.Content>
          </Drawer.Positioner>
        </Drawer.Root>
      )}
    </Box>
  );
}

function ClusterList({ onEdit, canEdit }: { onEdit?: (c: ClusterRecord) => void; canEdit?: boolean }) {
  const { data: clusters, isLoading, error } = useClusters();
  const [notif, setNotif] = useState<{ message: string; status: 'success' | 'error' | null }>({ message: '', status: null });

  // Auto-check health for listed clusters
  // No per-row client-side checks; badges use server-computed fields from clusters query
  if (isLoading) {
    return (
      <Text fontSize="sm" color="var(--chakra-colors-fg-muted)">Loading...</Text>
    );
  }
  if (error) {
    return (
      <Text fontSize="sm" color="red.500">Failed to load clusters</Text>
    );
  }
  if (!clusters || clusters.length === 0) {
    return (
      <Text fontSize="sm" color="var(--chakra-colors-fg-muted)">No clusters configured.</Text>
    );
  }
  return (
    <Box display="flex" flexDirection="column" gap="var(--chakra-spacing-xs)" mb="var(--chakra-spacing-sm)">
      {notif.status && (
        <Box
          position="fixed"
          top="80px"
          right="20px"
          zIndex={1000}
          bg={notif.status === 'success' ? 'green.50' : 'red.50'}
          border="1px solid"
          borderColor={notif.status === 'success' ? 'green.200' : 'red.200'}
          color={notif.status === 'success' ? 'green.700' : 'red.700'}
          p="var(--chakra-spacing-xs)"
          borderRadius="var(--chakra-radii-sm)"
          boxShadow="var(--chakra-shadows-md)"
        >
          <Text fontSize="sm" fontWeight="bold">{notif.status === 'success' ? 'Success' : 'Error'}</Text>
          <Text fontSize="xs">{notif.message}</Text>
        </Box>
      )}
      {clusters.map((c) => (
        <Flex
          key={c.id}
          align="center"
          gap="var(--chakra-spacing-sm)"
          p="var(--chakra-spacing-xs)"
          border="1px solid var(--chakra-colors-border)"
          borderRadius="var(--chakra-radii-sm)"
          boxShadow="var(--chakra-shadows-sm)"
          cursor="pointer"
          _hover={{ backgroundColor: 'var(--chakra-colors-bg-subtle)', boxShadow: 'var(--chakra-shadows-md)' }}
        >
          <Box display="flex" flexDirection="column" alignItems="center" justifyContent="flex-start" width="32px">
            <SiKubernetes size={32} color="#326CE5" />            
          </Box>
          <Flex direction="column" flex="1" minW={0}>
            <Flex align="center" gap="6px" minW={0}>
              <Text fontSize="sm" fontWeight="bold" color="var(--chakra-colors-fg)" whiteSpace="nowrap" overflow="hidden" textOverflow="ellipsis">
                {c.name}
              </Text>
              <Badge
                size="xs"
                colorPalette={
                  c.apiHealth == null ? 'gray' : (c.apiHealth?.ok ? 'green' : 'red')
                }
                variant="subtle"
                fontWeight="bold"
                display="inline-flex"
                alignItems="center"
                gap="4px"
              >
                {c.apiHealth == null ? (
                  <>
                    <HiMiniLink size={12} />
                    unknown
                  </>
                ) : c.apiHealth?.ok ? (
                  <>
                    <HiMiniLink size={12} />
                    ready
                  </>
                ) : (
                  <>
                    <HiMiniLink size={12} />
                    not ready
                  </>
                )}
              </Badge>
              <Badge
                size="xs"
                colorPalette={
                  c.clusterConnection == null ? 'gray' : (c.clusterConnection?.ok ? 'green' : 'red')
                }
                variant="subtle"
                fontWeight="bold"
                display="inline-flex"
                alignItems="center"
                gap="4px"
              >
                {c.clusterConnection == null ? (
                  <>
                    <HiMiniKey size={12} />
                    unknown
                  </>
                ) : c.clusterConnection?.ok ? (
                  <>
                    <HiMiniKey size={12} />
                    connected
                  </>
                ) : (
                  <>
                    <HiMiniKey size={12} />
                    failed
                  </>
                )}
              </Badge>
              <Badge
                size="xs"
                colorPalette={
                  !c.environmentType
                    ? 'gray'
                    : (c.environmentType === 'production'
                        ? 'red'
                        : (c.environmentType === 'staging'
                            ? 'yellow'
                            : (c.environmentType === 'testing'
                                ? 'purple'
                                : (c.environmentType === 'sandbox'
                                    ? 'gray'
                                    : 'blue'))))
                }
                variant="subtle"
                fontWeight="bold"
                display="inline-flex"
                alignItems="center"
                gap="4px"
              >
                {c.environmentType || 'env'}
              </Badge>
            </Flex>
            {c.description && (
              <Text fontSize="xs" color="var(--chakra-colors-fg-muted)" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{c.description}</Text>
            )}
          </Flex>
          <Flex direction="column" minW="200px" align="flex-end" gap="2px">
            <Text fontSize="sm" color="var(--chakra-colors-fg)" whiteSpace="nowrap" overflow="hidden" textOverflow="ellipsis" title={c.apiUrl}>
              {c.apiUrl}
            </Text>
            {canEdit && onEdit && (
              <Flex gap="var(--chakra-spacing-xs)">
                <Tooltip content="Edit cluster details" showArrow={true}>
                  <Button size="2xs" variant="solid" onClick={() => onEdit(c)}>
                    <HiPencil />
                  </Button>
                </Tooltip>
                {/* Removed per-row Test action; using server-computed fields */}
              </Flex>
            )}
          </Flex>
        </Flex>
      ))}
    </Box>
  );
}
