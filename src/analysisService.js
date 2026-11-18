const { clasificarCongestion, redondear, escaparCSV } = require("./utils");

function calcularTiemposReferencia(historico) {
    const tiemposMinimos = new Map();

    for (const medicion of historico) {
        const id = medicion.idArco;
        const tiempo = Number(medicion.duracionTraficoSeg);

        if (!id || !Number.isFinite(tiempo) || tiempo <= 0) continue;

        const actual = tiemposMinimos.get(id);
        if (actual === undefined || tiempo < actual) {
            tiemposMinimos.set(id, tiempo);
        }
    }

    return tiemposMinimos;
}

function enriquecerConCongestion(mediciones, tiemposReferencia) {
    return mediciones.map((medicion) => {
        const tiempo = Number(medicion.duracionTraficoSeg);
        const t0 = tiemposReferencia.get(medicion.idArco);
        let ci = null;

        if (Number.isFinite(t0) && t0 > 0 && Number.isFinite(tiempo)) {
            ci = (tiempo - t0) / t0;
        }

        return {
            ...medicion,
            t0ObservadoSeg: redondear(t0, 3),
            indiceCongestion: redondear(ci, 6),
            estadoTrafico: clasificarCongestion(ci)
        };
    });
}

function construirMatrizCostos(mediciones) {
    const nodosSet = new Set();

    for (const medicion of mediciones) {
        nodosSet.add(medicion.nodoOrigen);
        nodosSet.add(medicion.nodoDestino);
    }

    const nodos = Array.from(nodosSet).sort((a, b) =>
        String(a).localeCompare(String(b), "es", { numeric: true })
    );

    const indices = new Map(nodos.map((nodo, indice) => [nodo, indice]));
    const matriz = nodos.map((_, i) =>
        nodos.map((_, j) => (i === j ? 0 : null))
    );

    for (const medicion of mediciones) {
        const i = indices.get(medicion.nodoOrigen);
        const j = indices.get(medicion.nodoDestino);
        const peso = Number(medicion.pesoSegundos);

        if (i === undefined || j === undefined || !Number.isFinite(peso)) continue;

        if (matriz[i][j] === null || peso < matriz[i][j]) {
            matriz[i][j] = peso;
        }
    }

    return { nodos, matriz };
}

function matrizACSV(nodos, matriz) {
    const filas = [];

    filas.push(["Nodo", ...nodos].map(escaparCSV).join(","));

    for (let i = 0; i < nodos.length; i++) {
        const fila = [
            nodos[i],
            ...matriz[i].map((valor) => (valor === null ? "" : valor))
        ];
        filas.push(fila.map(escaparCSV).join(","));
    }

    return filas.join("\n");
}

module.exports = {
    calcularTiemposReferencia,
    enriquecerConCongestion,
    construirMatrizCostos,
    matrizACSV
};
