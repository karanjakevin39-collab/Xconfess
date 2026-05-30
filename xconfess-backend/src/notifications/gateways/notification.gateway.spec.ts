import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Socket } from 'socket.io';
import { WsJwtGuard } from '../../auth/guards/ws-jwt.guard';
import { WebSocketLogger } from '../../websocket/websocket.logger';
import { NotificationGateway } from './notification.gateway';

describe('Notification websocket auth regression coverage', () => {
  const createSocket = (
    overrides: Partial<Socket> & { data?: Record<string, unknown> } = {},
  ) =>
    ({
      id: 'socket-1',
      data: {},
      handshake: {
        auth: {},
        headers: {},
      },
      emit: jest.fn(),
      join: jest.fn(),
      leave: jest.fn(),
      disconnect: jest.fn(),
      ...overrides,
    }) as unknown as Socket;

  const createWsContext = (client: Socket): ExecutionContext =>
    ({
      switchToWs: () => ({
        getClient: () => client,
      }),
    }) as unknown as ExecutionContext;

  const createGuard = (
    jwtService: Pick<JwtService, 'verifyAsync'>,
    userService?: { findById: jest.Mock },
  ) => new WsJwtGuard(jwtService as JwtService, userService as any);

  const createGateway = () => {
    const notificationService = {
      markAsRead: jest.fn(),
      markAllAsRead: jest.fn(),
      getUserNotifications: jest.fn(),
    };
    const configService = {
      get: jest.fn((_key: string, fallback: unknown) => fallback),
    };
    const wsLogger = {
      logSubscriptionRejected: jest.fn(),
      logSubscriptionGranted: jest.fn(),
    };

    return {
      gateway: new NotificationGateway(
        notificationService as any,
        configService as any,
        wsLogger as unknown as WebSocketLogger,
      ),
      wsLogger,
    };
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('rejects notification sockets when the handshake has no token', async () => {
    const client = createSocket();
    const guard = createGuard({
      verifyAsync: jest.fn(),
    });

    await expect(guard.canActivate(createWsContext(client))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects notification sockets when the token cannot be verified', async () => {
    const client = createSocket({
      handshake: {
        auth: { token: 'bad-token' },
        headers: {},
      } as any,
    });
    const guard = createGuard({
      verifyAsync: jest.fn().mockRejectedValue(new Error('jwt malformed')),
    });

    await expect(guard.canActivate(createWsContext(client))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('stores authenticated notification socket data from a valid token', async () => {
    const client = createSocket({
      handshake: {
        auth: { token: 'good-token' },
        headers: {},
      } as any,
    });
    const guard = createGuard(
      {
        verifyAsync: jest.fn().mockResolvedValue({
          sub: 'user-1',
          username: 'alice',
        }),
      },
      {
        findById: jest.fn().mockResolvedValue({
          id: 1,
          username: 'alice',
          role: 'user',
          is_active: true,
        }),
      },
    );

    await expect(guard.canActivate(createWsContext(client))).resolves.toBe(
      true,
    );

    expect(client.data).toEqual({
      userId: 'user-1',
      username: 'alice',
      user: {
        id: 1,
        username: 'alice',
        role: 'user',
        is_active: true,
      },
    });
  });

  it('joins only the authenticated user notification room on connection', () => {
    const { gateway, wsLogger } = createGateway();
    const client = createSocket({
      data: { userId: 'user-1' },
    });

    gateway.handleConnection(client);

    expect(client.join).toHaveBeenCalledWith('user:user-1');
    expect(client.disconnect).not.toHaveBeenCalled();
    expect(wsLogger.logSubscriptionGranted).toHaveBeenCalledWith({
      socketId: 'socket-1',
      userId: 'user-1',
      channel: 'user:user-1',
    });
  });

  it('rejects private notification room subscriptions for another user', () => {
    const { gateway, wsLogger } = createGateway();
    const client = createSocket({
      data: { userId: 'user-1' },
    });

    gateway.handleSubscribeUserNotifications(client, { userId: 'user-2' });

    expect(client.join).not.toHaveBeenCalled();
    expect(client.emit).toHaveBeenCalledWith('subscription:rejected', {
      channel: 'user:user-2',
      reason: 'You can only subscribe to your own notification channel',
      timestamp: expect.any(String),
    });
    expect(wsLogger.logSubscriptionRejected).toHaveBeenCalledWith({
      socketId: 'socket-1',
      userId: 'user-1',
      channel: 'user:user-2',
      reason:
        "Ownership violation — authenticated as 'user-1', attempted to subscribe to 'user-2'",
    });
  });

  it('confirms private notification room subscriptions for the socket owner', () => {
    const { gateway, wsLogger } = createGateway();
    const client = createSocket({
      data: { userId: 'user-1' },
    });

    gateway.handleSubscribeUserNotifications(client, { userId: 'user-1' });

    expect(client.join).toHaveBeenCalledWith('user:user-1');
    expect(client.emit).toHaveBeenCalledWith('subscription:confirmed', {
      channel: 'user:user-1',
      timestamp: expect.any(String),
    });
    expect(wsLogger.logSubscriptionGranted).toHaveBeenCalledWith({
      socketId: 'socket-1',
      userId: 'user-1',
      channel: 'user:user-1',
    });
  });
});
