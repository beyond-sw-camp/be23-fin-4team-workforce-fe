import type { Rule } from 'antd/es/form';

/** Java `UUID.fromString`이 받는 36자 하이픈 표기 */
export const STANDARD_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isStandardUuidString(value: unknown): value is string {
  return typeof value === 'string' && STANDARD_UUID_RE.test(value.trim());
}

/** `required`와 함께 쓰면 빈 값은 넘깁니다. */
export function ruleStandardUuid(message: string): Rule {
  return {
    validator: async (_, value) => {
      const s = typeof value === 'string' ? value.trim() : value;
      if (s === undefined || s === null || s === '') return;
      if (!isStandardUuidString(s)) {
        return Promise.reject(new Error(message));
      }
    },
  };
}
