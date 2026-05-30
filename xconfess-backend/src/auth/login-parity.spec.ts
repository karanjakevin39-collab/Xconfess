import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { UserController } from '../user/user.controller';
import { AuthService } from './auth.service';
import { UserService } from '../user/user.service';
import { ConfessionService } from '../confession/confession.service';
import { AppException } from '../common/errors/app-exception';
import { ErrorCode } from '../common/errors/error-codes';
import { HttpStatus, HttpException } from '@nestjs/common';

describe('Login parity between /auth/login and /users/login', () => {
  let authController: AuthController;
  let userController: UserController;
  let mockAuthService: any;

  beforeEach(async () => {
    mockAuthService = {
      login: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController, UserController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: UserService, useValue: {} },
        { provide: ConfessionService, useValue: {} },
      ],
    }).compile();

    authController = module.get<AuthController>(AuthController);
    userController = module.get<UserController>(UserController);
  });

  it('returns identical success payloads for the same credentials', async () => {
    const successPayload = {
      access_token: 'jwt-token',
      user: { id: 1, username: 'u', email: 'a@b.c' },
      anonymousUserId: 'anon-1',
    };

    mockAuthService.login.mockResolvedValue(successPayload);

    const authResult = await authController.login({
      email: 'a@b.c',
      password: 'pass',
    } as any);

    const userResult = await userController.login({
      email: 'a@b.c',
      password: 'pass',
    } as any);

    expect(authResult).toEqual(userResult);
    expect(authResult).toEqual(successPayload);
  });

  it('propagates identical error status and response for auth failures', async () => {
    const appErr = new AppException(
      'Invalid credentials',
      ErrorCode.AUTH_INVALID_CREDENTIALS,
      HttpStatus.UNAUTHORIZED,
    );

    mockAuthService.login.mockRejectedValue(appErr);

    await expect(
      authController.login({ email: 'x', password: 'y' } as any),
    ).rejects.toThrow(HttpException);

    await expect(
      userController.login({ email: 'x', password: 'y' } as any),
    ).rejects.toThrow(HttpException);

    // Verify the status code is the same when caught
    try {
      await authController.login({ email: 'x', password: 'y' } as any);
    } catch (e: any) {
      expect(e.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
      expect(e.getResponse()).toHaveProperty('code');
    }

    try {
      await userController.login({ email: 'x', password: 'y' } as any);
    } catch (e: any) {
      expect(e.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
      expect(e.getResponse()).toHaveProperty('code');
    }
  });
});
