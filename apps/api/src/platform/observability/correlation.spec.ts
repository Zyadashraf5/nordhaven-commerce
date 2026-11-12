import { resolveCorrelationId } from './correlation';

describe('resolveCorrelationId', () => {
  it('accepts one valid UUID and normalizes case', () => {
    expect(resolveCorrelationId('8F44F65F-E86A-4FE4-9AAC-07B3E6C810F7')).toBe(
      '8f44f65f-e86a-4fe4-9aac-07b3e6c810f7',
    );
  });

  it.each([undefined, 'not-a-uuid', ['one', 'two']])('replaces invalid input', (value) => {
    expect(resolveCorrelationId(value)).toMatch(/^[0-9a-f-]{36}$/);
  });
});
