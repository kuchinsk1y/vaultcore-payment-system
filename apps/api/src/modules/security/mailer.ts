export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

/**
 * Development mailer: prints the message to the server log instead of sending it,
 * so verification links and one-time codes are visible without an SMTP server.
 * Swap it for a real implementation with setMailer() (SMTP, SES, ...).
 */
export class ConsoleMailer implements Mailer {
  constructor(private readonly log: (message: string) => void = console.log) {}

  async send(mail: Mail): Promise<void> {
    this.log(`\n--- EMAIL to ${mail.to} ---\nSubject: ${mail.subject}\n${mail.text}\n--- END EMAIL ---\n`);
  }
}

/** Keeps messages in memory; used by tests to read links and codes. */
export class MemoryMailer implements Mailer {
  readonly sent: Mail[] = [];

  async send(mail: Mail): Promise<void> {
    this.sent.push(mail);
  }

  lastTo(email: string): Mail | undefined {
    return [...this.sent].reverse().find((m) => m.to === email);
  }
}

let mailer: Mailer = new ConsoleMailer();

export const getMailer = (): Mailer => mailer;
export const setMailer = (next: Mailer): void => {
  mailer = next;
};
