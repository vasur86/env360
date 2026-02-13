export type ServiceType = 'microservice' | 'webapp' | 'database' | 'queue';

export type Project = {
  id: string;
  name: string;
  description?: string;
  services: string[]; // service ids
  environments: string[]; // environment ids
  createdAt: string;
};

export type Environment = {
  id: string;
  name: string;
  type: 'dev' | 'staging' | 'prod';
  url?: string;
  services: string[]; // service ids deployed here
};

export type Service = {
  id: string;
  name: string;
  type: ServiceType;
  projectId: string;
  owner?: string;
  repo?: string;
  runtime?: string;
  status: 'healthy' | 'degraded' | 'down' | 'unknown';
};

export type OverviewSummary = {
  totalProjects: number;
  totalEnvironments: number;
  totalServices: number;
  byServiceType: Record<ServiceType, number>;
};
