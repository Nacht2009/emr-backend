-- Cuentas por cobrar y pagos (abonos). Ejecutar si aún no existen las tablas.
CREATE TABLE IF NOT EXISTS finanzas_cuentas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paciente_id UUID NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
    tratamiento TEXT NOT NULL,
    costo_total NUMERIC(12, 2) NOT NULL,
    saldo_pendiente NUMERIC(12, 2) NOT NULL DEFAULT 0,
    estado VARCHAR(20) NOT NULL DEFAULT 'Pendiente',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finanzas_pagos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cuenta_id UUID NOT NULL REFERENCES finanzas_cuentas(id) ON DELETE CASCADE,
    monto NUMERIC(12, 2) NOT NULL,
    metodo_pago VARCHAR(50) NOT NULL,
    fecha_cobro DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_finanzas_cuentas_paciente ON finanzas_cuentas(paciente_id);
CREATE INDEX IF NOT EXISTS idx_finanzas_pagos_cuenta ON finanzas_pagos(cuenta_id);
