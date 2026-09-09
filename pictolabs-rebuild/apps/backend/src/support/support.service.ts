import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SupportSearchDto } from './dto/support-search.dto';
import { SessionHealthService } from '../sessions/session-health.service';

@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly healthService: SessionHealthService,
  ) {}

  async search(query: SupportSearchDto) {
    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit || 10)));
    const skip = (page - 1) * limit;

    const where: any = {};

    // 1. Email Lookup
    if (query.email && query.email.trim() !== '') {
      where.customerEmail = {
        contains: query.email.trim(),
        mode: 'insensitive',
      };
    }

    // 2. Phone Lookup
    if (query.phone && query.phone.trim() !== '') {
      where.customerPhone = {
        contains: query.phone.trim(),
      };
    }

    // 3. Payment / Order ID Lookup
    const transactionOr: any[] = [];
    if (query.orderId && query.orderId.trim() !== '') {
      transactionOr.push({
        orderId: { contains: query.orderId.trim(), mode: 'insensitive' },
      });
    }
    if (query.paymentRef && query.paymentRef.trim() !== '') {
      transactionOr.push({
        payment: { paymentRef: { contains: query.paymentRef.trim(), mode: 'insensitive' } },
      });
    }
    if (transactionOr.length > 0) {
      where.transaction = { OR: transactionOr };
    }

    // 4. Booth / Branch Filters
    if (query.boothId && query.boothId.trim() !== '' && query.boothId !== 'ALL') {
      where.boothId = query.boothId.trim();
    }
    if (query.branchId && query.branchId.trim() !== '' && query.branchId !== 'ALL') {
      where.booth = {
        ...(where.booth || {}),
        branchId: query.branchId.trim(),
      };
    }

    // 5. Date & Time Window Filter
    if (query.date && query.date.trim() !== '') {
      const dateStr = query.date.trim();
      const startTimeStr = query.startTime ? `${query.startTime}:00.000` : '00:00:00.000';
      const endTimeStr = query.endTime ? `${query.endTime}:59.999` : '23:59:59.999';

      const start = new Date(`${dateStr}T${startTimeStr}Z`);
      const end = new Date(`${dateStr}T${endTimeStr}Z`);

      where.createdAt = {
        gte: start,
        lte: end,
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
            include: { branch: true },
          },
          photos: {
            orderBy: { sequenceNo: 'asc' },
          },
          prints: true,
          transaction: {
            include: { payment: true },
          },
          events: {
            orderBy: { createdAt: 'asc' },
          },
        },
      }),
    ]);

    const results = rawSessions.map((s) => {
      // Find composite strip or first photo for thumbnail preview
      const compositePhoto = s.photos.find((p) => p.sequenceNo === 0) || s.photos[0];
      const thumbnailUrl =
        compositePhoto?.finalUrl ||
        compositePhoto?.rawUrl ||
        (compositePhoto?.storageKey ? `https://media.pictolabs.id/${compositePhoto.storageKey}` : null);

      // Evaluate health diagnosis
      const health = this.healthService.diagnose(s);

      return {
        id: s.id,
        customerEmail: s.customerEmail || null,
        customerPhone: s.customerPhone || null,
        orderId: s.transaction?.orderId || null,
        paymentRef: s.transaction?.payment?.paymentRef || null,
        amount: s.transaction?.amount || 0,
        boothId: s.boothId,
        boothName: s.booth?.name || 'Unknown Booth',
        branchId: s.booth?.branchId || null,
        branchName: s.booth?.branch?.name || 'Grand Indonesia',
        status: s.status,
        health,
        thumbnailUrl,
        photoCount: s.photos.length,
        printCount: s.prints.length,
        createdAt: s.createdAt.toISOString(),
      };
    });

    return {
      results,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }
}
