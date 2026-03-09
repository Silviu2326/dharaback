-- =====================================================
-- MIGRACIÓN COMPLETA: MongoDB → Supabase PostgreSQL
-- DharaTerapeutas Backend
-- =====================================================

-- Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- 1. TABLA: users (Usuarios/Terapeutas)
-- =====================================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255),
    supabase_id VARCHAR(255) UNIQUE,
    auth_provider VARCHAR(20) DEFAULT 'local' CHECK (auth_provider IN ('local', 'google', 'facebook')),
    email_verified BOOLEAN DEFAULT FALSE,
    name VARCHAR(100) NOT NULL,
    avatar TEXT,
    banner TEXT,
    is_verified BOOLEAN DEFAULT FALSE,
    verification_status VARCHAR(20) DEFAULT 'not_submitted' CHECK (verification_status IN ('pending', 'approved', 'rejected', 'not_submitted')),
    role VARCHAR(20) DEFAULT 'therapist' CHECK (role IN ('therapist', 'admin')),
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMPTZ,
    reset_password_token VARCHAR(255),
    reset_password_expire TIMESTAMPTZ,
    email_verification_token VARCHAR(255),
    email_verification_expire TIMESTAMPTZ,
    preferences JSONB DEFAULT '{
        "language": "es",
        "timezone": "Europe/Madrid",
        "notifications": {"email": true, "push": true, "sms": false},
        "privacy": {"showProfile": true, "allowMessages": true}
    }'::jsonb,
    stripe_customer_id VARCHAR(255),
    stripe_subscription_id VARCHAR(255),
    subscription_status VARCHAR(20) DEFAULT 'none' CHECK (subscription_status IN ('none', 'trial', 'active', 'past_due', 'canceled', 'unpaid')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_supabase_id ON users(supabase_id);
CREATE INDEX idx_users_verification_status ON users(verification_status);
CREATE INDEX idx_users_created_at ON users(created_at DESC);

-- =====================================================
-- 2. TABLA: clients (Pacientes/Clientes)
-- =====================================================
CREATE TABLE IF NOT EXISTS clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    avatar TEXT,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'demo')),
    age INTEGER CHECK (age >= 16 AND age <= 120),
    address VARCHAR(200),
    emergency_contact JSONB,
    notes TEXT,
    tags TEXT[],
    therapist_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_session TIMESTAMPTZ,
    sessions_count INTEGER DEFAULT 0 CHECK (sessions_count >= 0),
    rating DECIMAL(2,1) CHECK (rating >= 1 AND rating <= 5),
    payments_count INTEGER DEFAULT 0 CHECK (payments_count >= 0),
    documents_count INTEGER DEFAULT 0 CHECK (documents_count >= 0),
    messages_count INTEGER DEFAULT 0 CHECK (messages_count >= 0),
    preferences JSONB DEFAULT '{
        "preferredTime": "any",
        "preferredLocation": "both",
        "reminderEnabled": true,
        "reminderTime": 24
    }'::jsonb,
    gdpr_consent JSONB NOT NULL DEFAULT '{"given": false, "date": null, "ipAddress": null}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(email, therapist_id)
);

CREATE INDEX idx_clients_therapist_id ON clients(therapist_id);
CREATE INDEX idx_clients_therapist_status ON clients(therapist_id, status);
CREATE INDEX idx_clients_email ON clients(email);
CREATE INDEX idx_clients_tags ON clients USING GIN(tags);

