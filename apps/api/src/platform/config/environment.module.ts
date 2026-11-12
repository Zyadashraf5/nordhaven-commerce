import { Global, type DynamicModule, Module } from '@nestjs/common';
import { ENVIRONMENT_CONFIGURATION, type EnvironmentConfiguration } from './environment';

@Global()
@Module({})
export class EnvironmentModule {
  public static forRoot(configuration: EnvironmentConfiguration): DynamicModule {
    return {
      global: true,
      module: EnvironmentModule,
      providers: [{ provide: ENVIRONMENT_CONFIGURATION, useValue: configuration }],
      exports: [ENVIRONMENT_CONFIGURATION],
    };
  }
}
