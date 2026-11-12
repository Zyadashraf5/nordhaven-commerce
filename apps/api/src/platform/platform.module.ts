import { Global, Module } from '@nestjs/common';
import { ApplicationAvailabilityService } from './availability/application-availability.service';
import { RateLimiterService } from './security/rate-limiter';
import { ShutdownService } from './shutdown/shutdown.service';

@Global()
@Module({
  providers: [ApplicationAvailabilityService, ShutdownService, RateLimiterService],
  exports: [ApplicationAvailabilityService, ShutdownService, RateLimiterService],
})
export class PlatformModule {}