-- =====================================================
-- 3. TABLA: bookings (Citas/Reservas)
-- =====================================================
CREATE TABLE IF NOT EXISTS bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    therapist_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    therapy_type VARCHAR(100) NOT NULL,
    therapy_duration INTEGER DEFAULT 60 CHECK (therapy_duration >= 15 AND therapy_duration <= 240),
    status VARCHAR(20) DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'pending', 'completed', 'cancelled', 'no_show', 'client_arrived')),
    amount DECIMAL(10,2) NOT NULL CHECK (amount >= 0),
    currency VARCHAR(3) DEFAULT 'EUR' CHECK (currency IN ('EUR', 'USD', 'GBP')),
    payment_status VARCHAR(20) DEFAULT 'unpaid' CHECK (payment_status IN ('paid', 'unpaid', 'refunded', 'partial')),
    payment_method VARCHAR(20) CHECK (payment_method IN ('card', 'transfer', 'cash', 'online', 'other')),
    location VARCHAR(255) NOT NULL,
    notes TEXT,
    meeting_link TEXT,
    session_document TEXT,
    plan_id UUID,
    reminder_sent BOOLEAN DEFAULT FALSE,
    cancellation_reason VARCHAR(500),
    cancelled_by VARCHAR(20) CHECK (cancelled_by IN ('client', 'therapist', 'system')),
    cancelled_at TIMESTAMPTZ,
    last_status_change TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_bookings_therapist_date ON bookings(therapist_id, date);
CREATE INDEX idx_bookings_client_status ON bookings(client_id, status);
CREATE INDEX idx_bookings_therapist_status ON bookings(therapist_id, status);
CREATE INDEX idx_bookings_date_time ON bookings(date, start_time);
CREATE INDEX idx_bookings_status_date ON bookings(status, date);

-- =====================================================
-- 4. TABLA: professional_profiles (Perfiles Profesionales)
-- =====================================================
CREATE TABLE IF NOT EXISTS professional_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    about TEXT CHECK (LENGTH(about) <= 2000),
    therapies TEXT[],
    is_available BOOLEAN DEFAULT TRUE,
    video_presentation JSONB,
    stats JSONB DEFAULT '{
        "totalSessions": 0,
        "activeClients": 0,
        "averageRating": 0,
        "totalClients": 0,
        "responseTime": 24,
        "completionRate": 0,
        "satisfactionRate": 0
    }'::jsonb,
    specializations JSONB[],
    languages JSONB[],
    education JSONB[],
    experience JSONB[],
    rates JSONB DEFAULT '{}'::jsonb,
    work_locations JSONB[],
    social_media JSONB,
    external_links JSONB[],
    pricing_packages JSONB,
    preferences JSONB DEFAULT '{}'::jsonb,
    legal_info JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_profiles_user_id ON professional_profiles(user_id);
CREATE INDEX idx_profiles_therapies ON professional_profiles USING GIN(therapies);
CREATE INDEX idx_profiles_available ON professional_profiles(is_available);

-- =====================================================
-- 5. TABLA: session_notes (Notas de Sesiones)
-- =====================================================
CREATE TABLE IF NOT EXISTS session_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE UNIQUE,
    therapist_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    notes TEXT NOT NULL CHECK (LENGTH(notes) >= 10 AND LENGTH(notes) <= 5000),
    objectives TEXT[],
    homework TEXT[],
    next_steps TEXT CHECK (LENGTH(next_steps) <= 2000),
    mood VARCHAR(20) NOT NULL CHECK (mood IN ('very_poor', 'poor', 'fair', 'good', 'excellent')),
    progress VARCHAR(20) NOT NULL CHECK (progress IN ('no_progress', 'minimal', 'moderate', 'significant', 'excellent')),
    is_confidential BOOLEAN DEFAULT TRUE,
    session_type VARCHAR(20) DEFAULT 'follow_up' CHECK (session_type IN ('initial', 'follow_up', 'crisis', 'final', 'group', 'family')),
    treatment_plan JSONB,
    risk_assessment JSONB DEFAULT '{"level": "none", "flagged": false, "notes": null}'::jsonb,
    clinical_measures JSONB,
    session_duration INTEGER CHECK (session_duration >= 15 AND session_duration <= 240),
    tags TEXT[],
    last_edited_by UUID REFERENCES users(id),
    edit_history JSONB[],
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_session_notes_booking ON session_notes(booking_id);
CREATE INDEX idx_session_notes_therapist_client ON session_notes(therapist_id, client_id);
CREATE INDEX idx_session_notes_therapist_created ON session_notes(therapist_id, created_at DESC);
CREATE INDEX idx_session_notes_client_created ON session_notes(client_id, created_at DESC);
CREATE INDEX idx_session_notes_mood_progress ON session_notes(mood, progress);
CREATE INDEX idx_session_notes_risk_flagged ON session_notes((risk_assessment->>'flagged'));
CREATE INDEX idx_session_notes_tags ON session_notes USING GIN(tags);

