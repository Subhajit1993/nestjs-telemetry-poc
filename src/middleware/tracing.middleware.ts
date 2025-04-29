import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import {
  context,
  Context,
  propagation,
  ROOT_CONTEXT,
  SpanContext,
  trace,
  TraceFlags,
} from '@opentelemetry/api';

// Create a custom interface extending Express.Request
export interface RequestWithTrace extends Request {
  traceContext: Context;

  getTraceContext(): Context;

  getActiveSpan(): ReturnType<typeof trace.getSpan>;
}

@Injectable()
export class TracingMiddleware implements NestMiddleware {
  use(req: RequestWithTrace, res: Response, next: NextFunction) {
    const tracer = trace.getTracer('nestjs-app');
    const requestId = req.headers['x-request-id'] as string;
    const traceparent = req.headers['traceparent'] as string;

    console.log('traceparent ID received:', traceparent);
    console.log('x-request-id received:', requestId);

    let parentContext: Context;

    if (traceparent) {
      // If traceparent exists, extract the remote context
      parentContext = propagation.extract(ROOT_CONTEXT, req.headers);
      console.log('Using remote context from traceparent');
    } else {
      // Create a new local context using request ID
      const customSpanContext: SpanContext = {
        traceId: requestId,
        spanId: this.generateSpanId(),
        traceFlags: TraceFlags.SAMPLED,
        isRemote: false, // Local context
      };
      parentContext = trace.setSpanContext(ROOT_CONTEXT, customSpanContext);
      console.log('Created new local context with request ID');
    }

    // Start a new span with our parent context
    const span = tracer.startSpan(
      `${req.method} ${req.originalUrl}`,
      {
        attributes: {
          'http.method': req.method,
          'endpoint.name': req.originalUrl,
          'http.user_agent': req.get('user-agent'),
          'trace.is_remote': !!traceparent, // Add attribute to indicate if remote
        },
        kind: 1, // Server
      },
      parentContext,
    );

    // Create new context with our span
    const ctx = trace.setSpan(parentContext, span);

    // Inject the context into response headers for downstream services
    propagation.inject(ctx, res, {
      set: (carrier, key, value) => {
        res.setHeader(key, value);
      },
    });

    // Add helper methods to request object
    req.traceContext = ctx;
    req.getTraceContext = () => ctx;
    req.getActiveSpan = () => trace.getSpan(ctx);

    return context.with(ctx, () => {
      // End span when response finishes
      res.setHeader('x-request-id', requestId);
      res.setHeader('x-trace-id', span.spanContext().traceId);
      res.on('finish', () => {
        span.setAttributes({
          'http.status_code': res.statusCode,
        });
        span.end();
      });
      next();
    });
  }

  private generateSpanId(): string {
    const bytes = Buffer.allocUnsafe(8);
    for (let i = 0; i < 8; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
    return bytes.toString('hex');
  }
}
