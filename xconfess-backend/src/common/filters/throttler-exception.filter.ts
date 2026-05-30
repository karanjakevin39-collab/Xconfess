import { ExceptionFilter, Catch, ArgumentsHost } from '@nestjs/common';
import { Request, Response } from 'express';
import { ThrottlerException } from '@nestjs/throttler';
import { ErrorCode } from '../errors/error-codes';

@Catch(ThrottlerException)
export class ThrottlerExceptionFilter implements ExceptionFilter {
  catch(exception: ThrottlerException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();

    const responseData = exception.getResponse();
    const retryAfter = this.extractRetryAfter(responseData);

    response.status(status).json({
      status,
      code: ErrorCode.THROTTLED,
      message: 'Too many requests. Please wait a moment and try again.',
      retryAfter,
      timestamp: new Date().toISOString(),
      path: request.url,
      requestId: (request as any).requestId || 'unknown',
    });
  }

  private extractRetryAfter(responseData: unknown): number | undefined {
    if (typeof responseData === 'object' && responseData !== null) {
      const data = responseData as Record<string, unknown>;
      const retryAfter = data['retryAfter'];
      if (typeof retryAfter === 'number') {
        return retryAfter;
      }
    }
    return undefined;
  }
}
