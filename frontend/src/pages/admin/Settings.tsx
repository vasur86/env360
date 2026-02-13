import { useEffect, useState } from 'react';
import { Box, Button, Flex, Input, Text } from '@chakra-ui/react';
import { HiPencil, HiMiniCheckCircle, HiXMark } from 'react-icons/hi2';
import { useAdminConfigs, useCreateAdminConfig } from '@/api/client';
import { Toaster, toaster } from '@/components/ui/toaster';

// Keys stored in admin_configs
const KEY_BASE_DOMAIN = 'base_domain';

export default function Settings() {
  const { data: configs, isLoading } = useAdminConfigs();
  const createAdminConfig = useCreateAdminConfig();

  // Domain settings state
  const [baseDomain, setBaseDomain] = useState('');

  // Editing toggles
  const [isEditingDomain, setIsEditingDomain] = useState(false);

  // Populate state from fetched configs
  useEffect(() => {
    if (configs) {
      const get = (key: string) => configs.find((c) => c.key === key)?.value ?? '';
      setBaseDomain(get(KEY_BASE_DOMAIN));
    }
  }, [configs]);

  const handleSaveDomain = async () => {
    try {
      await createAdminConfig.mutateAsync({ key: KEY_BASE_DOMAIN, value: baseDomain });
      toaster.create({ title: 'Domain settings saved', type: 'success' });
      setIsEditingDomain(false);
    } catch (e: any) {
      toaster.create({ title: e?.message || 'Failed to save', type: 'error' });
    }
  };

  const handleCancelDomain = () => {
    if (configs) {
      const get = (key: string) => configs.find((c) => c.key === key)?.value ?? '';
      setBaseDomain(get(KEY_BASE_DOMAIN));
    }
    setIsEditingDomain(false);
  };

  if (isLoading) {
    return (
      <Box bg="white" borderRadius="md" boxShadow="md" p="sm">
        <Text fontSize="xs" color="fg.muted">Loading settings…</Text>
      </Box>
    );
  }

  return (
    <Box>
      <Toaster />
      {/* Domain Settings */}
      <Box bg="white" borderRadius="md" boxShadow="md" p="sm" mb="sm">
        <Flex justify="space-between" align="center" mb="sm">
          <Box>
            <Text fontSize="sm" fontWeight="bold" color="fg">Domain Settings</Text>
            <Text fontSize="xs" color="fg.muted">Configure the base domain used for service routing.</Text>
          </Box>
          {!isEditingDomain && (
            <Button variant="ghost" size="xs" onClick={() => setIsEditingDomain(true)}>
              <HiPencil />
            </Button>
          )}
        </Flex>

        <Flex direction="column" gap="sm">
          {/* Base Domain */}
          <Flex align="center" gap="sm">
            <Text fontSize="xs" fontWeight="semibold" color="fg.muted" minW="140px">Base Domain</Text>
            {isEditingDomain ? (
              <Input
                size="xs"
                value={baseDomain}
                onChange={(e) => setBaseDomain(e.target.value)}
                placeholder="e.g. env360.synvaraworks.com"
              />
            ) : (
              <Text fontSize="xs" color="fg">{baseDomain || '—'}</Text>
            )}
          </Flex>
        </Flex>

        {/* Action buttons */}
        {isEditingDomain && (
          <Flex mt="sm" gap="xs" justify="flex-end">
            <Button size="xs" variant="ghost" onClick={handleCancelDomain}>
              <HiXMark /> Cancel
            </Button>
            <Button
              size="xs"
              colorPalette="blue"
              onClick={handleSaveDomain}
              loading={createAdminConfig.isPending}
            >
              <HiMiniCheckCircle /> Save
            </Button>
          </Flex>
        )}
      </Box>
    </Box>
  );
}