-- =====================================================
-- 6. TABLA: documents (Documentos)
-- =====================================================
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
    filename VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    size INTEGER NOT NULL CHECK (size > 0),
    path TEXT NOT NULL,
    supabase_url TEXT,
    is_public BOOLEAN DEFAULT FALSE,
    category VARCHAR(50) DEFAULT 'general' CHECK (category IN ('general', 'contract', 'report', 'prescription', 'invoice', 'other')),
    description TEXT,
    metadata JSONB,
    access_log JSONB[],
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_documents_user ON documents(user_id);
CREATE INDEX idx_documents_client ON documents(client_id);
CREATE INDEX idx_documents_category ON documents(category);
CREATE INDEX idx_documents_supabase_url ON documents(supabase_url);

-- =====================================================
-- 7. TABLA: notes (Notas Generales)
-- =====================================================
CREATE TABLE IF NOT EXISTS notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    content TEXT NOT NULL,
    category VARCHAR(50) DEFAULT 'general' CHECK (category IN ('general', 'clinical', 'administrative', 'personal')),
    is_pinned BOOLEAN DEFAULT FALSE,
    color VARCHAR(20),
    tags TEXT[],
    reminders JSONB[],
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notes_user ON notes(user_id);
CREATE INDEX idx_notes_client ON notes(client_id);
CREATE INDEX idx_notes_pinned ON notes(user_id, is_pinned);

-- =====================================================
-- 8. TABLA: verification_documents (Documentos de Verificación)
-- =====================================================
CREATE TABLE IF NOT EXISTS verification_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL CHECK (type IN ('degree', 'license', 'certification', 'insurance', 'id', 'other')),
    document_number VARCHAR(200),
    issuing_body VARCHAR(200),
    issue_date DATE,
    expiry_date DATE,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    file_url TEXT,
    notes TEXT,
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_verification_docs_user ON verification_documents(user_id);
CREATE INDEX idx_verification_docs_status ON verification_documents(status);

-- =====================================================
-- 9. TABLA: conversations (Conversaciones)
-- =====================================================
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE UNIQUE,
    therapist_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'archived', 'blocked')),
    last_message_at TIMESTAMPTZ,
    unread_count INTEGER DEFAULT 0,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_conversations_client ON conversations(client_id);
CREATE INDEX idx_conversations_therapist ON conversations(therapist_id);
CREATE INDEX idx_conversations_last_message ON conversations(last_message_at DESC);

-- =====================================================
-- 10. TABLA: messages (Mensajes)
-- =====================================================
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sender_type VARCHAR(20) NOT NULL CHECK (sender_type IN ('therapist', 'client', 'system')),
    content TEXT NOT NULL,
    type VARCHAR(20) DEFAULT 'text' CHECK (type IN ('text', 'image', 'file', 'audio', 'system')),
    attachments JSONB[],
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_conversation_created ON messages(conversation_id, created_at DESC);
CREATE INDEX idx_messages_sender ON messages(sender_id);

-- =====================================================
-- 11. TABLA: notifications (Notificaciones)
-- =====================================================
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    data JSONB,
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    action_url TEXT,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_user_read ON notifications(user_id, is_read);
CREATE INDEX idx_notifications_created ON notifications(created_at DESC);

-- =====================================================
-- 12. TABLA: availability_slots (Horarios de Disponibilidad)
-- =====================================================
CREATE TABLE IF NOT EXISTS availability_slots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    therapist_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_available BOOLEAN DEFAULT TRUE,
    location VARCHAR(255),
    location_type VARCHAR(20) DEFAULT 'office' CHECK (location_type IN ('office', 'online', 'both')),
    slot_duration INTEGER DEFAULT 60,
    buffer_time INTEGER DEFAULT 0,
    max_bookings_per_slot INTEGER DEFAULT 1,
    valid_from DATE,
    valid_until DATE,
    exceptions JSONB[],
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_availability_therapist ON availability_slots(therapist_id);
CREATE INDEX idx_availability_day ON availability_slots(therapist_id, day_of_week);

