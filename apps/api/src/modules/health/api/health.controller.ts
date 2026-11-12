import {
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ApiExtraModels,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
  type ApiResponseOptions,
} from '@nestjs/swagger';
import { ApplicationAvailabilityService } from '../../../platform/availability/application-availability.service';
import { DatabaseService } from '../../../platform/database/database.service';
import { ErrorResponse } from '../../../platform/http/error-response.dto';
import { Public } from '../../../platform/security/access.decorators';
import { LivenessResponse, ReadinessResponse } from './health.dto';

const responseHeaders: NonNullable<ApiResponseOptions['headers']> = {
  'X-Correlation-ID': {
    description: 'Server-accepted or server-generated request correlation UUID.',
    schema: { type: 'string', format: 'uuid' },
  },
  'Cache-Control': {
    description: 'Prevents caches from retaining health state.',
    schema: { type: 'string', enum: ['no-store'] },
  },
};

@ApiTags('Health')
@ApiExtraModels(ErrorResponse)
@ApiHeader({
  name: 'X-Correlation-ID',
  required: false,
  schema: { type: 'string', format: 'uuid' },
})
@Public()
@Controller({ path: 'health', version: '1' })
export class HealthController {
  public constructor(
    private readonly database: DatabaseService,
    private readonly availability: ApplicationAvailabilityService,
  ) {}

  @Get('live')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ operationId: 'getLiveness', summary: 'Report process liveness' })
  @ApiResponse({
    status: 200,
    description: 'The process can serve probes.',
    type: LivenessResponse,
    headers: responseHeaders,
  })
  @ApiResponse({
    status: 500,
    description: 'An unexpected application failure occurred.',
    type: ErrorResponse,
    headers: responseHeaders,
  })
  public liveness(): LivenessResponse {
    return new LivenessResponse();
  }

  @Get('ready')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ operationId: 'getReadiness', summary: 'Report critical-dependency readiness' })
  @ApiResponse({
    status: 200,
    description: 'The application and PostgreSQL are ready.',
    type: ReadinessResponse,
    headers: responseHeaders,
  })
  @ApiResponse({
    status: 503,
    description: 'A critical dependency is unavailable or shutdown has begun.',
    type: ErrorResponse,
    headers: responseHeaders,
  })
  @ApiResponse({
    status: 500,
    description: 'An unexpected application failure occurred.',
    type: ErrorResponse,
    headers: responseHeaders,
  })
  public async readiness(): Promise<ReadinessResponse> {
    if (this.availability.getState() === 'SHUTTING_DOWN') throw new ServiceUnavailableException();
    try {
      await this.database.probe();
      this.availability.markReady();
      return new ReadinessResponse();
    } catch {
      this.availability.markDegraded();
      throw new ServiceUnavailableException();
    }
  }
}
