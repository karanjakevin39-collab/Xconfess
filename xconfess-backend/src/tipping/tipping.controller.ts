import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiBody,
  ApiResponse,
} from '@nestjs/swagger';
import { TippingService, TipVerificationResult } from './tipping.service';
import { VerifyTipDto } from './dto/verify-tip.dto';

@ApiTags('Tipping')
@Controller('confessions/:id/tips')
export class TippingController {
  constructor(private readonly tippingService: TippingService) {}

  @Get()
  @ApiOperation({ summary: 'List all tips for a confession' })
  @ApiParam({ name: 'id', description: 'Confession UUID' })
  @ApiResponse({
    status: 200,
    description: 'Tips for the confession.',
    schema: {
      example: [
        {
          id: 'tip-abc-123',
          confessionId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
          amount: 100,
          txHash: 'a3f8e2d1b4c5a6e7f8d9c0b1a2e3f4d5c6b7a8e9f0d1c2b3a4e5f6d7c8b9a0e1',
          status: 'completed',
          createdAt: '2026-04-25T10:00:00.000Z',
        },
      ],
    },
  })
  getTips(@Param('id') confessionId: string) {
    return this.tippingService.getTipsByConfessionId(confessionId);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get aggregate tip stats for a confession' })
  @ApiParam({ name: 'id', description: 'Confession UUID' })
  @ApiResponse({
    status: 200,
    description: 'Tip statistics.',
    schema: {
      example: {
        totalAmount: 550,
        tipCount: 3,
        latestTip: '2026-04-25T10:00:00.000Z',
      },
    },
  })
  getTipStats(@Param('id') confessionId: string) {
    return this.tippingService.getTipStats(confessionId);
  }

  @Post('verify')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  @ApiOperation({ summary: 'Verify and record a Stellar XLM tip transaction' })
  @ApiParam({ name: 'id', description: 'Confession UUID' })
  @ApiBody({
    type: VerifyTipDto,
    description: 'Stellar transaction ID to verify.',
  })
  @ApiResponse({
    status: 201,
    description: 'Tip verified and recorded.',
    schema: {
      example: {
        success: true,
        tipId: 'tip-abc-123',
        amount: 100,
        txHash: 'a3f8e2d1b4c5a6e7f8d9c0b1a2e3f4d5c6b7a8e9f0d1c2b3a4e5f6d7c8b9a0e1',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid transaction ID or tip already recorded.' })
  async verifyTip(
    @Param('id') confessionId: string,
    @Body() dto: VerifyTipDto,
  ): Promise<TipVerificationResult> {
    return this.tippingService.verifyAndRecordTip(confessionId, dto);
  }
}
