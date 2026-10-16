import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Contact } from '@/lib/api';
import { SavedContacts } from './SavedContacts';

const contact = (over: Partial<Contact>): Contact => ({
  contact_id: 'c1',
  user_id: 'u1',
  full_name: 'Anna Nowak',
  email: 'anna@example.com',
  phone_number: '+48123123123',
  accounts: [],
  ...over,
});

describe('SavedContacts', () => {
  it('renders nothing without contacts', () => {
    const { container } = render(<SavedContacts contacts={[]} onSelect={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows each contact and reports the selected one', async () => {
    const onSelect = vi.fn();
    const anna = contact({});
    render(<SavedContacts contacts={[anna, contact({ contact_id: 'c2', full_name: '', email: 'bob@example.com' })]} onSelect={onSelect} />);

    expect(screen.getByText('Anna Nowak')).toBeInTheDocument();
    expect(screen.getByText('bob@example.com')).toBeInTheDocument(); // falls back to email

    await userEvent.click(screen.getByRole('button', { name: /Anna Nowak/ }));
    expect(onSelect).toHaveBeenCalledWith(anna);
  });
});
