import { ZodError } from 'zod';
import { HttpError } from '../lib/http-error.js';

export function validate(schema) {
  return (req, res, next) => {
    try {
      const result = schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      req.body = result.body ?? req.body;
      req.query = result.query ?? req.query;
      req.params = result.params ?? req.params;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const issues = error.issues.map(issue => ({
          path: issue.path.join('.'),
          message: issue.message,
        }));
        return next(new HttpError(400, 'Validation failed', 'VALIDATION_ERROR', { issues }));
      }
      next(error);
    }
  };
}