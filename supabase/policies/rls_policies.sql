-- =====================================================
-- Row Level Security (RLS) Policies para Supabase
-- Estas políticas controlan el acceso a los datos
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
-- POLÍTICAS PARA LA TABLA users
-- =====================================================

-- Los usuarios pueden ver su propio perfil
CREATE POLICY "Users can view own profile" ON users
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- Los usuarios pueden actualizar su propio perfil
CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid());

-- Los administradores pueden ver todos los usuarios
CREATE POLICY "Admins can view all users" ON users
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Los terapeutas verificados pueden ver otros terapeutas (para búsqueda)
CREATE POLICY "Verified therapists can view other therapists" ON users
  FOR SELECT
  TO authenticated
  USING (
    role = 'therapist' AND 
    is_verified = true AND
    is_active = true
  );

-- =====================================================
-- POLÍTICAS PARA LA TABLA clients
-- =====================================================

-- Los terapeutas pueden ver sus propios clientes
CREATE POLICY "Therapists can view own clients" ON clients
  FOR SELECT
  TO authenticated
  USING (therapist_id = auth.uid());

-- Los terapeutas pueden crear clientes
CREATE POLICY "Therapists can create clients" ON clients
  FOR INSERT
  TO authenticated
  WITH CHECK (therapist_id = auth.uid());

-- Los terapeutas pueden actualizar sus propios clientes
CREATE POLICY "Therapists can update own clients" ON clients
  FOR UPDATE
  TO authenticated
  USING (therapist_id = auth.uid());

-- Los terapeutas pueden eliminar sus propios clientes
CREATE POLICY "Therapists can delete own clients" ON clients
  FOR DELETE
  TO authenticated
  USING (therapist_id = auth.uid());

-- =====================================================
-- POLÍTICAS PARA LA TABLA bookings
-- =====================================================

-- Los terapeutas pueden ver sus propias citas
CREATE POLICY "Therapists can view own bookings" ON bookings
  FOR SELECT
  TO authenticated
  USING (therapist_id = auth.uid());

-- Los terapeutas pueden crear citas
CREATE POLICY "Therapists can create bookings" ON bookings
  FOR INSERT
  TO authenticated
  WITH CHECK (therapist_id = auth.uid());

-- Los terapeutas pueden actualizar sus propias citas
CREATE POLICY "Therapists can update own bookings" ON bookings
  FOR UPDATE
  TO authenticated
  USING (therapist_id = auth.uid());

-- Los terapeutas pueden eliminar sus propias citas
CREATE POLICY "Therapists can delete own bookings" ON bookings
  FOR DELETE
  TO authenticated
  USING (therapist_id = auth.uid());

-- =====================================================
-- POLÍTICAS PARA LA TABLA professional_profiles
-- =====================================================

-- Los terapeutas pueden ver su propio perfil profesional
CREATE POLICY "Therapists can view own profile" ON professional_profiles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Los terapeutas pueden crear su perfil profesional
CREATE POLICY "Therapists can create own profile" ON professional_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Los terapeutas pueden actualizar su perfil profesional
CREATE POLICY "Therapists can update own profile" ON professional_profiles
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

-- Los terapeutas verificados pueden ver otros perfiles públicos
CREATE POLICY "Verified therapists can view public profiles" ON professional_profiles
  FOR SELECT
  TO authenticated
  USING (
    is_available = true AND
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() AND is_verified = true
    )
  );

-- =====================================================
-- POLÍTICAS PARA LA TABLA session_notes
-- =====================================================

-- Los terapeutas pueden ver sus propias notas de sesión
CREATE POLICY "Therapists can view own session notes" ON session_notes
  FOR SELECT
  TO authenticated
  USING (therapist_id = auth.uid());

-- Los terapeutas pueden crear notas de sesión
CREATE POLICY "Therapists can create session notes" ON session_notes
  FOR INSERT
  TO authenticated
  WITH CHECK (therapist_id = auth.uid());

