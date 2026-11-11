// 1. Sacamos las herramientas de sus cajas
const express = require('express');
const cors = require('cors');
require('dotenv').config(); // Le pedimos que lea la caja fuerte (.env)
const pool = require('./db'); // Le entregamos la llave del archivero
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// 2. Contratamos y preparamos al recepcionista
const app = express();

// 3. Reglas de la oficina (Middlewares)
app.use(cors()); // Le damos permiso de recibir papeles de la sala de espera (tu React)
app.use(express.json()); // Le enseñamos a leer los formularios digitales que vengan en formato JSON

function verificarToken(req, res, next) {
    const token = req.header('Authorization');

    if (!token) {
        return res.status(403).json({ error: 'Acceso denegado. Token no proporcionado.' });
    }

    const tokenLimpio = token.startsWith('Bearer ') ? token.slice(7) : token;

    try {
        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
            return res.status(500).json({ error: 'Configuración de autenticación incompleta' });
        }

        req.usuario = jwt.verify(tokenLimpio, jwtSecret);
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Token inválido o expirado' });
    }
}

// 4. Una tarea de prueba rápida
// Cuando alguien se acerque a la ventanilla principal ('/'), él responderá esto:
app.get('/', (req, res) => {
    res.send('El recepcionista del backend está despierto y listo para trabajar.');
});


