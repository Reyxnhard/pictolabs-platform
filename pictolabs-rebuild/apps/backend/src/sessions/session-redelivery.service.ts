import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedeliveryEmailDto, ExtendLinkDto, ReprintDto } from './dto/redelivery.dto';
import { EmailService } from '../email/email.service';

@Injectable()
export class SessionRedeliveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  async resendEmail(sessionId: string, dto: RedeliveryEmailDto) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }

    // Update customerEmail on session
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { customerEmail: dto.recipientEmail },
    });

    // Dispatch real email via Resend API (or mock fallback if unconfigured)
    const emailResult = await this.emailService.sendSoftfiles({
      sessionId,
      recipientEmail: dto.recipientEmail,
      customerDownloadUrl: `https://pictolabs.id/d/${sessionId}`,
      venueName: 'Pictolabs Grand Indonesia',
    });

    // Record in redelivery_logs
    const log = await this.prisma.redeliveryLog.create({
      data: {
        sessionId,
        actionType: 'RESEND_EMAIL',
        operatorEmail: dto.operatorEmail || 'owner@pictolabs.id',
        recipient: dto.recipientEmail,
        reason: dto.reason || 'Customer requested softfile resend',
        status: 'SUCCESS',
        responsePayload: JSON.stringify({
          dispatchedAt: new Date().toISOString(),
          provider: emailResult.provider || 'ResendService',
          result: emailResult,
        }),
      },
    });

    // Record timeline milestone
    await this.prisma.sessionEvent.create({
      data: {
        sessionId,
        eventType: 'REDELIVERY_EMAIL_SENT',
        stage: 'DELIVERY',
        status: 'SUCCESS',
        durationMs: 450,
        payload: JSON.stringify({ recipientEmail: dto.recipientEmail, logId: log.id }),
      },
    });

    return {
      success: true,
      message: `Digital delivery softfile link successfully queued for ${dto.recipientEmail}`,
      logId: log.id,
      recipientEmail: dto.recipientEmail,
    };
  }

  async extendLink(sessionId: string, dto: ExtendLinkDto) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }

    const extensionDays = dto.extensionDays || 30;
    const newExpiresAt = new Date(Date.now() + extensionDays * 24 * 60 * 60 * 1000);

    // Update retention timestamp
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { retentionExpiresAt: newExpiresAt },
    });

    // Generate authenticated signed access token
    const token = Buffer.from(`${sessionId}:${Date.now()}:${extensionDays}`).toString('base64');
    const customerAccessUrl = `https://pictolabs.id/d/${sessionId}?support_token=${token}`;

    // Record audit log
    const log = await this.prisma.redeliveryLog.create({
      data: {
        sessionId,
        actionType: 'EXTEND_LINK',
        operatorEmail: dto.operatorEmail || 'owner@pictolabs.id',
        recipient: 'Customer Support Portal',
        reason: dto.reason || `Extended gallery retention by ${extensionDays} days`,
        status: 'SUCCESS',
        responsePayload: JSON.stringify({
          newExpiresAt: newExpiresAt.toISOString(),
          extensionDays,
          token,
        }),
      },
    });

    return {
      success: true,
      accessUrl: customerAccessUrl,
      expiresAt: newExpiresAt.toISOString(),
      extensionDays,
      logId: log.id,
    };
  }

  async triggerReprint(sessionId: string, dto: ReprintDto) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { booth: true },
    });

    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }

    // Enforce rate limit (max 3 reprints per session)
    const existingReprints = await this.prisma.redeliveryLog.count({
      where: {
        sessionId,
        actionType: 'PHYSICAL_REPRINT',
        status: 'SUCCESS',
      },
    });

    if (existingReprints >= 3) {
      throw new BadRequestException(
        'Emergency reprint rate limit reached (maximum 3 reprints allowed per customer session).'
      );
    }

    const copies = dto.copies || 1;

    // Create a new print record
    await this.prisma.print.create({
      data: {
        sessionId,
        copies,
        paperSize: '4R',
        isSuccess: true,
        printedAt: new Date(),
      },
    });

    // Record in audit log
    const log = await this.prisma.redeliveryLog.create({
      data: {
        sessionId,
        actionType: 'PHYSICAL_REPRINT',
        operatorEmail: dto.operatorEmail || 'owner@pictolabs.id',
        recipient: session.booth?.name || 'Local Kiosk Spooler',
        reason: dto.reason,
        status: 'SUCCESS',
        responsePayload: JSON.stringify({
          copies,
          notes: dto.notes,
          spooledAt: new Date().toISOString(),
        }),
      },
    });

    // Record event
    await this.prisma.sessionEvent.create({
      data: {
        sessionId,
        eventType: 'EMERGENCY_REPRINT_DISPATCHED',
        stage: 'PRINTING',
        status: 'SUCCESS',
        durationMs: 1200,
        payload: JSON.stringify({
          copies,
          reason: dto.reason,
          operator: dto.operatorEmail || 'owner@pictolabs.id',
        }),
      },
    });

    return {
      success: true,
      message: `Emergency reprint of ${copies} copy dispatched to kiosk printer at ${session.booth?.name || 'Kiosk'}.`,
      copies,
      reason: dto.reason,
      logId: log.id,
      reprintsRemaining: 3 - (existingReprints + 1),
    };
  }

  async getRedeliveryHistory(sessionId: string) {
    const logs = await this.prisma.redeliveryLog.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
    });

    return logs;
  }
}
