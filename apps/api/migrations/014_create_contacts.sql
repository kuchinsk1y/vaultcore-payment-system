-- Contacts: a user's saved counterparties (replaces the one-off migrate_contacts.ts script)
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT contacts_user_id_contact_user_id_unique UNIQUE (user_id, contact_user_id)
);
