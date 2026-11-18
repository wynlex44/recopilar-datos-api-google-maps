# API Maps — recolector automático de tráfico

Este proyecto consulta **Google Routes API** para cada arco de la red vial y guarda un histórico de tiempos, velocidades e índice de congestión.

## Qué hace ahora

Por defecto, el servicio queda encendido y ejecuta una medición completa **cada lunes, cada hora desde las 06:00 hasta las 18:00 inclusive**:

```text
06:00, 07:00, 08:00, 09:00, 10:00, 11:00, 12:00,
13:00, 14:00, 15:00, 16:00, 17:00, 18:00
```

Eso produce 13 estados de la red por cada lunes.

El horario es configurable desde variables de entorno.

## Comandos

Instalar:

```bash
npm install
```

Realizar una sola medición manual (útil para probar):

```bash
npm run once
```

Iniciar el recolector automático y el servidor de descargas:

```bash
npm start
```

## Configuración

Copia `.env.example` como `.env` y configura tu clave.

Variables importantes:

```env
SCHEDULE_START_HOUR=6
SCHEDULE_END_HOUR=18
SCHEDULE_DAYS=1
SCHEDULE_TIMEZONE=America/Bogota
RUN_ON_START=false
```

`SCHEDULE_DAYS`:

- `1`: solo lunes.
- `1-5`: lunes a viernes.
- `*`: todos los días.
- `0,6`: sábado y domingo.

El programador interno revisa la hora de Colombia y ejecuta una sola vez cada slot horario. También conserva un archivo `scheduler_state.json` para evitar duplicados después de reinicios.

## Datos guardados

El histórico principal nunca se reemplaza:

- `data/mediciones_trafico.jsonl`
- `data/mediciones_trafico.csv`

Cada registro incluye ahora:

- fecha de muestreo;
- día de la semana;
- hora programada;
- hora exacta en que el arco fue consultado;
- distancia;
- duración con tráfico;
- velocidad calculada;
- peso del arco;
- `t0` e índice de congestión en los archivos enriquecidos de la última medición.

Los archivos `ultima_medicion.*`, `arcos_pesados.json` y `matriz_costos.*` se actualizan en cada slot.

Además, cada horario se conserva por separado en:

```text
data/snapshots/YYYY-MM-DD/HH-00/
```

Por ejemplo:

```text
data/snapshots/2026-09-21/06-00/
data/snapshots/2026-09-21/07-00/
...
data/snapshots/2026-09-21/18-00/
```

Cada carpeta contiene la medición, los arcos ponderados y la matriz de costos de ese horario.

## Descargar los datos desde el navegador

Al ejecutar `npm start`, el proyecto también levanta un pequeño servidor web.

En local:

```text
http://localhost:3000/?token=TU_DOWNLOAD_TOKEN
```

Desde esa página puedes descargar el histórico CSV y JSONL, además de la última matriz y los últimos arcos ponderados.

El archivo más útil para análisis en Excel, Python o R es:

```text
mediciones_trafico.csv
```

## Despliegue recomendado: Railway

Este proyecto está preparado para funcionar como un servicio persistente en Railway.

1. Sube el proyecto a un repositorio privado de GitHub. **No subas `.env`.**
2. En Railway crea un proyecto y conecta el repositorio.
3. Agrega las variables de `.env.example` desde la sección Variables de Railway.
4. Agrega un volumen persistente y móntalo en:

```text
/app/data
```

5. Configura:

```env
DATA_DIR=/app/data
```

6. Genera un dominio público en Networking.
7. Abre:

```text
https://TU-DOMINIO/?token=TU_DOWNLOAD_TOKEN
```

Ahí podrás descargar el CSV acumulado sin entrar al servidor.

### Importante

Sin un volumen persistente, los archivos locales de muchos servicios cloud pueden desaparecer al reiniciar o volver a desplegar la aplicación.

## Seguridad

- Nunca publiques `.env`.
- Restringe la API key de Google en Google Cloud a la Routes API cuando sea posible.
- Usa un `DOWNLOAD_TOKEN` largo y aleatorio.
- Si una API key real llegó a guardarse o publicarse dentro de `.env.example`, rótala en Google Cloud antes de desplegar.

## Volumen de consultas

Si tienes 399 arcos, una jornada de 06:00 a 18:00 genera aproximadamente:

```text
399 arcos × 13 horarios = 5.187 consultas por día seleccionado
```

Por eso conviene revisar las cuotas y la facturación de Google antes de habilitar varios días de la semana.
