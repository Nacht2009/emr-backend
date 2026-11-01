const { Pool } = require('pg');
require('dotenv').config(); // Lee la caja fuerte secreta

// Creamos un grupo de mensajeros (Pool) autorizados para bajar al archivero
const pool = new Pool({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME
});

module.exports = pool; // Le entregamos esta llave al resto de la oficina