// === NUEVA VENTANILLA: Para recibir expedientes de pacientes ===
app.post('/api/pacientes', verificarToken, async (req, res) => {
    try {
        const {
            nombre_completo, documento_identidad, edad, sexo, telefono,
            peso, altura, presion_arterial, motivo_consulta, enfermedad_actual
        } = req.body;

        const existente = await pool.query(
            'SELECT id, estado FROM pacientes WHERE documento_identidad = $1',
            [documento_identidad]
        );

        if (existente.rows.length > 0) {
            const pacienteExistente = existente.rows[0];
            const estadoNormalizado = String(pacienteExistente.estado ?? '').trim().toLowerCase();
            const estaInactivo = ['inactivo', 'eliminado', 'inactive', 'deleted', 'borrado'].includes(estadoNormalizado);

            if (!estaInactivo) {
                return res.status(400).json({
                    error: 'Este documento de identidad ya se encuentra registrado y activo en el sistema.'
                });
            }

            // No hay is_active ni deleted_at. Un alta nueva deja estado en su default 'Sano'.
            const pacienteRestaurado = await pool.query(
                `UPDATE pacientes SET
                    nombre_completo = $1,
                    documento_identidad = $2,
                    edad = $3,
                    sexo = $4,
                    telefono = $5,
                    peso = $6,
                    altura = $7,
                    presion_arterial = $8,
                    motivo_consulta = $9,
                    enfermedad_actual = $10,
                    estado = 'Sano'
                WHERE id = $11
                RETURNING *`,
                [
                    nombre_completo, documento_identidad, edad, sexo, telefono,
                    peso, altura, presion_arterial, motivo_consulta, enfermedad_actual,
                    pacienteExistente.id
                ]
            );

            return res.json(pacienteRestaurado.rows[0]);
        }

        const nuevoPaciente = await pool.query(
            `INSERT INTO pacientes (
                nombre_completo, documento_identidad, edad, sexo, telefono,
                peso, altura, presion_arterial, motivo_consulta, enfermedad_actual
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
            [nombre_completo, documento_identidad, edad, sexo, telefono, peso, altura, presion_arterial, motivo_consulta, enfermedad_actual]
        );

        res.json(nuevoPaciente.rows[0]);
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ error: 'Error al guardar el paciente' });
    }
});

// === NUEVA VENTANILLA: Para eliminar expedientes de pacientes ===
app.delete('/api/pacientes/:id', verificarToken, async (req, res) => {
    try {
        // 1. Extraemos el ID único del paciente que viene en la URL
        const { id } = req.params; 

        // 2. Borrado lógico: el expediente permanece para proteger el historial médico
        const query = `UPDATE pacientes SET estado = 'Eliminado' WHERE id = $1 RETURNING *`;
        const result = await pool.query(query, [id]);

        // 3. Verificamos si el paciente realmente existía
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Paciente no encontrado en la bóveda' });
        }

        // 4. Confirmamos el éxito al frontend
        res.json({ mensaje: 'Paciente eliminado exitosamente', paciente: result.rows[0] });
    } catch (error) {
        console.error('Error al intentar eliminar el paciente:', error);
        res.status(500).json({ error: 'Error interno del servidor al conectar con Supabase' });
    }
});

// === NUEVA VENTANILLA: Para entregar la lista completa de pacientes ===
app.get('/api/pacientes', verificarToken, async (req, res) => {
    try {
        // El recepcionista baja al sótano y pide TODOS los registros ordenados por su número
        const todosLosPacientes = await pool.query(
            `SELECT * FROM pacientes
             WHERE estado NOT IN ('Eliminado', 'Inactivo', 'Borrado', 'eliminado', 'inactivo', 'borrado')
             ORDER BY numero_historia ASC`
        );
        
        // Le entrega la lista completa a React en formato JSON
        res.json(todosLosPacientes.rows);
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ error: 'Error al obtener la lista de pacientes' });
    }
});

app.put('/api/pacientes/:id', verificarToken, async (req, res) => {
    try {
        const { id } = req.params;
        const {
            nombre_completo,
            edad,
            telefono,
            peso,
            altura,
            estado,
            documento_identidad,
            sexo,
            presion_arterial,
            motivo_consulta,
            enfermedad_actual
        } = req.body;

        const pacienteActualizado = await pool.query(
            `UPDATE pacientes SET
                nombre_completo = $1,
                edad = $2,
                telefono = $3,
                peso = $4,
                altura = $5,
                estado = $6,
                documento_identidad = $7,
                sexo = COALESCE($8, sexo),
                presion_arterial = COALESCE($9, presion_arterial),
                motivo_consulta = COALESCE($10, motivo_consulta),
                enfermedad_actual = COALESCE($11, enfermedad_actual)
            WHERE id = $12
            RETURNING *`,
            [
                nombre_completo,
                edad,
                telefono,
                peso,
                altura,
                estado,
                documento_identidad,
                sexo ?? null,
                presion_arterial ?? null,
                motivo_consulta ?? null,
                enfermedad_actual ?? null,
                id
            ]
        );

        if (pacienteActualizado.rowCount === 0) {
            return res.status(404).json({ error: 'Paciente no encontrado' });
        }

        res.json(pacienteActualizado.rows[0]);
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ error: 'Error al actualizar el paciente' });
    }
});

// 5. Sentamos al recepcionista en su escritorio (el Puerto 5000)
const PORT = process.env.PORT || 5000;
// === VENTANILLA: Guardar una nueva consulta ===
app.post('/api/consultas', verificarToken, async (req, res) => {
    try {
        const { paciente_id, motivo_consulta, notas_medicas } = req.body;
        const nuevaConsulta = await pool.query(
            'INSERT INTO consultas (paciente_id, motivo_consulta, notas_medicas) VALUES ($1, $2, $3) RETURNING *',
            [paciente_id, motivo_consulta, notas_medicas]
        );
        res.json(nuevaConsulta.rows[0]);
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ error: 'Error al guardar la consulta' });
    }
});

// === VENTANILLA: Leer el historial de consultas de un paciente específico ===
async function obtenerHistorialConsultasPaciente(req, res) {
    try {
        const { paciente_id } = req.params;
        const historial = await pool.query(
            'SELECT * FROM consultas WHERE paciente_id = $1 ORDER BY fecha_consulta DESC',
            [paciente_id]
        );
        res.json(historial.rows);
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ error: 'Error al obtener el historial' });
    }
}

app.get('/api/consultas/paciente/:paciente_id', verificarToken, obtenerHistorialConsultasPaciente);
app.get('/api/consultas/:paciente_id', verificarToken, obtenerHistorialConsultasPaciente);

app.put('/api/consultas/:id', verificarToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { motivo_consulta, notas_medicas } = req.body;

        const consultaActualizada = await pool.query(
            `UPDATE consultas SET
                motivo_consulta = $1,
                notas_medicas = $2
            WHERE id = $3
            RETURNING *`,
            [motivo_consulta, notas_medicas, id]
        );

        if (consultaActualizada.rowCount === 0) {
            return res.status(404).json({ error: 'Consulta no encontrada' });
        }

        res.json(consultaActualizada.rows[0]);
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ error: 'Error al actualizar la consulta' });
    }
});

app.get('/api/evoluciones/consulta/:consulta_id', verificarToken, async (req, res) => {
    try {
        const { consulta_id } = req.params;
        const evolucion = await pool.query(
            `SELECT * FROM evoluciones_clinicas
             WHERE consulta_id = $1
             ORDER BY created_at DESC
             LIMIT 1`,
            [consulta_id]
        );
        res.json(evolucion.rows[0] ?? null);
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ error: 'Error al obtener la evolución de la consulta' });
    }
});

app.put('/api/evoluciones/:id', verificarToken, async (req, res) => {
    try {
        const { id } = req.params;
        const {
            fecha_evolucion,
            evolucion_procedimiento,
            firma_profesional
        } = req.body;

        const evolucionActualizada = await pool.query(
            `UPDATE evoluciones_clinicas SET
                fecha_evolucion = $1,
                evolucion_procedimiento = $2,
                firma_profesional = $3
            WHERE id = $4
            RETURNING *`,
            [
                fecha_evolucion,
                evolucion_procedimiento,
                firma_profesional ?? '',
                id
            ]
        );

        if (evolucionActualizada.rowCount === 0) {
            return res.status(404).json({ error: 'Evolución no encontrada' });
        }

        res.json(evolucionActualizada.rows[0]);
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ error: 'Error al actualizar la evolución clínica' });
    }
});

app.get('/api/evoluciones/paciente/:paciente_id', verificarToken, async (req, res) => {
    try {
        const { paciente_id } = req.params;
        const evoluciones = await pool.query(
            `SELECT e.*
             FROM evoluciones_clinicas e
             WHERE e.paciente_id = $1
             ORDER BY e.fecha_evolucion ASC, e.created_at ASC`,
            [paciente_id]
        );
        res.json(evoluciones.rows);
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ error: 'Error al obtener evoluciones clínicas' });
    }
});

app.post('/api/evoluciones', verificarToken, async (req, res) => {
    try {
        const {
            consulta_id,
            paciente_id,
            fecha_evolucion,
            evolucion_procedimiento,
            firma_profesional
        } = req.body;

        const nuevaEvolucion = await pool.query(
            `INSERT INTO evoluciones_clinicas (
                consulta_id, paciente_id, fecha_evolucion,
                evolucion_procedimiento, firma_profesional
            ) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [
                consulta_id,
                paciente_id,
                fecha_evolucion,
                evolucion_procedimiento,
                firma_profesional ?? ''
            ]
        );

        res.json(nuevaEvolucion.rows[0]);
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ error: 'Error al guardar la evolución clínica' });
    }
});

