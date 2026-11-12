import {
  BadRequestException,
  Injectable,
  type ArgumentMetadata,
  type PipeTransform,
} from '@nestjs/common';
import type { ZodType } from 'zod';

export const ZOD_VALIDATION_SCHEMA = Symbol('ZOD_VALIDATION_SCHEMA');

interface ZodValidatedType {
  readonly [ZOD_VALIDATION_SCHEMA]?: ZodType;
}

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  public transform(value: unknown, metadata: ArgumentMetadata): unknown {
    const validatedType = metadata.metatype as ZodValidatedType | undefined;
    const schema = validatedType?.[ZOD_VALIDATION_SCHEMA];
    if (schema === undefined) return value;

    const result = schema.safeParse(value);
    if (result.success) return result.data;

    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      details: result.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: 'Invalid value',
      })),
    });
  }
}
