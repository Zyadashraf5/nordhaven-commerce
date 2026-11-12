import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { getCorrelationId } from './correlation';

/** Injects the correlation identifier resolved for the current request. */
export const CorrelationId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    return getCorrelationId(context.switchToHttp().getRequest<object>());
  },
);
