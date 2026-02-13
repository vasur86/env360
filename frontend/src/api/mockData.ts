import type { Project, Environment, Service, OverviewSummary, ServiceType } from '../types/domain';

export const mockProjects: Project[] = [
  {
    id: 'proj-1',
    name: 'Env360',
    description: 'Core platform',
    services: ['svc-1', 'svc-2', 'svc-3'],
    environments: ['env-dev', 'env-stg', 'env-prd'],
    createdAt: new Date().toISOString(),
  },
  {
    id: 'proj-2',
    name: 'Payments',
    description: 'Payments domain',
    services: ['svc-4', 'svc-5'],
    environments: ['env-dev', 'env-stg', 'env-prd'],
    createdAt: new Date().toISOString(),
  },
];

export const mockEnvironments: Environment[] = [
  {
    id: 'env-dev',
    name: 'Development',
    type: 'dev',
    url: 'https://dev.example.com',
    services: ['svc-1', 'svc-4'],
  },
  {
    id: 'env-stg',
    name: 'Staging',
    type: 'staging',
    url: 'https://stg.example.com',
    services: ['svc-2', 'svc-5'],
  },
  {
    id: 'env-prd',
    name: 'Production',
    type: 'prod',
    url: 'https://app.example.com',
    services: ['svc-1', 'svc-2', 'svc-3'],
  },
];

export const mockServices: Service[] = [
  {
    id: 'svc-1',
    name: 'api-gateway',
    type: 'microservice',
    projectId: 'proj-1',
    owner: 'platform',
    repo: 'github.com/org/api-gateway',
    runtime: 'node',
    status: 'healthy',
  },
  {
    id: 'svc-2',
    name: 'web-frontend',
    type: 'webapp',
    projectId: 'proj-1',
    owner: 'frontend',
    repo: 'github.com/org/web-frontend',
    runtime: 'node',
    status: 'healthy',
  },
  {
    id: 'svc-3',
    name: 'orders-db',
    type: 'database',
    projectId: 'proj-1',
    runtime: 'postgres',
    status: 'healthy',
  },
  {
    id: 'svc-4',
    name: 'payments',
    type: 'microservice',
    projectId: 'proj-2',
    owner: 'payments',
    repo: 'github.com/org/payments',
    runtime: 'go',
    status: 'degraded',
  },
  {
    id: 'svc-5',
    name: 'event-queue',
    type: 'queue',
    projectId: 'proj-2',
    runtime: 'kafka',
    status: 'healthy',
  },
];

export function computeOverviewSummary(): OverviewSummary {
  const byType = mockServices.reduce<Record<ServiceType, number>>(
    (acc, s) => {
      acc[s.type] += 1;
      return acc;
    },
    { microservice: 0, webapp: 0, database: 0, queue: 0 },
  );
  return {
    totalProjects: mockProjects.length,
    totalEnvironments: mockEnvironments.length,
    totalServices: mockServices.length,
    byServiceType: byType,
  };
}
