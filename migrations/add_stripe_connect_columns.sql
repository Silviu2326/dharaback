-- Migration: Agregar columnas de Stripe Connect a la tabla users
-- Fecha: 2026-03-22
-- Descripción: Agrega las columnas necesarias para integrar Stripe Connect

-- Agregar columnas para Stripe Connect
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS stripe_connect_account_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS stripe_connect_status VARCHAR(50);

-- Crear índice para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_users_stripe_connect_account_id 
ON users(stripe_connect_account_id) 
WHERE stripe_connect_account_id IS NOT NULL;

-- Comentarios en las columnas para documentación
COMMENT ON COLUMN users.stripe_connect_account_id IS 'ID de la cuenta de Stripe Connect (ac_xxx)';
COMMENT ON COLUMN users.stripe_connect_status IS 'Estado de la cuenta: pending, active, rejected, etc.';
