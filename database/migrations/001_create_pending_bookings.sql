-- Execute this SQL in Supabase to create the pending_bookings table

CREATE TABLE IF NOT EXISTS pending_bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    therapist_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    therapy_type VARCHAR(100) NOT NULL,
    therapy_duration INTEGER NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'EUR',
    service_id VARCHAR(100),
    service_name VARCHAR(200),
    stripe_session_id VARCHAR(255),
    payment_intent_id VARCHAR(255),
    status VARCHAR(50) DEFAULT 'awaiting_payment' CHECK (status IN ('awaiting_payment', 'paid', 'expired', 'cancelled')),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    paid_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}'
);

-- Índices
CREATE INDEX idx_pending_bookings_therapist ON pending_bookings(therapist_id);
CREATE INDEX idx_pending_bookings_client ON pending_bookings(client_id);
CREATE INDEX idx_pending_bookings_date ON pending_bookings(date);
CREATE INDEX idx_pending_bookings_session ON pending_bookings(stripe_session_id);
CREATE INDEX idx_pending_bookings_status ON pending_bookings(status);
CREATE INDEX idx_pending_bookings_slot ON pending_bookings(therapist_id, date, start_time) WHERE status = 'awaiting_payment';

-- Trigger para updated_at
CREATE TRIGGER update_pending_bookings_updated_at 
    BEFORE UPDATE ON pending_bookings 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();
