function assertSafeJSONNumbers(value: unknown, path = 'args'): void {
  if (typeof value === 'number') {
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
      throw new TypeError(
        `${path} contains an unsafe integer; pass int64 and identifier values as strings`
      );
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertSafeJSONNumbers(item, `${path}[${index}]`)
    );
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      assertSafeJSONNumbers(item, `${path}.${key}`);
    }
  }
}

export function validateStructuredArgs(value: unknown): void {
  assertSafeJSONNumbers(value);
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
    JSON.parse(rawValue);
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
