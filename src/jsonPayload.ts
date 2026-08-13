const MAX_SAFE_INTEGER_DIGITS = '9007199254740991';

function scaledIntegerGreater(
  left: string,
  leftTrailingZeros: number,
  right: string,
  rightTrailingZeros: number
): boolean {
  const leftLength = left.length + leftTrailingZeros;
  const rightLength = right.length + rightTrailingZeros;
  if (leftLength !== rightLength) return leftLength > rightLength;
  for (let index = 0; index < leftLength; index++) {
    const leftDigit = index < left.length ? left[index] : '0';
    const rightDigit = index < right.length ? right[index] : '0';
    if (leftDigit !== rightDigit) return leftDigit > rightDigit;
  }
  return false;
}

function numberOutsideSafeRange(token: string): boolean {
  const match = token.match(
    /^-?(?<whole>\d+)(?:\.(?<fraction>\d+))?(?:[eE](?<exponent>[+-]?\d+))?$/
  );
  if (!match?.groups) return true;
  const whole = match.groups.whole;
  const fraction = match.groups.fraction ?? '';
  const exponent = Number(match.groups.exponent ?? '0');
  if (!Number.isSafeInteger(exponent)) return true;
  const digits = (whole + fraction).replace(/^0+/, '') || '0';
  if (digits === '0') return false;
  const scale = exponent - fraction.length;
  return scale >= 0
    ? scaledIntegerGreater(digits, scale, MAX_SAFE_INTEGER_DIGITS, 0)
    : scaledIntegerGreater(digits, 0, MAX_SAFE_INTEGER_DIGITS, -scale);
}

function validateJSONNumberTokens(raw: string): void {
  let index = 0;
  while (index < raw.length) {
    if (raw[index] === '"') {
      index++;
      while (index < raw.length) {
        if (raw[index] === '\\') {
          index += 2;
        } else if (raw[index++] === '"') {
          break;
        }
      }
      continue;
    }
    if (raw[index] === '-' || /\d/.test(raw[index] ?? '')) {
      const match = raw
        .slice(index)
        .match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
      if (match) {
        if (numberOutsideSafeRange(match[0])) {
          throw new TypeError(
            "args contains a number outside JavaScript's safe range; use a string for int64 and identifier values"
          );
        }
        index += match[0].length;
        continue;
      }
    }
    index++;
  }
}

function assertPlainJSONData(
  value: unknown,
  path: string,
  seen: Set<object>
): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError(`${path} must contain only finite numbers`);
    }
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
      throw new TypeError(
        `${path} contains a number outside JavaScript's safe range; use a string for int64 and identifier values`
      );
    }
    return;
  }
  if (typeof value !== 'object') {
    throw new TypeError(`${path} must contain only JSON data`);
  }
  if (seen.has(value)) {
    throw new TypeError(`${path} must not contain circular references`);
  }
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertPlainJSONData(item, `${path}[${index}]`, seen)
    );
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`${path} must contain only plain JSON objects`);
    }
    for (const [key, descriptor] of Object.entries(
      Object.getOwnPropertyDescriptors(value)
    )) {
      if (!descriptor.enumerable) continue;
      if (!('value' in descriptor)) {
        throw new TypeError(`${path} must not contain accessors`);
      }
      assertPlainJSONData(descriptor.value, `${path}.${key}`, seen);
    }
  }
  seen.delete(value);
}

export function serializeStructuredArgs(value: unknown): string {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('args must be a JSON object');
  }
  assertPlainJSONData(value, 'args', new Set());
  const serialized = JSON.stringify(value);
  validateSerializedArgs(serialized);
  return serialized;
}

export function validateSerializedArgs(raw: string): void {
  const value: unknown = JSON.parse(raw);
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('args must be a JSON object');
  }
  validateJSONNumberTokens(raw);
}

export function objectWithRawJSONField(
  fields: Record<string, unknown>,
  fieldName: string,
  rawValue: string | undefined
): string {
  const entries = Object.entries(fields).filter(
    ([key, value]) =>
      value !== undefined && (rawValue === undefined || key !== fieldName)
  );
  if (rawValue !== undefined) {
    validateSerializedArgs(rawValue);
    entries.push([fieldName, rawValue]);
  }
  return `{${entries
    .map(([key, value]) => {
      const encodedValue =
        key === fieldName && rawValue !== undefined
          ? rawValue
          : JSON.stringify(value);
      return `${JSON.stringify(key)}:${encodedValue}`;
    })
    .join(',')}}`;
}