-- Los terapeutas pueden actualizar sus propias notas
CREATE POLICY "Therapists can update own session notes" ON session_notes
  FOR UPDATE
  TO authenticated
  USING (therapist_id = auth.uid());

-- Los terapeutas pueden eliminar sus propias notas
CREATE POLICY "Therapists can delete own session notes" ON session_notes
  FOR DELETE
  TO authenticated
  USING (therapist_id = auth.uid());

-- =====================================================
-- POLÍTICAS PARA LA TABLA documents
-- =====================================================

-- Los usuarios pueden ver sus propios documentos
CREATE POLICY "Users can view own documents" ON documents
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Los usuarios pueden subir documentos
CREATE POLICY "Users can upload documents" ON documents
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Los usuarios pueden eliminar sus propios documentos
CREATE POLICY "Users can delete own documents" ON documents
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- =====================================================
-- POLÍTICAS PARA LA TABLA notifications
-- =====================================================

-- Los usuarios pueden ver sus propias notificaciones
CREATE POLICY "Users can view own notifications" ON notifications
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Los usuarios pueden marcar notificaciones como leídas
CREATE POLICY "Users can update own notifications" ON notifications
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

-- Los usuarios pueden eliminar sus propias notificaciones
CREATE POLICY "Users can delete own notifications" ON notifications
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- =====================================================
-- POLÍTICAS PARA LA TABLA payments
-- =====================================================

-- Los terapeutas pueden ver sus propios pagos
CREATE POLICY "Therapists can view own payments" ON payments
  FOR SELECT
  TO authenticated
  USING (therapist_id = auth.uid());

-- =====================================================
-- POLÍTICAS PARA LA TABLA availability_slots
-- =====================================================

-- Los terapeutas pueden gestionar su propia disponibilidad
CREATE POLICY "Therapists can manage own availability" ON availability_slots
  FOR ALL
  TO authenticated
  USING (therapist_id = auth.uid());

-- =====================================================
-- POLÍTICAS PARA LA TABLA work_locations
-- =====================================================

-- Los terapeutas pueden gestionar sus propios lugares de trabajo
CREATE POLICY "Therapists can manage own work locations" ON work_locations
  FOR ALL
  TO authenticated
  USING (therapist_id = auth.uid());

-- =====================================================
-- POLÍTICAS PARA LA TABLA conversations y messages
-- =====================================================

-- Los terapeutas pueden ver sus propias conversaciones
CREATE POLICY "Therapists can view own conversations" ON conversations
  FOR SELECT
  TO authenticated
  USING (therapist_id = auth.uid());

-- Los terapeutas pueden enviar mensajes
CREATE POLICY "Therapists can send messages" ON messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM conversations 
      WHERE id = conversation_id AND therapist_id = auth.uid()
    )
  );

-- =====================================================
-- POLÍTICAS PARA OTRAS TABLAS (simplificadas)
-- =====================================================

-- Rates
CREATE POLICY "Therapists can manage own rates" ON rates
  FOR ALL
  TO authenticated
  USING (therapist_id = auth.uid());

-- Integrations
CREATE POLICY "Therapists can manage own integrations" ON integrations
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid());

-- Subscriptions
CREATE POLICY "Therapists can view own subscription" ON subscriptions
  FOR SELECT
  TO authenticated
  USING (therapist_id = auth.uid());

-- Pricing packages
CREATE POLICY "Therapists can manage own pricing packages" ON pricing_packages
  FOR ALL
  TO authenticated
  USING (therapist_id = auth.uid());

-- Coupons
CREATE POLICY "Therapists can manage own coupons" ON coupons
  FOR ALL
  TO authenticated
  USING (therapist_id = auth.uid());

-- Reviews
CREATE POLICY "Therapists can view reviews about them" ON reviews
  FOR SELECT
  TO authenticated
  USING (therapist_id = auth.uid());

-- Favorites
CREATE POLICY "Therapists can manage own favorites" ON favorites
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid());

-- =====================================================
-- FIN DE POLÍTICAS RLS
-- =====================================================
