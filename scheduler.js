const http = require("node:http");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

const { ejecutarMedicionCompleta } = require("./index");
const {
    PORT,
    DATA_DIR,
    HISTORICO_CSV,
    HISTORICO_JSONL,
    ULTIMA_MEDICION_CSV,
    ULTIMA_MEDICION_JSON,
    MATRIZ_COSTOS_CSV,
    MATRIZ_COSTOS_JSON,
    ARCOS_PESADOS_JSON,
    SCHEDULE_START_HOUR,
    SCHEDULE_END_HOUR,
    SCHEDULE_DAYS,
    SCHEDULE_TIMEZONE,
    RUN_ON_START,
    DOWNLOAD_TOKEN
} = require("./src/config");
const { obtenerPartesFechaColombia } = require("./src/utils");

const STATE_FILE = path.join(DATA_DIR, "scheduler_state.json");
const CHECK_INTERVAL_MS = 20_000;
const GRACE_MINUTES = 10;

let ejecutando = false;
let ultimaEjecucion = null;
let ultimoError = null;
let ultimoSlotEjecutado = null;

function numeroDiaSemana(nombre) {
    return {
        domingo: 0,
        lunes: 1,
        martes: 2,
        miércoles: 3,
        jueves: 4,
        viernes: 5,
        sábado: 6
    }[nombre];
}

function diaPermitido(numeroDia, expresion) {
    const valor = String(expresion || "*").trim();
    if (valor === "*") return true;

    return valor.split(",").some((parte) => {
        const p = parte.trim();
        if (/^\d$/.test(p)) {
            return Number(p) === numeroDia;
        }

        const match = p.match(/^(\d)-(\d)$/);
        if (match) {
            const inicio = Number(match[1]);
            const fin = Number(match[2]);
            return numeroDia >= inicio && numeroDia <= fin;
        }

        return false;
    });
}

async function cargarEstado() {
    try {
        if (!fs.existsSync(STATE_FILE)) return;
        const estado = JSON.parse(await fsp.readFile(STATE_FILE, "utf8"));
        ultimoSlotEjecutado = estado.ultimoSlotEjecutado || null;
        ultimaEjecucion = estado.ultimaEjecucion || null;
        ultimoError = estado.ultimoError || null;
    } catch (error) {
        console.warn(`No se pudo leer scheduler_state.json: ${error.message}`);
    }
}

async function guardarEstado() {
    await fsp.mkdir(DATA_DIR, { recursive: true });
    await fsp.writeFile(
        STATE_FILE,
        JSON.stringify(
            {
                ultimoSlotEjecutado,
                ultimaEjecucion,
                ultimoError,
                actualizadoUTC: new Date().toISOString()
            },
            null,
            2
        ),
        "utf8"
    );
}

function tokenValido(url) {
    if (!DOWNLOAD_TOKEN) return true;
    return url.searchParams.get("token") === DOWNLOAD_TOKEN;
}

function enviarJSON(res, statusCode, data) {
    const body = JSON.stringify(data, null, 2);
    res.writeHead(statusCode, {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Length": Buffer.byteLength(body)
    });
    res.end(body);
}

function servirArchivo(res, archivo) {
    if (!fs.existsSync(archivo)) {
        enviarJSON(res, 404, { error: "El archivo todavía no existe." });
        return;
    }

    const nombre = path.basename(archivo);
    const ext = path.extname(nombre).toLowerCase();
    const contentType = ext === ".csv"
        ? "text/csv; charset=utf-8"
        : ext === ".json"
            ? "application/json; charset=utf-8"
            : "application/octet-stream";

    res.writeHead(200, {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${nombre}"`
    });
    fs.createReadStream(archivo).pipe(res);
}

