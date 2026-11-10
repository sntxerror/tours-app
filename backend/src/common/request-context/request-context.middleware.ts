import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { runWithRequestContext } from './request-context';

export const REQUEST_ID_HEADER = 'x-request-id';

/** Only accept sane caller-supplied ids; anything else could be used to forge or bloat log/event fields. */
const SAFE_REQUEST_ID = /^[\w.-]{1,128}$/;

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const supplied = req.header(REQUEST_ID_HEADER);
    const correlationId = supplied && SAFE_REQUEST_ID.test(supplied) ? supplied : randomUUID();
    res.setHeader(REQUEST_ID_HEADER, correlationId);
    runWithRequestContext({ correlationId, ip: req.ip }, next);
  }
}
