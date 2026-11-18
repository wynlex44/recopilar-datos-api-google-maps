function esperar(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function duracionASegundos(valor) {
    if (!valor) return null;
    const numero = Number.parseFloat(String(valor).replace("s", ""));
    return Number.isFinite(numero) ? numero : null;
}

function fechaHoraUTC() {
    return new Date().toISOString();
}

function obtenerPartesFechaColombia(fecha = new Date()) {
    const formato = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Bogota",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        weekday: "long",
        hour12: false
    });

    const partes = Object.fromEntries(
        formato.formatToParts(fecha).map((parte) => [parte.type, parte.value])
    );

    const dias = {
        Monday: "lunes",
        Tuesday: "martes",
        Wednesday: "miércoles",
        Thursday: "jueves",
        Friday: "viernes",
        Saturday: "sábado",
        Sunday: "domingo"
    };

    const fechaLocal = `${partes.year}-${partes.month}-${partes.day}`;
    const horaLocal = `${partes.hour}:${partes.minute}:${partes.second}`;

    return {
        fecha: fechaLocal,
        hora: horaLocal,
        horaHHMM: `${partes.hour}:${partes.minute}`,
        horaEntera: Number(partes.hour),
        diaSemana: dias[partes.weekday] || partes.weekday,
        fechaHoraISO: `${fechaLocal}T${horaLocal}-05:00`
    };
}

function fechaHoraColombia() {
    return obtenerPartesFechaColombia().fechaHoraISO;
}

function convertirWaypoint(punto, esVia = false) {
    if (!punto) {
        throw new Error("Se recibió un waypoint vacío.");
    }

    let waypoint;

    if (typeof punto.address === "string" && punto.address.trim() !== "") {
        waypoint = { address: punto.address.trim() };
    } else if (typeof punto.placeId === "string" && punto.placeId.trim() !== "") {
        waypoint = { placeId: punto.placeId.trim() };
    } else if (
        Number.isFinite(Number(punto.lat)) &&
        Number.isFinite(Number(punto.lng))
    ) {
        waypoint = {
            location: {
                latLng: {
                    latitude: Number(punto.lat),
                    longitude: Number(punto.lng)
                }
            }
        };
    } else {
        throw new Error(`Waypoint inválido: ${JSON.stringify(punto)}`);
    }

    if (esVia) {
        waypoint.via = true;
    }

    return waypoint;
}

function obtenerIdNodo(punto, fallback) {
    if (punto?.id) return String(punto.id);
    if (punto?.address) return punto.address;
    return fallback;
}

function calcularVelocidadKmh(distanciaMetros, duracionSegundos) {
    if (
        !Number.isFinite(distanciaMetros) ||
        !Number.isFinite(duracionSegundos) ||
        duracionSegundos <= 0
    ) {
        return null;
    }

    return (distanciaMetros / duracionSegundos) * 3.6;
}

function clasificarCongestion(ci) {
    if (ci === null || ci === undefined || !Number.isFinite(ci)) return null;
    if (ci <= 0.15) return "Fluido";
    if (ci <= 0.35) return "Ligeramente congestionado";
    if (ci <= 0.65) return "Congestionado";
    if (ci <= 2.0) return "Altamente congestionado";
    return "Embotellamiento";
}

function redondear(valor, decimales = 3) {
    if (valor === null || valor === undefined || !Number.isFinite(Number(valor))) {
        return null;
    }

    const factor = 10 ** decimales;
    return Math.round(Number(valor) * factor) / factor;
}

function escaparCSV(valor) {
    if (valor === null || valor === undefined) return "";

    if (typeof valor === "object") {
        valor = JSON.stringify(valor);
    }

    const texto = String(valor);

    if (texto.includes(",") || texto.includes('"') || texto.includes("\n")) {
        return '"' + texto.replaceAll('"', '""') + '"';
    }

    return texto;
}

module.exports = {
    esperar,
    duracionASegundos,
    fechaHoraUTC,
    fechaHoraColombia,
    obtenerPartesFechaColombia,
    convertirWaypoint,
    obtenerIdNodo,
    calcularVelocidadKmh,
    clasificarCongestion,
    redondear,
    escaparCSV
};
