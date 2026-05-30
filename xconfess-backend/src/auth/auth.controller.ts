import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Req,
  Get,
  UseGuards,
  UnauthorizedException,
  HttpException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBody,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { GetUser } from './get-user.decorator';
import { User } from '../user/entities/user.entity';
import { CryptoUtil } from '../common/crypto.util';
import { RateLimit } from './guard/rate-limit.decorator';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @RateLimit(5, 300)
  @ApiOperation({ summary: 'Log in with email and password' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: 200,
    description: 'Login successful. Returns a JWT access token.',
    schema: {
      example: {
        access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        anonymousUserId: 'anon_7f3a2b1c',
        user: {
          id: 1,
          username: 'alice_42',
          role: 'user',
          is_active: true,
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials.' })
  @ApiResponse({ status: 429, description: 'Too many login attempts.' })
  async login(
    @Body() loginDto: LoginDto,
  ): Promise<{ access_token: string; user: any; anonymousUserId: string }> {
    try {
      const result = await this.authService.login(
        loginDto.email,
        loginDto.password,
      );

      if (!result) {
        throw new UnauthorizedException('Invalid credentials');
      }

      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new BadRequestException('Login failed: ' + errorMessage);
    }
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current authenticated user profile' })
  @ApiResponse({
    status: 200,
    description: 'Authenticated user profile.',
    schema: {
      example: {
        id: 1,
        username: 'alice_42',
        role: 'user',
        is_active: true,
        email: 'alice@example.com',
        notificationPreferences: {},
        privacy: {
          isDiscoverable: true,
          canReceiveReplies: true,
          showReactions: true,
          dataProcessingConsent: true,
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized — missing or invalid JWT.' })
  async getProfile(@GetUser('id') userId: number): Promise<any> {
    return this.getSession(userId);
  }

  @Get('session')
  @UseGuards(JwtAuthGuard)
  async getSession(@GetUser('id') userId: number): Promise<any> {
    try {
      const user = await this.authService.validateUserById(userId);
      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      return user; // Already formatted by validateUserById
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new BadRequestException('Failed to get session: ' + errorMessage);
    }
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Log out current user (client-side token discard)' })
  @ApiResponse({
    status: 200,
    description: 'Logout acknowledged.',
    schema: { example: { message: 'Logged out successfully' } },
  })
  async logout(): Promise<{ message: string }> {
    // In a stateless JWT setup, logout is mainly client-side
    // but we can add token blacklisting here if needed
    return { message: 'Logged out successfully' };
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @RateLimit(3, 300)
  @ApiOperation({ summary: 'Request a password-reset e-mail' })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiResponse({
    status: 200,
    description: 'Password-reset e-mail sent if the account exists.',
    schema: {
      example: {
        message: 'If the user exists, a password reset email has been sent.',
      },
    },
  })
  @ApiResponse({ status: 429, description: 'Too many reset requests.' })
  async forgotPassword(
    @Body() forgotPasswordDto: ForgotPasswordDto,
    @Req() request: Request,
  ): Promise<{ message: string }> {
    try {
      const ipAddress =
        request.ip ||
        (request.headers['x-forwarded-for'] as string)?.split(',')[0] ||
        request.connection.remoteAddress;
      const userAgent = request.headers['user-agent'];

      return await this.authService.forgotPassword(
        forgotPasswordDto,
        ipAddress,
        userAgent,
      );
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      // Handle generic errors gracefully - don't expose internal details
      return {
        message: 'If the user exists, a password reset email has been sent.',
      };
    }
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password using a token from the reset e-mail' })
  @ApiBody({ type: ResetPasswordDto })
  @ApiResponse({
    status: 200,
    description: 'Password reset successfully.',
    schema: { example: { message: 'Password has been reset successfully.' } },
  })
  @ApiResponse({ status: 400, description: 'Invalid or expired token.' })
  async resetPassword(
    @Body() resetPasswordDto: ResetPasswordDto,
  ): Promise<{ message: string }> {
    try {
      return await this.authService.resetPassword(
        resetPasswordDto.token,
        resetPasswordDto.newPassword,
      );
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      // Handle generic errors
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new BadRequestException(
        'Failed to reset password: ' + errorMessage,
      );
    }
  }
}
