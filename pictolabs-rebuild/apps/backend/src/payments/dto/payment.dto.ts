import { IsString, IsNumber, IsOptional } from 'class-validator';

export class CreateQRISDto {
  @IsString()
  boothId: string;

  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsNumber()
  amount: number;

  @IsOptional()
  @IsString()
  productName?: string;

  @IsOptional()
  @IsString()
  voucherCode?: string;
}

export class MidtransWebhookDto {
  @IsString()
  order_id: string;

  @IsString()
  status_code: string;

  @IsString()
  gross_amount: string;

  @IsString()
  transaction_status: string;

  @IsOptional()
  @IsString()
  fraud_status?: string;

  @IsOptional()
  @IsString()
  signature_key?: string;

  @IsOptional()
  @IsString()
  transaction_id?: string;

  @IsOptional()
  @IsString()
  payment_type?: string;

  @IsOptional()
  @IsString()
  settlement_time?: string;
}
