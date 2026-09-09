import { IsString, IsOptional, IsNumber, IsIn } from 'class-validator';

export class CreateSessionEventDto {
  @IsString()
  eventType!: string;

  @IsString()
  stage!: string;

  @IsString()
  @IsIn(['SUCCESS', 'FAILED', 'WARNING', 'SKIPPED'])
  status!: string;

  @IsOptional()
  @IsNumber()
  durationMs?: number;

  @IsOptional()
  @IsString()
  errorCode?: string;

  @IsOptional()
  @IsString()
  errorMessage?: string;

  @IsOptional()
  payload?: any;
}