// === RUTAS DE CITAS ===

// 1. Crear nueva cita (POST)
app.post('/api/citas', verificarToken, async (req, res) => {
    try {
        const { paciente_id, fecha, hora_inicio, hora_fin, tratamiento } = req.body;
        const nuevaCita = await pool.query(
            `INSERT INTO citas (paciente_id, fecha, hora_inicio, hora_fin, tratamiento) 
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [paciente_id, fecha, hora_inicio, hora_fin, tratamiento]
        );
        res.json(nuevaCita.rows[0]);
    } catch (error) {
        console.error("Error al crear cita:", error.message);
        res.status(500).json({ error: 'Error al agendar la cita' });
    }
});

// 2. Leer todas las citas para el calendario (GET)
app.get('/api/citas', verificarToken, async (req, res) => {
    try {
        const todasLasCitas = await pool.query(
            `SELECT c.*, p.nombre_completo, p.documento_identidad 
             FROM citas c 
             JOIN pacientes p ON c.paciente_id = p.id 
             ORDER BY c.fecha ASC, c.hora_inicio ASC`
        );
        res.json(todasLasCitas.rows);
    } catch (error) {
        console.error("Error al obtener citas:", error.message);
        res.status(500).json({ error: 'Error al obtener las citas' });
    }
});

// 3. Cambiar el estado de la cita (PUT) - Para tus botones de Agendado/Completado/Cancelado
app.put('/api/citas/:id/estado', verificarToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { estado } = req.body;
        const citaActualizada = await pool.query(
            `UPDATE citas SET estado = $1 WHERE id = $2 RETURNING *`,
            [estado, id]
        );
        res.json(citaActualizada.rows[0]);
    } catch (error) {
        console.error("Error al actualizar estado:", error.message);
        res.status(500).json({ error: 'Error al actualizar estado' });
    }
});

// === RUTAS DE FINANZAS ===
app.get('/api/finanzas', verificarToken, async (req, res) => {
    try {
        const resultado = await pool.query(
            `SELECT
                c.id,
                c.paciente_id,
                p.nombre_completo,
                c.tratamiento,
                c.costo_total,
                c.saldo_pendiente,
                c.estado,
                c.created_at,
                COALESCE(SUM(pg.monto), 0)::numeric AS monto_pagado,
                (
                    SELECT pg2.metodo_pago
                    FROM finanzas_pagos pg2
                    WHERE pg2.cuenta_id = c.id
                    ORDER BY pg2.fecha_cobro DESC, pg2.created_at DESC
                    LIMIT 1
                ) AS metodo_pago,
                (
                    SELECT pg3.fecha_cobro
                    FROM finanzas_pagos pg3
                    WHERE pg3.cuenta_id = c.id
                    ORDER BY pg3.fecha_cobro DESC, pg3.created_at DESC
                    LIMIT 1
                ) AS fecha_cobro
             FROM finanzas_cuentas c
             INNER JOIN pacientes p ON p.id = c.paciente_id
             LEFT JOIN finanzas_pagos pg ON pg.cuenta_id = c.id
             GROUP BY c.id, p.nombre_completo
             ORDER BY c.created_at DESC`
        );
        res.json(resultado.rows);
    } catch (error) {
        console.error('Error al obtener finanzas:', error.message);
        res.status(500).json({ error: 'Error al obtener finanzas' });
    }
});

app.post('/api/finanzas/cuenta', verificarToken, async (req, res) => {
    const client = await pool.connect();
    try {
        const {
            paciente_id,
            tratamiento,
            costo_total,
            monto_pagado,
            metodo_pago,
            fecha_cobro
        } = req.body;

        const costo = Number(costo_total);
        const pagado = Number(monto_pagado);
        if (!paciente_id || !tratamiento) {
            return res.status(400).json({ error: 'Paciente y tratamiento son obligatorios' });
        }
        if (!Number.isFinite(costo) || costo <= 0) {
            return res.status(400).json({ error: 'Costo total inválido' });
        }
        if (!Number.isFinite(pagado) || pagado < 0 || pagado > costo) {
            return res.status(400).json({ error: 'Monto pagado inválido' });
        }
        if (!metodo_pago || !fecha_cobro) {
            return res.status(400).json({ error: 'Método de pago y fecha son obligatorios' });
        }

        const saldoPendiente = Math.max(0, costo - pagado);
        const estado = saldoPendiente > 0 ? 'Pendiente' : 'Pagado';

        await client.query('BEGIN');

        const cuentaInsertada = await client.query(
            `INSERT INTO finanzas_cuentas (
                paciente_id, tratamiento, costo_total, saldo_pendiente, estado
            ) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [paciente_id, tratamiento, costo, saldoPendiente, estado]
        );

        const cuenta = cuentaInsertada.rows[0];

        await client.query(
            `INSERT INTO finanzas_pagos (cuenta_id, monto, metodo_pago, fecha_cobro)
             VALUES ($1, $2, $3, $4)`,
            [cuenta.id, pagado, metodo_pago, fecha_cobro]
        );

        await client.query('COMMIT');

        const detalle = await pool.query(
            `SELECT
                c.id,
                c.paciente_id,
                p.nombre_completo,
                c.tratamiento,
                c.costo_total,
                c.saldo_pendiente,
                c.estado,
                c.created_at,
                $2::numeric AS monto_pagado,
                $3::varchar AS metodo_pago,
                $4::date AS fecha_cobro
             FROM finanzas_cuentas c
             INNER JOIN pacientes p ON p.id = c.paciente_id
             WHERE c.id = $1`,
            [cuenta.id, pagado, metodo_pago, fecha_cobro]
        );

        res.status(201).json(detalle.rows[0]);
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error al registrar cuenta:', error.message);
        res.status(500).json({ error: 'Error al registrar la cuenta por cobrar' });
    } finally {
        client.release();
    }
});

