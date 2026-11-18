const fs = require("node:fs");
const fsp = require("node:fs/promises");
const { escaparCSV } = require("./utils");

async function agregarJSONL(archivo, objetos) {
    if (!objetos.length) return;

    const contenido = objetos.map((obj) => JSON.stringify(obj)).join("\n") + "\n";
    await fsp.appendFile(archivo, contenido, "utf8");
}

async function leerJSONL(archivo) {
    if (!fs.existsSync(archivo)) return [];

    const contenido = await fsp.readFile(archivo, "utf8");

    return contenido
        .split(/\r?\n/)
        .map((linea) => linea.trim())
        .filter(Boolean)
        .map((linea) => {
            try {
                return JSON.parse(linea);
            } catch {
                return null;
            }
        })
        .filter(Boolean);
}

function convertirACSV(datos, columnas) {
    const header = columnas.join(",");
    const filas = datos.map((objeto) =>
        columnas.map((columna) => escaparCSV(objeto[columna])).join(",")
    );

    return [header, ...filas].join("\n");
}

async function agregarHistoricoCSV(archivo, datos, columnas) {
    if (!datos.length) return;

    const existe = fs.existsSync(archivo);
    const filas = datos
        .map((objeto) => columnas.map((columna) => escaparCSV(objeto[columna])).join(","))
        .join("\n");

    const contenido = `${existe ? "" : columnas.join(",") + "\n"}${filas}\n`;
    await fsp.appendFile(archivo, contenido, "utf8");
}

async function escribirJSON(archivo, datos) {
    await fsp.writeFile(archivo, JSON.stringify(datos, null, 2), "utf8");
}

async function escribirTexto(archivo, texto) {
    await fsp.writeFile(archivo, texto, "utf8");
}

module.exports = {
    agregarJSONL,
    leerJSONL,
    convertirACSV,
    agregarHistoricoCSV,
    escribirJSON,
    escribirTexto
};
