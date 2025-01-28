// Install dependencies:
// npm install @opentelemetry/api @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node @opentelemetry/exporter-trace-otlp-http @nestjs/otelemetry

// src/tracing.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import {
  CompositePropagator,
  W3CTraceContextPropagator,
} from '@opentelemetry/core';
import { propagation } from '@opentelemetry/api';

const traceExporter = new OTLPTraceExporter({
  url:
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
    'http://localhost:4318/v1/traces',
});

export const setupTracing = () => {
  // 1. Set up the propagator first
  propagation.setGlobalPropagator(
    new CompositePropagator({
      propagators: [new W3CTraceContextPropagator()],
    }),
  );

  // 2. Create SDK
  const sdk = new NodeSDK({
    resource: new Resource({
      'service.name': 'dummy order service',
      'service.version': '1.0.0',
    }),
    // instrumentations: [getNodeAutoInstrumentations()],
    traceExporter,
  });

  sdk.start();
  return sdk;
};
