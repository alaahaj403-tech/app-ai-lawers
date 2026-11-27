import type { FastifyBaseLogger } from 'fastify';
import { failures } from '@voxeli/domain';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** Business-critical external system → adapter (spec §98). */
export interface EmailProvider {
  readonly id: 'console' | 'resend' | 'capture';
  send(message: EmailMessage, correlationId: string): Promise<void>;
}

/** Development/test: logs the message; never used in production (env validation). */
export class ConsoleEmailProvider implements EmailProvider {
  readonly id = 'console' as const;
  constructor(private readonly log: FastifyBaseLogger) {}
  send(message: EmailMessage, correlationId: string): Promise<void> {
    // The body carries a one-time link; this provider is refused in production.
    this.log.info(
      { to: message.to, subject: message.subject, text: message.text, correlationId },
      'email (console provider)',
    );
    return Promise.resolve();
  }
}

/** Test double that records what would have been sent. */
export class CaptureEmailProvider implements EmailProvider {
  readonly id = 'capture' as const;
  readonly sent: EmailMessage[] = [];
  send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
    return Promise.resolve();
  }
}

/**
 * Resend HTTP API. Verified against the official reference (2026-09-06):
 * POST https://api.resend.com/emails with a Bearer key; 200 → { id }.
 * Uses fetch directly — no SDK dependency for a single endpoint.
 */
export class ResendEmailProvider implements EmailProvider {
  readonly id = 'resend' as const;
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(message: EmailMessage, correlationId: string): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, 10_000);
    try {
      const res = await this.fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          // One email per logical event; a retried request must not double-send.
          'Idempotency-Key': correlationId,
        },
        body: JSON.stringify({
          from: this.from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          ...(message.html ? { html: message.html } : {}),
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        if (res.status === 401) throw failures.internal('Email provider credential rejected');
        if (res.status === 400 || res.status === 422)
          throw failures.validation('Email rejected by provider');
        throw failures.providerUnavailable('Email provider unavailable', {
          details: { status: res.status },
        });
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError')
        throw failures.timeout('Email provider timed out');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}
