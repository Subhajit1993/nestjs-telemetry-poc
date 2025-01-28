import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import {
  context,
  propagation,
  ROOT_CONTEXT,
  SpanContext,
  trace,
  TraceFlags,
} from '@opentelemetry/api';

@Injectable()
export class TracingMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const tracer = trace.getTracer('nestjs-app');
    const requestId = req.headers['x-request-id'] as string;

    if (!requestId) {
      next();
      return;
    }

    // Try to extract parent context first
    const parentContext = propagation.extract(ROOT_CONTEXT, req.headers);
    const parentSpan = trace.getSpan(parentContext);

    // Determine trace ID and remote status
    let traceId: string;
    let isRemote = false;
    let parentSpanId: string | undefined;

    if (parentSpan) {
      // Use parent's trace ID if it exists
      const parentSpanContext = parentSpan.spanContext();
      traceId = parentSpanContext.traceId;
      isRemote = true;
      parentSpanId = parentSpanContext.spanId;

      console.log('Using parent context:', {
        parentTraceId: traceId,
        parentSpanId,
        traceparent: req.headers.traceparent,
      });
    } else {
      // No parent context, use request ID
      traceId = this.normalizeTraceId(requestId);
      isRemote = false;
    }

    const spanId = this.generateSpanId();

    // Create explicit span context
    const spanContext: SpanContext = {
      traceId,
      spanId,
      traceFlags: TraceFlags.SAMPLED,
      isRemote,
    };
    if (parentSpanId) {
      // If we have a parent span, set it as an attribute
      // This helps with debugging parent-child relationships
      (spanContext as any).parentSpanId = parentSpanId;
    }

    console.log('Creating span with context:', {
      traceId,
      spanId,
      requestId,
      isRemote,
    });

    // Create new context with our span context
    const ctx = trace.setSpanContext(ROOT_CONTEXT, spanContext);

    // Start span with context as third parameter
    const span = tracer.startSpan(
      `${req.method} ${req.path}`,
      {
        attributes: {
          'http.method': req.method,
          'http.target': req.path,
          'http.user_agent': req.get('user-agent'),
          'request.id': requestId,
          'trace.is_remote': isRemote,
        },
        kind: 1, // Server
      },
      ctx,
    );

    // Add debug headers to see what's being set
    res.setHeader('x-span-id', spanId);
    res.setHeader('x-request-id', requestId);
    res.setHeader('x-trace-id', span.spanContext().traceId);

    // Inject context into response headers for downstream services
    const contextWithSpan = trace.setSpan(ROOT_CONTEXT, span);
    propagation.inject(contextWithSpan, res, {
      set: (carrier, key, value) => {
        res.setHeader(key, value);
      },
    });

    return context.with(trace.setSpan(context.active(), span), () => {
      const startTime = Date.now();

      res.on('finish', () => {
        span.setAttributes({
          'http.status_code': res.statusCode,
          'http.duration_ms': Date.now() - startTime,
        });

        console.log('Finishing span:', {
          traceId: span.spanContext().traceId,
          spanId: span.spanContext().spanId,
          requestId,
          isRemote,
        });

        span.end();
      });

      next();
    });
  }

  private normalizeTraceId(id: string): string {
    // if valid trace ID, return
    if (id.length === 32) {
      return id;
    }

    // Convert to hex if not already
    const hex = Buffer.from(id).toString('hex');

    // Pad or truncate to exactly 32 chars
    return hex.padEnd(32, '0').slice(0, 32);
  }

  private generateSpanId(): string {
    const bytes = Buffer.allocUnsafe(8);
    for (let i = 0; i < 8; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
    return bytes.toString('hex');
  }
}
