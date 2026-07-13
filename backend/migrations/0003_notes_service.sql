-- Repurpose documents -> notes: this service becomes a pure Yjs collab
-- session store, with no ownership or title of its own - helm now owns
-- titles/ownership entirely, and only publishes a note here for the
-- duration it's actively shared (see helm's Note.published/shareToken).

ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_owner_id_fkey;
ALTER TABLE documents DROP COLUMN IF EXISTS owner_id;
ALTER TABLE documents DROP COLUMN IF EXISTS title;
ALTER TABLE documents ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;

DROP TABLE IF EXISTS users;

ALTER TABLE documents RENAME TO notes;