-- =====================================================
-- 13. TABLA: absences (Ausencias/Vacaciones)
-- =====================================================
CREATE TABLE IF NOT EXISTS absences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    therapist_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('vacation', 'sick', 'personal', 'other')),
    reason TEXT,
    is_recurring BOOLEAN DEFAULT FALSE,
    recurrence_pattern JSONB,
    status VARCHAR(20) DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CHECK (end_date >= start_date)
);

CREATE INDEX idx_absences_therapist ON absences(therapist_id);
CREATE INDEX idx_absences_dates ON absences(start_date, end_date);

-- =====================================================
-- 14. TABLA: work_locations (Lugares de Trabajo)
-- =====================================================
CREATE TABLE IF NOT EXISTS work_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    therapist_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    address VARCHAR(255) NOT NULL,
    city VARCHAR(100) NOT NULL,
    postal_code VARCHAR(20) NOT NULL,
    country VARCHAR(100) DEFAULT 'Spain',
    phone VARCHAR(20),
    email VARCHAR(255),
    is_primary BOOLEAN DEFAULT FALSE,
    offers_online BOOLEAN DEFAULT FALSE,
    coordinates JSONB,
    accessibility_info JSONB,
    parking_info JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_work_locations_therapist ON work_locations(therapist_id);

-- =====================================================
-- 15. TABLA: notification_settings (Configuración de Notificaciones)
-- =====================================================
CREATE TABLE IF NOT EXISTS notification_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    email_enabled BOOLEAN DEFAULT TRUE,
    push_enabled BOOLEAN DEFAULT TRUE,
    sms_enabled BOOLEAN DEFAULT FALSE,
    whatsapp_enabled BOOLEAN DEFAULT FALSE,
    booking_confirmations BOOLEAN DEFAULT TRUE,
    booking_reminders BOOLEAN DEFAULT TRUE,
    booking_cancellations BOOLEAN DEFAULT TRUE,
    new_messages BOOLEAN DEFAULT TRUE,
    payment_notifications BOOLEAN DEFAULT TRUE,
    marketing_emails BOOLEAN DEFAULT FALSE,
    reminder_time INTEGER DEFAULT 24,
    quiet_hours JSONB,
    custom_preferences JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notification_settings_user ON notification_settings(user_id);

-- =====================================================
-- 16. TABLA: rates (Tarifas - Legacy)
-- =====================================================
CREATE TABLE IF NOT EXISTS rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    therapist_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    session_price DECIMAL(10,2) DEFAULT 60,
    follow_up_price DECIMAL(10,2) DEFAULT 50,
    package_price DECIMAL(10,2) DEFAULT 200,
    couple_session_price DECIMAL(10,2) DEFAULT 80,
    currency VARCHAR(3) DEFAULT 'EUR',
    custom_rates JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rates_therapist ON rates(therapist_id);

-- =====================================================
-- 17. TABLA: integrations (Integraciones API)
-- =====================================================
CREATE TABLE IF NOT EXISTS integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL CHECK (provider IN ('google_calendar', 'outlook', 'zoom', 'meet', 'stripe', 'twilio', 'sendgrid')),
    name VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    credentials JSONB,
    settings JSONB,
    last_sync_at TIMESTAMPTZ,
    last_sync_status VARCHAR(20),
    last_sync_error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, provider)
);

CREATE INDEX idx_integrations_user ON integrations(user_id);

