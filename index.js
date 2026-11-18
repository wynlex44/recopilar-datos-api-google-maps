const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

const {
    DATA_DIR,
    SNAPSHOTS_DIR,
    ARCOS_FILE,
    REQUEST_DELAY_MS,
    ROUTING_PREFERENCE,
    HISTORICO_JSONL,
    HISTORICO_CSV,
    ULTIMA_MEDICION_JSON,
    ULTIMA_MEDICION_CSV,
    ARCOS_PESADOS_JSON,
    MATRIZ_COSTOS_JSON,
    MATRIZ_COSTOS_CSV
} = require("./src/config");

const {
    esperar,
    fechaHoraUTC,
    obtenerPartesFechaColombia
} = require("./src/utils");
const { consultarArco } = require("./src/googleRoutesService");
const {
    agregarJSONL,
    leerJSONL,
    convertirACSV,
    escribirJSON,
    escribirTexto
} = require("./src/storageService");
const {
    calcularTiemposReferencia,
    enriquecerConCongestion,
    construirMatrizCostos,
    matrizACSV
} = require("./src/analysisService");

const COLUMNAS_HISTORICO = [
    "runId",
    "tipoEjecucion",
    "slotProgramado",
    "fechaMuestreo",
    "diaSemana",
    "horaProgramada",
    "idArco",
    "nodoOrigen",
    "nodoDestino",
    "fechaHoraUTC",
    "fechaHoraColombia",
    "distanciaMetros",
    "duracionTraficoSeg",
    "duracionEstaticaSeg",
    "velocidadTraficoKmh",
    "velocidadEstaticaKmh",
    "retrasoVsStaticSeg",
    "indiceVsStatic",
    "pesoSegundos",
    "longitudEsperadaMetros",
    "desviacionDistanciaPct",
    "rutaSospechosa"
];

const COLUMNAS_ULTIMA = [
    "tipoEjecucion",
    "slotProgramado",
    "fechaMuestreo",
    "diaSemana",
    "horaProgramada",
    "idArco",
    "nodoOrigen",
    "nodoDestino",
    "fechaHoraColombia",
    "distanciaMetros",
    "duracionTraficoSeg",
    "duracionEstaticaSeg",
    "velocidadTraficoKmh",
    "t0ObservadoSeg",
    "indiceCongestion",
    "estadoTrafico",
    "pesoSegundos",
    "desviacionDistanciaPct",
    "rutaSospechosa"
];

async function cargarArcos() {
    if (!fs.existsSync(ARCOS_FILE)) {
        throw new Error(`No existe el archivo ${ARCOS_FILE}`);
    }

    const contenido = await fsp.readFile(ARCOS_FILE, "utf8");
    const arcos = JSON.parse(contenido);

    if (!Array.isArray(arcos)) {
        throw new Error("config/arcos.json debe contener un arreglo JSON.");
    }

    if (arcos.length === 0) {
        throw new Error("config/arcos.json no contiene ningún arco.");
    }

    return arcos;
}

