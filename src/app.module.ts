import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HttpModule } from '@nestjs/axios';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { TracingMiddleware } from './middleware/tracing.middleware';
import { KafkaService } from './lib/kafka/kafka.service';

@Module({
  imports: [HttpModule],
  controllers: [AppController],
  providers: [AppService, KafkaService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TracingMiddleware).forRoutes('*');
  }
}
