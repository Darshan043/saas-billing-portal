import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';
import type { SendMailOptions, SendMailResult } from './types';

export class EmailService {
  private transporter: Transporter | null = null;
  private customTransporter: Transporter | null = null;

  constructor() {
    // Lazy initialized on first send or verify
  }

  /**
   * Inject a custom transporter (useful for mocking in unit/integration tests).
   */
  public setTransporter(transporter: Transporter | null): void {
    this.customTransporter = transporter;
  }

  private getTransporter(): Transporter {
    if (this.customTransporter) {
      return this.customTransporter;
    }
    if (!this.transporter) {
      const auth =
        env.SMTP_USER && env.SMTP_PASS
          ? {
              user: env.SMTP_USER,
              pass: env.SMTP_PASS,
            }
          : undefined;

      this.transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port: env.SMTP_PORT,
        secure: env.SMTP_SECURE, // false for 587 (STARTTLS)
        auth,
        connectionTimeout: 10_000, // 10s
        greetingTimeout: 10_000,
        socketTimeout: 15_000, // 15s
      });
    }
    return this.transporter;
  }

  /**
   * Verify SMTP connectivity without logging or exposing credentials.
   */
  public async verifyConnection(): Promise<{ ok: boolean; error?: string }> {
    if (!env.ENABLE_EMAIL_DELIVERY) {
      return { ok: true };
    }
    try {
      const transporter = this.getTransporter();
      await transporter.verify();
      logger.info(
        { host: env.SMTP_HOST, port: env.SMTP_PORT },
        'SMTP connection verified successfully',
      );
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Ensure no passwords or sensitive auth headers appear in logs
      const sanitized = message.replace(/(pass|key|password):\s*[^\s,]+/gi, '$1: [REDACTED]');
      logger.error(
        { host: env.SMTP_HOST, port: env.SMTP_PORT, err: sanitized },
        'SMTP connection verification failed',
      );
      return { ok: false, error: sanitized };
    }
  }

  /**
   * Sends an email via configured transport.
   * Never leaks secrets or throws unhandled errors.
   */
  public async sendEmail(options: SendMailOptions): Promise<SendMailResult> {
    if (!env.ENABLE_EMAIL_DELIVERY) {
      logger.info(
        { recipient: options.to, subject: options.subject },
        'email delivery is disabled via ENABLE_EMAIL_DELIVERY; skipped',
      );
      return { success: true, messageId: 'delivery-disabled' };
    }

    // In non-production, if credentials are empty and not connecting to a local dev SMTP server,
    // log safely and skip rather than crashing
    if (
      env.NODE_ENV !== 'production' &&
      !env.SMTP_USER &&
      !env.SMTP_PASS &&
      env.SMTP_HOST === 'smtp-relay.brevo.com' &&
      !this.customTransporter
    ) {
      logger.info(
        { recipient: options.to, subject: options.subject },
        'development mode without Brevo SMTP credentials; mock send succeeded',
      );
      return { success: true, messageId: 'dev-mock-sent' };
    }

    const fromAddress = env.SMTP_FROM_EMAIL
      ? `"${env.SMTP_FROM_NAME}" <${env.SMTP_FROM_EMAIL}>`
      : `"${env.SMTP_FROM_NAME}" <no-reply@billinghub.local>`;

    try {
      const transporter = this.getTransporter();
      const info = await transporter.sendMail({
        from: fromAddress,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
      });

      logger.info(
        {
          recipient: options.to,
          subject: options.subject,
          messageId: info.messageId,
        },
        'email sent successfully',
      );

      return { success: true, messageId: info.messageId };
    } catch (err) {
      const rawMessage = err instanceof Error ? err.message : String(err);
      const sanitized = rawMessage.replace(/(pass|key|password):\s*[^\s,]+/gi, '$1: [REDACTED]');
      logger.error(
        {
          recipient: options.to,
          subject: options.subject,
          error: sanitized,
        },
        'email delivery failed',
      );

      return { success: false, error: sanitized };
    }
  }
}

export const emailService = new EmailService();

