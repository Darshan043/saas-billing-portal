import { AuditSource, Prisma } from '@prisma/client';

export type AuditSnapshot = {
  status?: string;
  planPriceId?: string;
  planName?: string;
  pendingPlanPriceId?: string | null;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
  pausedAt?: string | null;
  canceledAt?: string | null;
  endedAt?: string | null;
  chargeAmount?: number;
  currency?: string;
  effectiveAt?: string | null;
  reason?: string;
};

export async function recordAudit(
  tx: Prisma.TransactionClient,
  input: {
    subscriptionId?: string | null;
    organizationId?: string | null;
    action: string;
    beforeState?: AuditSnapshot | null;
    afterState?: AuditSnapshot | null;
    source: AuditSource;
    actorUserId?: string | null;
    webhookEventId?: string | null;
  },
): Promise<void> {
  await tx.auditLog.create({
    data: {
      subscriptionId: input.subscriptionId ?? null,
      organizationId: input.organizationId ?? null,
      action: input.action,
      beforeState: (input.beforeState ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      afterState: (input.afterState ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      source: input.source,
      actorUserId: input.actorUserId ?? null,
      webhookEventId: input.webhookEventId ?? null,
    },
  });
}