// 3. Registrar un nuevo abono a una cuenta existente
app.post('/api/finanzas/cuenta/:id/abono', verificarToken, async (req, res) => {
    const { id } = req.params; // El ID de la cuenta principal
    const { monto_abonado, metodo_pago, fecha_cobro } = req.body;
    
    const client = await pool.connect(); // Transacción iniciada

    try {
        await client.query('BEGIN');

        // 1. Obtener la deuda actual de la cuenta
        const cuentaActual = await client.query(
            'SELECT saldo_pendiente, costo_total FROM finanzas_cuentas WHERE id = $1', 
            [id]
        );

        if (cuentaActual.rows.length === 0) {
            throw new Error('Cuenta no encontrada');
        }

        const saldoActual = Number(cuentaActual.rows[0].saldo_pendiente);
        const monto = Number(monto_abonado);

        // Validaciones del guardia de seguridad
        if (!Number.isFinite(monto) || monto <= 0) {
            return res.status(400).json({ error: 'Monto de abono inválido' });
        }
        if (monto > saldoActual) {
            return res.status(400).json({ error: 'El abono no puede superar el saldo pendiente' });
        }
        if (!metodo_pago) {
            return res.status(400).json({ error: 'El método de pago es obligatorio' });
        }

        // 2. Calcular el nuevo saldo y estado
        const nuevoSaldo = saldoActual - monto;
        const nuevoEstado = nuevoSaldo === 0 ? 'Pagado' : 'Pendiente';

        // 3. Actualizar la factura principal
        await client.query(
            'UPDATE finanzas_cuentas SET saldo_pendiente = $1, estado = $2 WHERE id = $3',
            [nuevoSaldo, nuevoEstado, id]
        );

        // 4. Guardar el recibo (el abono)
        await client.query(
            'INSERT INTO finanzas_pagos (cuenta_id, monto, metodo_pago, fecha_cobro) VALUES ($1, $2, $3, $4)',
            [id, monto, metodo_pago, fecha_cobro || new Date()]
        );

        await client.query('COMMIT');
        
        // Responder con éxito para que React refresque la tabla
        res.status(200).json({ mensaje: 'Abono registrado correctamente', nuevoSaldo, nuevoEstado });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error al registrar abono:', error.message);
        res.status(500).json({ error: 'Error interno al registrar el abono' });
    } finally {
        client.release();
    }
});

