import type PgBoss from 'pg-boss';
import { EmailStatus } from '@prisma/client';
import { logger } from '../../lib/logger';
import { prisma } from '../../lib/prisma';
import { emailService } from '../../services/email/emailService';
import { isEmailJobData, type EmailJobData } from '../queues';

const emailLogger = logger.child({ service: 'email-worker' });

export const handleSendEmailJob: PgBoss.WorkHandler<EmailJobData> = async (
  jobs,
) => {
  const job = jobs[0];
  if (!job || !isEmailJobData(job.data)) {
    emailLogger.warn('send-email job received with invalid payload');
    return;
  }

  const { emailLogId, to, subject, html, text } = job.data;
  const emailLog = await prisma.emailLog.findUnique({
    where: { id: emailLogId },
  });

  if (!emailLog) {
    emailLogger.warn({ emailLogId }, 'email_log not found for job; aborting');
    return;
  }

  if (emailLog.status === EmailStatus.SENT) {
    emailLogger.info(
      { emailLogId, dedupeKey: emailLog.dedupeKey },
      'email already marked as SENT; skipping duplicate execution',
    );
    return;
  }

  const result = await emailService.sendEmail({ to, subject, html, text });

  if (result.success) {
    await prisma.emailLog.update({
      where: { id: emailLogId },
      data: {
        status: EmailStatus.SENT,
        sentAt: new Date(),
        error: null,
      },
    });
    emailLogger.info(
      {
        emailLogId,
        recipient: to,
        dedupeKey: emailLog.dedupeKey,
        messageId: result.messageId,
      },
      'email job completed successfully',
    );
  } else {
    const errorMsg = (result.error ?? 'Unknown email delivery error').slice(0, 1000);
    await prisma.emailLog.update({
      where: { id: emailLogId },
      data: {
        status: EmailStatus.FAILED,
        error: errorMsg,
      },
    });

    emailLogger.error(
      {
        emailLogId,
        recipient: to,
        dedupeKey: emailLog.dedupeKey,
        error: errorMsg,
      },
      'email delivery failed; job will be retried by pg-boss',
    );

    // Throw error to trigger pg-boss retry with backoff
    throw new Error(`Email delivery failed: ${errorMsg}`);
  }
};

export const handleEmailDeadLetterJob: PgBoss.WorkHandler<EmailJobData> = async (
  jobs,
) => {
  const job = jobs[0];
  if (!job || !isEmailJobData(job.data)) {
    emailLogger.error('dead-letter email job missing data');
    return;
  }

  const { emailLogId, to, subject } = job.data;
  emailLogger.error(
    { emailLogId, recipient: to, subject },
    'email job exhausted maximum retry limit; permanently moved to dead letter',
  );
};