-- =====================================================
-- 18. TABLA: payments (Pagos)
-- =====================================================
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    therapist_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount DECIMAL(10,2) NOT NULL CHECK (amount >= 0),
    currency VARCHAR(3) DEFAULT 'EUR',
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded', 'partial_refund')),
    method VARCHAR(20) CHECK (method IN ('card', 'transfer', 'cash', 'online', 'other')),
    stripe_payment_intent_id VARCHAR(255),
    stripe_charge_id VARCHAR(255),
    description TEXT,
    metadata JSONB,
    refunded_amount DECIMAL(10,2) DEFAULT 0,
    refund_reason TEXT,
    net_amount DECIMAL(10,2),
    platform_fee DECIMAL(10,2) DEFAULT 0,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payments_booking ON payments(booking_id);
CREATE INDEX idx_payments_client ON payments(client_id);
CREATE INDEX idx_payments_therapist ON payments(therapist_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_stripe_intent ON payments(stripe_payment_intent_id);

-- =====================================================
-- 19. TABLA: subscriptions (Suscripciones)
-- =====================================================
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    therapist_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    stripe_subscription_id VARCHAR(255) UNIQUE,
    stripe_customer_id VARCHAR(255),
    plan_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'past_due', 'unpaid', 'trialing')),
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    canceled_at TIMESTAMPTZ,
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'EUR',
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_therapist ON subscriptions(therapist_id);
CREATE INDEX idx_subscriptions_stripe ON subscriptions(stripe_subscription_id);

-- =====================================================
-- 20. TABLA: pricing_packages (Paquetes de Precios)
-- =====================================================
CREATE TABLE IF NOT EXISTS pricing_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    therapist_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    sessions INTEGER NOT NULL CHECK (sessions >= 1),
    session_type VARCHAR(20) NOT NULL CHECK (session_type IN ('individual', 'couple', 'group', 'consultation', 'followup', 'online')),
    price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
    original_price DECIMAL(10,2),
    validity_days INTEGER DEFAULT 90,
    is_active BOOLEAN DEFAULT TRUE,
    features TEXT[],
    terms TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pricing_packages_therapist ON pricing_packages(therapist_id);

-- =====================================================
-- 21. TABLA: plan_assignments (Asignaciones de Planes)
-- =====================================================
CREATE TABLE IF NOT EXISTS plan_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    therapist_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES pricing_packages(id) ON DELETE CASCADE,
    total_sessions INTEGER NOT NULL,
    used_sessions INTEGER DEFAULT 0 CHECK (used_sessions <= total_sessions),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled', 'expired')),
    start_date DATE NOT NULL,
    end_date DATE,
    payment_id UUID REFERENCES payments(id),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_plan_assignments_client ON plan_assignments(client_id);
CREATE INDEX idx_plan_assignments_therapist ON plan_assignments(therapist_id);
CREATE INDEX idx_plan_assignments_status ON plan_assignments(status);

-- =====================================================
-- 22. TABLA: payout_requests (Solicitudes de Pago)
-- =====================================================
CREATE TABLE IF NOT EXISTS payout_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    therapist_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) DEFAULT 'EUR',
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'rejected')),
    method VARCHAR(20) NOT NULL CHECK (method IN ('bank_transfer', 'paypal', 'stripe')),
    bank_details JSONB,
    processed_at TIMESTAMPTZ,
    processed_by UUID REFERENCES users(id),
    notes TEXT,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payout_requests_therapist ON payout_requests(therapist_id);
CREATE INDEX idx_payout_requests_status ON payout_requests(status);

-- =====================================================
-- 23. TABLA: therapy_plans (Planes de Terapia)
-- =====================================================
CREATE TABLE IF NOT EXISTS therapy_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    therapist_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    type VARCHAR(50) NOT NULL,
    duration_weeks INTEGER,
    estimated_sessions INTEGER,
    objectives TEXT[],
    interventions TEXT[],
    assessments JSONB[],
    resources JSONB[],
    is_template BOOLEAN DEFAULT FALSE,
    template_category VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_therapy_plans_therapist ON therapy_plans(therapist_id);
CREATE INDEX idx_therapy_plans_template ON therapy_plans(is_template, template_category);

