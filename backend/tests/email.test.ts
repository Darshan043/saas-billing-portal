import { describe, expect, it, vi, beforeEach } from 'vitest';
import type PgBoss from 'pg-boss';
import type { Transporter } from 'nodemailer';
import { EmailStatus, type EmailLog } from '@prisma/client';
import { EmailService } from '../src/services/email/emailService';
import { paymentSucceededTemplate } from '../src/services/email/templates/paymentSucceeded';
import { invoiceNotificationTemplate } from '../src/services/email/templates/invoiceNotification';
import { subscriptionActivatedTemplate } from '../src/services/email/templates/subscriptionActivated';
import { subscriptionPlanChangedTemplate } from '../src/services/email/templates/subscriptionPlanChanged';
import { subscriptionCanceledTemplate } from '../src/services/email/templates/subscriptionCanceled';
import { handleSendEmailJob } from '../src/jobs/handlers/email';
import { prisma } from '../src/lib/prisma';
import type { EmailJobData } from '../src/jobs/queues';

describe('Email Service & Brevo SMTP Integration', () => {
  let emailService: EmailService;

  beforeEach(() => {
    emailService = new EmailService();
  });

  it('generates payment successful confirmation template accurately', () => {
    const result = paymentSucceededTemplate({
      recipient: 'billing@example.com',
      organizationName: 'Acme Corp',
      amount: 4900,
      currency: 'USD',
      paymentId: 'pay_test_123',
      invoiceNumber: 42,
      paymentMethodLabel: 'Visa ending in 4242',
      paidAt: new Date('2026-01-15T12:00:00Z'),
    });

    expect(result.subject).toContain('USD $49.00');
    expect(result.html).toContain('Acme Corp');
    expect(result.html).toContain('INV-000042');
    expect(result.html).toContain('Visa ending in 4242');
    expect(result.html).toContain('pay_test_123');
    expect(result.text).toContain('USD $49.00');
  });

  it('generates invoice notification template accurately', () => {
    const result = invoiceNotificationTemplate({
      recipient: 'billing@example.com',
      organizationName: 'Acme Corp',
      invoiceId: 'inv-uuid',
      invoiceNumber: 1,
      total: 9900,
      currency: 'USD',
      status: 'PAID',
      periodStart: new Date('2026-01-01T00:00:00Z'),
      periodEnd: new Date('2026-02-01T00:00:00Z'),
    });

    expect(result.subject).toContain('INV-000001');
    expect(result.html).toContain('INV-000001');
    expect(result.html).toContain('PAID');
    expect(result.html).toContain('USD $99.00');
    expect(result.text).toContain('INV-000001');
  });

  it('generates subscription activated template accurately', () => {
    const result = subscriptionActivatedTemplate({
      recipient: 'billing@example.com',
      organizationName: 'Acme Corp',
      subscriptionId: 'sub-uuid',
      planName: 'Pro Tier',
      interval: 'MONTH',
      currentPeriodStart: new Date('2026-01-01T00:00:00Z'),
      currentPeriodEnd: new Date('2026-02-01T00:00:00Z'),
    });

    expect(result.subject).toContain('Pro Tier');
    expect(result.html).toContain('Welcome to Pro Tier');
    expect(result.html).toContain('Monthly');
    expect(result.text).toContain('Pro Tier (Monthly)');
  });

  it('generates plan change template for both upgrade and downgrade', () => {
    const upgrade = subscriptionPlanChangedTemplate({
      recipient: 'billing@example.com',
      organizationName: 'Acme Corp',
      subscriptionId: 'sub-uuid',
      kind: 'UPGRADE',
      planName: 'Enterprise',
      interval: 'YEAR',
      chargeAmount: 15000,
      currency: 'USD',
    });
    expect(upgrade.subject).toContain('Upgraded to Enterprise');
    expect(upgrade.html).toContain('Plan Upgrade Confirmation');
    expect(upgrade.html).toContain('USD $150.00');

    const downgrade = subscriptionPlanChangedTemplate({
      recipient: 'billing@example.com',
      organizationName: 'Acme Corp',
      subscriptionId: 'sub-uuid',
      kind: 'DOWNGRADE',
      planName: 'Starter',
      interval: 'MONTH',
      effectiveAt: '2026-03-01T00:00:00Z',
    });
    expect(downgrade.subject).toContain('Downgrade to Starter Scheduled');
    expect(downgrade.html).toContain('Plan Downgrade Scheduled');
  });

  it('generates subscription canceled template for immediate and period-end', () => {
    const periodEnd = subscriptionCanceledTemplate({
      recipient: 'billing@example.com',
      organizationName: 'Acme Corp',
      subscriptionId: 'sub-uuid',
      planName: 'Pro Tier',
      when: 'AT_PERIOD_END',
      effectiveAt: '2026-02-01T00:00:00Z',
    });
    expect(periodEnd.html).toContain('At End of Current Period');
    expect(periodEnd.html).toContain('Feb 1, 2026');

    const immediate = subscriptionCanceledTemplate({
      recipient: 'billing@example.com',
      organizationName: 'Acme Corp',
      subscriptionId: 'sub-uuid',
      planName: 'Pro Tier',
      when: 'IMMEDIATELY',
    });
    expect(immediate.html).toContain('Immediate');
  });

  it('sends email successfully with a mocked transporter', async () => {
    const mockSendMail = vi.fn().mockResolvedValue({ messageId: '<mock-msg-id@billinghub>' });
    const mockTransporter = {
      sendMail: mockSendMail,
      verify: vi.fn().mockResolvedValue(true),
    } as unknown as Transporter;

    emailService.setTransporter(mockTransporter);

    const result = await emailService.sendEmail({
      to: 'customer@test.com',
      subject: 'Test Subject',
      html: '<p>Hello</p>',
      text: 'Hello',
    });

    expect(result.success).toBe(true);
    expect(result.messageId).toBe('<mock-msg-id@billinghub>');
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'customer@test.com',
        subject: 'Test Subject',
      }),
    );
  });

  it('sanitizes and handles SMTP delivery failures without leaking credentials', async () => {
    const sensitiveError = new Error('535 5.7.8 Authentication failed for user brevo@test.com with pass: MySuperSecretKey123!');
    const mockSendMail = vi.fn().mockRejectedValue(sensitiveError);
    const mockTransporter = {
      sendMail: mockSendMail,
      verify: vi.fn().mockRejectedValue(sensitiveError),
    } as unknown as Transporter;

    emailService.setTransporter(mockTransporter);

    const result = await emailService.sendEmail({
      to: 'customer@test.com',
      subject: 'Test Subject',
      html: '<p>Hello</p>',
      text: 'Hello',
    });

    expect(result.success).toBe(false);
    expect(result.error).not.toContain('MySuperSecretKey123!');
    expect(result.error).toContain('[REDACTED]');

    const verifyResult = await emailService.verifyConnection();
    expect(verifyResult.ok).toBe(false);
    expect(verifyResult.error).not.toContain('MySuperSecretKey123!');
    expect(verifyResult.error).toContain('[REDACTED]');
  });

  it('retries background job on failure by throwing an error', async () => {
    // Mock prisma.emailLog.findUnique and update
    const mockFindUnique = vi.spyOn(prisma.emailLog, 'findUnique').mockResolvedValue({
      id: 'mock-log-id',
      organizationId: 'mock-org-id',
      recipient: 'user@example.com',
      template: 'payment_succeeded',
      dedupeKey: 'dedupe-test-retry',
      status: EmailStatus.QUEUED,
      error: null,
      sentAt: null,
      createdAt: new Date(),
    });

    const mockUpdate = vi.spyOn(prisma.emailLog, 'update').mockResolvedValue({} as unknown as EmailLog);

    const failingJobData = {
      id: 'job-1',
      name: 'send-email',
      data: {
        emailLogId: 'mock-log-id',
        to: 'user@example.com',
        subject: 'Failing Email',
        html: '<p>Error</p>',
        text: 'Error',
      },
    };

    // Make EmailService fail by injecting failing transport
    const mockFailingTransporter = {
      sendMail: vi.fn().mockRejectedValue(new Error('SMTP connection timeout')),
      verify: vi.fn(),
    } as unknown as Transporter;

    // Use default emailService for handler
    const { emailService: globalEmailService } = await import('../src/services/email/emailService');
    globalEmailService.setTransporter(mockFailingTransporter);

    // handleSendEmailJob must throw so pg-boss will retry the job
    await expect(
      handleSendEmailJob([failingJobData as unknown as PgBoss.Job<EmailJobData>]),
    ).rejects.toThrow(/Email delivery failed/);

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'mock-log-id' },
        data: expect.objectContaining({
          status: EmailStatus.FAILED,
        }),
      }),
    );

    mockFindUnique.mockRestore();
    mockUpdate.mockRestore();
    globalEmailService.setTransporter(null);
  });

  it('skips duplicate sending if email is already marked as SENT', async () => {
    const mockFindUnique = vi.spyOn(prisma.emailLog, 'findUnique').mockResolvedValue({
      id: 'mock-log-id',
      organizationId: 'mock-org-id',
      recipient: 'user@example.com',
      template: 'payment_succeeded',
      dedupeKey: 'dedupe-already-sent',
      status: EmailStatus.SENT,
      error: null,
      sentAt: new Date(),
      createdAt: new Date(),
    });

    const mockUpdate = vi.spyOn(prisma.emailLog, 'update').mockResolvedValue({} as unknown as EmailLog);

    const jobData = {
      id: 'job-2',
      name: 'send-email',
      data: {
        emailLogId: 'mock-log-id',
        to: 'user@example.com',
        subject: 'Already Sent Email',
        html: '<p>Content</p>',
        text: 'Content',
      },
    };

    const { emailService: globalEmailService } = await import('../src/services/email/emailService');
    const sendMailSpy = vi.fn();
    globalEmailService.setTransporter({ sendMail: sendMailSpy } as unknown as Transporter);

    await handleSendEmailJob([jobData as unknown as PgBoss.Job<EmailJobData>]);

    // Should NOT call sendMail or update since it's already SENT
    expect(sendMailSpy).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();

    mockFindUnique.mockRestore();
    mockUpdate.mockRestore();
    globalEmailService.setTransporter(null);
  });
});
