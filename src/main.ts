import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { setupTracing } from './lib/tracing';

async function bootstrap() {
  const otel = setupTracing();

  // process.on('SIGTERM', () => {
  //   otel
  //     .shutdown()
  //     .then(() => console.log('Tracing terminated via sigterm'))
  //     .catch((error) => console.log('Error terminating tracing', error))
  //     .finally(() => process.exit(0));
  // });
  const app = await NestFactory.create(AppModule);
  await app.listen(8000);
}

bootstrap();
