import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Modal } from './Modal';

function Harness({ onClose = () => {} }: { onClose?: () => void }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button onClick={() => setOpen(true)}>opener</button>
      <Modal
        open={open}
        title="Top up"
        description="Add demo funds"
        closeLabel="Close"
        onClose={() => {
          onClose();
          setOpen(false);
        }}
      >
        <input aria-label="amount" />
        <button>submit</button>
      </Modal>
    </>
  );
}

describe('Modal', () => {
  it('renders an accessible dialog with title and description', () => {
    render(<Harness />);
    const dialog = screen.getByRole('dialog', { name: 'Top up' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription('Add demo funds');
  });

  it('renders nothing when closed', () => {
    render(<Modal open={false} title="x" closeLabel="Close" onClose={() => {}}>child</Modal>);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('focuses the first form control instead of the close button', () => {
    render(<Harness />);
    expect(screen.getByLabelText('amount')).toHaveFocus();
  });

  it('closes on Escape and on the close button', async () => {
    const onClose = vi.fn();
    const { unmount } = render(<Harness onClose={onClose} />);

    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    unmount();
    render(<Harness onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('keeps Tab focus inside the dialog', async () => {
    render(<Harness />);
    const close = screen.getByRole('button', { name: 'Close' });
    const submit = screen.getByRole('button', { name: 'submit' });

    submit.focus();
    await userEvent.tab();
    expect(close).toHaveFocus(); // wrapped to the first control

    await userEvent.tab({ shift: true });
    expect(submit).toHaveFocus(); // and back to the last one
  });

  it('locks page scroll while open and restores it afterwards', async () => {
    const { unmount } = render(<Harness />);
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).not.toBe('hidden');
  });
});
