-- =============================================================
-- Script: clear_all_data.sql
-- Descripción: Elimina todos los datos de las tablas del schema
--              public, excepto terapias_diccionario.
-- ADVERTENCIA: Esta operación es IRREVERSIBLE. Hacer un backup
--              antes de ejecutar.
-- =============================================================

DO $$
DECLARE
  r RECORD;
  tablas TEXT := '';
BEGIN
  -- Construir la lista de tablas a truncar (excluye terapias_diccionario)
  FOR r IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename != 'terapias_diccionario'
    ORDER BY tablename
  LOOP
    tablas := tablas || quote_ident(r.tablename) || ', ';
  END LOOP;

  -- Quitar la última coma y espacio
  IF tablas != '' THEN
    tablas := LEFT(tablas, LENGTH(tablas) - 2);
    -- Ejecutar el TRUNCATE con CASCADE para manejar las FK
    EXECUTE 'TRUNCATE TABLE ' || tablas || ' RESTART IDENTITY CASCADE';
    RAISE NOTICE 'Tablas truncadas: %', tablas;
  ELSE
    RAISE NOTICE 'No se encontraron tablas para truncar.';
  END IF;
END;
$$;
