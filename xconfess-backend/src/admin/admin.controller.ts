import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { AdminService } from './services/admin.service';
import { ModerationService } from './services/moderation.service';
import { ModerationTemplateService } from '../comment/moderation-template.service';
import { ResolveReportDto } from './dto/resolve-report.dto';
import { BanUserDto } from './dto/ban-user.dto';
import { BulkResolveDto } from './dto/bulk-resolve.dto';
import { ReportStatus, ReportType } from './entities/report.entity';
import { AuditActionType } from '../audit-log/audit-log.entity';
import { AuditLogService } from '../audit-log/audit-log.service';
import { TemplateCategory } from '../comment/entities/moderation-note-template.entity';
import { Request } from 'express';
import { GetUser } from '../auth/get-user.decorator';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import { IsString, IsEnum, IsOptional } from 'class-validator';

class CreateTemplateDto {
  @IsString()
  name: string;

  @IsString()
  content: string;

  @IsEnum(TemplateCategory)
  category: TemplateCategory;
}

class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsEnum(TemplateCategory)
  category?: TemplateCategory;

  @IsOptional()
  isActive?: boolean;
}

type AuthedRequest = Request & { user?: RequestUser };

const auditActionTypeValues = new Set<string>(
  Object.values(AuditActionType) as string[],
);

function parseAuditAction(value?: string): AuditActionType | undefined {
  if (!value) {
    return undefined;
  }

  return auditActionTypeValues.has(value)
    ? (value as AuditActionType)
    : undefined;
}

