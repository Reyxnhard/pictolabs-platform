import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class KioskGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(KioskGateway.name);
  
  // Map of connected booths: socketId -> boothId
  private connectedBooths = new Map<string, string>();

  constructor(private prisma: PrismaService) {}

  async handleConnection(client: Socket) {
    const deviceSecret = (
      client.handshake.headers['x-device-secret'] ||
      client.handshake.auth?.deviceSecret ||
      (client.handshake.query?.deviceSecret as string)
    ) as string;
    
    // If no deviceSecret, it's likely an Admin Dashboard web client
    if (!deviceSecret) {
      this.logger.log(`Client connected without deviceSecret (Admin Dashboard): ${client.id}`);
      client.join('dashboards');
      return;
    }

    // Authenticate Kiosk by deviceSecret
    const booth = await this.prisma.booth.findUnique({
      where: { deviceSecret },
      include: { config: true },
    });

    if (!booth) {
      this.logger.warn(`Kiosk connection rejected: Invalid deviceSecret "${deviceSecret}"`);
      client.disconnect(true);
      return;
    }

    // Mark booth online
    await this.prisma.booth.update({
      where: { id: booth.id },
      data: { status: 'ONLINE' },
    });

    this.connectedBooths.set(client.id, booth.id);
    client.join(`booth:${booth.id}`);
    client.join('kiosks');
    
    this.logger.log(`✓ Booth Online: ${booth.name} (${booth.id})`);
    
    // Notify Dashboards
    this.server.to('dashboards').emit('booth_status_changed', {
      boothId: booth.id,
      name: booth.name,
      status: 'ONLINE',
    });

    // Send latest config immediately on connect
    if (booth.config?.generalSettings) {
      try {
        const general = JSON.parse(booth.config.generalSettings);
        client.emit('CONFIG_UPDATE', general);
      } catch {
        client.emit('CONFIG_UPDATE', booth.config);
      }
    }
  }

  async handleDisconnect(client: Socket) {
    const boothId = this.connectedBooths.get(client.id);
    
    if (boothId) {
      await this.prisma.booth.update({
        where: { id: boothId },
        data: { status: 'OFFLINE' },
      });
      
      this.logger.log(`✗ Booth Offline: ${boothId}`);
      this.connectedBooths.delete(client.id);

      this.server.to('dashboards').emit('booth_status_changed', {
        boothId,
        status: 'OFFLINE',
      });
    }
  }

  @SubscribeMessage('HEALTH_PING')
  async handleHealthPing(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: any,
  ) {
    const boothId = this.connectedBooths.get(client.id);
    if (!boothId) return;

    await this.prisma.boothHealthLog.create({
      data: {
        boothId,
        cpuTemp: typeof payload.cpuTemp === 'number' ? payload.cpuTemp : null,
        paperCount: typeof payload.paperCount === 'number' ? payload.paperCount : null,
        cameraState: payload.cameraState || 'OK',
        printerState: payload.printerState || 'READY',
        rawPayload: JSON.stringify(payload),
      },
    });

    // Relay real-time telemetry to Dashboards
    this.server.to('dashboards').emit('booth_telemetry', {
      boothId,
      ...payload,
    });
    
    return { status: 'ok' };
  }

  @SubscribeMessage('PUSH_CONFIG')
  async handlePushConfig(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: { boothId?: string; config: any },
  ) {
    await this.pushConfigUpdate(payload?.boothId, payload?.config);
    return { status: 'ok', pushed: true };
  }

  // --- Push Methods ---

  /**
   * Pushes a config update to all kiosks or a specific booth
   */
  async pushConfigUpdate(boothId: string | undefined, config: any) {
    if (!boothId || boothId === 'all') {
      this.server.emit('CONFIG_UPDATE', config);
      this.logger.log(`[WebSocket] Broadcasted CONFIG_UPDATE to all live booths`);
    } else {
      this.server.to(`booth:${boothId}`).emit('CONFIG_UPDATE', config);
      this.logger.log(`[WebSocket] Pushed CONFIG_UPDATE to booth: ${boothId}`);
    }
  }
}
