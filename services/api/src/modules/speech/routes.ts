import type { FastifyPluginAsync } from 'fastify';
import type { AIModelRouter } from '@voxeli/ai-core';
import { speechRequestSchema } from '@voxeli/api-contracts';
import { failures } from '@voxeli/domain';
import { currentUser } from '../../plugins/auth.js';
import type { QuotaService } from '../usage/quota.js';

export interface SpeechRoutesDeps {
  router: AIModelRouter;
  quota: QuotaService;
  bindCorrelation: (correlationId: string, userId: string) => void;
}

/**
 * Server-side speech synthesis (Journey B: hear the translation).
 *
 * Audio is generated per request and returned as bytes; nothing is stored.
 * The response is uncacheable by shared caches because the text is user content.
 */
export const speechRoutes: FastifyPluginAsync<SpeechRoutesDeps> = async (app, deps) => {
  app.addHook('preHandler', app.requireUser);

  app.post('/speech', async (req, reply) => {
    const body = speechRequestSchema.parse(req.body);
    const user = currentUser(req);

    // Audio minutes are the scarce resource; charge a conservative estimate of
    // speech duration (~14 characters per second) and refund if synthesis fails.
    const estimatedMinutes = Math.max(1, Math.ceil(body.text.length / 14 / 60));
    await deps.quota.consume(user.sub, user.plan, 'audio_minutes', estimatedMinutes);

    deps.bindCorrelation(req.correlationId, user.sub);
    let speech;
    try {
      speech = await deps.router.synthesize(
        {
          text: body.text,
          language: body.language,
          ...(body.voice ? { voice: body.voice } : {}),
          format: body.format,
          feature: 'speech.synthesis',
        },
        { correlationId: req.correlationId, timeoutMs: 30_000 },
      );
    } catch (error) {
      await deps.quota.refund(user.sub, 'audio_minutes', estimatedMinutes);
      throw error;
    }

    if (speech.audio.byteLength === 0) throw failures.providerUnavailable('No audio generated');

    return reply
      .header('content-type', speech.mimeType)
      .header('content-length', String(speech.audio.byteLength))
      .header('cache-control', 'private, no-store')
      .send(Buffer.from(speech.audio));
  });
};
