import { AllExceptionsFilter } from './all-exceptions.filter';
import { HttpException, HttpStatus } from '@nestjs/common';
import { ArgumentsHost } from '@nestjs/common';

function makeHost(requestId?: string): ArgumentsHost {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const response = { status } as any;
  const request = {
    method: 'POST',
    url: '/stellar/verify',
    requestId,
  } as any;
  const ctx = {
    getResponse: () => response,
    getRequest: () => request,
  };
  return {
    switchToHttp: () => ctx,
  } as any;
}

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
  });

  it('includes requestId from request object for unexpected errors', () => {
    const host = makeHost('req-id-123');
    const httpCtx = host.switchToHttp();
    const response = httpCtx.getResponse<any>();

    filter.catch(new Error('Unexpected DB failure'), host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    const body = response.status.mock.results[0].value.json.mock.calls[0][0];
    expect(body.requestId).toBe('req-id-123');
    expect(body.code).toBe('INTERNAL_SERVER_ERROR');
  });

  it('falls back to "unknown" when no requestId on request', () => {
    const host = makeHost(undefined);
    const httpCtx = host.switchToHttp();
    const response = httpCtx.getResponse<any>();

    filter.catch(new Error('No requestId'), host);

    const body = response.status.mock.results[0].value.json.mock.calls[0][0];
    expect(body.requestId).toBe('unknown');
  });

  it('handles HttpException subclass by including requestId', () => {
    const host = makeHost('req-id-http');
    const httpCtx = host.switchToHttp();
    const response = httpCtx.getResponse<any>();

    filter.catch(
      new HttpException('Bad input', HttpStatus.BAD_REQUEST),
      host,
    );

    const body = response.status.mock.results[0].value.json.mock.calls[0][0];
    expect(body.requestId).toBe('req-id-http');
    expect(body.status).toBe(HttpStatus.BAD_REQUEST);
  });

  it('does not expose stack traces in the response body', () => {
    const host = makeHost('req-id-safe');
    const httpCtx = host.switchToHttp();
    const response = httpCtx.getResponse<any>();

    filter.catch(new Error('Secret internals'), host);

    const body = response.status.mock.results[0].value.json.mock.calls[0][0];
    expect(body).not.toHaveProperty('stack');
    expect(body.message).toBe('An unexpected error occurred');
  });
});
