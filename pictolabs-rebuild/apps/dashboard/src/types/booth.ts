export type ComputedStatus = 'ONLINE' | 'DEGRADED' | 'OFFLINE' | 'MAINTENANCE';

export interface Branch {
  id: string;
  name: string;
  location?: string | null;
  companyId: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface BoothRuntime {
  appVersion: string | null;
  gitCommit: string | null;
  releaseChannel: string;
  machineName: string | null;
  localIp: string | null;
  osVersion: string | null;
  electronVersion: string | null;
}

export interface Booth {
  id: string;
  name: string;
  branchId: string;
  branch?: Branch | null;
  status: ComputedStatus;
  isMaintenance: boolean;
  lastSeen: string | null;
  secondsSinceLastHeartbeat: number | null;
  appVersion: string | null;
  gitCommit: string | null;
  releaseChannel: string;
  machineName: string | null;
  localIp: string | null;
  osVersion: string | null;
  electronVersion: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BoothStatusResponse {
  boothId: string;
  name: string;
  status: ComputedStatus;
  isMaintenance: boolean;
  lastSeen: string | null;
  secondsSinceLastHeartbeat: number | null;
  thresholds: {
    onlineUnderSeconds: number;
    degradedUnderSeconds: number;
    offlineOverSeconds: number;
  };
  runtime: BoothRuntime;
}

export interface UpdateBoothStatusPayload {
  status: 'NORMAL' | 'MAINTENANCE';
  reason?: string;
}
