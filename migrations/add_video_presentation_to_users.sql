-- Agregar columna video_presentation a la tabla users
-- El video tiene estructura: { url, title, description }

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS video_presentation jsonb NULL;

-- Comentario para documentar la columna
COMMENT ON COLUMN public.users.video_presentation IS 'Video de presentación del terapeuta. Estructura: { url, title, description }';
