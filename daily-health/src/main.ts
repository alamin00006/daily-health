// Must stay the first import: loads .env before other modules read process.env.
import './core/config/load-env-file.js';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule, ObserveInstrument } from './app.module.js';
import { AppConfigService } from './core/config/app-config.service.js';
import { configureHttpApp } from './core/http/configure-http-app.js';
import { RealtimeIoAdapter } from './core/realtime/realtime-io.adapter.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    instrument: ObserveInstrument,
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));

  const config = app.get(AppConfigService);
  configureHttpApp(app, config);
  app.useWebSocketAdapter(new RealtimeIoAdapter(app, config.corsOrigins));
  await app.listen(config.port);
}
await bootstrap();
