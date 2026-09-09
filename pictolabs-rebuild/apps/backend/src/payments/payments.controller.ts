import { Controller, Post, Get, Body, Param, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { CreateQRISDto, MidtransWebhookDto } from './dto/payment.dto';
import { Public } from '../auth/decorators/public.decorator';

@Public()
@Controller('api/payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * Generates a new dynamic QRIS invoice
   * POST /api/payments/qris
   */
  @Post('qris')
  @HttpCode(HttpStatus.OK)
  async createQRIS(@Body() dto: CreateQRISDto) {
    return this.paymentsService.createQRIS(dto);
  }

  /**
   * Main Midtrans Webhook Handler
   * POST /api/payments/webhook
   */
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(@Body() payload: MidtransWebhookDto) {
    return this.paymentsService.handleWebhook(payload);
  }

  /**
   * Midtrans Webhook Endpoint Alias
   * POST /api/payments/webhook/midtrans
   */
  @Post('webhook/midtrans')
  @HttpCode(HttpStatus.OK)
  async handleMidtransWebhook(@Body() payload: MidtransWebhookDto) {
    return this.paymentsService.handleWebhook(payload);
  }

  /**
   * Check status of a transaction
   * GET /api/payments/status/:orderId
   */
  @Get('status/:orderId')
  async checkStatus(@Param('orderId') orderId: string) {
    return this.paymentsService.checkStatus(orderId);
  }

  /**
   * Cancel an active payment
   * POST /api/payments/cancel/:orderId
   */
  @Post('cancel/:orderId')
  @HttpCode(HttpStatus.OK)
  async cancelTransaction(@Param('orderId') orderId: string) {
    return this.paymentsService.cancelTransaction(orderId);
  }

  /**
   * Sandbox Simulation Endpoint for testing payment settlement
   * POST /api/payments/simulate/:orderId
   */
  @Post('simulate/:orderId')
  @HttpCode(HttpStatus.OK)
  async simulatePayment(@Param('orderId') orderId: string) {
    return this.paymentsService.simulateSettlement(orderId);
  }
}
