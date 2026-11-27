import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { AppFailure } from '@voxeli/domain';

/**
 * Single place where errors become responses. Clients get a code, a safe
 * message, retryability and the correlation id — never internals.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: unknown, req, reply) => {
    const correlationId = req.correlationId;

    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_FAILURE',
          message: 'Invalid request',
          retryable: false,
          correlationId,
          issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
      });
    }

    if (AppFailure.is(error)) {
      if (error.httpStatus >= 500)
        req.log.error(
          { err: error.cause ?? error, code: error.code, details: error.details },
          'request failed',
        );
      else req.log.info({ code: error.code }, 'request rejected');
      return reply.status(error.httpStatus).send({ error: { ...error.toPublic(), correlationId } });
    }

    const fastifyError = error as { statusCode?: number; code?: string; message?: string };
    if (fastifyError.statusCode === 429) {
      return reply.status(429).send({
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests',
          retryable: true,
          correlationId,
        },
      });
    }
    if (fastifyError.statusCode === 413) {
      return reply.status(413).send({
        error: {
          code: 'VALIDATION_FAILURE',
          message: 'Payload too large',
          retryable: false,
          correlationId,
        },
      });
    }
    if (
      fastifyError.statusCode &&
      fastifyError.statusCode >= 400 &&
      fastifyError.statusCode < 500
    ) {
      return reply.status(fastifyError.statusCode).send({
        error: {
          code: 'VALIDATION_FAILURE',
          message: 'Bad request',
          retryable: false,
          correlationId,
        },
      });
    }

    req.log.error({ err: error }, 'unhandled error');
    return reply.status(500).send({
      error: { code: 'INTERNAL', message: 'Internal error', retryable: false, correlationId },
    });
  });

  app.setNotFoundHandler((req, reply) => {
    void reply.status(404).send({
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found',
        retryable: false,
        correlationId: req.correlationId,
      },
    });
  });
}
