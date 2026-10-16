import type { Context } from 'hono';
import type { z } from 'zod';
import { HarborError } from '@harbor/core';

/** Parse and validate a JSON body, turning failures into typed INVALID_REQUEST errors. */
export async function body<T extends z.ZodTypeAny>(c: Context, schema: T, prepare?: (raw: unknown) => unknown): Promise<z.infer<T>> {
  const raw = await c.req.json().catch(() => {
    throw new HarborError('INVALID_REQUEST', 'Request body must be JSON.');
  });
  return check(schema, prepare ? prepare(raw) : raw);
}

/** Validate a value, turning failures into typed INVALID_REQUEST errors. */
export function check<T extends z.ZodTypeAny>(schema: T, raw: unknown): z.infer<T> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new HarborError('INVALID_REQUEST', `${issue?.path.join('.') || 'body'}: ${issue?.message ?? 'invalid'}`);
  }
  return parsed.data;
}

/** Postgres unique_violation, from either driver. */
export const isUniqueViolation = (err: unknown) => (err as { code?: string } | null)?.code === '23505';

export const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString());
