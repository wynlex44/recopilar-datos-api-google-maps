const {
    API_KEY,
    GOOGLE_ROUTES_URL,
    ROUTING_PREFERENCE,
    REQUEST_TIMEOUT_MS,
    MAX_RETRIES,
    DISTANCE_TOLERANCE_PCT
} = require("./config");

const {
    esperar,
    duracionASegundos,
    fechaHoraUTC,
    fechaHoraColombia,
    convertirWaypoint,
    obtenerIdNodo,
    calcularVelocidadKmh,
    redondear
} = require("./utils");

async function hacerPeticionGoogle(body, intento = 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        const response = await fetch(GOOGLE_ROUTES_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Goog-Api-Key": API_KEY,
                "X-Goog-FieldMask": [
                    "routes.distanceMeters",
                    "routes.duration",
                    "routes.staticDuration",
                    "routes.polyline.encodedPolyline"
                ].join(",")
            },
            body: JSON.stringify(body),
            signal: controller.signal
        });

        const texto = await response.text();
        let data;

        try {
            data = texto ? JSON.parse(texto) : {};
        } catch {
            data = { rawResponse: texto };
        }

        if (response.ok) {
            return data;
        }

        const temporal = [429, 500, 502, 503, 504].includes(response.status);

        if (temporal && intento < MAX_RETRIES) {
            const esperaMs = 1000 * (2 ** (intento - 1));
            console.warn(
                `Google respondió HTTP ${response.status}. Reintentando en ${esperaMs} ms...`
            );
            await esperar(esperaMs);
            return hacerPeticionGoogle(body, intento + 1);
        }

        throw new Error(
            `Google Routes API respondió HTTP ${response.status}: ${JSON.stringify(data)}`
        );
    } catch (error) {
        if (error.name === "AbortError" && intento < MAX_RETRIES) {
            console.warn(`Timeout. Reintentando petición ${intento + 1}/${MAX_RETRIES}...`);
            return hacerPeticionGoogle(body, intento + 1);
        }
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

async function consultarArco(arco, runId) {
    if (!arco?.id) throw new Error("Todos los arcos deben tener un campo 'id'.");
    if (!arco.origen) throw new Error(`El arco ${arco.id} no tiene origen.`);
    if (!arco.destino) throw new Error(`El arco ${arco.id} no tiene destino.`);

    const vias = Array.isArray(arco.vias) ? arco.vias : [];

    const body = {
        origin: convertirWaypoint(arco.origen),
        destination: convertirWaypoint(arco.destino),
        travelMode: "DRIVE",
        routingPreference: ROUTING_PREFERENCE,
        computeAlternativeRoutes: false,
        languageCode: "es-CO",
        units: "METRIC"
    };

    if (vias.length > 0) {
        body.intermediates = vias.map((punto) => convertirWaypoint(punto, true));
    }

    const data = await hacerPeticionGoogle(body);

    if (!Array.isArray(data.routes) || data.routes.length === 0) {
        throw new Error(`Google no encontró una ruta para el arco ${arco.id}.`);
    }

    const ruta = data.routes[0];
    const distanciaMetros = Number(ruta.distanceMeters);
    const duracionTraficoSeg = duracionASegundos(ruta.duration);
    const duracionEstaticaSeg = duracionASegundos(ruta.staticDuration);

    if (!Number.isFinite(distanciaMetros) || duracionTraficoSeg === null) {
        throw new Error(`Respuesta incompleta para ${arco.id}: ${JSON.stringify(ruta)}`);
    }

    const velocidadTraficoKmh = calcularVelocidadKmh(
        distanciaMetros,
        duracionTraficoSeg
    );

    const velocidadEstaticaKmh = calcularVelocidadKmh(
        distanciaMetros,
        duracionEstaticaSeg
    );

    let retrasoVsStaticSeg = null;
    let indiceVsStatic = null;

    if (duracionEstaticaSeg !== null && duracionEstaticaSeg > 0) {
        retrasoVsStaticSeg = duracionTraficoSeg - duracionEstaticaSeg;
        indiceVsStatic = retrasoVsStaticSeg / duracionEstaticaSeg;
    }

    const longitudEsperada = Number(arco.longitudEsperadaMetros);
    let desviacionDistanciaPct = null;
    let rutaSospechosa = false;

    if (Number.isFinite(longitudEsperada) && longitudEsperada > 0) {
        desviacionDistanciaPct =
            (Math.abs(distanciaMetros - longitudEsperada) / longitudEsperada) * 100;
        rutaSospechosa = desviacionDistanciaPct > DISTANCE_TOLERANCE_PCT;
    }

    // Peso dinámico del arco: tiempo de viaje estimado considerando tráfico.
    const pesoSegundos = duracionTraficoSeg;

    return {
        runId,
        idArco: String(arco.id),
        nodoOrigen: obtenerIdNodo(arco.origen, `${arco.id}_ORIGEN`),
        nodoDestino: obtenerIdNodo(arco.destino, `${arco.id}_DESTINO`),
        fechaHoraUTC: fechaHoraUTC(),
        fechaHoraColombia: fechaHoraColombia(),
        distanciaMetros: redondear(distanciaMetros, 3),
        duracionTraficoSeg: redondear(duracionTraficoSeg, 3),
        duracionEstaticaSeg: redondear(duracionEstaticaSeg, 3),
        velocidadTraficoKmh: redondear(velocidadTraficoKmh, 3),
        velocidadEstaticaKmh: redondear(velocidadEstaticaKmh, 3),
        retrasoVsStaticSeg: redondear(retrasoVsStaticSeg, 3),
        indiceVsStatic: redondear(indiceVsStatic, 6),
        pesoSegundos: redondear(pesoSegundos, 3),
        longitudEsperadaMetros: Number.isFinite(longitudEsperada)
            ? longitudEsperada
            : null,
        desviacionDistanciaPct: redondear(desviacionDistanciaPct, 2),
        rutaSospechosa,
        cantidadPuntosVia: vias.length,
        polyline: ruta.polyline?.encodedPolyline ?? null
    };
}

module.exports = {
    consultarArco
};
