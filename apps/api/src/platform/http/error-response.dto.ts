import { ApiProperty } from '@nestjs/swagger';

/**
 * The single safe error envelope every endpoint returns.
 *
 * It lives in the platform layer because every module must document the same shape and because a
 * module may never import another module's DTOs.
 */
export class ErrorResponse {
  @ApiProperty({ minimum: 400, maximum: 599 })
  public statusCode!: number;

  @ApiProperty({ pattern: '^[A-Z][A-Z0-9_]*$' })
  public code!: string;

  @ApiProperty()
  public message!: string;

  @ApiProperty({ format: 'uuid' })
  public correlationId!: string;

  @ApiProperty({
    required: false,
    oneOf: [{ type: 'object' }, { type: 'array', items: {} }],
    description: 'Optional non-sensitive validation details.',
  })
  public details?: Record<string, unknown> | unknown[];
}