@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly moderationService: ModerationService,
    private readonly moderationTemplateService: ModerationTemplateService,
    private readonly auditLogService: AuditLogService,
  ) {}

  // Reports
  @Get('reports')
  @ApiOperation({ summary: 'List reports with optional filters' })
  @ApiQuery({ name: 'status', required: false, enum: ReportStatus, description: 'Filter by status' })
  @ApiQuery({ name: 'type', required: false, enum: ReportType, description: 'Filter by report type' })
  @ApiQuery({ name: 'startDate', required: false, type: String, example: '2026-04-01' })
  @ApiQuery({ name: 'endDate', required: false, type: String, example: '2026-04-30' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 50 })
  @ApiQuery({ name: 'offset', required: false, type: Number, example: 0 })
  @ApiResponse({
    status: 200,
    description: 'Paginated report list.',
    schema: {
      example: {
        reports: [{ id: 'abc-123', confessionId: 'def-456', status: 'pending', type: 'spam' }],
        total: 1,
        limit: 50,
        offset: 0,
      },
    },
  })
  async getReports(
    @Query('status') status?: ReportStatus,
    @Query('type') type?: ReportType,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    const [reports, total] = await this.adminService.getReports(
      status,
      type,
      start,
      end,
      parseInt(limit || '50', 10),
      parseInt(offset || '0', 10),
    );

    return {
      reports,
      total,
      limit: parseInt(limit || '50', 10),
      offset: parseInt(offset || '0', 10),
    };
  }

  @Get('reports/:id')
  @ApiOperation({ summary: 'Get a single report by ID' })
  @ApiParam({ name: 'id', description: 'Report UUID' })
  @ApiResponse({ status: 200, description: 'Report record.' })
  @ApiResponse({ status: 404, description: 'Report not found.' })
  async getReportById(@Param('id') id: string) {
    return this.adminService.getReportById(id);
  }

  @Patch('reports/:id/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resolve a report (admin action)' })
  @ApiParam({ name: 'id', description: 'Report UUID' })
  @ApiBody({
    schema: {
      example: {
        resolutionNotes: 'Content removed — violates community guidelines.',
        templateId: 3,
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Report resolved successfully.' })
  async resolveReport(
    @Param('id') id: string,
    @Body() dto: ResolveReportDto,
    @GetUser('id') adminId: number,
    @Req() req: AuthedRequest,
  ) {
    return this.adminService.resolveReport(
      id,
      adminId,
      dto.resolutionNotes || null,
      dto.templateId,
      req,
    );
  }

  @Patch('reports/:id/dismiss')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Dismiss a report without taking action' })
  @ApiParam({ name: 'id', description: 'Report UUID' })
  @ApiResponse({ status: 200, description: 'Report dismissed.' })
  async dismissReport(
    @Param('id') id: string,
    @Body() dto: ResolveReportDto,
    @GetUser('id') adminId: number,
    @Req() req: AuthedRequest,
  ) {
    return this.adminService.dismissReport(
      id,
      adminId,
      dto.resolutionNotes || null,
      req,
    );
  }

  @Patch('reports/bulk-resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bulk-resolve multiple reports at once' })
  @ApiBody({
    schema: {
      example: {
        reportIds: ['abc-123', 'def-456'],
        notes: 'Batch resolution — content removed.',
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'All listed reports resolved.',
    schema: { example: { resolved: 2, failed: 0 } },
  })
  async bulkResolveReports(
    @Body() dto: BulkResolveDto,
    @GetUser('id') adminId: number,
    @Req() req: AuthedRequest,
  ) {
    return this.adminService.bulkResolveReports(
      dto.reportIds,
      adminId,
      dto.notes || null,
      req,
    );
  }

  // Confessions
  @Delete('confessions/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin-delete a confession' })
  @ApiParam({ name: 'id', description: 'Confession UUID' })
  @ApiBody({ schema: { example: { reason: 'Violates community standards.' } } })
  @ApiResponse({ status: 200, description: 'Confession deleted.', schema: { example: { message: 'Confession deleted successfully' } } })
  async deleteConfession(
    @Param('id') id: string,
    @Body() body: { reason?: string },
    @GetUser('id') adminId: number,
    @Req() req: AuthedRequest,
  ) {
    await this.adminService.deleteConfession(
      id,
      adminId,
      body.reason || null,
      req,
    );
    return { message: 'Confession deleted successfully' };
  }

  @Patch('confessions/:id/hide')
  @HttpCode(HttpStatus.OK)
  async hideConfession(
    @Param('id') id: string,
    @Body() body: { reason?: string },
    @GetUser('id') adminId: number,
    @Req() req: AuthedRequest,
  ) {
    return this.adminService.hideConfession(
      id,
      adminId,
      body.reason || null,
      req,
    );
  }

  @Patch('confessions/:id/unhide')
  @HttpCode(HttpStatus.OK)
  async unhideConfession(
    @Param('id') id: string,
    @GetUser('id') adminId: number,
    @Req() req: AuthedRequest,
  ) {
    return this.adminService.unhideConfession(id, adminId, req);
  }

  // Users
  @Get('users/search')
  @ApiOperation({ summary: 'Search users by username or email fragment' })
  @ApiQuery({ name: 'q', description: 'Search query', example: 'alice' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 50 })
  @ApiQuery({ name: 'offset', required: false, type: Number, example: 0 })
  @ApiResponse({
    status: 200,
    description: 'Matching users.',
    schema: { example: { users: [{ id: 1, username: 'alice_42', role: 'user' }], total: 1 } },
  })
  async searchUsers(
    @Query('q') query: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    if (!query) {
      return { users: [], total: 0 };
    }
    const [users, total] = await this.adminService.searchUsers(
      query,
      parseInt(limit || '50', 10),
      parseInt(offset || '0', 10),
    );
    return { users, total };
  }

  @Get('users/:id/history')
  async getUserHistory(@Param('id') id: string) {
    return this.adminService.getUserHistory(parseInt(id, 10));
  }

  @Patch('users/:id/ban')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ban a user account' })
  @ApiParam({ name: 'id', description: 'User numeric ID' })
  @ApiBody({ schema: { example: { reason: 'Repeated policy violations.' } } })
  @ApiResponse({ status: 200, description: 'User banned.' })
  async banUser(
    @Param('id') id: string,
    @Body() dto: BanUserDto,
    @GetUser('id') adminId: number,
    @Req() req: AuthedRequest,
  ) {
    return this.adminService.banUser(
      parseInt(id, 10),
      adminId,
      dto.reason || null,
      req,
    );
  }

  @Patch('users/:id/unban')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Lift a user ban' })
  @ApiParam({ name: 'id', description: 'User numeric ID' })
  @ApiResponse({ status: 200, description: 'User unbanned.' })
  async unbanUser(
    @Param('id') id: string,
    @GetUser('id') adminId: number,
    @Req() req: AuthedRequest,
  ) {
    return this.adminService.unbanUser(parseInt(id, 10), adminId, req);
  }

  // Moderation Note Templates
  @Get('templates')
  async getTemplates(@Query('includeInactive') includeInactive?: string) {
    return this.moderationTemplateService.findAll(includeInactive === 'true');
  }

  @Get('templates/:id')
  async getTemplateById(@Param('id') id: string) {
    return this.moderationTemplateService.findById(parseInt(id, 10));
  }

  @Post('templates')
  @HttpCode(HttpStatus.CREATED)
  async createTemplate(
    @Body() dto: CreateTemplateDto,
    @GetUser('id') adminId: number,
  ) {
    return this.moderationTemplateService.create(dto, adminId);
  }

  @Patch('templates/:id')
  async updateTemplate(
    @Param('id') id: string,
    @Body() dto: UpdateTemplateDto,
  ) {
    return this.moderationTemplateService.update(parseInt(id, 10), dto);
  }

  @Delete('templates/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteTemplate(@Param('id') id: string) {
    await this.moderationTemplateService.delete(parseInt(id, 10));
  }

  // Operator anchor & tip lookup (Issue #778)
  @Get('lookup/anchor-tip')
  async lookupAnchorAndTip(
    @Query('txHash') txHash?: string,
    @Query('confessionId') confessionId?: string,
  ) {
    return this.adminService.lookupAnchorAndTip({ txHash, confessionId });
  }

  // Analytics
  @Get('analytics')
  @ApiOperation({ summary: 'Get platform analytics (optionally date-bounded)' })
  @ApiQuery({ name: 'startDate', required: false, type: String, example: '2026-04-01' })
  @ApiQuery({ name: 'endDate', required: false, type: String, example: '2026-04-30' })
  @ApiResponse({
    status: 200,
    description: 'Aggregated platform metrics.',
    schema: {
      example: {
        totalConfessions: 1420,
        totalUsers: 380,
        totalReports: 42,
        totalReactions: 8500,
      },
    },
  })
  async getAnalytics(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return this.adminService.getAnalytics(start, end);
  }

  // Audit Logs
  @Get('audit-logs')
  @ApiOperation({ summary: 'Query the admin audit log' })
  @ApiQuery({ name: 'adminId', required: false, description: 'Filter by admin user ID' })
  @ApiQuery({ name: 'action', required: false, description: 'Filter by action type' })
  @ApiQuery({ name: 'entityType', required: false, description: 'Filter by entity type (e.g. confession, user)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 100 })
  @ApiQuery({ name: 'offset', required: false, type: Number, example: 0 })
  @ApiResponse({
    status: 200,
    description: 'Audit log entries matching the filter.',
    schema: {
      example: {
        data: [
          {
            id: 'log-abc-123',
            adminId: 1,
            action: 'DELETE_CONFESSION',
            entityType: 'confession',
            entityId: 'f47ac10b-...',
            createdAt: '2026-04-25T10:00:00.000Z',
          },
        ],
        total: 1,
      },
    },
  })
  async getAuditLogs(
    @Query('adminId') adminId?: string,
    @Query('action') action?: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('requestId') requestId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const result = await this.auditLogService.findAll({
      userId: adminId,
      actionType: parseAuditAction(action),
      entityType,
      entityId,
      requestId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      limit: parseInt(limit || '100', 10),
      offset: parseInt(offset || '0', 10),
    });

    return result;
  }

  // Audit Logs by requestId (dedicated endpoint for incident reviews)
  @Get('audit-logs/by-request/:requestId')
  async getAuditLogsByRequestId(
    @Param('requestId') requestId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const result = await this.auditLogService.findAll({
      requestId,
      limit: parseInt(limit || '100', 10),
      offset: parseInt(offset || '0', 10),
    });

    return result;
  }

  // Audit Logs by entity (for reviewing actions on a specific target)
  @Get('audit-logs/by-entity/:entityType/:entityId')
  async getAuditLogsByEntity(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const result = await this.auditLogService.findAll({
      entityType,
      entityId,
      limit: parseInt(limit || '100', 10),
      offset: parseInt(offset || '0', 10),
    });

    return result;
  }
}
