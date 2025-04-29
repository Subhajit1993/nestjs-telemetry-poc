import { Controller, Get, Post, Req } from '@nestjs/common';
import { AppService } from './app.service';
import { HttpService } from '@nestjs/axios';
import { v4 as uuidv4 } from 'uuid';
import { RequestWithTrace } from './middleware/tracing.middleware';
import { context, propagation, trace } from '@opentelemetry/api';
import axios from 'axios';
import { KafkaService } from './lib/kafka/kafka.service';

function getSpan(serviceName: string, spanName: string, traceContext: any) {
  const tracer = trace.getTracer(serviceName);
  const span = tracer.startSpan(
    spanName,
    {
      attributes: {
        'service.name': serviceName,
        'endpoint.name': spanName,
      },
    },
    traceContext,
  );
  return span;
}

async function simulateDbSave(data: any, timeout: number): Promise<any> {
  console.log('Saving to the database...');
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      const shouldFail = Math.random() < 0.1; // 10% chance of failure
      if (shouldFail) {
        console.error('Failed to save to the database:', data);
        reject(new Error('Database save failed'));
      } else {
        console.log('Data successfully saved:', data);
        resolve({
          status: 'success',
          data: data,
        });
      }
    }, timeout); // Simulated delay of 1 second
  });
}

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly httpService: HttpService,
    private readonly kafkaService: KafkaService,
  ) {}

  @Get('/health')
  getHello(@Req() req: RequestWithTrace): string {
    // Create child span using the existing trace context
    const span = getSpan('nestjs-app', 'GET /health', req.traceContext);

    try {
      const result = this.appService.getHello();
      span.setAttributes({
        'health.status': 'success',
      });
      return result;
    } catch (error) {
      span.recordException(error);
      throw error;
    } finally {
      span.end();
    }
  }

  @Post('/place-order')
  async placeOrder(@Req() request: RequestWithTrace): Promise<string> {
    const orderSpan = getSpan(
      'nestjs-app',
      'POST /place-order handler',
      request.traceContext,
    );
    const requestId = request.headers['x-request-id'] as string;
    const amount = Math.floor(Math.random() * (1000 - 10 + 1)) + 10;
    const itemId = Math.floor(Math.random() * (1000 - 10 + 1)) + 10;
    const userId = Math.floor(Math.random() * (1000 - 10 + 1)) + 10;
    const quantity = Math.floor(Math.random() * (10 - 1 + 1)) + 1;
    const orderId = uuidv4();
    const orderDetails = {
      itemId: itemId.toString(),
      quantity: quantity,
      userId: userId,
      amount: amount,
      orderId: orderId,
    };
    orderSpan.setAttributes({
      'order.amount': amount,
      'order.itemId': itemId,
      'order.userId': userId,
      'order.quantity': quantity,
    });
    // Create context for the entire operation
    const ctx = trace.setSpan(context.active(), orderSpan);
    try {
      // Simulate database save
      const carrier: { [key: string]: string } = {};
      propagation.inject(ctx, carrier);
      await simulateDbSave(orderDetails, 1000);
      console.log('traceparent:', carrier.traceparent);

      // Call payment service with X-Request-ID header
      const paymentResponse = await axios.post(
        'http://localhost:8001/payment',
        {
          orderId: orderId,
          amount: amount, // Payment amount
        },
        {
          headers: {
            'X-Request-ID': requestId, // Pass X-Request-ID header to /payment API
            traceparent: carrier.traceparent,
          },
        },
      );
      console.log('Payment response:', paymentResponse.data);
      await simulateDbSave(orderDetails, 2000);
      // Send kafka message with trace context
      const kafkaData = JSON.stringify({
        data: {
          orderRefId: paymentResponse.data.orderId,
        },
        type: 'ORDER_CREATED',
        traceContext: carrier.traceparent,
      });
      await this.kafkaService.sendMessage('reports-ms-dev01', kafkaData);
      orderSpan.addEvent('sendToKafka', {
        orderId,
      });
      orderSpan.end();
      return `Order placed successfully with payment status: ${paymentResponse.data.paymentStatus}`;
    } catch (error) {
      orderSpan.end();
      console.error('Error during order placement:', error.message);
      throw new Error(error.message);
    }
  }
}
