import { ApiProperty } from '@nestjs/swagger';

export class LivenessResponse {
  @ApiProperty({ enum: ['ok'], example: 'ok' })
  public readonly status = 'ok' as const;
}

class ReadinessChecks {
  @ApiProperty({ enum: ['up'], example: 'up' })
  public readonly database = 'up' as const;
}

export class ReadinessResponse {
  @ApiProperty({ enum: ['ok'], example: 'ok' })
  public readonly status = 'ok' as const;

  @ApiProperty({ type: ReadinessChecks })
  public readonly checks = new ReadinessChecks();
}
