-- Añade la columna has_used_trial a la tabla users
-- Permite detectar si un usuario ya disfrutó del período de prueba gratuito,
-- evitando que se pueda abusar creando cuentas nuevas con el mismo email o usuario.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS has_used_trial BOOLEAN NOT NULL DEFAULT FALSE;

-- Marcar como "ya usaron trial" los usuarios que actualmente están en trial o activos
-- (asume que cualquier suscripción previa implica que el trial ya fue consumido)
UPDATE users
SET has_used_trial = TRUE
WHERE subscription_status IN ('trial', 'active', 'past_due', 'canceled', 'unpaid');

-- Índice para acelerar las consultas de verificación
CREATE INDEX IF NOT EXISTS idx_users_has_used_trial ON users (has_used_trial);
