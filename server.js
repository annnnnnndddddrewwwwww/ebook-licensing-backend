const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000; // Usa el puerto de Render o 3000 localmente

// --- Configuración de CORS ---
// Permite que tu frontend (ej. localhost:5500 o tu dominio de Render) se conecte
const allowedOrigins = [
    'http://localhost:5500', // Para desarrollo local con Live Server
    'http://127.0.0.1:5500',  // Otra posible dirección de Live Server
    'https://ebook-licensing-backend.onrender.com', // **¡Reemplaza con el dominio de tu frontend en Render!**
];

app.use(cors({
    origin: function (origin, callback) {
        // Permitir solicitudes sin origen (como Postman o curl)
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1) {
            const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    }
}));
app.use(express.json()); // Para parsear cuerpos de solicitud JSON

// --- Base de Datos Simulada (archivo JSON) ---
const LICENSES_FILE = path.join(__dirname, 'licenses.json');

// Cargar licencias existentes o inicializar si no existen
let licenses = {};
if (fs.existsSync(LICENSES_FILE)) {
    try {
        licenses = JSON.parse(fs.readFileSync(LICENSES_FILE, 'utf8'));
    } catch (e) {
        console.error("Error reading licenses.json:", e);
        licenses = {}; // Reiniciar si el archivo está corrupto
    }
}

// Guardar licencias en el archivo JSON
function saveLicenses() {
    fs.writeFileSync(LICENSES_FILE, JSON.stringify(licenses, null, 2), 'utf8');
}

// --- Endpoints de la API ---

// 1. Generar una nueva licencia
app.post('/generate-license', (req, res) => {
    // En un sistema real, verificarías autenticación/autorización aquí
    const { userId = 'guest' } = req.body; // Simula un ID de usuario

    // Genera una clave con formato NUTR-XXXX-XXXX-XXXX
    const newLicenseKey = `NUTR-${uuidv4().substring(0, 4).toUpperCase()}-${uuidv4().substring(0, 4).toUpperCase()}-${uuidv4().substring(0, 4).toUpperCase()}`;

    // Almacena la licencia. En un sistema real, podrías añadir más metadata
    licenses[newLicenseKey] = {
        userId: userId,
        status: 'active', // 'active', 'used', 'revoked'
        createdAt: new Date().toISOString(),
        usedCount: 0,
        usedIps: {}, // Para rastrear IPs que la han usado
        maxUses: 1 // Por defecto, una licencia por IP/uso
    };
    saveLicenses();

    console.log(`Generated license: ${newLicenseKey} for user ${userId}`);
    res.json({ success: true, licenseKey: newLicenseKey, message: "License generated successfully." });
});

// 2. Validar una licencia
app.post('/validate-license', (req, res) => {
    const { licenseKey, userIp = req.ip } = req.body; // Obtiene la IP del cliente (simplificado, detrás de proxy puede ser más complejo)

    if (!licenseKey) {
        return res.status(400).json({ success: false, message: "License key is required." });
    }

    const license = licenses[licenseKey];

    if (!license) {
        console.log(`Validation failed: License ${licenseKey} not found.`);
        return res.status(401).json({ success: false, message: "License key not found or invalid." });
    }

    if (license.status !== 'active') {
        console.log(`Validation failed: License ${licenseKey} is not active (status: ${license.status}).`);
        return res.status(403).json({ success: false, message: `License is ${license.status}.` });
    }

    // --- Lógica de un solo uso por IP o usos limitados ---
    if (license.maxUses > 0 && license.usedCount >= license.maxUses) {
        console.log(`Validation failed: License ${licenseKey} has reached max uses (${license.maxUses}).`);
        return res.status(403).json({ success: false, message: "License has reached its maximum uses." });
    }

    // Verificar si ya ha sido usada por esta IP (simulación de 'una vez por IP')
    if (license.usedIps[userIp]) {
        // Permitir re-acceso desde la misma IP si ya la usó, sin incrementar el contador principal
        console.log(`License ${licenseKey} re-accessed by existing IP: ${userIp}`);
        // No actualizamos el status a 'used' si ya ha sido marcada como tal, ni incrementamos usedCount.
        // Podríamos tener un contador separado para "accesos" vs "usos iniciales" si se requiere.
        return res.json({
            success: true,
            message: "License valid. Content loaded.",
            personalizedContent: `<h2>¡Bienvenido de nuevo, ${license.userId}!</h2><p>Este es tu contenido exclusivo, cargado porque tu licencia **${licenseKey}** es válida y ya la usaste desde esta IP.</p><p>Puedes seguir leyendo tu eBook de nutrición personalizado.</p>`
        });
    } else {
        // Primera vez que se usa la licencia o se usa desde una nueva IP
        license.usedIps[userIp] = new Date().toISOString();
        license.usedCount++;

        if (license.usedCount >= license.maxUses) {
            license.status = 'used'; // Marca como usada si alcanzó el límite
            console.log(`License ${licenseKey} marked as 'used' after reaching max uses.`);
        }
        saveLicenses();

        console.log(`License ${licenseKey} validated successfully for new IP: ${userIp}. Used count: ${license.usedCount}`);
        return res.json({
            success: true,
            message: "License valid. Content loaded.",
            personalizedContent: `<h2>¡Hola, ${license.userId}!</h2><p>Bienvenido/a a tu eBook de Nutrición Personalizado, cargado gracias a tu licencia **${licenseKey}**. Este es un contenido exclusivo para ti.</p><p>Disfruta de tu guía completa y personalizada.</p>`
        });
    }
});

// Endpoint para mostrar todas las licencias (SOLO PARA ADMIN/TESTEO)
app.get('/licenses', (req, res) => {
    // En producción, esto debería estar protegido con autenticación
    res.json(licenses);
});

// Endpoint para simular el contenido personalizado (puede ser más complejo)
app.get('/content/:licenseKey', (req, res) => {
    const { licenseKey } = req.params;
    const license = licenses[licenseKey];

    if (!license || license.status !== 'active') {
        return res.status(403).json({ success: false, message: "Unauthorized content access." });
    }

    // Aquí construirías y servirías el contenido real basado en userId o data asociada a la licencia
    res.json({
        success: true,
        content: `<p>Este es el contenido detallado y personalizado para la licencia **${licenseKey}** asignada a **${license.userId}**. ¡Disfrútalo!</p>
                  <h3>Tu Receta Especial del Día</h3>
                  <p>Hoy, te recomendamos una ensalada de quinua con vegetales de temporada y aderezo de aguacate, ideal para tus necesidades calóricas.</p>
                  <ul><li>Ingrediente A</li><li>Ingrediente B</li><li>Ingrediente C</li></ul>
                  <p>¡Y mucho más contenido adaptado a ti!</p>`
    });
});


// Ruta raíz para verificar que el servidor está funcionando
app.get('/', (req, res) => {
    res.send('Ebook Licensing Backend is running!');
});

// Iniciar el servidor
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});