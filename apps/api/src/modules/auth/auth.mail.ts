import type { Mail } from '../security/mailer';

export const verificationEmail = (to: string, link: string): Mail => ({
  to,
  subject: 'Confirm your email address',
  text: `Welcome to PayCore!\n\nConfirm your email address to enable transfers:\n${link}\n\nIf you did not create an account, you can ignore this message.`,
});

export const passwordResetEmail = (to: string, link: string, ttlMinutes: number): Mail => ({
  to,
  subject: 'Reset your password',
  text: `We received a request to reset your password.\n\nSet a new password (valid for ${ttlMinutes} minutes):\n${link}\n\nIf you did not ask for this, ignore this message: your password has not changed.`,
});

export const transferCodeEmail = (to: string, code: string, ttlMinutes: number): Mail => ({
  to,
  subject: 'Confirm your transfer',
  text: `Your transfer confirmation code is ${code}.\n\nIt is valid for ${ttlMinutes} minutes. Never share this code: PayCore will never ask for it.\n\nIf you did not start a transfer, change your password immediately.`,
});
