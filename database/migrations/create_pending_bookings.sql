-- Tabla pending_bookings para reservas en proceso de pago
-- Esta tabla bloquea temporalmente el slot hasta que se complete el pago

CREATE TABLE IF NOT EXISTS pending_bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    therapist_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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

-- Índices para búsquedas eficientes
CREATE INDEX idx_pending_bookings_therapist ON pending_bookings(therapist_id);
CREATE INDEX idx_pending_bookings_client ON pending_bookings(client_id);
CREATE INDEX idx_pending_bookings_date ON pending_bookings(date);
CREATE INDEX idx_pending_bookings_session ON pending_bookings(stripe_session_id);
CREATE INDEX idx_pending_bookings_status ON pending_bookings(status);
CREATE INDEX idx_pending_bookings_expires ON pending_bookings(expires_at);

-- Índice compuesto para verificar disponibilidad
CREATE INDEX idx_pending_bookings_slot ON pending_bookings(therapist_id, date, start_time) 
    WHERE status = 'awaiting_payment';

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_pending_bookings_updated_at 
    BEFORE UPDATE ON pending_bookings 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Función para limpiar pending bookings expirados automáticamente
CREATE OR REPLACE FUNCTION cleanup_expired_pending_bookings()
RETURNS void AS $$
BEGIN
    DELETE FROM pending_bookings 
    WHERE expires_at < CURRENT_TIMESTAMP 
    AND status = 'awaiting_payment';
    
    RAISE NOTICE 'Limpiados % pending bookings expirados', FOUND;
END;
$$ LANGUAGE plpgsql;

-- Comentarios
COMMENT ON TABLE pending_bookings IS 'Reservas temporales en proceso de pago. Se borran automáticamente tras 30 min si no se paga.';
COMMENT ON COLUMN pending_bookings.status IS 'Estado: awaiting_payment, paid, expired, cancelled';
COMMENT ON COLUMN pending_bookings.expires_at IS 'Fecha de expiración. El slot se libera automáticamente.';
