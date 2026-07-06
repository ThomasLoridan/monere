import type { ZodTypeAny, z } from 'zod';
import { badRequest } from './errors.js';

/** Parse and validate a request body/query/params against a Zod schema.
 *  Throws a 400 AppError with readable, field-level messages. */
export function validate<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const detail = result.error.issues
      .map((i) => `${i.path.join('.') || 'body'}: ${i.message}`)
      .join('; ');
    throw badRequest(`Requête invalide — ${detail}`, 'VALIDATION_ERROR');
  }
  return result.data;
}
