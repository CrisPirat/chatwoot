# Despliegue en VPS

Esta guia despliega la rama `reports` del fork de Chatwoot sin recrear PostgreSQL, Redis ni el almacenamiento existente. El proceso usa `deploy_vps.sh` y debe ejecutarse desde el clon en el VPS.

## Requisitos

- Docker Engine y Docker Compose v2 instalados.
- Git instalado.
- La red Docker externa `proxy_network` debe existir.
- El proxy debe enrutar al host Docker `chatwoot` en el puerto `3000` mediante HTTP.

Crear la red solo si todavia no existe:

```bash
docker network inspect proxy_network >/dev/null 2>&1 || docker network create proxy_network
```

No ejecutar `docker compose down`, `docker compose up` manualmente ni `--remove-orphans`. El VPS comparte la red con otros servicios.

## Instalacion inicial

Ejecutar una sola vez en un VPS sin el repositorio:

```bash
git clone --branch reports --single-branch https://github.com/CrisPirat/chatwoot.git /opt/omnicem-chatwoot
cd /opt/omnicem-chatwoot
cp .env.example .env
nano .env
```

El script requiere estas variables no vacias en `.env`:

```dotenv
POSTGRES_PASSWORD=reemplazar_por_un_valor_seguro
SECRET_KEY_BASE=reemplazar_por_un_valor_seguro
OMNICEM_URL=quitomotors.ocm
URL_REPORT=https://quitomotors.bkn.aigentss.cloud/webhook/sgc-report-chatwoot
```

Si el DNS de Docker resuelve `URL_REPORT` a una IP privada del contenedor, agregar esta variable:

```dotenv
URL_REPORT_ALLOW_PRIVATE_NETWORK=true
```

No usar `SAFE_FETCH_ALLOW_PRIVATE_NETWORK`. La variable especifica anterior permite red privada solo para el webhook SGC configurado.

## Despliegue

Desde el clon:

```bash
cd /opt/omnicem-chatwoot
BACKUP_DIR=/opt/backups/chatwoot ./deployment/deploy_vps.sh
```

El script realiza estas acciones:

1. Verifica el entorno y actualiza `origin/reports` con `git pull --ff-only`.
2. Conserva PostgreSQL, Redis, almacenamiento y `proxy_network`.
3. Crea un backup PostgreSQL en `/opt/backups/chatwoot`.
4. Construye la imagen para el commit actual.
5. Ejecuta `db:chatwoot_prepare`.
6. Recrea solo `chatwoot` y `chatwoot_sidekiq`.
7. Espera que `/health` responda correctamente.

El script se detiene si el checkout tiene cambios locales rastreados. No es necesario ejecutar `git pull` antes: el script lo hace.

## Verificacion

Comprobar los contenedores:

```bash
docker ps --filter name=chatwoot
```

Comprobar el informe SGC:

```bash
docker exec chatwoot bundle exec rails runner 'IntegrationSgc::ReportFetcher.new.perform; puts "OK"'
```

La ultima orden debe mostrar `OK`. Luego se puede recargar el panel de Integracion SGC.

Ver los logs si el despliegue o el informe fallan:

```bash
docker logs --tail=100 chatwoot
docker logs --tail=100 chatwoot_sidekiq
```

## Actualizaciones posteriores

Para desplegar un nuevo commit de `reports`, o despues de cambiar `URL_REPORT` u otra variable de `.env`, ejecutar de nuevo:

```bash
cd /opt/omnicem-chatwoot
BACKUP_DIR=/opt/backups/chatwoot ./deployment/deploy_vps.sh
```

Cada ejecucion crea un backup nuevo antes de aplicar migraciones o recrear los servicios.

## Problemas frecuentes

`proxy_network does not exist`

```bash
docker network create proxy_network
```

`SafeFetch::UnsafeUrlError` al consultar SGC

El host de `URL_REPORT` esta resolviendo a una IP privada. Confirmar que `.env` contiene:

```dotenv
URL_REPORT_ALLOW_PRIVATE_NETWORK=true
```

Despues ejecutar de nuevo el script de despliegue.

`The deployment checkout has tracked local changes`

Revisar los cambios antes de desplegar:

```bash
cd /opt/omnicem-chatwoot
git status
```

No descartar cambios locales sin revisar su origen.
