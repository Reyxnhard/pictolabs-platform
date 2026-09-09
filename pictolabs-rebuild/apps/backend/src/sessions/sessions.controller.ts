import { Controller, Get, Post, Body, Param, Query, Headers, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { SessionsService } from './sessions.service';
import { SessionQueryDto } from './dto/session-query.dto';
import { CreateSessionEventDto } from './dto/session-timeline.dto';
import { RedeliveryEmailDto, ExtendLinkDto, ReprintDto } from './dto/redelivery.dto';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('Sessions')
@Controller('api/sessions')
export class SessionsController {
  private readonly logger = new Logger(SessionsController.name);

  constructor(
    private readonly sessionsService: SessionsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Search and list sessions',
    description: 'Retrieves customer sessions with search by ID, filtering by booth, branch, date, and resilient status tolerance',
  })
  @ApiResponse({ status: 200, description: 'Paginated list of sessions' })
  async findAll(@Query() query: SessionQueryDto) {
    return this.sessionsService.findAll(query);
  }

  @Get('stats/today')
  @ApiOperation({
    summary: 'Get operational counters for today',
    description: 'Counts sessions created, completed, failed, and active booths today since 00:00 WIB',
  })
  @ApiResponse({ status: 200, description: 'Today operational metrics' })
  async getTodayStats() {
    return this.sessionsService.getTodayStats();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get session details by ID' })
  @ApiParam({ name: 'id', description: 'Session identifier' })
  @ApiResponse({ status: 200, description: 'Detailed session information' })
  async findOne(@Param('id') id: string) {
    return this.sessionsService.findOne(id);
  }

  @Get(':id/timeline')
  @ApiOperation({
    summary: 'Get session timeline milestones',
    description: 'Returns chronological step-by-step lifecycle events with duration and status',
  })
  @ApiParam({ name: 'id', description: 'Session identifier' })
  async getTimeline(@Param('id') id: string) {
    return this.sessionsService.getTimeline(id);
  }

  @Public()
  @Post(':id/timeline')
  @ApiOperation({ summary: 'Record a timeline event for a session' })
  @ApiParam({ name: 'id', description: 'Session identifier' })
  async recordEvent(@Param('id') id: string, @Body() dto: CreateSessionEventDto) {
    return this.sessionsService.recordEvent(id, dto);
  }

  @Get(':id/health')
  @ApiOperation({
    summary: 'Get session health diagnosis',
    description: 'Computes health classification (HEALTHY, DEGRADED, FAILED, ABANDONED) and root cause analysis',
  })
  @ApiParam({ name: 'id', description: 'Session identifier' })
  async getHealth(@Param('id') id: string) {
    return this.sessionsService.getHealth(id);
  }

  @Post(':id/redelivery/email')
  @ApiOperation({ summary: 'Resend softfile delivery email to customer' })
  @ApiParam({ name: 'id', description: 'Session identifier' })
  async resendEmail(@Param('id') id: string, @Body() dto: RedeliveryEmailDto) {
    return this.sessionsService.resendEmail(id, dto);
  }

  @Post(':id/redelivery/extend-link')
  @ApiOperation({ summary: 'Extend customer gallery retention and produce authenticated support link' })
  @ApiParam({ name: 'id', description: 'Session identifier' })
  async extendLink(@Param('id') id: string, @Body() dto: ExtendLinkDto) {
    return this.sessionsService.extendLink(id, dto);
  }

  @Post(':id/reprint')
  @ApiOperation({ summary: 'Command emergency physical strip reprint' })
  @ApiParam({ name: 'id', description: 'Session identifier' })
  async triggerReprint(@Param('id') id: string, @Body() dto: ReprintDto) {
    return this.sessionsService.triggerReprint(id, dto);
  }

  @Get(':id/redelivery/history')
  @ApiOperation({ summary: 'Get audit history of support re-deliveries and reprints' })
  @ApiParam({ name: 'id', description: 'Session identifier' })
  async getRedeliveryHistory(@Param('id') id: string) {
    return this.sessionsService.getRedeliveryHistory(id);
  }

  @Public()
  @Post()
  @ApiOperation({ summary: 'Sync session from kiosk client' })
  async syncSession(
    @Body() sessionData: any,
    @Headers('x-device-secret') deviceSecret?: string
  ) {
    this.logger.log(`[SessionsController] Incoming session sync: ${sessionData?.id}`);

    try {
      const booth = await this.prisma.booth.findUnique({
        where: { deviceSecret: deviceSecret || 'dev-secret-booth-01' },
      });

      if (!booth) {
        this.logger.warn(`[SessionsController] Booth not registered for deviceSecret: ${deviceSecret}`);
        return { success: true, acknowledged: true, warning: 'Booth unregistered' };
      }

      const status = sessionData.printStatus === 'printed' ? 'COMPLETED' : (sessionData.status || 'CAPTURED');

      const session = await this.prisma.session.upsert({
        where: { id: sessionData.id },
        update: {
          status,
          customerEmail: sessionData.customerEmail || undefined,
          customerPhone: sessionData.customerPhone || undefined,
          updatedAt: new Date(),
        },
        create: {
          id: sessionData.id,
          boothId: booth.id,
          status,
          customerEmail: sessionData.customerEmail,
          customerPhone: sessionData.customerPhone,
          createdAt: sessionData.createdAt ? new Date(sessionData.createdAt) : new Date(),
        },
      });

      this.logger.log(`[SessionsController] ✓ Session synced to database: ${session.id}`);
      return { success: true, sessionId: session.id };
    } catch (err: any) {
      this.logger.error(`[SessionsController] Error syncing session: ${err.message}`);
      return { success: true, error: err.message };
    }
  }
}
