-- ============================================================
-- Migración 02: cuenta_accesos + acceso_id en suscripciones
-- Idempotente: usa IF NOT EXISTS / chequeos de columna
-- ============================================================

-- ── 1. Tabla cuenta_accesos ───────────────────────────────
CREATE TABLE IF NOT EXISTS cuenta_accesos (
  id                INT          PRIMARY KEY AUTO_INCREMENT,
  cuenta_id         INT          NOT NULL,
  suscripcion_id    INT          NULL,
  nombre_acceso     VARCHAR(255) NULL,
  correo_acceso     VARCHAR(255) NULL,
  password_acceso   VARCHAR(255) NULL,
  pin_acceso        VARCHAR(20)  NULL,
  tipo_acceso       VARCHAR(50)  NOT NULL DEFAULT 'perfil',
  estado            VARCHAR(50)  NOT NULL DEFAULT 'DISPONIBLE',
  created_at        TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (cuenta_id)      REFERENCES cuentas(id)       ON DELETE CASCADE,
  FOREIGN KEY (suscripcion_id) REFERENCES suscripciones(id) ON DELETE SET NULL,

  INDEX idx_ca_cuenta_id      (cuenta_id),
  INDEX idx_ca_suscripcion_id (suscripcion_id),
  INDEX idx_ca_estado         (estado)
);

-- ── 2. Columna acceso_id en suscripciones (idempotente) ───
DROP PROCEDURE IF EXISTS _add_col_acceso_id;

DELIMITER $$

CREATE PROCEDURE _add_col_acceso_id()
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   information_schema.COLUMNS
    WHERE  TABLE_SCHEMA = DATABASE()
      AND  TABLE_NAME   = 'suscripciones'
      AND  COLUMN_NAME  = 'acceso_id'
  ) THEN
    ALTER TABLE suscripciones
      ADD COLUMN acceso_id INT NULL AFTER pin_perfil;
  END IF;
END$$

DELIMITER ;

CALL _add_col_acceso_id();
DROP PROCEDURE IF EXISTS _add_col_acceso_id;

-- FK solo si no existe aún (chequeo vía information_schema)
DROP PROCEDURE IF EXISTS _add_fk_suscripciones_acceso;

DELIMITER $$

CREATE PROCEDURE _add_fk_suscripciones_acceso()
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   information_schema.KEY_COLUMN_USAGE
    WHERE  TABLE_SCHEMA         = DATABASE()
      AND  TABLE_NAME           = 'suscripciones'
      AND  COLUMN_NAME          = 'acceso_id'
      AND  REFERENCED_TABLE_NAME IS NOT NULL
  ) THEN
    ALTER TABLE suscripciones
      ADD CONSTRAINT fk_suscripciones_acceso_id
      FOREIGN KEY (acceso_id)
      REFERENCES cuenta_accesos(id)
      ON DELETE SET NULL;
  END IF;
END$$

DELIMITER ;

CALL _add_fk_suscripciones_acceso();
DROP PROCEDURE IF EXISTS _add_fk_suscripciones_acceso;

-- ── 3. Migración de datos: crear accesos para cuentas existentes ──
-- Por cada cuenta existente genera N accesos (uno por cupo_total).
-- Las suscripciones ACTIVA/PAUSADA existentes se asignan en orden.
-- Idem idempotente: solo inserta cuando la cuenta aún no tiene accesos.

DROP PROCEDURE IF EXISTS _migrar_accesos_existentes;

DELIMITER $$

CREATE PROCEDURE _migrar_accesos_existentes()
BEGIN
  DECLARE done        INT     DEFAULT FALSE;
  DECLARE v_cuenta_id INT;
  DECLARE v_cupo      INT;
  DECLARE v_usuario   INT;

  -- Cursor de cuentas que aún no tienen accesos generados
  DECLARE cur CURSOR FOR
    SELECT c.id, COALESCE(c.cupo_total, 1), c.usuario_id
    FROM   cuentas c
    WHERE  NOT EXISTS (
             SELECT 1 FROM cuenta_accesos ca WHERE ca.cuenta_id = c.id
           );

  DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;

  OPEN cur;

  read_loop: LOOP
    FETCH cur INTO v_cuenta_id, v_cupo, v_usuario;
    IF done THEN LEAVE read_loop; END IF;

    BEGIN
      DECLARE i            INT DEFAULT 1;
      DECLARE v_sus_id     INT DEFAULT NULL;
      DECLARE v_pin        VARCHAR(20) DEFAULT NULL;
      DECLARE v_sus_done   INT DEFAULT FALSE;

      -- Cursor de suscripciones activas/pausadas de esta cuenta (para asignar)
      DECLARE cur_sus CURSOR FOR
        SELECT   s.id, s.pin_perfil
        FROM     suscripciones s
        INNER JOIN clientes cl ON cl.id = s.cliente_id AND cl.activo = 1
        WHERE    s.cuenta_id  = v_cuenta_id
          AND    s.estado     IN ('ACTIVA', 'PAUSADA')
        ORDER BY s.id ASC;

      DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_sus_done = TRUE;

      OPEN cur_sus;

      WHILE i <= v_cupo DO
        SET v_sus_id   = NULL;
        SET v_pin      = NULL;
        SET v_sus_done = FALSE;

        -- Intentar consumir la siguiente suscripción disponible
        FETCH cur_sus INTO v_sus_id, v_pin;
        IF v_sus_done THEN
          SET v_sus_id = NULL;
          SET v_pin    = NULL;
        END IF;

        IF v_sus_id IS NOT NULL THEN
          -- Acceso OCUPADO con datos de la suscripción existente
          INSERT INTO cuenta_accesos
            (cuenta_id, suscripcion_id, nombre_acceso, pin_acceso, tipo_acceso, estado)
          VALUES
            (v_cuenta_id, v_sus_id, CONCAT('Perfil ', i), v_pin, 'perfil', 'OCUPADO');

          -- Apuntar acceso_id en la suscripción
          UPDATE suscripciones
          SET    acceso_id = LAST_INSERT_ID()
          WHERE  id        = v_sus_id;

        ELSE
          -- Acceso libre
          INSERT INTO cuenta_accesos
            (cuenta_id, suscripcion_id, nombre_acceso, pin_acceso, tipo_acceso, estado)
          VALUES
            (v_cuenta_id, NULL, CONCAT('Perfil ', i), NULL, 'perfil', 'DISPONIBLE');
        END IF;

        SET i = i + 1;
      END WHILE;

      CLOSE cur_sus;
    END;

  END LOOP;

  CLOSE cur;
END$$

DELIMITER ;

CALL _migrar_accesos_existentes();
DROP PROCEDURE IF EXISTS _migrar_accesos_existentes;
