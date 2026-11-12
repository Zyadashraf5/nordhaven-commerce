import {
  Injectable,
  type BeforeApplicationShutdown,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ApplicationAvailabilityService } from '../availability/application-availability.service';

@Injectable()
export class ShutdownService implements BeforeApplicationShutdown, OnApplicationShutdown {
  public constructor(private readonly availability: ApplicationAvailabilityService) {}

  public beforeApplicationShutdown(): void {
    this.availability.beginShutdown();
  }

  public onApplicationShutdown(): void {
    this.availability.markStopped();
  }
}
