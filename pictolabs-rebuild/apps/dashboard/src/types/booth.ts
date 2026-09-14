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

export interface Device {
  id: string;
  boothId: string;
  deviceSecret?: string;
  machineGuid?: string | null;
  macAddress?: string | null;
  hostname?: string | null;
  osVersion?: string | null;
  appVersion?: string | null;
  status: 'ACTIVE' | 'REVOKED' | 'DECOMMISSIONED';
  pairedAt: string;
  lastSeenAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ActivationToken {
  id: string;
  token: string;
  boothId: string;
  createdByUserId?: string | null;
  expiresAt: string;
  usedAt?: string | null;
  usedByDeviceGuid?: string | null;
  ipAddress?: string | null;
  status: 'PENDING' | 'CONSUMED' | 'EXPIRED' | 'REVOKED';
  createdAt: string;
}

export interface Booth {
  id: string;
  name: string;
  branchId: string;
  branch?: Branch | null;
  device?: Device | null;
  activationTokens?: ActivationToken[];
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
