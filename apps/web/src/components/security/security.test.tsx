import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TransferConfirmation } from '@/components/transfers/TransferConfirmation';
import { describeAction } from './AuditLogList';
import { describeDevice } from './SessionsList';

describe('describeDevice', () => {
  it.each([
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36', 'Chrome on Windows'],
    ['Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120.0 Safari/537.36 Edg/120.0', 'Edge on Windows'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15', 'Safari on macOS'],
    ['Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0', 'Firefox on Linux'],
    ['Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36', 'Chrome on Android'],
    [null, 'Unknown device'],
  ])('describes %s', (userAgent, expected) => {
    expect(describeDevice(userAgent)).toBe(expected);
  });
});

describe('describeAction', () => {
  it('uses friendly labels and falls back to the raw action', () => {
    expect(describeAction('auth.login.failed')).toBe('Failed sign-in attempt');
    expect(describeAction('something.new')).toBe('something.new');
  });
});

describe('TransferConfirmation', () => {
  const base = {
    confirmation: {
      status: 'CONFIRMATION_REQUIRED' as const,
      confirmation_id: 'c1',
      method: 'EMAIL_OTP' as const,
      expires_at: '2030-01-01T12:00:00.000Z',
    },
    code: '',
    onCodeChange: () => {},
    onSubmit: (e: React.FormEvent) => e.preventDefault(),
    onCancel: () => {},
    loading: false,
    error: '',
  };

  it('explains where the code comes from for each method', () => {
    const { rerender } = render(<TransferConfirmation {...base} />);
    expect(screen.getByText(/emailed you a 6-digit code/i)).toBeInTheDocument();

    rerender(<TransferConfirmation {...base} confirmation={{ ...base.confirmation, method: 'TOTP' }} />);
    expect(screen.getByText(/authenticator app/i)).toBeInTheDocument();
  });

  it('only enables the confirm button for a full code and keeps digits only', async () => {
    const onCodeChange = vi.fn();
    const { rerender } = render(<TransferConfirmation {...base} onCodeChange={onCodeChange} />);

    const button = screen.getByRole('button', { name: /confirm and send/i });
    expect(button).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/confirmation code/i), '12a3');
    expect(onCodeChange).toHaveBeenLastCalledWith('3'); // controlled input: each keystroke reports its own value

    rerender(<TransferConfirmation {...base} code="123456" />);
    expect(screen.getByRole('button', { name: /confirm and send/i })).toBeEnabled();
  });

  it('shows errors and lets the user cancel', async () => {
    const onCancel = vi.fn();
    render(<TransferConfirmation {...base} error="The confirmation code is invalid or has expired" onCancel={onCancel} />);

    expect(screen.getByRole('alert')).toHaveTextContent(/invalid or has expired/);
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
  });
});
