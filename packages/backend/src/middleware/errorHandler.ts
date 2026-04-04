import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

/**
 * Global error handler middleware.
 * Catches all errors, returns structured JSON responses.
 * In development, includes stack trace for debugging.
 */
export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const message = err instanceof AppError ? err.message : 'Internal server error';

  const response: Record<string, unknown> = {
    error: message,
    statusCode,
  };

  if (env.NODE_ENV === 'development') {
    response.stack = err.stack;
    // For non-AppError in dev, show the real message too
    if (!(err instanceof AppError)) {
      response.originalMessage = err.message;
    }
  }

  console.error(`[ERROR] ${statusCode} - ${err.message}`, env.NODE_ENV === 'development' ? err.stack : '');

  res.status(statusCode).json(response);
}

/**
 * 404 handler for unmatched routes.
 */
export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: 'Route not found', statusCode: 404 });
}
