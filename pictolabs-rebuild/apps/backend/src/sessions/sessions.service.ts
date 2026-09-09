import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SessionQueryDto } from './dto/session-query.dto';
import { CreateSessionEventDto } from './dto/session-timeline.dto';
import { RedeliveryEmailDto, ExtendLinkDto, ReprintDto } from './dto/redelivery.dto';
import { SessionHealthService } from './session-health.service';
import { SessionRedeliveryService } from './session-redelivery.service';

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly healthService: SessionHealthService,
    private readonly redeliveryService: SessionRedeliveryService,
  ) {}

  /**
   * Search and list sessions with pagination and multi-dimensional filters.
   */
  async findAll(query: SessionQueryDto) {
    const page = Math.max(1, parseInt(String(query.page || 1), 10));
    const limit = Math.min(100, Math.max(1, parseInt(String(query.limit || 10), 10)));
    const skip = (page - 1) * limit;

    const where: any = {};

    // 1. Partial Search by Session ID
    if (query.search && query.search.trim() !== '') {
      where.id = {
        contains: query.search.trim(),
        mode: 'insensitive',
      };
    }

    // 2. Filter by Booth ID
    if (query.boothId && query.boothId.trim() !== '' && query.boothId !== 'ALL') {
      where.boothId = query.boothId.trim();
    }

    // 3. Filter by Branch ID (via Booth relation)
    if (query.branchId && query.branchId.trim() !== '' && query.branchId !== 'ALL') {
      where.booth = {
        ...(where.booth || {}),
        branchId: query.branchId.trim(),
      };
    }

    // 4. Filter by Session Status (Case-insensitive match, accepts canonical & legacy)
    if (query.status && query.status.trim() !== '' && query.status !== 'ALL') {
      where.status = {
        equals: query.status.trim(),
        mode: 'insensitive',
      };
    }

    // 5. Filter by Date (YYYY-MM-DD in Indonesia / UTC range)
    if (query.date && query.date.trim() !== '') {
      const dateStr = query.date.trim();
      const startOfDay = new Date(`${dateStr}T00:00:00.000Z`);
      const endOfDay = new Date(`${dateStr}T23:59:59.999Z`);

      where.createdAt = {
        gte: startOfDay,
        lte: endOfDay,
      };
    }

    const [total, rawSessions] = await Promise.all([
      this.prisma.session.count({ where }),
      this.prisma.session.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          booth: {
            include: {
              branch: true,
            },
          },
          _count: {
            select: {
              photos: true,
              prints: true,
            },
          },
        },
      }),
    ]);

    const data = rawSessions.map((s) => ({
      id: s.id,
      boothId: s.boothId,
      boothName: s.booth?.name || 'Unknown Booth',
      branchId: s.booth?.branchId || null,
      branchName: s.booth?.branch?.name || 'Unknown Branch',
      status: s.status,
      customerEmail: s.customerEmail,
      customerPhone: s.customerPhone,
      photoCount: s._count?.photos ?? 0,
      printCount: s._count?.prints ?? 0,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    }));

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Aggregate operational metrics for today (00:00:00 WIB to now).
   */
  async getTodayStats() {
    const now = new Date();
    // Offset for WIB (UTC+7)
    const wibOffsetMs = 7 * 60 * 60 * 1000;
    const wibNow = new Date(now.getTime() + wibOffsetMs);
    const todayYmd = wibNow.toISOString().split('T')[0];
    const startOfTodayUtc = new Date(`${todayYmd}T00:00:00.000+07:00`);

    const [sessionsToday, completedToday, failedToday, activeBooths] = await Promise.all([
      this.prisma.session.count({
        where: {
          createdAt: { gte: startOfTodayUtc },
        },
      }),
      this.prisma.session.count({
        where: {
          createdAt: { gte: startOfTodayUtc },
          status: { in: ['COMPLETED', 'printed', 'ready'] },
        },
      }),
      this.prisma.session.count({
        where: {
          createdAt: { gte: startOfTodayUtc },
          status: 'FAILED',
        },
      }),
      this.prisma.session.findMany({
        where: {
          createdAt: { gte: startOfTodayUtc },
        },
        select: { boothId: true },
        distinct: ['boothId'],
      }),
    ]);

    return {
      sessionsToday,
      completedToday,
      failedToday,
      activeBoothsToday: activeBooths.length,
      calculatedAt: now.toISOString(),
    };
  }

  /**
   * Retrieve single session details.
   */
  async findOne(id: string) {
    const session = await this.prisma.session.findUnique({
      where: { id },
      include: {
        booth: {
          include: {
            branch: true,
          },
        },
        photos: {
          orderBy: { sequenceNo: 'asc' },
        },
        prints: true,
        transaction: {
          include: {
            payment: true,
          },
        },
      },
    });

    if (!session) {
      throw new NotFoundException(`Session with ID "${id}" not found`);
    }

    return {
      id: session.id,
      boothId: session.boothId,
      boothName: session.booth?.name || 'Unknown Booth',
      branchId: session.booth?.branchId || null,
      branchName: session.booth?.branch?.name || 'Unknown Branch',
      status: session.status,
      customerEmail: session.customerEmail,
      customerPhone: session.customerPhone,
      retentionExpiresAt: session.retentionExpiresAt?.toISOString() || null,
      customerDownloadUrl: `https://pictolabs.id/d/${session.id}`,
      photos: session.photos,
      prints: session.prints,
      transaction: session.transaction,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    };
  }

  /**
   * Get chronological lifecycle events for a session.
   * If no explicit events exist in database, synthesize baseline events from relational data.
   */
  async getTimeline(sessionId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        events: {
          orderBy: { createdAt: 'asc' },
        },
        transaction: {
          include: { payment: true },
        },
        prints: true,
        photos: true,
      },
    });

    if (!session) {
      throw new NotFoundException(`Session "${sessionId}" not found`);
    }

    // If explicit recorded events exist, return them
    if (session.events && session.events.length > 0) {
      return session.events;
    }

    // Synthesize timeline from session artifacts
    const syntheticEvents: any[] = [];
    const baseTime = new Date(session.createdAt).getTime();

    // 1. Session Init
    syntheticEvents.push({
      id: `syn_init_${sessionId}`,
      sessionId,
      eventType: 'SESSION_INIT',
      stage: 'SESSION',
      status: 'SUCCESS',
      durationMs: 0,
      payload: JSON.stringify({ boothId: session.boothId, status: session.status }),
      createdAt: new Date(baseTime).toISOString(),
    });

    // 2. Payment Pending / Settled
    if (session.transaction) {
      syntheticEvents.push({
        id: `syn_pay_${sessionId}`,
        sessionId,
        eventType: session.transaction.status === 'SETTLED' ? 'PAYMENT_SETTLED' : 'PAYMENT_PENDING',
        stage: 'PAYMENT',
        status: session.transaction.status === 'SETTLED' ? 'SUCCESS' : 'WARNING',
        durationMs: 14500,
        payload: JSON.stringify({
          amount: session.transaction.amount,
          method: session.transaction.payment?.method || 'QRIS',
          orderId: session.transaction.orderId,
        }),
        createdAt: new Date(baseTime + 15000).toISOString(),
      });
    }

    // 3. Captures
    if (session.photos && session.photos.length > 0) {
      syntheticEvents.push({
        id: `syn_cap_${sessionId}`,
        sessionId,
        eventType: 'CAPTURE_COMPLETED',
        stage: 'CAPTURE',
        status: 'SUCCESS',
        durationMs: 42000,
        payload: JSON.stringify({ photoCount: session.photos.length }),
        createdAt: new Date(baseTime + 60000).toISOString(),
      });

      // 4. Storage Upload
      const hasUploaded = session.photos.some((p) => p.finalUrl || p.storageKey);
      syntheticEvents.push({
        id: `syn_r2_${sessionId}`,
        sessionId,
        eventType: hasUploaded ? 'R2_UPLOAD_COMPLETED' : 'R2_UPLOAD_QUEUED',
        stage: 'STORAGE',
        status: hasUploaded ? 'SUCCESS' : 'WARNING',
        durationMs: 3200,
        payload: JSON.stringify({ bucket: 'pictolabs-media-prod', count: session.photos.length }),
        createdAt: new Date(baseTime + 65000).toISOString(),
      });
    }

    // 5. Prints
    if (session.prints && session.prints.length > 0) {
      const allSuccess = session.prints.every((p) => p.isSuccess);
      syntheticEvents.push({
        id: `syn_prt_${sessionId}`,
        sessionId,
        eventType: allSuccess ? 'PRINT_COMPLETED' : 'PRINT_FAILED',
        stage: 'PRINTING',
        status: allSuccess ? 'SUCCESS' : 'FAILED',
        durationMs: 18500,
        payload: JSON.stringify({ prints: session.prints.length }),
        createdAt: new Date(baseTime + 85000).toISOString(),
      });
    }

    // 6. Delivery
    if (session.status === 'COMPLETED' || session.customerEmail) {
      syntheticEvents.push({
        id: `syn_del_${sessionId}`,
        sessionId,
        eventType: 'DELIVERY_ISSUED',
        stage: 'DELIVERY',
        status: 'SUCCESS',
        durationMs: 120,
        payload: JSON.stringify({
          qrViewUrl: `https://pictolabs.id/d/${sessionId}`,
          email: session.customerEmail || null,
        }),
        createdAt: new Date(baseTime + 86000).toISOString(),
      });
    }

    return syntheticEvents;
  }

  /**
   * Record a new event on the session timeline.
   */
  async recordEvent(sessionId: string, dto: CreateSessionEventDto) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException(`Session "${sessionId}" not found`);
    }

    return this.prisma.sessionEvent.create({
      data: {
        sessionId,
        eventType: dto.eventType,
        stage: dto.stage,
        status: dto.status,
        durationMs: dto.durationMs,
        errorCode: dto.errorCode,
        errorMessage: dto.errorMessage,
        payload: dto.payload ? JSON.stringify(dto.payload) : null,
      },
    });
  }

  /**
   * Compute automated health diagnosis and root cause analysis.
   */
  async getHealth(sessionId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        events: { orderBy: { createdAt: 'asc' } },
        transaction: { include: { payment: true } },
        prints: true,
        photos: true,
      },
    });

    if (!session) {
      throw new NotFoundException(`Session "${sessionId}" not found`);
    }

    return this.healthService.diagnose(session);
  }

  // Re-delivery delegates
  async resendEmail(sessionId: string, dto: RedeliveryEmailDto) {
    return this.redeliveryService.resendEmail(sessionId, dto);
  }

  async extendLink(sessionId: string, dto: ExtendLinkDto) {
    return this.redeliveryService.extendLink(sessionId, dto);
  }

  async triggerReprint(sessionId: string, dto: ReprintDto) {
    return this.redeliveryService.triggerReprint(sessionId, dto);
  }

  async getRedeliveryHistory(sessionId: string) {
    return this.redeliveryService.getRedeliveryHistory(sessionId);
  }
}
