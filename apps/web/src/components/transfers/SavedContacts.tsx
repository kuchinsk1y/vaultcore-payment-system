import type { Contact } from '@/lib/api';

interface Props {
  contacts: Contact[];
  onSelect: (contact: Contact) => void;
}

export function SavedContacts({ contacts, onSelect }: Props) {
  if (contacts.length === 0) return null;

  return (
    <div className="pt-4 border-t border-[var(--border-subtle)]">
      <label className="block text-[10px] tracking-[0.2em] uppercase text-gray-500 font-medium mb-3">Saved Contacts</label>
      <div className="flex flex-wrap gap-3">
        {contacts.map((contact) => {
          const initial = contact.full_name?.charAt(0) || contact.email?.charAt(0) || '?';
          return (
            <button
              key={contact.contact_id}
              type="button"
              onClick={() => onSelect(contact)}
              className="flex items-center space-x-3 p-3 rounded-md border border-[var(--border-subtle)] hover:border-[#D4AF37]/50 hover:bg-[#D4AF37]/5 transition-all text-left"
            >
              <div className="w-8 h-8 rounded-full bg-[var(--border-subtle)] flex items-center justify-center text-xs font-serif text-[var(--text-main)] uppercase">
                {initial}
              </div>
              <div>
                <p className="text-xs font-medium text-[var(--text-main)]">{contact.full_name || contact.email}</p>
                <p className="text-[10px] text-[var(--text-muted)] font-mono">Tap to auto-fill</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
