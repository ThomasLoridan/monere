/** Application error carrying an HTTP status. Anything else maps to 500. */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (msg: string, code = 'BAD_REQUEST') => new AppError(400, msg, code);
export const unauthorized = (msg = 'Authentification requise', code = 'UNAUTHORIZED') =>
  new AppError(401, msg, code);
export const forbidden = (msg = 'Accès refusé', code = 'FORBIDDEN') => new AppError(403, msg, code);
export const notFound = (msg = 'Ressource introuvable', code = 'NOT_FOUND') =>
  new AppError(404, msg, code);
export const conflict = (msg: string, code = 'CONFLICT') => new AppError(409, msg, code);
export const tooMany = (msg = 'Trop de requêtes, réessayez plus tard', code = 'RATE_LIMITED') =>
  new AppError(429, msg, code);
export const upstreamUnavailable = (msg: string, code = 'UPSTREAM_UNAVAILABLE') =>
  new AppError(503, msg, code);
