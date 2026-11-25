import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { RequestContextService } from '../context/request-context.service';

interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  code: string;
  requestId: string;
  details?: unknown;
}

const STATUS_CODE: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'PERMISSION_DENIED',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  412: 'PRECONDITION_FAILED',
  413: 'PAYLOAD_TOO_LARGE',
  422: 'VALIDATION_ERROR',
  429: 'RATE_LIMITED',
  500: 'INTERNAL_ERROR',
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly requestContext: RequestContextService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request & { id?: string }>();
    const requestId =
      request.id ?? this.requestContext.getRequestId() ?? 'unknown';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let title = 'Internal server error';
    let code = STATUS_CODE[500];
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const payload = exception.getResponse();
      if (typeof payload === 'string') {
        title = payload;
      } else if (payload && typeof payload === 'object') {
        const record = payload as Record<string, unknown>;
        title = typeof record.message === 'string' ? record.message : title;
        if (record.details !== undefined) {
          details = record.details;
        }
        if (typeof record.code === 'string') {
          code = record.code;
        }
      }
      if (!code || code === STATUS_CODE[500]) {
        code = STATUS_CODE[status] ?? 'ERROR';
      }
    } else if (exception instanceof Error) {
      this.logger.error(
        `Unhandled exception: ${exception.message}`,
      );
    }

    const body: ProblemDetails = {
      type: `https://api.securevault.local/errors/${code.toLowerCase().replace(/_/g, '-')}`,
      title,
      status,
      code,
      requestId,
    };
    if (details !== undefined) {
      body.details = details;
    }

    if (status >= 500) {
      this.logger.error(`Request failed: ${request.method} ${request.url}`);
    }

    response.status(status).json(body);
  }
}