import type { Db } from '../../db/client.js';
import { auditEvents } from '../../db/schema.js';

export interface AuditEntry {
  actorUserId: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  correlationId?: string;
  ip?: string;
  metadata?: Record<string, unknown>;
}

/** Append-only audit trail for security-relevant and admin actions. */
export class AuditService {
  constructor(private readonly db: Db) {}
  async log(entry: AuditEntry): Promise<void> {
    await this.db.insert(auditEvents).values({
      actorUserId: entry.actorUserId,
      action: entry.action,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      correlationId: entry.correlationId ?? null,
      ip: entry.ip ?? null,
      metadata: entry.metadata ?? null,
    });
  }
}
