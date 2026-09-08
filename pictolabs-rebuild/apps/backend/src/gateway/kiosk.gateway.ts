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

    this.connectedBooths.set(client.id, booth.id);
    client.join(`booth:${booth.id}`);
    client.join('kiosks');
    
    this.logger.log(`✓ Kiosk Socket Connected: ${booth.name} (${booth.id})`);
    
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
      this.logger.log(`✗ Kiosk Socket Disconnected: ${boothId}`);
      this.connectedBooths.delete(client.id);

      // Note: Database status is NOT mutated on socket disconnect.
      // Status is computed dynamically from HTTP heartbeat last_seen.
      this.server.to('dashboards').emit('booth_socket_disconnected', {
        boothId,
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

  /**
   * Emits payment settled event to the specific booth and dashboard clients
   */
  notifyPaymentSettled(boothId: string, payload: any) {
    this.logger.log(`[WebSocket] Emitting payment:settled for booth ${boothId}: ${JSON.stringify(payload)}`);
    if (this.server) {
      // Emit to booth room
      this.server.to(`booth:${boothId}`).emit('payment:settled', payload);
      this.server.to(`booth:${boothId}`).emit('PAYMENT_SETTLED', payload);
      // Broadcast to kiosks room as well
      this.server.to('kiosks').emit('payment:settled', payload);
      this.server.to('dashboards').emit('payment:settled', payload);
    }
  }

  /**
   * Emits payment expired event to the booth
   */
  notifyPaymentExpired(boothId: string, payload: any) {
    this.logger.log(`[WebSocket] Emitting payment:expired for booth ${boothId}: ${JSON.stringify(payload)}`);
    if (this.server) {
      this.server.to(`booth:${boothId}`).emit('payment:expired', payload);
      this.server.to(`booth:${boothId}`).emit('PAYMENT_EXPIRED', payload);
      this.server.to('dashboards').emit('payment:expired', payload);
    }
  }
}

