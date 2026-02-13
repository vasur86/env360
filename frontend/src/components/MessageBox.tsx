import { Box, Flex, Spinner, Text } from '@chakra-ui/react';
import { HiExclamationTriangle, HiInformationCircle, HiXCircle, HiArrowPath } from 'react-icons/hi2';
import type { IconType } from 'react-icons';

export type MessageType = 'info' | 'warning' | 'error' | 'loading';

interface MessageBoxProps {
  type?: MessageType;
  message: string;
  height?: string;
  fullWidth?: boolean;
  marginTop?: string;
}

const iconMap: Record<MessageType, IconType> = {
  info: HiInformationCircle,
  warning: HiExclamationTriangle,
  error: HiXCircle,
  loading: HiArrowPath,
};

const colorMap: Record<MessageType, string> = {
  info: 'var(--chakra-colors-blue-500)',
  warning: 'var(--chakra-colors-yellow-500)',
  error: 'var(--chakra-colors-red-500)',
  loading: 'var(--chakra-colors-primary)',
};

export default function MessageBox({ 
  type = 'info', 
  message, 
  height = '150px',
  fullWidth = true,
  marginTop = '0'
}: MessageBoxProps) {
  // Heuristic: treat "No ... yet" style messages as warnings
  const isNoDataMsg = /no\s+(deployment|deployments|data|records)\s+yet/i.test(message);
  const effectiveType: MessageType = isNoDataMsg ? 'warning' as const : type;
  const Icon = iconMap[effectiveType];
  const iconColor = colorMap[effectiveType];

  return (
    <Box 
      w="100%" 
      h={height}
      display="flex" 
      justifyContent="center" 
      alignItems="center" 
      bg="var(--chakra-colors-bg-subtle)" 
      borderRadius="var(--chakra-radii-md)" 
      boxShadow="var(--chakra-shadows-md)" 
      p="var(--chakra-spacing-2xl)"
      mt={marginTop}
      style={fullWidth ? { gridColumn: '1 / -1' } : undefined}
    >
      <Flex align="center" justify="center" gap="var(--chakra-spacing-xs)" direction="row" h="100%">
        {effectiveType === 'loading' ? (
          <Spinner size="lg" color={iconColor} />
        ) : (
          <Icon size={28} color={iconColor} />
        )}
        <Text fontSize="lg" color="var(--chakra-colors-fg-muted)" whiteSpace="nowrap">
          {message}
        </Text>
      </Flex>
    </Box>
  );
}
