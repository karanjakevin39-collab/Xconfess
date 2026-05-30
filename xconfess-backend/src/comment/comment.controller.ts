import {
  Controller,
  Post,
  Body,
  Param,
  Delete,
  Get,
  UseGuards,
  Req,
  Query,
} from '@nestjs/common';
import { CommentService } from './comment.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Request as ExpressRequest } from 'express';
import { AnonymousUser } from '../user/entities/anonymous-user.entity';

// Custom request type with user
interface RequestWithUser extends ExpressRequest {
  user?: any;
}

@Controller('comments')
export class CommentController {
  constructor(private readonly service: CommentService) {}

  @UseGuards(JwtAuthGuard)
  @Post(':confessionId')
  create(
    @Param('confessionId') confessionId: string,
    @Body('content') content: string,
    @Req() req: RequestWithUser,
    @Body('anonymousContextId') anonymousContextId: string,
    @Body('parentId') parentId?: number,
  ) {
    const user = req.user as AnonymousUser;
    return this.service.create(
      content,
      user,
      confessionId,
      anonymousContextId,
      parentId,
    );
  }

  @Get('by-confession/:confessionId')
  findByConfession(
    @Param('confessionId') confessionId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const p = page ? Number(page) : undefined;
    const l = limit ? Number(limit) : undefined;
    return this.service.findByConfessionId(confessionId, { page: p, limit: l });
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: RequestWithUser) {
    const user = req.user as AnonymousUser;
    return this.service.delete(+id, user);
  }

}
