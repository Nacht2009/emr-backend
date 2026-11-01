-- Ejecutar en pgAdmin sobre la base de datos del EMR

CREATE TABLE IF NOT EXISTS evoluciones_clinicas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consulta_id UUID NOT NULL REFERENCES consultas(id) ON DELETE CASCADE,
  paciente_id UUID NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  fecha_evolucion DATE NOT NULL DEFAULT CURRENT_DATE,
  evolucion_procedimiento TEXT NOT NULL DEFAULT '',
  firma_profesional TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evoluciones_paciente
  ON evoluciones_clinicas(paciente_id);

CREATE INDEX IF NOT EXISTS idx_evoluciones_consulta
  ON evoluciones_clinicas(consulta_id);