-- =====================================================
-- 24. TABLA: client_plan_progress (Progreso del Cliente)
-- =====================================================
CREATE TABLE IF NOT EXISTS client_plan_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    therapist_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES therapy_plans(id) ON DELETE CASCADE,
    start_date DATE NOT NULL,
    expected_end_date DATE,
    actual_end_date DATE,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled', 'on_hold')),
    progress_percentage INTEGER DEFAULT 0 CHECK (progress_percentage >= 0 AND progress_percentage <= 100),
    objectives_progress JSONB[],
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(client_id, plan_id)
);

CREATE INDEX idx_client_plan_progress_client ON client_plan_progress(client_id);
CREATE INDEX idx_client_plan_progress_therapist ON client_plan_progress(therapist_id);

-- =====================================================
-- 25. TABLA: credentials (Credenciales)
-- =====================================================
CREATE TABLE IF NOT EXISTS credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL CHECK (type IN ('api_key', 'oauth_token', 'password', 'certificate')),
    name VARCHAR(100) NOT NULL,
    value TEXT NOT NULL,
    is_encrypted BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_credentials_user ON credentials(user_id);

-- =====================================================
-- 26. TABLA: reviews (Reseñas)
-- =====================================================
CREATE TABLE IF NOT EXISTS reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    therapist_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    title VARCHAR(200),
    comment TEXT,
    is_verified BOOLEAN DEFAULT FALSE,
    is_public BOOLEAN DEFAULT TRUE,
    therapist_response TEXT,
    responded_at TIMESTAMPTZ,
    helpful_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(client_id, booking_id)
);

CREATE INDEX idx_reviews_therapist ON reviews(therapist_id);
CREATE INDEX idx_reviews_client ON reviews(client_id);
CREATE INDEX idx_reviews_rating ON reviews(therapist_id, rating);
CREATE INDEX idx_reviews_created ON reviews(created_at DESC);

-- =====================================================
-- 27. TABLA: favorites (Favoritos)
-- =====================================================
CREATE TABLE IF NOT EXISTS favorites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, client_id)
);

CREATE INDEX idx_favorites_user ON favorites(user_id);
CREATE INDEX idx_favorites_client ON favorites(client_id);

-- =====================================================
-- 28. TABLA: coupons (Cupones)
-- =====================================================
CREATE TABLE IF NOT EXISTS coupons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    therapist_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    description TEXT,
    discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
    discount_value DECIMAL(10,2) NOT NULL CHECK (discount_value >= 0),
    min_amount DECIMAL(10,2) DEFAULT 0,
    max_uses INTEGER,
    used_count INTEGER DEFAULT 0,
    valid_from DATE,
    valid_until DATE,
    is_active BOOLEAN DEFAULT TRUE,
    applicable_services TEXT[],
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(therapist_id, code)
);

CREATE INDEX idx_coupons_therapist ON coupons(therapist_id);
CREATE INDEX idx_coupons_code ON coupons(code);

-- =====================================================
-- 29. TABLA: audit_logs (Logs de Auditoría)
-- =====================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);

-- =====================================================
-- 30. TABLA: webhooks (Webhooks)
-- =====================================================
CREATE TABLE IF NOT EXISTS webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    url TEXT NOT NULL,
    secret TEXT,
    events TEXT[] NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    last_triggered_at TIMESTAMPTZ,
    last_response_status INTEGER,
    last_response_body TEXT,
    failure_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_webhooks_user ON webhooks(user_id);

-- =====================================================
-- TRIGGERS PARA updated_at
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Crear triggers para todas las tablas con updated_at
DO $$
DECLARE
    t text;
    trigger_name text;
