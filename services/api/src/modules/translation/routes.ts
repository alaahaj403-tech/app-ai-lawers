import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  paginationQuerySchema,
  translateRequestSchema,
  updateTranslationSchema,
  uuidSchema,
} from '@voxeli/api-contracts';
import type { TranslateResponse } from '@voxeli/api-contracts';
import { failures } from '@voxeli/domain';
import type { TranslationResult } from '@voxeli/domain';
import type { TranslationService } from '@voxeli/translation-core';
import type { QuotaService } from '../usage/quota.js';
import type { TranslationRepository } from './repository.js';
import { currentUser } from '../../plugins/auth.js';

export interface TranslationRoutesDeps {
  translation: TranslationService;
  quota: QuotaService;
  repo: TranslationRepository;
  bindCorrelation: (correlationId: string, userId: string) => void;
}

/**
 * The first vertical slice:
 * text → detect/route → validated structured result → persisted (opt-in) → usage recorded.
 */
export const translationRoutes: FastifyPluginAsync<TranslationRoutesDeps> = async (app, deps) => {
  app.addHook('preHandler', app.requireUser);

  app.post('/translate', async (req): Promise<TranslateResponse> => {
    const body = translateRequestSchema.parse(req.body);
    const user = currentUser(req);

    if (body.idempotencyKey) {
      const existing = await deps.repo.findByIdempotencyKey(user.sub, body.idempotencyKey);
      if (existing) {
        const q = await deps.quota.peek(user.sub, user.plan, 'translations');
        return {
          id: existing.id,
          result: toWire(existing.result),
          routing: {
            slot: existing.slot,
            degraded: existing.degraded,
            latencyMs: existing.latencyMs,
          },
          quota: { dimension: 'translations', used: q.used, limit: q.limit },
        };
      }
    }

    // Reserve quota first; refund if the provider fails so users are not charged for our outages.
    const q = await deps.quota.consume(user.sub, user.plan, 'translations', 1);
    await deps.quota
      .consume(user.sub, user.plan, 'characters', body.text.length)
      .catch(async (e: unknown) => {
        await deps.quota.refund(user.sub, 'translations', 1);
        throw e;
      });

    deps.bindCorrelation(req.correlationId, user.sub);
    let outcome;
    try {
      outcome = await deps.translation.translate(
        {
          text: body.text,
          sourceLanguage: body.sourceLanguage,
          targetLanguage: body.targetLanguage,
          mode: body.mode,
          ...(body.context ? { context: body.context } : {}),
          ...(body.glossary ? { glossary: body.glossary } : {}),
        },
        {
          plan: user.plan,
          quality: user.plan === 'free' ? 'default' : 'high',
          feature: 'translate.text',
        },
        { correlationId: req.correlationId, timeoutMs: 25_000 },
      );
    } catch (e) {
      await deps.quota.refund(user.sub, 'translations', 1);
      await deps.quota.refund(user.sub, 'characters', body.text.length);
      throw e;
    }

    let id: string | null = null;
    if (body.saveToHistory) {
      id = await deps.repo.save({
        userId: user.sub,
        idempotencyKey: body.idempotencyKey,
        sourceLanguage: body.sourceLanguage,
        mode: body.mode,
        sourceText: body.text,
        result: outcome.result,
        degraded: outcome.routing.degraded,
        slot: outcome.routing.slot,
        latencyMs: outcome.routing.latencyMs,
      });
    }

    return {
      id,
      result: toWire(outcome.result),
      routing: {
        slot: outcome.routing.slot,
        degraded: outcome.routing.degraded,
        latencyMs: outcome.routing.latencyMs,
      },
      quota: { dimension: 'translations', used: q.used, limit: q.limit },
    };
  });

  app.get('/translations', async (req) => {
    const query = paginationQuerySchema.parse(req.query);
    return deps.repo.list(currentUser(req).sub, query.limit, query.cursor);
  });

  app.patch('/translations/:id', async (req) => {
    const { id } = z.object({ id: uuidSchema }).parse(req.params);
    const body = updateTranslationSchema.parse(req.body);
    if (body.favorite === undefined) return { ok: true };
    const ok = await deps.repo.setFavorite(currentUser(req).sub, id, body.favorite);
    if (!ok) throw failures.notFound('Translation not found');
    return { ok: true };
  });

  app.delete('/translations/:id', async (req, reply) => {
    const { id } = z.object({ id: uuidSchema }).parse(req.params);
    const ok = await deps.repo.delete(currentUser(req).sub, id);
    if (!ok) throw failures.notFound('Translation not found');
    return reply.status(204).send();
  });

  app.delete('/translations', async (req) => {
    const deleted = await deps.repo.deleteAll(currentUser(req).sub);
    return { deleted };
  });
};

/** Domain results are deeply readonly; the wire schema is plain JSON. */
function toWire(r: TranslationResult): TranslateResponse['result'] {
  return {
    detectedLanguage: r.detectedLanguage,
    targetLanguage: r.targetLanguage,
    translatedText: r.translatedText,
    alternatives: r.alternatives.map((a) => ({
      text: a.text,
      ...(a.note ? { note: a.note } : {}),
    })),
    ambiguities: r.ambiguities.map((a) => ({ span: a.span, explanation: a.explanation })),
    register: r.register,
    ...(r.dialect ? { dialect: r.dialect } : {}),
    notes: [...r.notes],
    integrity: { ...r.integrity, violations: [...r.integrity.violations] },
  };
}
