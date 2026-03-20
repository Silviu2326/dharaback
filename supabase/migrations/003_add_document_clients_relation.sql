-- Migration: Add support for multiple clients per document
-- Created: 2026-03-20

-- Create junction table for document-client many-to-many relationship
CREATE TABLE IF NOT EXISTS document_clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(document_id, client_id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_document_clients_document ON document_clients(document_id);
CREATE INDEX IF NOT EXISTS idx_document_clients_client ON document_clients(client_id);

-- Comment explaining the migration
COMMENT ON TABLE document_clients IS 'Junction table linking documents to multiple clients';
