import type { components } from '../src/generated/platform-v2.js';
import { shapeErrors } from './contractShape.js';

/** Returns `value` when it is a valid `name` of the contract; throws otherwise. */
export function v2<N extends keyof components['schemas']>(
  name: N,
  value: components['schemas'][N]
): components['schemas'][N] {
  const errors = shapeErrors(name, value);
  if (errors.length > 0) {
    throw new Error(`fixture is not a ${name}:\n  ${errors.join('\n  ')}`);
  }
  return value;
}
