# Cambios de la versión 2.0

- Se agregó recolección automática por horario.
- Configuración predeterminada: lunes, cada hora de 06:00 a 18:00 inclusive.
- Se agregaron `fechaMuestreo`, `diaSemana`, `horaProgramada` y `slotProgramado` al histórico.
- El archivo `mediciones_trafico.jsonl` continúa acumulando todas las observaciones.
- `mediciones_trafico.csv` se regenera a partir del histórico para mantener columnas consistentes.
- Se agregó `scheduler_state.json` para evitar repetir un mismo slot después de un reinicio.
- Se agregó un servidor HTTP para descargar los datos desde el navegador.
- Las descargas pueden protegerse con `DOWNLOAD_TOKEN`.
- `DATA_DIR` ahora puede configurarse para usar un volumen persistente en la nube.
- Se cambió `npm start` para iniciar el servicio automático.
- Se agregó `npm run once` para realizar una medición manual.
- Se eliminó cualquier API key de `.env.example`.
- Se agregó `DEPLOY_RAILWAY.md` con instrucciones de despliegue.
- Se agregaron snapshots por fecha y hora en `data/snapshots/YYYY-MM-DD/HH-00/`.
