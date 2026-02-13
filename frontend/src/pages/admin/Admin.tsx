import { useEffect, useRef, useState } from 'react';
import { Box, Flex, Tabs, Text } from '@chakra-ui/react';
import { useSearchParams } from 'react-router-dom';
import { HiCog8Tooth, HiServerStack } from 'react-icons/hi2';
import Clusters from './compute/Clusters';
import Settings from './Settings';

const VALID_TABS = ['compute', 'settings'] as const;
type TabValue = typeof VALID_TABS[number];

export default function Admin() {
  const [searchParams, setSearchParams] = useSearchParams();
  const isUserChangeRef = useRef(false);

  const getTabFromUrl = (): TabValue => {
    const tabFromUrl = searchParams.get('tab') || 'compute';
    return VALID_TABS.includes(tabFromUrl as TabValue) ? (tabFromUrl as TabValue) : 'compute';
  };

  const [activeTab, setActiveTab] = useState<TabValue>(() => getTabFromUrl());

  useEffect(() => {
    if (!searchParams.get('tab')) {
      setSearchParams({ tab: activeTab }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isUserChangeRef.current) {
      isUserChangeRef.current = false;
      return;
    }
    const tabFromUrl = getTabFromUrl();
    if (tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleTabChange = (value: string) => {
    if (VALID_TABS.includes(value as TabValue)) {
      isUserChangeRef.current = true;
      setActiveTab(value as TabValue);
      setSearchParams({ tab: value }, { replace: true });
    }
  };

  return (
    <Tabs.Root value={activeTab} onValueChange={(e) => handleTabChange(e.value)} variant="plain" size="sm">
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
        <Flex direction="row" justify="space-between" align="center" gap="var(--chakra-spacing-sm)" wrap="wrap">
          <Flex align="center" gap="var(--chakra-spacing-xs)" flex="1" minW="200px">
            <Text fontSize="sm" fontWeight="bold" color="var(--chakra-colors-sws-secondary)">
              Admin
            </Text>
          </Flex>

          <Tabs.List bg="var(--chakra-colors-sws-secondary)" rounded="l3" p="0">
            <Tabs.Trigger value="compute" py="0">
              <HiServerStack />
              Compute
            </Tabs.Trigger>
            <Tabs.Trigger value="settings" py="0">
              <HiCog8Tooth />
              Settings
            </Tabs.Trigger>
            <Tabs.Indicator rounded="l2" />
          </Tabs.List>
        </Flex>
      </Box>

      <Box mt="0" pt="calc(60px)">
        <Box>
          <Tabs.Content value="compute">
            <Clusters />
          </Tabs.Content>
          <Tabs.Content value="settings">
            <Settings />
          </Tabs.Content>
        </Box>
      </Box>
    </Tabs.Root>
  );
}

