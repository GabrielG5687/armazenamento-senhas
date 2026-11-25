import { randomUUID } from 'node:crypto';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { RequestContextService } from './request-context.service';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private readonly requestContext: RequestContextService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const header = req.headers['x-request-id'];
    const requestId = typeof header === 'string' && header.length > 0 ? header : randomUUID();
    (req as Request & { id?: string }).id = requestId;
    res.setHeader('x-request-id', requestId);

    this.requestContext.run(
      {
        requestId,
        ip: req.ip,
        userAgent: req.header('user-agent') ?? undefined,
      },
      () => next(),
    );
  }
}