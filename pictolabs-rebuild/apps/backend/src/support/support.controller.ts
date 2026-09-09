import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SupportService } from './support.service';
import { SupportSearchDto } from './dto/support-search.dto';

@ApiTags('Support')
@Controller('api/support')
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Get('search')
  @ApiOperation({
    summary: 'Omni-channel customer support search',
    description: 'Lookup sessions by customer email, phone, Midtrans Order ID, payment ref, and venue time windows',
  })
  @ApiResponse({ status: 200, description: 'Search results with health status and visual composite thumbnail' })
  async search(@Query() query: SupportSearchDto) {
    return this.supportService.search(query);
  }
}