// === RUTAS DE AUTENTICACIÓN ===
app.post('/api/auth/registro', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email y contraseña son obligatorios' });
        }

        const emailNormalizado = String(email).trim().toLowerCase();

        const usuarioExistente = await pool.query(
            'SELECT id FROM usuarios WHERE email = $1',
            [emailNormalizado]
        );

        if (usuarioExistente.rowCount > 0) {
            return res.status(400).json({ error: 'El usuario ya está registrado' });
        }

        const passwordHash = await bcrypt.hash(password, 10);

        const nuevoUsuario = await pool.query(
            'INSERT INTO usuarios (email, password_hash) VALUES ($1, $2) RETURNING id, email, rol',
            [emailNormalizado, passwordHash]
        );

        res.status(201).json({
            mensaje: 'Usuario registrado exitosamente',
            usuario: nuevoUsuario.rows[0],
        });
    } catch (error) {
        console.error('Error en registro:', error.message);
        res.status(500).json({ error: 'Error al registrar el usuario' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        const emailNormalizado = String(email).trim().toLowerCase();

        const resultado = await pool.query(
            'SELECT id, email, password_hash, rol FROM usuarios WHERE email = $1',
            [emailNormalizado]
        );

        if (resultado.rowCount === 0) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        const usuario = resultado.rows[0];
        const passwordValida = await bcrypt.compare(password, usuario.password_hash);

        if (!passwordValida) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
            console.error('JWT_SECRET no está definido en el entorno');
            return res.status(500).json({ error: 'Configuración de autenticación incompleta' });
        }

        const token = jwt.sign(
            { id: usuario.id, rol: usuario.rol },
            jwtSecret,
            { expiresIn: '8h' }
        );

        res.json({
            token,
            usuario: {
                id: usuario.id,
                email: usuario.email,
                rol: usuario.rol,
            },
        });
    } catch (error) {
        console.error('Error en login:', error.message);
        res.status(500).json({ error: 'Error al iniciar sesión' });
    }
});

app.listen(PORT, () => {
    console.log(`✅ Recepcionista trabajando y escuchando en el puerto ${PORT}`);
});