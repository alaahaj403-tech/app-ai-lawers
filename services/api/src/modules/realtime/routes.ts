import { and, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { AIModelRouter } from '@voxeli/ai-core';
import {
  createRealtimeSessionSchema,
  realtimeMetricsReportSchema,
  uuidSchema,
} from '@voxeli/api-contracts';
import type { RealtimeSessionResponse } from '@voxeli/api-contracts';
import { DEFAULT_ENTITLEMENTS, failures } from '@voxeli/domain';
import type { Db } from '../../db/client.js';
import { realtimeSessions } from '../../db/schema.js';
import type { FlagService } from '../flags/service.js';
import type { TokenService } from '../auth/tokens.js';
import type { QuotaService } from '../usage/quota.js';
import { currentUser } from '../../plugins/auth.js';

export interface RealtimeRoutesDeps {
  db: Db;
  router: AIModelRouter;
  quota: QuotaService;
  flags: FlagService;
  tokens: TokenService;
}

const CLIENT_SECRET_TTL_SECONDS = 300;
const RELAY_TICKET_TTL_SECONDS = 60;

/**
 * Realtime bootstrap. Tier selection is server-side and explainable
 * (`degradedReason`).
 *
 * Tier 2 returns a ticket for our own relay: the media path runs through the
 * server, so minutes are metered there rather than trusted from the client.
 * Tier 1 still connects the device straight to the provider for latency, but
 * its ephemeral credential is capped by the account's remaining minutes so an
 * exhausted account cannot keep a session alive.
 */
export const realtimeRoutes: FastifyPluginAsync<RealtimeRoutesDeps> = async (app, deps) => {
  app.addHook('preHandler', app.requireUser);

  app.post('/sessions', async (req, reply) => {
    if (!(await deps.flags.isEnabled('live_translation')))
      throw failures.unsupportedPlatform('Live translation is currently disabled');
    const body = createRealtimeSessionSchema.parse(req.body);
    const user = currentUser(req);

    if (body.kind === 'interpreter_call' && !body.remoteLanguage)
      throw failures.validation('remoteLanguage is required for interpreter calls');
    if (body.recording && !(await deps.flags.isEnabled('call_recording')))
      throw failures.unsupportedPlatform('Recording is currently disabled');

    const q = await deps.quota.peek(user.sub, user.plan, 'realtime_minutes');
    if (q.limit !== null && q.used >= q.limit)
      throw failures.quota('Realtime minutes exhausted', { dimension: 'realtime_minutes' });

    const tier1Allowed = DEFAULT_ENTITLEMENTS[user.plan].features.realtimeTier1;
    const selection = deps.router.selectRealtimeTier({
      plan: user.plan,
      targetLanguage: body.targetLanguage,
      tier1Allowed,
    });

    const [row] = await deps.db
      .insert(realtimeSessions)
      .values({
        userId: user.sub,
        kind: body.kind,
        tier: selection.tier,
        myLanguage: body.myLanguage,
        targetLanguage: body.targetLanguage,
        remoteLanguage: body.remoteLanguage ?? null,
        recording: body.recording,
        degraded: selection.degradedReason !== undefined,
        degradedReason: selection.degradedReason ?? null,
      })
      .returning({ id: realtimeSessions.id });
    if (!row) throw failures.internal('Session insert returned no row');

    let clientSecret: RealtimeSessionResponse['clientSecret'] = null;
    let endpoint: RealtimeSessionResponse['endpoint'] = null;
    let relay: RealtimeSessionResponse['relay'] = null;

    if (selection.tier === 'tier1_s2s') {
      // A device-held credential must not outlive the minutes it can spend.
      const remainingSeconds =
        q.limit === null ? CLIENT_SECRET_TTL_SECONDS : (q.limit - q.used) * 60;
      const secret = await selection.provider.createClientSecret(
        {
          tier: 'tier1_s2s',
          model: selection.ref.model,
          transport: body.transport,
          targetLanguage: body.targetLanguage,
          languageHints:
            body.myLanguage === 'auto'
              ? []
              : [body.myLanguage, ...(body.remoteLanguage ? [body.remoteLanguage] : [])],
          expiresInSeconds: Math.max(10, Math.min(CLIENT_SECRET_TTL_SECONDS, remainingSeconds)),
        },
        { correlationId: req.correlationId, timeoutMs: 10_000 },
      );
      clientSecret = { value: secret.value, expiresAt: secret.expiresAt.toISOString() };
      endpoint = secret.endpoint;
    } else {
      const ticket = await deps.tokens.signRelayTicket(
        { sub: user.sub, sid: row.id, plan: user.plan },
        RELAY_TICKET_TTL_SECONDS,
      );
      relay = {
        path: '/v1/realtime/stream',
        ticket: ticket.ticket,
        expiresAt: ticket.expiresAt.toISOString(),
      };
    }

    const response: RealtimeSessionResponse = {
      sessionId: row.id,
      tier: selection.tier,
      clientSecret,
      endpoint,
      relay,
      degraded: selection.degradedReason !== undefined,
      ...(selection.degradedReason ? { degradedReason: selection.degradedReason } : {}),
      quota: { dimension: 'realtime_minutes', used: q.used, limit: q.limit },
    };
    return reply.status(201).send(response);
  });

  app.post('/sessions/:id/metrics', async (req) => {
    const { id } = z.object({ id: uuidSchema }).parse(req.params);
    const body = realtimeMetricsReportSchema.parse({ ...(req.body as object), sessionId: id });
    const user = currentUser(req);
    const [session] = await deps.db
      .select()
      .from(realtimeSessions)
      .where(and(eq(realtimeSessions.id, id), eq(realtimeSessions.userId, user.sub)))
      .limit(1);
    if (!session) throw failures.notFound('Session not found');
    if (session.endedAt) return { ok: true, alreadyClosed: true };

    const minutes = Math.ceil(body.durationSeconds / 60);
    const { sessionId: _sid, ...metrics } = body;
    await deps.db
      .update(realtimeSessions)
      .set({ metrics, durationSeconds: body.durationSeconds, endedAt: new Date() })
      .where(and(eq(realtimeSessions.id, id), eq(realtimeSessions.userId, user.sub)));
    if (minutes > 0) {
      // Over-limit at close time is recorded (not blocked) — the session already happened.
      await deps.quota
        .consume(user.sub, user.plan, 'realtime_minutes', minutes)
        .catch(() => undefined);
    }
    return { ok: true, alreadyClosed: false };
  });
};
