import * as fs from 'node:fs';
import { CONTRACT_PATH } from '../scripts/openapi.js';
import type { Schema } from '../src/platformApi.js';
import type { components } from '../src/generated/platform-v2.js';

// Checks a test fixture against a schema of the /api/v2 contract
// (openapi/alva-platform-v2.json), so fakes answer what the gateway answers,
// and a request body against its operation's schema, so the client sends
// what the gateway takes. It reads the JSON Schema keywords the document
// uses: $ref, anyOf, type, enum, pattern, maxLength, required, properties and
// items. Objects are closed: the gateway writes no member its schema lacks
// and refuses a request member its schema lacks.

interface JsonSchema {
  $ref?: string;
  anyOf?: JsonSchema[];
  type?: string | string[];
  enum?: unknown[];
  pattern?: string;
  maxLength?: number;
  required?: string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
}

interface Operation {
  requestBody?: { content?: Record<string, { schema?: JsonSchema }> };
}

const DOCUMENT = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8')) as {
  paths: Record<string, Record<string, Operation>>;
  components: { schemas: Record<string, JsonSchema> };
};
const SCHEMAS = DOCUMENT.components.schemas;

/**
 * The contract's paths as patterns of a sent path, a literal segment before
 * a parameter (`/me/risk-rules` before `/me/{x}`).
 */
const PATHS = Object.entries(DOCUMENT.paths)
  .map(([template, item]) => ({
    parameters: template.split('{').length - 1,
    pattern: new RegExp(`^${template.replace(/\{[^}]+\}/g, '[^/]+')}$`),
    item,
  }))
  .sort((a, b) => a.parameters - b.parameters);

function typeOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number')
    return Number.isInteger(value) ? 'integer' : 'number';
  return typeof value;
}

function errors(schema: JsonSchema, value: unknown, at: string): string[] {
  if (schema.$ref !== undefined) {
    const name = schema.$ref.replace('#/components/schemas/', '');
    return errors(SCHEMAS[name], value, at);
  }
  if (schema.anyOf !== undefined) {
    const branches = schema.anyOf.map((s) => errors(s, value, at));
    return branches.some((e) => e.length === 0)
      ? []
      : [`${at}: matches no branch (${branches.flat().join('; ')})`];
  }
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actual = typeOf(value);
    if (
      !types.includes(actual) &&
      !(actual === 'integer' && types.includes('number'))
    ) {
      return [`${at}: is ${actual}, not ${types.join(' or ')}`];
    }
  }
  if (schema.enum !== undefined && !schema.enum.includes(value)) {
    return [`${at}: ${JSON.stringify(value)} is not one of the enum`];
  }
  const out: string[] = [];
  if (typeof value === 'string') {
    if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(value))
      out.push(`${at}: ${JSON.stringify(value)} fails ${schema.pattern}`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength)
      out.push(`${at}: longer than ${schema.maxLength}`);
  }
  if (Array.isArray(value) && schema.items !== undefined) {
    value.forEach((item, i) =>
      out.push(...errors(schema.items!, item, `${at}[${i}]`))
    );
  }
  if (typeOf(value) === 'object' && schema.properties !== undefined) {
    const record = value as Record<string, unknown>;
    for (const name of schema.required ?? []) {
      if (!(name in record)) out.push(`${at}.${name}: missing`);
    }
    for (const [name, member] of Object.entries(record)) {
      const property = schema.properties[name];
      out.push(
        ...(property === undefined
          ? [`${at}.${name}: not in the schema`]
          : errors(property, member, `${at}.${name}`))
      );
    }
  }
  return out;
}

/** Why value is not a `name` of the contract; empty when it is one. */
export function shapeErrors<Name extends keyof components['schemas']>(
  name: Name,
  value: Schema<Name>
): string[] {
  const schema = SCHEMAS[name];
  if (schema === undefined) return [`no schema ${name}`];
  return errors(schema, value, name);
}

/**
 * Why `body`, sent as `contentType`, is not a request the contract's
 * operation `method path` takes (path below /api/v2, as sent); empty when it
 * is one.
 */
export function requestBodyErrors(
  method: string,
  path: string,
  contentType: string | undefined,
  body: unknown
): string[] {
  const at = `${method} ${path}`;
  const operation = PATHS.find((p) => p.pattern.test(path))?.item[
    method.toLowerCase()
  ];
  if (operation === undefined) return [`${at}: no such operation`];
  const media = operation.requestBody?.content?.[contentType ?? ''];
  if (media === undefined) return [`${at}: takes no ${contentType} body`];
  return media.schema === undefined ? [] : errors(media.schema, body, 'body');
}
