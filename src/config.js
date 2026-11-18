const path = require("node:path");
require("dotenv").config();

const ROOT_DIR = path.resolve(__dirname, "..");
const DATA_DIR = process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.join(ROOT_DIR, "data");

const API_KEY = process.env.GOOGLE_MAPS_API_KEY;

if (!API_KEY) {
    throw new Error(
        "No se encontró GOOGLE_MAPS_API_KEY. Copia .env.example como .env y agrega tu clave."
    );
}

const SCHEDULE_START_HOUR = Number(process.env.SCHEDULE_START_HOUR ?? 6);
const SCHEDULE_END_HOUR = Number(process.env.SCHEDULE_END_HOUR ?? 18);

if (
    !Number.isInteger(SCHEDULE_START_HOUR) ||
    !Number.isInteger(SCHEDULE_END_HOUR) ||
    SCHEDULE_START_HOUR < 0 ||
    SCHEDULE_END_HOUR > 23 ||
    SCHEDULE_START_HOUR > SCHEDULE_END_HOUR
) {
    throw new Error("SCHEDULE_START_HOUR y SCHEDULE_END_HOUR no son válidos.");
}

module.exports = {
    API_KEY,
    GOOGLE_ROUTES_URL: "https://routes.googleapis.com/directions/v2:computeRoutes",
    ROUTING_PREFERENCE: process.env.ROUTING_PREFERENCE || "TRAFFIC_AWARE",
    REQUEST_DELAY_MS: Number(process.env.REQUEST_DELAY_MS) || 300,
    REQUEST_TIMEOUT_MS: Number(process.env.REQUEST_TIMEOUT_MS) || 30000,
    MAX_RETRIES: Number(process.env.MAX_RETRIES) || 3,
    DISTANCE_TOLERANCE_PCT: Number(process.env.DISTANCE_TOLERANCE_PCT) || 60,

    // Programación. Por defecto: lunes, cada hora de 06:00 a 18:00.
    SCHEDULE_START_HOUR,
    SCHEDULE_END_HOUR,
    SCHEDULE_DAYS: process.env.SCHEDULE_DAYS || "1",
    SCHEDULE_TIMEZONE: process.env.SCHEDULE_TIMEZONE || "America/Bogota",
    RUN_ON_START: String(process.env.RUN_ON_START || "false").toLowerCase() === "true",

    // Servidor para descargar resultados desde el navegador.
    PORT: Number(process.env.PORT) || 3000,
    DOWNLOAD_TOKEN: process.env.DOWNLOAD_TOKEN || "",

    ROOT_DIR,
    DATA_DIR,
    ARCOS_FILE: path.join(ROOT_DIR, "config", "arcos.json"),
    SNAPSHOTS_DIR: path.join(DATA_DIR, "snapshots"),
    HISTORICO_JSONL: path.join(DATA_DIR, "mediciones_trafico.jsonl"),
    HISTORICO_CSV: path.join(DATA_DIR, "mediciones_trafico.csv"),
    ULTIMA_MEDICION_JSON: path.join(DATA_DIR, "ultima_medicion.json"),
    ULTIMA_MEDICION_CSV: path.join(DATA_DIR, "ultima_medicion.csv"),
    ARCOS_PESADOS_JSON: path.join(DATA_DIR, "arcos_pesados.json"),
    MATRIZ_COSTOS_JSON: path.join(DATA_DIR, "matriz_costos.json"),
    MATRIZ_COSTOS_CSV: path.join(DATA_DIR, "matriz_costos.csv")
};
