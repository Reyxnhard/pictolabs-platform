import { IsString, IsEmail, IsOptional, IsNumber, Min, Max, IsIn } from 'class-validator';

export class RedeliveryEmailDto {
  @IsEmail()
  recipientEmail!: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  operatorEmail?: string;
}

export class ExtendLinkDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(90)
  extensionDays?: number = 30;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  operatorEmail?: string;
}

export class ReprintDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(3)
  copies?: number = 1;

  @IsString()
  @IsIn(['PAPER_JAM', 'PRINT_DEFECT', 'CUSTOMER_COURTESY', 'TEST_PRINT'])
  reason!: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  operatorEmail?: string;
}
