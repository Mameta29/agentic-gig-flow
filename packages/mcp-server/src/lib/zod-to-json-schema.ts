import type { z } from 'zod';

/**
 * Lightweight zod -> JSON Schema converter sufficient for tool inputSchema.
 * Handles object / string / number / boolean / enum / array / optional / default.
 */
export function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  return convert(schema);
}

function convert(s: z.ZodTypeAny): Record<string, unknown> {
  const def = (s as unknown as { _def: { typeName: string } })._def;
  switch (def.typeName) {
    case 'ZodObject': {
      const shape = (s as z.ZodObject<z.ZodRawShape>).shape;
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      for (const [k, v] of Object.entries(shape)) {
        properties[k] = convert(v);
        if (!isOptional(v)) required.push(k);
      }
      return {
        type: 'object',
        properties,
        ...(required.length ? { required } : {}),
        additionalProperties: false,
      };
    }
    case 'ZodString': {
      const checks = (def as unknown as { checks?: { kind: string; regex?: RegExp }[] })
        .checks ?? [];
      const out: Record<string, unknown> = { type: 'string' };
      const regex = checks.find((c) => c.kind === 'regex')?.regex?.source;
      if (regex) out.pattern = regex;
      return out;
    }
    case 'ZodNumber': {
      const checks = (def as unknown as { checks?: { kind: string; value?: number }[] })
        .checks ?? [];
      const out: Record<string, unknown> = { type: 'number' };
      if (checks.some((c) => c.kind === 'int')) out.type = 'integer';
      const min = checks.find((c) => c.kind === 'min')?.value;
      const max = checks.find((c) => c.kind === 'max')?.value;
      if (min !== undefined) out.minimum = min;
      if (max !== undefined) out.maximum = max;
      return out;
    }
    case 'ZodBoolean':
      return { type: 'boolean' };
    case 'ZodEnum':
      return { type: 'string', enum: (def as unknown as { values: string[] }).values };
    case 'ZodArray':
      return {
        type: 'array',
        items: convert((def as unknown as { type: z.ZodTypeAny }).type),
      };
    case 'ZodOptional':
      return convert((def as unknown as { innerType: z.ZodTypeAny }).innerType);
    case 'ZodDefault':
      return convert((def as unknown as { innerType: z.ZodTypeAny }).innerType);
    case 'ZodLiteral':
      return { const: (def as unknown as { value: unknown }).value };
    case 'ZodAny':
    case 'ZodUnknown':
      return {};
    default:
      return {};
  }
}

function isOptional(s: z.ZodTypeAny): boolean {
  const def = (s as unknown as { _def: { typeName: string } })._def;
  return def.typeName === 'ZodOptional' || def.typeName === 'ZodDefault';
}
