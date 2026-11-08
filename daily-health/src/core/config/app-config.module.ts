import { Global, Module } from '@nestjs/common';
import { AppConfigService } from './app-config.service.js';
import { parseEnvironmentVariables } from './environment-variables.schema.js';

@Global()
@Module({
  providers: [
    {
      provide: AppConfigService,
      useFactory: () =>
        new AppConfigService(parseEnvironmentVariables(process.env)),
    },
  ],
  exports: [AppConfigService],
})
export class AppConfigModule {}
