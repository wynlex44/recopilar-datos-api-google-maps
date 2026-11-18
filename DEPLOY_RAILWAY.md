# Despliegue en Railway

La configuración recomendada para este proyecto es un **servicio persistente** de Railway con un **Volume** montado en `/app/data`.

## 1. Subir el código a GitHub

Crea un repositorio privado y sube el proyecto.

No subas `.env`; ya está incluido en `.gitignore`.

## 2. Crear el servicio

En Railway:

1. New Project.
2. Deploy from GitHub Repo.
3. Selecciona el repositorio.
4. Railway detectará Node.js y ejecutará `npm start`.

## 3. Variables

Agrega al servicio:

```env
GOOGLE_MAPS_API_KEY=TU_CLAVE_REAL
ROUTING_PREFERENCE=TRAFFIC_AWARE
REQUEST_DELAY_MS=300
REQUEST_TIMEOUT_MS=30000
MAX_RETRIES=3
DISTANCE_TOLERANCE_PCT=60

SCHEDULE_START_HOUR=6
SCHEDULE_END_HOUR=18
SCHEDULE_DAYS=1
SCHEDULE_TIMEZONE=America/Bogota
RUN_ON_START=false

DATA_DIR=/app/data
DOWNLOAD_TOKEN=GENERA_UN_TOKEN_LARGO_Y_ALEATORIO
```

No es necesario definir `PORT`; Railway lo proporciona.

## 4. Volumen persistente

Agrega un Volume al servicio y configura el Mount Path:

```text
/app/data
```

Esto es indispensable: el histórico se escribe en esa carpeta y debe sobrevivir reinicios y despliegues.

## 5. Dominio

En Networking genera un dominio público.

La página de descarga quedará disponible en:

```text
https://TU-DOMINIO/?token=TU_DOWNLOAD_TOKEN
```

Desde ahí puedes descargar `mediciones_trafico.csv`, que contiene el histórico acumulado.

## 6. Probar sin esperar al lunes

Antes de desplegar, en tu computador puedes ejecutar:

```bash
npm run once
```

En Railway, si quieres comprobar una ejecución inmediatamente, cambia temporalmente:

```env
RUN_ON_START=true
```

Haz un redeploy, verifica los datos y luego vuelve a:

```env
RUN_ON_START=false
```

para evitar mediciones fuera de los horarios definidos.

## Configurar otros días

Solo lunes:

```env
SCHEDULE_DAYS=1
```

Lunes a viernes:

```env
SCHEDULE_DAYS=1-5
```

Todos los días:

```env
SCHEDULE_DAYS=*
```
