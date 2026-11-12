import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';
import { ZOD_VALIDATION_SCHEMA } from '../../../platform/validation/zod-validation.pipe';

export class NotificationIdParam {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({ notificationId: z.uuid() });

  @ApiProperty({ type: String, format: 'uuid' })
  public notificationId!: string;
}