async function ejecutarMedicionCompleta(opciones = {}) {
    const {
        tipoEjecucion = "manual",
        horaProgramada = null,
        slotProgramado = null
    } = opciones;

    console.log("\n=============================================");
    console.log(" RECOLECCIÓN DE TRÁFICO - GOOGLE ROUTES API");
    console.log("=============================================\n");

    await fsp.mkdir(DATA_DIR, { recursive: true });

    const arcos = await cargarArcos();
    const inicioLocal = obtenerPartesFechaColombia();
    const runId = fechaHoraUTC();
    const horaObjetivo = horaProgramada || inicioLocal.horaHHMM;
    const slot = slotProgramado || `${inicioLocal.fecha} ${horaObjetivo}`;
    const medicionesActuales = [];
    const errores = [];

    console.log(`Arcos cargados: ${arcos.length}`);
    console.log(`Routing preference: ${ROUTING_PREFERENCE}`);
    console.log(`Tipo de ejecución: ${tipoEjecucion}`);
    console.log(`Slot de muestreo: ${slot}\n`);

    for (let i = 0; i < arcos.length; i++) {
        const arco = arcos[i];
        console.log(`[${i + 1}/${arcos.length}] Consultando ${arco.id}...`);

        try {
            const resultado = await consultarArco(arco, runId);

            medicionesActuales.push({
                ...resultado,
                tipoEjecucion,
                slotProgramado: slot,
                fechaMuestreo: inicioLocal.fecha,
                diaSemana: inicioLocal.diaSemana,
                horaProgramada: horaObjetivo
            });

            console.log(`    Distancia: ${resultado.distanciaMetros} m`);
            console.log(`    Tiempo tráfico: ${resultado.duracionTraficoSeg} s`);
            console.log(`    Velocidad: ${resultado.velocidadTraficoKmh} km/h`);
            console.log(`    Peso: ${resultado.pesoSegundos} s`);

            if (resultado.rutaSospechosa) {
                console.warn(
                    `    ADVERTENCIA: la longitud devuelta difiere ${resultado.desviacionDistanciaPct}% de la esperada.`
                );
            }
        } catch (error) {
            console.error(`    ERROR en ${arco.id}: ${error.message}`);
            errores.push({ idArco: arco.id, error: error.message });
        }

        if (i < arcos.length - 1) {
            await esperar(REQUEST_DELAY_MS);
        }
    }

    if (medicionesActuales.length === 0) {
        throw new Error("No se obtuvo ninguna medición válida.");
    }

    // JSONL es la fuente histórica principal y nunca se sobrescribe.
    await agregarJSONL(HISTORICO_JSONL, medicionesActuales);

    const historico = await leerJSONL(HISTORICO_JSONL);

    // Regeneramos el CSV completo para que los históricos antiguos también
    // sean compatibles si se agregaron columnas nuevas al proyecto.
    await escribirTexto(
        HISTORICO_CSV,
        convertirACSV(historico, COLUMNAS_HISTORICO)
    );

    const tiemposReferencia = calcularTiemposReferencia(historico);
    const medicionesEnriquecidas = enriquecerConCongestion(
        medicionesActuales,
        tiemposReferencia
    );

    await escribirJSON(ULTIMA_MEDICION_JSON, {
        runId,
        tipoEjecucion,
        slotProgramado: slot,
        fechaGeneracionUTC: fechaHoraUTC(),
        totalArcosSolicitados: arcos.length,
        totalArcosExitosos: medicionesEnriquecidas.length,
        totalErrores: errores.length,
        errores,
        mediciones: medicionesEnriquecidas
    });

    await escribirTexto(
        ULTIMA_MEDICION_CSV,
        convertirACSV(medicionesEnriquecidas, COLUMNAS_ULTIMA)
    );

    const arcosPonderados = medicionesEnriquecidas.map((medicion) => ({
        id: medicion.idArco,
        origen: medicion.nodoOrigen,
        destino: medicion.nodoDestino,
        pesoSegundos: medicion.pesoSegundos,
        distanciaMetros: medicion.distanciaMetros,
        velocidadKmh: medicion.velocidadTraficoKmh,
        t0Segundos: medicion.t0ObservadoSeg,
        indiceCongestion: medicion.indiceCongestion,
        estadoTrafico: medicion.estadoTrafico,
        rutaSospechosa: medicion.rutaSospechosa
    }));

    await escribirJSON(ARCOS_PESADOS_JSON, {
        runId,
        slotProgramado: slot,
        unidadPeso: "segundos",
        arcos: arcosPonderados
    });

    const { nodos, matriz } = construirMatrizCostos(medicionesEnriquecidas);

    await escribirJSON(MATRIZ_COSTOS_JSON, {
        runId,
        slotProgramado: slot,
        fechaGeneracionUTC: fechaHoraUTC(),
        descripcion: "Matriz de costos W(t)",
        unidad: "segundos",
        valorSinConexion: null,
        nodos,
        matriz
    });

    const matrizCsvTexto = matrizACSV(nodos, matriz);
    await escribirTexto(MATRIZ_COSTOS_CSV, matrizCsvTexto);

    // Conserva una copia independiente de cada horario para poder comparar
    // rutas de las 06:00, 07:00, ..., 18:00 sin que se sobrescriban.
    const horaCarpeta = horaObjetivo.replace(":", "-");
    const snapshotDir = path.join(SNAPSHOTS_DIR, inicioLocal.fecha, horaCarpeta);
    await fsp.mkdir(snapshotDir, { recursive: true });

    await escribirJSON(path.join(snapshotDir, "medicion.json"), {
        runId,
        tipoEjecucion,
        slotProgramado: slot,
        totalArcosSolicitados: arcos.length,
        totalArcosExitosos: medicionesEnriquecidas.length,
        totalErrores: errores.length,
        errores,
        mediciones: medicionesEnriquecidas
    });

    await escribirTexto(
        path.join(snapshotDir, "medicion.csv"),
        convertirACSV(medicionesEnriquecidas, COLUMNAS_ULTIMA)
    );

    await escribirJSON(path.join(snapshotDir, "arcos_pesados.json"), {
        runId,
        slotProgramado: slot,
        unidadPeso: "segundos",
        arcos: arcosPonderados
    });

    await escribirJSON(path.join(snapshotDir, "matriz_costos.json"), {
        runId,
        slotProgramado: slot,
        descripcion: "Matriz de costos W(t)",
        unidad: "segundos",
        valorSinConexion: null,
        nodos,
        matriz
    });

    await escribirTexto(path.join(snapshotDir, "matriz_costos.csv"), matrizCsvTexto);

    console.log("\n=============================================");
    console.log(" RESULTADOS");
    console.log("=============================================\n");

    console.table(
        medicionesEnriquecidas.map((m) => ({
            Arco: m.idArco,
            Origen: m.nodoOrigen,
            Destino: m.nodoDestino,
            Hora: m.horaProgramada,
            Distancia_m: m.distanciaMetros,
            Tiempo_s: m.duracionTraficoSeg,
            Velocidad_kmh: m.velocidadTraficoKmh,
            t0_s: m.t0ObservadoSeg,
            CI: m.indiceCongestion,
            Estado: m.estadoTrafico,
            Peso_s: m.pesoSegundos
        }))
    );

    console.log(`\nMediciones exitosas: ${medicionesEnriquecidas.length}`);
    console.log(`Errores: ${errores.length}`);
    console.log(`Slot guardado: ${slot}`);
    console.log(`Snapshot: ${snapshotDir}`);
    console.log("\nEl histórico continúa acumulándose en data/mediciones_trafico.*\n");

    return {
        runId,
        slotProgramado: slot,
        exitosas: medicionesEnriquecidas.length,
        errores: errores.length
    };
}

if (require.main === module) {
    ejecutarMedicionCompleta({ tipoEjecucion: "manual" }).catch((error) => {
        console.error("\nERROR FATAL:");
        console.error(error.message);
        // Evita cierres forzados de handles asíncronos en Windows.
        process.exitCode = 1;
    });
}

module.exports = {
    ejecutarMedicionCompleta
};
