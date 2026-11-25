import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { RequestContextService } from '../context/request-context.service';
import type { AuthenticatedUser } from '../types';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  constructor(private readonly requestContext: RequestContextService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<Request & { user?: AuthenticatedUser }>();
    const response = http.getResponse<Response>();
    const startedAt = Date.now();

    return next.handle().pipe(
      tap(() => {
        this.logger.log(
          `${request.method} ${request.url} ${response.statusCode} ${Date.now() - startedAt}ms ` +
            `requestId=${this.requestContext.getRequestId() ?? '-'} ` +
            `userId=${request.user?.id ?? '-'}`,
        );
      }),
      catchError((error: unknown) => {
        this.logger.warn(
          `${request.method} ${request.url} failed ${Date.now() - startedAt}ms ` +
            `requestId=${this.requestContext.getRequestId() ?? '-'} ` +
            `userId=${request.user?.id ?? '-'}`,
        );
        return throwError(() => error);
      }),
    );
  }
}