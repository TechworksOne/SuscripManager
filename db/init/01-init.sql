-- Crear tabla usuarios
CREATE TABLE IF NOT EXISTS usuarios (
  id INT PRIMARY KEY AUTO_INCREMENT,
  email VARCHAR(255) UNIQUE NOT NULL,
  nombre VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Crear tabla servicios
CREATE TABLE IF NOT EXISTS servicios (
  id INT PRIMARY KEY AUTO_INCREMENT,
  usuario_id INT NOT NULL,
  nombre_servicio VARCHAR(255) NOT NULL,
  costo_servicio DECIMAL(10, 2) DEFAULT 0,
  venta_por_cuenta DECIMAL(10, 2) DEFAULT 0,
  activo TINYINT DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  INDEX idx_usuario_id (usuario_id)
);

-- Crear tabla clientes
CREATE TABLE IF NOT EXISTS clientes (
  id INT PRIMARY KEY AUTO_INCREMENT,
  usuario_id INT NOT NULL,
  nombre VARCHAR(255) NOT NULL,
  telefono VARCHAR(20),
  direccion TEXT,
  notas TEXT,
  activo TINYINT DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  INDEX idx_usuario_id (usuario_id)
);

-- Crear tabla cuentas
CREATE TABLE IF NOT EXISTS cuentas (
  id INT PRIMARY KEY AUTO_INCREMENT,
  usuario_id INT NOT NULL,
  servicio_id INT NOT NULL,
  correo VARCHAR(255),
  password_correo VARCHAR(255),
  password_app VARCHAR(255),
  cupo_total INT DEFAULT 0,
  cupo_ocupado INT DEFAULT 0,
  activa TINYINT DEFAULT 1,
  notas TEXT,
  tarjeta_nombre VARCHAR(255),
  tarjeta_last4 VARCHAR(4),
  dia_pago INT,
  proximo_pago DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  FOREIGN KEY (servicio_id) REFERENCES servicios(id) ON DELETE CASCADE,
  INDEX idx_usuario_id (usuario_id),
  INDEX idx_servicio_id (servicio_id)
);

-- Crear tabla suscripciones
CREATE TABLE IF NOT EXISTS suscripciones (
  id INT PRIMARY KEY AUTO_INCREMENT,
  usuario_id INT NOT NULL,
  cliente_id INT NOT NULL,
  cuenta_id INT NOT NULL,
  estado VARCHAR(50) DEFAULT 'ACTIVA',
  estado_cobro VARCHAR(50) DEFAULT 'PENDIENTE',
  precio_mensual DECIMAL(10, 2) DEFAULT 0,
  dia_cobro INT DEFAULT 1,
  proximo_cobro DATE,
  fecha_inicio DATE,
  pin_perfil VARCHAR(10) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
  FOREIGN KEY (cuenta_id) REFERENCES cuentas(id) ON DELETE CASCADE,
  INDEX idx_usuario_id (usuario_id),
  INDEX idx_cliente_id (cliente_id),
  INDEX idx_cuenta_id (cuenta_id),
  INDEX idx_estado (estado)
);

-- Crear tabla cobros
CREATE TABLE IF NOT EXISTS cobros (
  id INT PRIMARY KEY AUTO_INCREMENT,
  usuario_id INT NOT NULL,
  suscripcion_id INT NOT NULL,
  fecha DATETIME NOT NULL DEFAULT NOW(),
  monto DECIMAL(10, 2) NOT NULL,
  metodo VARCHAR(50) DEFAULT 'EFECTIVO',
  meses_pagados INT DEFAULT 1,
  boleta VARCHAR(255),
  nota TEXT,
  periodo_inicio VARCHAR(7),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  FOREIGN KEY (suscripcion_id) REFERENCES suscripciones(id) ON DELETE CASCADE,
  INDEX idx_usuario_id (usuario_id),
  INDEX idx_fecha (fecha)
);