function paginaInicio(token) {
    const q = token ? `?token=${encodeURIComponent(token)}` : "";
    return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Datos de tráfico - Florencia</title>
<style>
body{font-family:system-ui,-apple-system,sans-serif;max-width:820px;margin:40px auto;padding:0 18px;line-height:1.5}a{display:block;margin:10px 0}code{background:#f3f3f3;padding:2px 6px;border-radius:4px}.ok{padding:12px;border:1px solid #ddd;border-radius:8px}
</style>
</head>
<body>
<h1>Recolección de tráfico</h1>
<div class="ok">
<p><strong>Horario:</strong> cada hora de ${String(SCHEDULE_START_HOUR).padStart(2, "0")}:00 a ${String(SCHEDULE_END_HOUR).padStart(2, "0")}:00</p>
<p><strong>Días configurados:</strong> <code>${SCHEDULE_DAYS}</code></p>
<p><strong>Zona horaria:</strong> ${SCHEDULE_TIMEZONE}</p>
<p><strong>Último slot ejecutado:</strong> ${ultimoSlotEjecutado || "Todavía no se ha ejecutado"}</p>
<p><strong>Última ejecución correcta:</strong> ${ultimaEjecucion || "Todavía no se ha ejecutado"}</p>
<p><strong>Último error:</strong> ${ultimoError || "Ninguno"}</p>
</div>
<h2>Descargar</h2>
<a href="/download/mediciones_trafico.csv${q}">Histórico completo CSV</a>
<a href="/download/mediciones_trafico.jsonl${q}">Histórico completo JSONL</a>
<a href="/download/ultima_medicion.csv${q}">Última medición CSV</a>
<a href="/download/ultima_medicion.json${q}">Última medición JSON</a>
<a href="/download/matriz_costos.csv${q}">Última matriz de costos CSV</a>
<a href="/download/matriz_costos.json${q}">Última matriz de costos JSON</a>
<a href="/download/arcos_pesados.json${q}">Últimos arcos ponderados JSON</a>
</body>
</html>`;
}

function iniciarServidorDescargas() {
    const archivosPermitidos = new Map([
        ["mediciones_trafico.csv", HISTORICO_CSV],
        ["mediciones_trafico.jsonl", HISTORICO_JSONL],
        ["ultima_medicion.csv", ULTIMA_MEDICION_CSV],
        ["ultima_medicion.json", ULTIMA_MEDICION_JSON],
        ["matriz_costos.csv", MATRIZ_COSTOS_CSV],
        ["matriz_costos.json", MATRIZ_COSTOS_JSON],
        ["arcos_pesados.json", ARCOS_PESADOS_JSON]
    ]);

    const server = http.createServer((req, res) => {
        const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

        if (url.pathname === "/health") {
            enviarJSON(res, 200, {
                ok: true,
                ejecutando,
                ultimoSlotEjecutado,
                ultimaEjecucion,
                ultimoError,
                horario: `${SCHEDULE_START_HOUR}:00-${SCHEDULE_END_HOUR}:00`,
                dias: SCHEDULE_DAYS,
                timezone: SCHEDULE_TIMEZONE
            });
            return;
        }

        if (!tokenValido(url)) {
            enviarJSON(res, 401, {
                error: "Token de descarga inválido. Usa ?token=TU_DOWNLOAD_TOKEN"
            });
            return;
        }

        if (url.pathname === "/") {
            const html = paginaInicio(DOWNLOAD_TOKEN ? url.searchParams.get("token") : "");
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(html);
            return;
        }

        const prefijo = "/download/";
        if (url.pathname.startsWith(prefijo)) {
            const nombre = decodeURIComponent(url.pathname.slice(prefijo.length));
            const archivo = archivosPermitidos.get(nombre);
            if (!archivo) {
                enviarJSON(res, 404, { error: "Archivo no permitido." });
                return;
            }
            servirArchivo(res, archivo);
            return;
        }

        enviarJSON(res, 404, { error: "Ruta no encontrada." });
    });

    server.listen(PORT, "0.0.0.0", () => {
        console.log(`Servidor de descargas escuchando en puerto ${PORT}`);
        console.log(`Carpeta de datos: ${DATA_DIR}`);
    });

    return server;
}

async function ejecutarSlot(slotProgramado, horaProgramada) {
    if (ejecutando) {
        console.warn("Se omitió una ejecución porque la medición anterior todavía sigue activa.");
        return;
    }

    if (slotProgramado === ultimoSlotEjecutado) return;

    ejecutando = true;
    ultimoError = null;
    ultimoSlotEjecutado = slotProgramado;
    await guardarEstado();

    try {
        console.log(`\n[PROGRAMADOR] Iniciando slot ${slotProgramado}`);
        await ejecutarMedicionCompleta({
            tipoEjecucion: "programada",
            horaProgramada,
            slotProgramado
        });
        ultimaEjecucion = slotProgramado;
        console.log(`[PROGRAMADOR] Slot ${slotProgramado} finalizado.`);
    } catch (error) {
        ultimoError = `${slotProgramado}: ${error.message}`;
        console.error(`[PROGRAMADOR] Error en ${slotProgramado}: ${error.message}`);
    } finally {
        ejecutando = false;
        await guardarEstado();
    }
}

async function revisarHorario() {
    const ahora = obtenerPartesFechaColombia();
    const numeroDia = numeroDiaSemana(ahora.diaSemana);
    const minuto = Number(ahora.hora.split(":")[1]);

    if (!diaPermitido(numeroDia, SCHEDULE_DAYS)) return;
    if (
        ahora.horaEntera < SCHEDULE_START_HOUR ||
        ahora.horaEntera > SCHEDULE_END_HOUR
    ) return;

    // Ejecutar solamente cada 3 horas: 06:00, 09:00, 12:00, 15:00 y 18:00
    if ((ahora.horaEntera - SCHEDULE_START_HOUR) % 3 !== 0) return;

    if (minuto >= GRACE_MINUTES) return;

    const horaProgramada = `${String(ahora.horaEntera).padStart(2, "0")}:00`;
    const slotProgramado = `${ahora.fecha} ${horaProgramada}`;

    await ejecutarSlot(slotProgramado, horaProgramada);
}

async function iniciar() {
    await fsp.mkdir(DATA_DIR, { recursive: true });
    await cargarEstado();

    console.log("\n=============================================");
    console.log(" RECOLECTOR AUTOMÁTICO DE TRÁFICO");
    console.log("=============================================");
    console.log(`Zona horaria: ${SCHEDULE_TIMEZONE}`);
    console.log(`Horario: cada hora de ${SCHEDULE_START_HOUR}:00 a ${SCHEDULE_END_HOUR}:00`);
    console.log(`Días: ${SCHEDULE_DAYS}`);
    console.log("SCHEDULE_DAYS=1: lunes | 1-5: lunes-viernes | *: todos los días");
    console.log(`Tolerancia al arranque/reinicio: primeros ${GRACE_MINUTES} min de cada hora.\n`);

    iniciarServidorDescargas();

    if (RUN_ON_START) {
        const ahora = obtenerPartesFechaColombia();
        const horaProgramada = `${String(ahora.horaEntera).padStart(2, "0")}:00`;
        await ejecutarSlot(`${ahora.fecha} ${horaProgramada}-inicio`, horaProgramada);
    }

    await revisarHorario();
    setInterval(() => {
        revisarHorario().catch((error) => {
            console.error(`Error revisando horario: ${error.message}`);
        });
    }, CHECK_INTERVAL_MS);
}

iniciar().catch((error) => {
    console.error(`Error fatal iniciando el programador: ${error.message}`);
    process.exitCode = 1;
});
