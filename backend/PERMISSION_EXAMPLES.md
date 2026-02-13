# GraphQL Permission Mutation Examples

## Grant Resource Permissions to Users

### 1. Grant READ permission to a user for your project

```graphql
mutation GrantReadPermission {
  grantResourcePermission(
    input: {
      user_id: "USER_ID_HERE"           # The ID of the user you want to grant permission to
      scope: "project"                  # Scope: "project", "environment", or "service"
      resource_id: "PROJECT_ID_HERE"     # Your project ID
      actions: ["read"]                 # Permission level: read, write, delete, admin
    }
  ) {
    id
    user_id
    scope
    resource_id
    actions
    granted_at
    granted_by
  }
}
```

### 2. Grant WRITE permission (read + write) to a user for your project

```graphql
mutation GrantWritePermission {
  grantResourcePermission(
    input: {
      user_id: "USER_ID_HERE"
      scope: "project"
      resource_id: "PROJECT_ID_HERE"
      actions: ["read", "write"]        # User can read and update the project
    }
  ) {
    id
    user_id
    scope
    resource_id
    actions
    granted_at
    granted_by
  }
}
```

### 3. Grant ADMIN permission (full access) to a user for your project

```graphql
mutation GrantAdminPermission {
  grantResourcePermission(
    input: {
      user_id: "USER_ID_HERE"
      scope: "project"
      resource_id: "PROJECT_ID_HERE"
      actions: ["read", "write", "delete", "admin"]  # Full access
    }
  ) {
    id
    user_id
    scope
    resource_id
    actions
    granted_at
    granted_by
  }
}
```

### 4. Grant permission for a specific environment

```graphql
mutation GrantEnvironmentPermission {
  grantResourcePermission(
    input: {
      user_id: "USER_ID_HERE"
      scope: "environment"               # Environment-level permission
      resource_id: "ENVIRONMENT_ID_HERE"
      actions: ["read", "write"]
    }
  ) {
    id
    user_id
    scope
    resource_id
    actions
    granted_at
    granted_by
  }
}
```

### 5. Grant permission for a specific service

```graphql
mutation GrantServicePermission {
  grantResourcePermission(
    input: {
      user_id: "USER_ID_HERE"
      scope: "service"                  # Service-level permission
      resource_id: "SERVICE_ID_HERE"
      actions: ["read", "write"]
    }
  ) {
    id
    user_id
    scope
    resource_id
    actions
    granted_at
    granted_by
  }
}
```

## Helper Queries to Get IDs

### Get your user ID

```graphql
query GetCurrentUser {
  me {
    id
    email
    name
  }
}
```

### Get all users (to find user_id to grant permission to)

```graphql
query GetAllUsers {
  users {
    id
    email
    name
    active
  }
}
```

### Get your projects (to find project_id)

```graphql
query GetMyProjects {
  projects {
    id
    name
    description
    owner_id
  }
}
```

### Get a specific project

```graphql
query GetProject {
  project(id: "PROJECT_ID_HERE") {
    id
    name
    description
    owner_id
  }
}
```

### Get environments in a project

```graphql
query GetEnvironments {
  environments(project_id: "PROJECT_ID_HERE") {
    id
    name
    type
    project_id
  }
}
```

### Get services in a project

```graphql
query GetServices {
  services(project_id: "PROJECT_ID_HERE") {
    id
    name
    type
    project_id
    environment_id
  }
}
```

## Update Existing Permissions

### Update actions for an existing permission

```graphql
mutation UpdatePermission {
  updateResourcePermission(
    id: "PERMISSION_ID_HERE"             # The ID of the permission to update
    input: {
      actions: ["read", "write", "admin"]  # New actions
    }
  ) {
    id
    user_id
    scope
    resource_id
    actions
    granted_at
    granted_by
  }
}
```

## Revoke Permissions

### Revoke a permission

```graphql
mutation RevokePermission {
  revokeResourcePermission(id: "PERMISSION_ID_HERE")
}
```

## Check Existing Permissions

### Get all resource permissions for a project

```graphql
query GetResourcePermissions {
  resourcePermissions(scope: "project", resource_id: "PROJECT_ID_HERE") {
    id
    user_id
    scope
    resource_id
    actions
    granted_at
    granted_by
  }
}
```

### Get permissions for a specific user

```graphql
query GetUserResourcePermissions {
  resourcePermissions(user_id: "USER_ID_HERE") {
    id
    user_id
    scope
    resource_id
    actions
    granted_at
    granted_by
  }
}
```

## Complete Example Workflow

### Step 1: Find the user you want to grant permission to

```graphql
query FindUser {
  users(search: "user@example.com") {
    id
    email
    name
  }
}
```

### Step 2: Find your project ID

```graphql
query FindProject {
  projects(search: "My Project") {
    id
    name
    owner_id
  }
}
```

### Step 3: Grant permission

```graphql
mutation GrantPermission {
  grantResourcePermission(
    input: {
      user_id: "abc123-def456-ghi789"      # From Step 1
      scope: "project"
      resource_id: "xyz789-uvw456-rst123"  # From Step 2
      actions: ["read", "write"]
    }
  ) {
    id
    user_id
    scope
    resource_id
    actions
    granted_at
  }
}
```

## Permission Levels Explained

- **read**: User can view the project/environment/service
- **write**: User can update the project/environment/service (includes read)
- **delete**: User can delete the project/environment/service (includes read and write)
- **admin**: User has full administrative access including granting/revoking permissions (includes all above)

## Notes

- Only project owners and admins can grant permissions
- Project owners automatically have all permissions for their projects
- Permissions are hierarchical:
  - Project permissions apply to all environments and services in the project
  - Environment permissions apply to all services in that environment
- If you grant a permission that already exists, it will be updated with the new actions
