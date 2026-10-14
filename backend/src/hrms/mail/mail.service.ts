import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

/**
 * MAIL_TRANSPORT=log writes each email to the application log (development and tests).
 * MAIL_TRANSPORT=none drops them. A real transport (SMTP or an API) plugs in here.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger('Mail');

  constructor(private readonly config: ConfigService) {}

  get transport(): string {
    return this.config.get<string>('MAIL_TRANSPORT') ?? 'log';
  }

  async send(message: MailMessage): Promise<void> {
    if (this.transport === 'none') return;
    if (this.transport !== 'log') throw new Error(`Unknown MAIL_TRANSPORT "${this.transport}"`);
    // A log is not a mailbox: in production only the envelope is written, never the body
    // (an invite body holds a one-time sign-in link).
    const production = this.config.get<string>('NODE_ENV') === 'production';
    this.logger.log(
      `to=${message.to} subject="${message.subject}"${production ? '' : `\n${message.text}`}`,
    );
  }
}
