import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';
import { ZOD_VALIDATION_SCHEMA } from '../../../platform/validation/zod-validation.pipe';

export class CustomerIdParam {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({ customerId: z.uuid() });

  @ApiProperty({ type: String, format: 'uuid' })
  public customerId!: string;
}

export class AuditQuery {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({
    limit: z.coerce.number().int().min(1).max(200).default(50),
  });

  @ApiProperty({ type: Number, minimum: 1, maximum: 200 })
  public limit!: number;
}

export class CustomersQuery {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({
    limit: z.coerce.number().int().min(1).max(200).default(200),
    cursor: z
      .uuid()
      .transform((value) => value.toLowerCase())
      .optional(),
  });
  @ApiProperty({ type: Number, required: false, minimum: 1, maximum: 200, default: 200 })
  public limit!: number;
  @ApiProperty({ type: String, required: false, format: 'uuid' }) public cursor?: string;
}
