import * as React from 'react';
import {
  Box,
  Button,
  Flex,
  Text,
  Input,
  Badge,
  InputGroup,
  Separator,
  Dialog,
  Drawer,
  Combobox,
  useListCollection,
  Portal,
  useFilter,
} from '@chakra-ui/react';
import { HiXMark, HiPlus } from 'react-icons/hi2';
import { FaSearch } from 'react-icons/fa';
import { useEnvironmentResourcePermissions, useProjectResourcePermissions, useUsers, useUsersByIds, useGrantResourcePermission, useRevokeResourcePermission } from '../../api/client';
import MessageBox from '@/components/MessageBox';
import { useAuth } from '@/contexts/AuthContext';
import { Link } from 'react-router-dom';

interface PermissionsTabProps {
  environmentId: string;
  environmentOwnerId?: string;
  projectId?: string; // Project ID to fetch project-level permissions
  projectCreatedAt?: string; // Project created_at date for owner permission
  projectUpdatedAt?: string; // Project updated_at date for owner permission
  canManagePermissions: boolean;
  resourcePermissions?: Array<{
    id: string;
    userId: string;
    scope: string;
    resourceId: string;
    actions: string[];
    grantedAt: string;
    grantedBy: string;
  }>;
}

export default function PermissionsTab({ environmentId, environmentOwnerId, projectId, projectCreatedAt, projectUpdatedAt, canManagePermissions, resourcePermissions: resourcePermissionsFromProps }: PermissionsTabProps) {
  const { user: currentUser } = useAuth();
  const { data: permissionsFallback, isLoading: permissionsLoading } = useEnvironmentResourcePermissions(
    environmentId,
    { enabled: !resourcePermissionsFromProps } // Disable if data is provided via props
  );
  
  // Always fetch project-level permissions to show users with project-level access
  // This is needed even when using props because props only contain environment-level permissions
  const { data: projectPermissionsFallback, isLoading: projectPermissionsLoading } = useProjectResourcePermissions(
    projectId || '',
    { enabled: !!projectId } // Always fetch if we have projectId
  );
  
  // Use props data if available, otherwise fall back to individual query
  // Filter to only environment-level permissions (props might include all permissions)
  const environmentPermissions = React.useMemo(() => {
    const perms = resourcePermissionsFromProps || permissionsFallback || [];
    // Filter to only environment-level permissions
    return perms.filter(perm => perm.scope === 'environment');
  }, [resourcePermissionsFromProps, permissionsFallback]);
  
  // Get project-level permissions (already filtered to scope='project' by the query)
  const projectPermissions = projectPermissionsFallback || [];
  
  // Combine environment and project permissions
  // Project permissions are inherited, so we show them with 'project' scope
  // Environment permissions are explicit, so we show them with 'environment' scope
  // If a user has both, prefer the environment-level permission (more specific)
  const allPermissions = React.useMemo(() => {
    // environmentPermissions is already filtered to scope='environment'
    const envPerms = (environmentPermissions || []).map(perm => ({ ...perm, _source: 'environment' }));
    
    // Project permissions from the query are already filtered to scope='project'
    const projPerms = (projectPermissions || []).map(perm => ({ ...perm, _source: 'project' }));
    
    // Combine and deduplicate: if user has both project and environment permissions, keep environment one
    const permissionMap = new Map<string, typeof envPerms[0]>();
    
    // First add project permissions
    projPerms.forEach(perm => {
      if (!environmentOwnerId || perm.userId !== environmentOwnerId) {
        permissionMap.set(perm.userId, perm);
      }
    });
    
    // Then add/override with environment permissions (more specific)
    envPerms.forEach(perm => {
      if (!environmentOwnerId || perm.userId !== environmentOwnerId) {
        permissionMap.set(perm.userId, perm);
      }
    });
    
    return Array.from(permissionMap.values());
  }, [environmentPermissions, projectPermissions, environmentOwnerId]);
  
  // Get unique user IDs from all permissions and owner
  const allPermissionUserIds = React.useMemo(() => {
    const ids = new Set<string>();
    if (environmentOwnerId) ids.add(environmentOwnerId);
    allPermissions.forEach(perm => {
      if (perm.userId) ids.add(perm.userId);
    });
    return Array.from(ids);
  }, [allPermissions, environmentOwnerId]);
  
  // Fetch only the users we need (from permissions + owner) using batch query
  const usersQuery = useUsersByIds(allPermissionUserIds, { enabled: allPermissionUserIds.length > 0 });
  
  // For the grant permission form, fetch all users (lazy, only when form is visible)
  // Only fetch when canManagePermissions is true (form will be shown)
  const { data: allUsersData, isLoading: allUsersLoading } = useUsers(undefined, { enabled: canManagePermissions });

  const grantMutation = useGrantResourcePermission();
  const revokeMutation = useRevokeResourcePermission();

  const [selectedUserId, setSelectedUserId] = React.useState<string>('');
  const [selectedActions, setSelectedActions] = React.useState<string[]>(['read']);
  const [permissionSearch, setPermissionSearch] = React.useState('');
  const [revokePermissionId, setRevokePermissionId] = React.useState<string | null>(null);
  const [revokePermissionScope, setRevokePermissionScope] = React.useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = React.useState(false);

  // Use the optimized users list for displaying permissions
  const users = usersQuery.data || [];
  const usersLoading = usersQuery.isLoading;
  
  // For the grant permission form, use all users
  const allUsers = allUsersData?.items || [];
  
  // Filter out owner from the user list for granting permissions (they already have all permissions)
  const filteredUsers = React.useMemo(() => {
    let users = allUsers;
    
    // Exclude owner from the selectable users
    if (environmentOwnerId) {
      users = users.filter(user => user.id !== environmentOwnerId);
    }
    
    return users;
  }, [allUsers, environmentOwnerId]);

  // Use filter hook for Combobox filtering
  const { contains } = useFilter({ sensitivity: "base" });

  // Create collection for user Combobox with filter
  const { collection: usersCollection, filter: usersFilter } = useListCollection({
    initialItems: filteredUsers.map((user) => ({
      value: user.id,
      label: `${user.name} (${user.email})`,
    })),
    filter: contains,
  });

  // Get user info for each permission
  // Show "Loading..." if users are still loading, otherwise show user info or "Unknown"
  const resourcePermissionsWithUsers = React.useMemo(() => {
    const mapped = allPermissions.map(perm => {
      const user = users.find((u: { id: string }) => u.id === perm.userId);
      const scope: 'project' | 'environment' = perm._source === 'project' ? 'project' : 'environment';
      return {
        ...perm,
        userName: usersLoading ? 'Loading...' : (user?.name || 'Unknown'),
        userEmail: usersLoading ? 'Loading...' : (user?.email || 'Unknown'),
        isOwner: false,
        isAuthenticatedUsers: false,
        permissionScope: scope,
      };
    });
    return mapped;
  }, [allPermissions, users, usersLoading]);

  // Add owner to the permissions list if owner exists
  const ownerUser = environmentOwnerId 
    ? (users.find((u: { id: string }) => u.id === environmentOwnerId) || null)
    : null;
  const ownerPermission = environmentOwnerId ? {
    id: `owner-${environmentOwnerId}`,
    userId: environmentOwnerId,
    scope: 'environment',
    resourceId: environmentId,
    actions: ['admin', 'write', 'read', 'delete'],
    grantedAt: projectCreatedAt || projectUpdatedAt || new Date().toISOString(), // Use project created_at or updated_at
    grantedBy: environmentOwnerId,
    userName: usersLoading && !ownerUser ? 'Loading...' : (ownerUser?.name || 'Loading...'),
    userEmail: usersLoading && !ownerUser ? 'Loading...' : (ownerUser?.email || 'Loading...'),
    isOwner: true,
    isAuthenticatedUsers: false,
    permissionScope: 'project' as const, // Owner has project-level access
  } : null;

  // Add "Authenticated Users" entry with read access (default for all authenticated users)
  const authenticatedUsersPermission = {
    id: 'authenticated-users',
    userId: '*', // Special identifier for all authenticated users
    scope: 'environment',
    resourceId: environmentId,
    actions: ['read'],
    grantedAt: 'N/A', // System default permission - no specific date
    grantedBy: 'system',
    userName: 'Authenticated Users',
    userEmail: 'All logged-in users',
    isOwner: false,
    isAuthenticatedUsers: true,
    permissionScope: 'project' as const, // Default permission is at project level
  };

  // Combine permissions: owner first, then authenticated users, then resource permissions
  const permissionsWithUsers = [
    ...(ownerPermission ? [ownerPermission] : []),
    authenticatedUsersPermission,
    ...resourcePermissionsWithUsers,
  ];

  const handleActionToggle = (action: string) => {
    setSelectedActions(prev => 
      prev.includes(action) 
        ? prev.filter(a => a !== action)
        : [...prev, action]
    );
  };

  const handleGrant = async () => {
    if (!selectedUserId || selectedActions.length === 0) {
      return;
    }

    try {
      await grantMutation.mutateAsync({
        userId: selectedUserId,
        scope: 'environment',
        resourceId: environmentId,
        actions: selectedActions,
      });
      setSelectedUserId('');
      setSelectedActions(['read']);
      setIsDrawerOpen(false); // Close drawer after successful grant
    } catch (error) {
      console.error('Error granting permission:', error);
    }
  };

  const handleRevoke = (permissionId: string, scope: string) => {
    setRevokePermissionId(permissionId);
    setRevokePermissionScope(scope);
  };

  const confirmRevoke = async () => {
    if (!revokePermissionId) return;

    try {
      await revokeMutation.mutateAsync({
        permissionId: revokePermissionId,
        resourceId: environmentId,
        scope: revokePermissionScope || 'environment', // Default to environment scope
      });
      setRevokePermissionId(null);
      setRevokePermissionScope(null);
    } catch (error) {
      console.error('Error revoking permission:', error);
    }
  };

  const cancelRevoke = () => {
    setRevokePermissionId(null);
    setRevokePermissionScope(null);
  };

  const getActionBadgeColor = (action: string) => {
    switch (action) {
      case 'read': return 'blue';
      case 'write': return 'green';
      case 'delete': return 'orange';
      case 'admin': return 'red';
      default: return 'gray';
    }
  };

  // Filter permissions based on search
  const filteredPermissions = React.useMemo(() => {
    if (!permissionSearch) return permissionsWithUsers;
    const searchLower = permissionSearch.toLowerCase();
    return permissionsWithUsers.filter(perm => 
      perm.userName.toLowerCase().includes(searchLower) ||
      perm.userEmail.toLowerCase().includes(searchLower) ||
      perm.actions.some(action => action.toLowerCase().includes(searchLower))
    );
  }, [permissionsWithUsers, permissionSearch]);

  // Show loading only if permissions are still loading (users can load in background)
  if (permissionsLoading || (projectPermissionsLoading && !!projectId)) {
    return <MessageBox type="loading" message="Loading permissions..." marginTop="0" />;
  }

  // Get the permission being revoked for display in the modal
  const permissionToRevoke = revokePermissionId 
    ? permissionsWithUsers.find(p => p.id === revokePermissionId)
    : null;

  return (
    <Box bg="var(--chakra-colors-sws-secondary)" mt="var(--chakra-spacing-sm)" borderRadius="var(--chakra-radii-md)" p="var(--chakra-spacing-sm)">
      {/* Revoke Confirmation Modal */}
      <Dialog.Root open={revokePermissionId !== null} onOpenChange={(e) => {
        if (!e.open) {
          setRevokePermissionId(null);
        }
      }}>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>Revoke Permission</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
              <Text>
                Are you sure you want to revoke permission for{' '}
                <strong>{permissionToRevoke?.userName || 'this user'}</strong>?
                {permissionToRevoke?.userEmail && (
                  <>
                    {' '}({permissionToRevoke.userEmail})
                  </>
                )}
              </Text>
              {permissionToRevoke && permissionToRevoke.actions.length > 0 && (
                <Box mt="var(--chakra-spacing-sm)">
                  <Text fontSize="sm" color="var(--chakra-colors-fg-muted)" mb="var(--chakra-spacing-xs)">
                    Current permissions:
                  </Text>
                  <Flex gap="var(--chakra-spacing-xs)" wrap="wrap">
                    {permissionToRevoke.actions.map((action) => {
                      const badgeColor = getActionBadgeColor(action);
                      return (
                        <Badge
                          key={action}
                          colorPalette={badgeColor}
                          variant="solid"
                          textTransform="capitalize"
                        >
                          {action}
                        </Badge>
                      );
                    })}
                  </Flex>
                </Box>
              )}
            </Dialog.Body>
            <Dialog.Footer>
              <Button
                variant="outline"
                onClick={cancelRevoke}
                disabled={revokeMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                colorPalette="red"
                onClick={confirmRevoke}
                disabled={revokeMutation.isPending}
                loading={revokeMutation.isPending}
              >
                Revoke Permission
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Dialog.Root>
      {/* Header with Search */}
      <Flex direction="row" justify="flex-end" align="center" 
              gap="var(--chakra-spacing-sm)" wrap="wrap" bg="var(--chakra-colors-bg-subtle)">
          <Flex align="center" gap="var(--chakra-spacing-xs)" flex="1" grow={1}>          
            <InputGroup startElement={<FaSearch />} maxW="300px" minW="150px">
              <Input
                size="sm"
                placeholder="Search permissions..."
                value={permissionSearch}
                onChange={(e) => setPermissionSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                  }
                }}
                flex="1"
              />
            </InputGroup>                      
          </Flex>
          {/* Add User Button */}
          <Button 
            variant="solid" 
            size="xs"
            onClick={() => setIsDrawerOpen(true)}
            disabled={!canManagePermissions}
            opacity={canManagePermissions ? 1 : 0.5}
            cursor={canManagePermissions ? 'pointer' : 'not-allowed'}
          >
            <HiPlus />
            <Text fontSize="sm" color={canManagePermissions ? "var(--chakra-colors-bg-subtle)" : "var(--chakra-colors-fg-muted)"}>
              Add User
            </Text>
          </Button>
        </Flex>
      <Separator my="var(--chakra-spacing-sm)" />
      {/* Existing Permissions Table */}
      <Box mb="var(--chakra-spacing-sm)">        
        {filteredPermissions.length === 0 ? (
          <MessageBox type="info" message={permissionSearch ? "No permissions match your search." : "No permissions granted yet."} marginTop="0" height="100px" />
        ) : (
          <Box overflowX="auto">
            <table
              className="table-hover"
              style={{
                width: '100%',
                minWidth: 640,
                borderCollapse: 'separate',
                borderSpacing: 0,
              }}
            >
              <thead>
                <tr>
                  <th style={{ padding: 'var(--chakra-spacing-sm)', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--chakra-colors-fg-muted)' }}>User</th>
                  <th style={{ padding: 'var(--chakra-spacing-sm)', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--chakra-colors-fg-muted)' }}>Email</th>
                  <th style={{ padding: 'var(--chakra-spacing-sm)', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--chakra-colors-fg-muted)' }}>Scope</th>
                  <th style={{ padding: 'var(--chakra-spacing-sm)', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--chakra-colors-fg-muted)' }}>Permissions</th>
                  <th style={{ padding: 'var(--chakra-spacing-sm)', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--chakra-colors-fg-muted)' }}>Granted At</th>
                  <th style={{ padding: 'var(--chakra-spacing-sm)', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--chakra-colors-fg-muted)' }}>Actions</th>                  
                </tr>
              </thead>
              <tbody>
                {filteredPermissions.map((perm) => (
                  <tr
                    key={perm.id}
                    style={{
                      borderTop: '1px solid var(--chakra-colors-border)',
                    }}
                  >
                    <td style={{ padding: 'var(--chakra-spacing-sm)', fontSize: 14, fontWeight: 600 }}>
                      <Flex align="center" gap="var(--chakra-spacing-xs)">
                        <Text>{perm.userName}</Text>
                        {perm.isOwner && (
                          <Badge colorPalette="purple" variant="solid" fontSize="xs">
                            Owner
                          </Badge>
                        )}
                        {perm.isAuthenticatedUsers && (
                          <Badge colorPalette="blue" variant="outline" fontSize="xs">
                            System
                          </Badge>
                        )}
                      </Flex>
                    </td>
                    <td style={{ padding: 'var(--chakra-spacing-sm)', fontSize: 14 }}>{perm.userEmail}</td>
                    <td style={{ padding: 'var(--chakra-spacing-sm)' }}>
                      {perm.permissionScope === 'project' ? (
                        <Badge colorPalette="blue" variant="solid" fontSize="xs" textTransform="capitalize">
                          Project
                        </Badge>
                      ) : (
                        <Badge colorPalette="green" variant="solid" fontSize="xs" textTransform="capitalize">
                          Environment
                        </Badge>
                      )}
                    </td>
                    <td style={{ padding: 'var(--chakra-spacing-sm)' }}>
                      <Flex gap="var(--chakra-spacing-xs)" wrap="wrap">
                        {perm.actions.map((action) => {
                          const badgeColor = getActionBadgeColor(action);
                          return (
                            <Badge
                              key={action}
                              colorPalette={badgeColor}
                              variant="solid"
                              textTransform="capitalize"
                            >
                              {action}
                            </Badge>
                          );
                        })}
                      </Flex>
                    </td>
                      <td className="text-muted" style={{ padding: 'var(--chakra-spacing-sm)', fontSize: 13 }}>
                        {(() => {
                          // For Authenticated Users, show "N/A"
                          if (perm.isAuthenticatedUsers && perm.grantedAt === 'N/A') {
                            return 'N/A';
                          }
                          
                          const date = new Date(perm.grantedAt);
                          // Check if date is valid
                          if (isNaN(date.getTime())) {
                            return 'N/A';
                          }
                          
                          const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
                          
                          // Get timezone abbreviation using formatToParts
                          const formatter = new Intl.DateTimeFormat('en-US', {
                            timeZone,
                            timeZoneName: 'short'
                          });
                          const parts = formatter.formatToParts(date);
                          let tzAbbr = parts.find(part => part.type === 'timeZoneName')?.value || '';
                          
                          // If we got an offset (like GMT+5:30), try to get abbreviation differently
                          if (tzAbbr.startsWith('GMT') || tzAbbr.includes('+') || tzAbbr.includes('-')) {
                            // Try using 'shortOffset' or fallback to timezone ID mapping
                            const tzMap: Record<string, string> = {
                              'Asia/Kolkata': 'IST',
                              'Asia/Calcutta': 'IST',
                              'America/New_York': 'EST',
                              'America/Los_Angeles': 'PST',
                              'America/Chicago': 'CST',
                              'Europe/London': 'GMT',
                              'UTC': 'UTC'
                            };
                            tzAbbr = tzMap[timeZone] || timeZone.split('/').pop()?.substring(0, 3).toUpperCase() || tzAbbr;
                          }
                          
                          // Format date and time
                          return date.toLocaleString(navigator.language || 'en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            timeZone
                          }) + ` ${tzAbbr}`;
                        })()}
                      </td>
                    {/* For project-level permissions (not owner, not System): show link to project permissions */}
                    {!perm.isOwner && !perm.isAuthenticatedUsers && perm.permissionScope === 'project' && projectId && (
                      <td style={{ padding: 'var(--chakra-spacing-sm)' }}>
                        <Link 
                          to={`/projects/${projectId}?tab=permissions`}
                          style={{ 
                            color: 'var(--chakra-colors-blue-500)',
                            textDecoration: 'underline',
                            fontSize: 'var(--chakra-fontsize-xs)'
                          }}
                        >
                          View
                        </Link>
                      </td>
                    )}
                    {/* For environment-level permissions: show revoke button or self message */}
                    {!perm.isOwner && !perm.isAuthenticatedUsers && perm.permissionScope === 'environment' && currentUser?.id === perm.userId && (
                      <td style={{ padding: 'var(--chakra-spacing-sm)' }}>
                        <Text fontSize="xs" color="var(--chakra-colors-fg-muted)" fontStyle="italic">
                          Cannot revoke self permission
                        </Text>
                      </td>
                    )}
                    {canManagePermissions && !perm.isOwner && !perm.isAuthenticatedUsers && currentUser?.id !== perm.userId && perm.permissionScope === 'environment' && (
                      <td style={{ padding: 'var(--chakra-spacing-sm)' }}>
                        <Button
                          size="2xs"
                          variant="outline"
                          colorPalette="red"
                          onClick={() => handleRevoke(perm.id, perm.scope)}
                          disabled={revokeMutation.isPending}
                        >
                          <HiXMark />
                          Revoke
                        </Button>
                      </td>
                    )}
                    {/* For owner and System: show cannot revoke message */}
                    {(perm.isOwner || perm.isAuthenticatedUsers) && (
                      <td style={{ padding: 'var(--chakra-spacing-sm)' }}>
                        <Text fontSize="xs" color="var(--chakra-colors-fg-muted)" fontStyle="italic">
                          {perm.isOwner ? 'Cannot revoke owner' : 'Cannot revoke default permission'}
                        </Text>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </Box>
        )}
      </Box>

      {/* Add New Permission Drawer */}
      {canManagePermissions && (
        <Drawer.Root           
          open={isDrawerOpen} 
          onOpenChange={(e) => {
            setIsDrawerOpen(e.open);
            // Reset form when drawer closes
            if (!e.open) {
              setSelectedUserId('');
              setSelectedActions(['read']);
            }
          }} 
          placement="end"
          size="sm"
        >
          <Drawer.Backdrop />
          <Drawer.Positioner>
            <Drawer.Content>
              <Drawer.Header style={{ boxShadow: 'var(--chakra-shadows-md)', padding: 'var(--chakra-spacing-sm)'}}>
                <Flex justify="space-between" align="center" width="100%">
                  <Drawer.Title>Grant Permission</Drawer.Title>
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
              <Drawer.Body>
                <Flex direction="column" gap="var(--chakra-spacing-md)" alignItems="stretch">
                  {/* User Select */}
                  <Box>
                    <Text fontSize="sm" mb="var(--chakra-spacing-xs)" fontWeight="medium">
                      User
                    </Text>
                    <Combobox.Root
                      value={selectedUserId ? [selectedUserId] : []}
                      onValueChange={(details: { value: string[] }) => {
                        setSelectedUserId(details.value[0] || '');
                      }}
                      onInputValueChange={(e) => usersFilter(e.inputValue)}
                      disabled={allUsersLoading || filteredUsers.length === 0}
                      collection={usersCollection}
                    >
                      <Combobox.Control>
                        <Combobox.Input 
                          placeholder={
                            allUsersLoading 
                              ? 'Loading users...' 
                              : (allUsers.length === 0 
                                  ? 'No users available' 
                                  : 'Select a user')
                          }
                          disabled={allUsersLoading || filteredUsers.length === 0}
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
                              {allUsersLoading 
                                ? 'Loading users...' 
                                : (allUsers.length === 0 
                                    ? 'No users available' 
                                    : 'No users found')}
                            </Combobox.Empty>
                            {usersCollection.items.map((item: { value: string; label: string }) => (
                              <Combobox.Item key={item.value} item={item}>
                                {item.label}
                              </Combobox.Item>
                            ))}
                          </Combobox.Content>
                        </Combobox.Positioner>
                      </Portal>
                    </Combobox.Root>
                  </Box>

                  {/* Actions Checkboxes */}
                  <Box mt="5">
                    <Text fontSize="sm" mb="var(--chakra-spacing-xs)" fontWeight="medium">
                      Permissions
                    </Text>
                    <Flex direction="column" gap="var(--chakra-spacing-xs)">
                      {['read', 'write', 'delete', 'admin'].map((action) => (
                        <label
                          key={action}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 'var(--chakra-spacing-xs)',
                            cursor: 'pointer',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={selectedActions.includes(action)}
                            onChange={() => handleActionToggle(action)}
                            style={{
                              width: '16px',
                              height: '16px',
                              cursor: 'pointer',
                            }}
                          />
                          <Text textTransform="capitalize" fontSize="sm">{action}</Text>
                        </label>
                      ))}
                    </Flex>
                  </Box>

                  {/* Grant Button */}
                  <Flex justify="center" mt="5">
                    <Button
                      size="xs"
                      onClick={handleGrant}
                      disabled={!selectedUserId || selectedActions.length === 0 || grantMutation.isPending}
                      colorPalette="primary"
                    >
                      <HiPlus />
                      Grant Permission
                    </Button>
                  </Flex>
                </Flex>
              </Drawer.Body>
            </Drawer.Content>
          </Drawer.Positioner>
        </Drawer.Root>
      )}
      </Box>    
  );
}
