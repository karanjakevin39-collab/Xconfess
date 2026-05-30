import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import * as StellarSDK from '@stellar/stellar-sdk';
import { StellarService } from './stellar.service';
import { ContractService } from './contract.service';
import { VerifyTransactionDto } from './dto/verify-transaction.dto';
import { InvokeContractDto } from './dto/invoke-contract.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { StellarInvokeContractGuard } from './guards/stellar-invoke-contract.guard';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditActionType } from '../audit-log/audit-log.entity';
import { AuthenticatedRequest } from '../auth/interfaces/jwt-payload.interface';
import { getStellarInvocationPolicy } from './stellar-invocation-policy';
import {
  buildAuditContextFromRequest,
  buildStellarInvocationAuditMetadata,
} from './stellar-invocation-audit';

@ApiTags('Stellar')
@Controller('stellar')
export class StellarController {
  constructor(
    private stellarService: StellarService,
    private contractService: ContractService,
    private configService: ConfigService,
    private auditLogService: AuditLogService,
  ) {}

  @Get('config')
  @ApiOperation({ summary: 'Get Stellar network configuration' })
  @ApiResponse({ status: 200, description: 'Network configuration' })
  getConfig() {
    return this.stellarService.getNetworkConfig();
  }

  @Get('balance/:address')
  @ApiOperation({ summary: 'Get account balance' })
  @ApiResponse({ status: 200, description: 'Account balance' })
  async getBalance(@Param('address') address: string) {
    return this.stellarService.getAccountBalance(address);
  }

  @Post('verify')
  @ApiOperation({ summary: 'Verify transaction on-chain' })
  @ApiResponse({ status: 200, description: 'Transaction verification result' })
  async verifyTransaction(@Body() dto: VerifyTransactionDto) {
    return this.stellarService.verifyTransaction(dto.txHash);
  }

  @Get('account-exists/:address')
  @ApiOperation({ summary: 'Check if account exists' })
  async accountExists(@Param('address') address: string) {
    const exists = await this.stellarService.accountExists(address);
    return { exists };
  }

  @Post('invoke-contract')
  @ApiOperation({
    summary: 'Invoke allowlisted Soroban operation (server-signed, admin)',
  })
  @UseGuards(JwtAuthGuard, StellarInvokeContractGuard)
  async invokeContract(
    @Body() dto: InvokeContractDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const signerSecret = this.configService.get<string>(
      'STELLAR_SERVER_SECRET',
    );
    if (!signerSecret) {
      throw new BadRequestException(
        'Stellar server signer secret is not configured',
      );
    }

    const signerPk = StellarSDK.Keypair.fromSecret(signerSecret).publicKey();
    const invocation = this.contractService.invocationFromAllowlistedDto(
      dto,
      signerPk,
    );
    const policy = getStellarInvocationPolicy(dto.operation);

    if (dto.sourceAccount !== signerPk) {
      await this.auditStellarInvocation(req, dto, {
        allowlistClass: policy?.allowlistClass,
        contractId: invocation.contractId,
        functionName: invocation.functionName,
        sourceAccount: dto.sourceAccount,
        outcome: 'denied',
        denialReason: 'source_account_mismatch',
        expectedSourceAccount: signerPk,
      });
      throw new BadRequestException(
        'sourceAccount must be the public key of the configured server signer',
      );
    }

    try {
      const result = await this.contractService.invokeContract(
        invocation,
        signerSecret,
      );
      await this.auditStellarInvocation(req, dto, {
        allowlistClass: policy?.allowlistClass,
        outcome: result.success ? 'success' : 'failed',
        transactionHash: result.hash,
        chainSuccess: result.success,
        contractId: invocation.contractId,
        functionName: invocation.functionName,
        sourceAccount: dto.sourceAccount,
        authorizedScope: (req as any).stellarInvocationScopeMatch,
      });
      return result;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      await this.auditStellarInvocation(req, dto, {
        allowlistClass: policy?.allowlistClass,
        outcome: 'failed',
        contractId: invocation.contractId,
        functionName: invocation.functionName,
        sourceAccount: dto.sourceAccount,
        errorMessage: message,
        authorizedScope: (req as any).stellarInvocationScopeMatch,
      });
      throw err;
    }
  }

  private async auditStellarInvocation(
    req: AuthenticatedRequest,
    dto: InvokeContractDto,
    fields: Omit<
      Parameters<typeof buildStellarInvocationAuditMetadata>[0],
      'operation'
    >,
  ): Promise<void> {
    await this.auditLogService.log({
      actionType: AuditActionType.STELLAR_CONTRACT_INVOCATION,
      context: buildAuditContextFromRequest(req as typeof req & {
        requestId?: string;
      }),
      metadata: {
        ...buildStellarInvocationAuditMetadata({
          operation: dto.operation,
          ...fields,
        }),
        actorUserId: req.user.id,
      },
    });
  }
}
