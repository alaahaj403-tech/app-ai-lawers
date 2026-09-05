import { and, eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { AIModelRouter, LiveTranscriptionProvider } from '@voxeli/ai-core';
import type { ModelConfig } from '@voxeli/config';
import type { TranslationService } from '@voxeli/translation-core';
import type { Db } from '../../db/client.js';
import { realtimeSessions } from '../../db/schema.js';
import type { TokenService } from '../auth/tokens.js';
import type { QuotaService } from '../usage/quota.js';
import { RELAY_CLOSE, RelaySession } from './relay.js';
import type { RelaySocket } from './relay.js';

export interface RelayRoutesDeps {
  db: Db;
  router: AIModelRouter;
  translation: TranslationService;
  transcription: LiveTranscriptionProvider;
  quota: QuotaService;
  tokens: TokenService;
  modelConfig: ModelConfig;
}

const querySchema = z.object({ ticket: z.string().min(20).max(2000) });

type MessageListener = (data: Buffer, isBinary: boolean) => void;

interface RawSocket {
  send: (data: string | Uint8Array) => void;
  close: (code?: number, reason?: string) => void;
  on: ((event: 'message', cb: MessageListener) => void) &
    ((event: 'close', cb: () => void) => void);
}

/** Minimal adapter from the `ws` socket to what the relay needs. */
function adapt(socket: RawSocket): RelaySocket {
  return {
    send: (data) => {
      socket.send(data);
    },
    close: (code, reason) => {
      socket.close(code, reason);
    },
    onText: (cb) => {
      socket.on('message', (data, isBinary) => {
        if (!isBinary) cb(data.toString('utf8'));
      });
    },
    onBinary: (cb) => {
      socket.on('message', (data, isBinary) => {
        if (isBinary) cb(new Uint8Array(data));
      });
    },
    onClose: (cb) => {
      socket.on('close', () => {
        cb();
      });
    },
  };
}

/**
 * `GET /v1/realtime/stream` (WebSocket). Authentication uses the short-lived
 * relay ticket issued at session creation, because a browser cannot set
 * headers on a WebSocket handshake. The ticket is bound to one user and one
 * session, and the session row is re-checked for ownership here.
 */
export const relayRoutes: FastifyPluginAsync<RelayRoutesDeps> = async (app, deps) => {
  app.get('/stream', { websocket: true }, (socket, req) => {
    const relaySocket = adapt(socket);

    const reject = (message: string) => {
      relaySocket.send(
        JSON.stringify({
          type: 'error',
          code: 'AUTHENTICATION_FAILURE',
          message,
          retryable: false,
        }),
      );
      relaySocket.close(RELAY_CLOSE.internal, message);
    };

    void (async () => {
      const query = querySchema.safeParse(req.query);
      if (!query.success) {
        reject('Missing relay ticket');
        return;
      }

      let claims;
      try {
        claims = await deps.tokens.verifyRelayTicket(query.data.ticket);
      } catch {
        reject('Invalid or expired relay ticket');
        return;
      }

      const [session] = await deps.db
        .select()
        .from(realtimeSessions)
        .where(and(eq(realtimeSessions.id, claims.sid), eq(realtimeSessions.userId, claims.sub)))
        .limit(1);
      if (!session) {
        reject('Session not found');
        return;
      }
      if (session.endedAt) {
        reject('Session already ended');
        return;
      }
      if (session.tier !== 'tier2_streaming') {
        reject('This session does not use the relay');
        return;
      }

      const relay = new RelaySession(
        relaySocket,
        {
          sessionId: session.id,
          userId: claims.sub,
          plan: claims.plan,
          correlationId: req.correlationId,
          myLanguage: session.myLanguage,
          targetLanguage: session.targetLanguage,
          // Subtitle mode is text-only by design; every other kind speaks.
          speakTranslations: session.kind !== 'live_subtitles',
          transcriptionModel: deps.modelConfig['speech.transcription.live'].model,
        },
        {
          db: deps.db,
          router: deps.router,
          translation: deps.translation,
          transcription: deps.transcription,
          quota: deps.quota,
          log: req.log,
        },
      );
      await relay.run();
    })();
  });
};