BEGIN
    FOR t IN 
        SELECT table_name 
        FROM information_schema.columns 
        WHERE column_name = 'updated_at' 
        AND table_schema = 'public'
    LOOP
        trigger_name := 'trg_' || t || '_updated_at';
        -- Eliminar trigger si existe
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', trigger_name, t);
        -- Crear trigger nuevo
        EXECUTE format('
            CREATE TRIGGER %I
            BEFORE UPDATE ON %I
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column()
        ', trigger_name, t);
    END LOOP;
END $$;

-- =====================================================
-- ROW LEVEL SECURITY (RLS) - Políticas Básicas
-- =====================================================

-- Habilitar RLS en todas las tablas
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE professional_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE absences ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE therapy_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_plan_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 31. TABLA: auto_responses (Respuestas Automáticas)
-- =====================================================
CREATE TABLE IF NOT EXISTS auto_responses (
    id SERIAL PRIMARY KEY,
    rating INTEGER NOT NULL UNIQUE,
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO auto_responses (rating, message) VALUES
    (1, 'Lamentamos profundamente que tu experiencia no haya sido la esperada. Nos gustaría entender mejor qué ocurrió para poder mejorar. Por favor, contáctanos directamente para poder atender tu caso personalmente.'),
    (2, 'Gracias por tus comentarios. Sentimos que no hayamos cumplido totalmente con tus expectativas. Tomaremos muy en cuenta tus observaciones para mejorar nuestros servicios en el futuro.'),
    (3, 'Gracias por tu reseña. Nos alegra que hayas compartido tu opinión con nosotros. Siempre buscamos mejorar y tus comentarios son muy valiosos para nuestro crecimiento.'),
    (4, '¡Muchas gracias por tu buena valoración! Nos alegra mucho saber que tuviste una experiencia positiva con nosotros. Esperamos poder atenderte de nuevo pronto.'),
    (5, '¡Muchísimas gracias por tu excelente valoración! Nos hace muy felices saber que estás satisfecho con nuestro servicio. ¡Es un verdadero placer atenderte!')
ON CONFLICT (rating) DO NOTHING;

ALTER TABLE auto_responses ENABLE ROW LEVEL SECURITY;

-- Nota: Las políticas específicas RLS se crearán en un archivo separado
-- para permitir configuración más granular según los requisitos de la app

-- =====================================================
-- VISTAS ÚTILES
-- =====================================================

-- Vista de terapeutas con sus perfiles
CREATE OR REPLACE VIEW therapist_profiles AS
SELECT 
    u.*,
    p.about,
    p.therapies,
    p.is_available,
    p.stats,
    p.specializations,
    p.languages,
    p.education,
    p.experience,
    p.rates,
    p.work_locations
FROM users u
LEFT JOIN professional_profiles p ON u.id = p.user_id
WHERE u.role = 'therapist';

-- Vista de citas con información completa
CREATE OR REPLACE VIEW bookings_full AS
SELECT 
    b.*,
    c.name as client_name,
    c.email as client_email,
    c.phone as client_phone,
    u.name as therapist_name,
    u.email as therapist_email
FROM bookings b
JOIN clients c ON b.client_id = c.id
JOIN users u ON b.therapist_id = u.id;

-- Vista de dashboard stats por terapeuta
CREATE OR REPLACE VIEW therapist_dashboard_stats AS
SELECT 
    u.id as therapist_id,
    u.name as therapist_name,
    COUNT(DISTINCT c.id) as total_clients,
    COUNT(DISTINCT CASE WHEN c.status = 'active' THEN c.id END) as active_clients,
    COUNT(DISTINCT b.id) as total_bookings,
    COUNT(DISTINCT CASE WHEN b.status = 'completed' THEN b.id END) as completed_bookings,
    COUNT(DISTINCT CASE WHEN b.status = 'upcoming' THEN b.id END) as upcoming_bookings,
    COALESCE(SUM(CASE WHEN p.status = 'completed' THEN p.amount END), 0) as total_revenue,
    AVG(r.rating) as average_rating
FROM users u
LEFT JOIN clients c ON u.id = c.therapist_id
LEFT JOIN bookings b ON u.id = b.therapist_id
LEFT JOIN payments p ON b.id = p.booking_id
LEFT JOIN reviews r ON u.id = r.therapist_id
WHERE u.role = 'therapist'
GROUP BY u.id, u.name;

-- =====================================================
-- FIN DEL SCRIPT
-- =====================================================
