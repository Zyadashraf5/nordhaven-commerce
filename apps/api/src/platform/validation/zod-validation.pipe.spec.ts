import { BadRequestException, type ArgumentMetadata } from '@nestjs/common';
import { z } from 'zod';
import { ZOD_VALIDATION_SCHEMA, ZodValidationPipe } from './zod-validation.pipe';

class ExampleRequest {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.object({
    name: z.string().trim().min(1),
    count: z.coerce.number().int().positive(),
  });
}

const metadata: ArgumentMetadata = { type: 'body', metatype: ExampleRequest, data: undefined };

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe();

  it('normalizes validated external input', () => {
    expect(pipe.transform({ name: '  lamp  ', count: '2' }, metadata)).toEqual({
      name: 'lamp',
      count: 2,
    });
  });

  it('rejects invalid input without returning rejected values', () => {
    const secret = 'synthetic-rejected-secret';
    try {
      pipe.transform({ name: '', count: secret }, metadata);
      throw new Error('Expected validation to fail');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect(JSON.stringify((error as BadRequestException).getResponse())).not.toContain(secret);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: 'VALIDATION_ERROR',
      });
    }
  });

  it('leaves parameters without an attached schema unchanged', () => {
    const value = { untouched: true };
    expect(pipe.transform(value, { type: 'body', metatype: Object })).toBe(value);
  });
});
