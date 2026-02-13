import * as React from 'react';
import { Box, Text } from '@chakra-ui/react';

interface ServicesTabProps {
  environmentId: string;
}

export default function ServicesTab({ environmentId }: ServicesTabProps) {
  return (
    <Box p="var(--chakra-spacing-md)">
      <Text fontSize="md" fontWeight="bold" mb="var(--chakra-spacing-sm)">
        Services
      </Text>
      <Text fontSize="sm" color="var(--chakra-colors-fg-muted)">
        Services management for this environment will be implemented here.
      </Text>
    </Box>
  );
}
