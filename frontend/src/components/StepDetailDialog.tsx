import * as React from 'react';
import { Box, IconButton, Dialog, Portal } from '@chakra-ui/react';
import { HiXMark } from 'react-icons/hi2';

/** Generic dialog to display step output or error content, centered at 90% screen size */
export default function StepDetailDialog({ data, label, icon, color }: { data: any; label: string; icon: React.ReactNode; color: string }) {
  if (data === null || data === undefined) return (
    <IconButton size="xs" rounded="full" variant="ghost" color="gray.400" disabled aria-label={label}>
      {icon}
    </IconButton>
  );
  const content = typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data);
  return (
    <Dialog.Root placement="center">
      <Dialog.Trigger asChild>
        <IconButton size="xs" rounded="full" variant="ghost" color={color} aria-label={label}>
          {icon}
        </IconButton>
      </Dialog.Trigger>
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content w="90vw" h="90vh" maxW="90vw" maxH="90vh" display="flex" flexDirection="column">
            <Dialog.Header>
              <Dialog.Title fontSize="sm" fontWeight="bold">{label}</Dialog.Title>
              <Dialog.CloseTrigger asChild>
                <IconButton size="xs" variant="ghost" aria-label="Close" position="absolute" top="var(--chakra-spacing-sm)" right="var(--chakra-spacing-sm)">
                  <HiXMark />
                </IconButton>
              </Dialog.CloseTrigger>
            </Dialog.Header>
            <Dialog.Body flex="1" overflow="auto">
              <Box as="pre" fontSize="xs" whiteSpace="pre-wrap" wordBreak="break-all" bg="gray.50" p="var(--chakra-spacing-sm)" borderRadius="var(--chakra-radii-sm)">
                {content}
              </Box>
            </Dialog.Body>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
