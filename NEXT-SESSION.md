# Guía para la siguiente sesión

**Rama fija:** `arena/01a0c713-mamalones`  
**Último commit:** `9e34b3e`  
**Estado de trabajo:** limpio; cambios de documentación confirmados y enviados al remoto.

## Por dónde empezar

1. Leer `docs/production-readiness-report.md`.
2. Leer `docs/integrations/credentials-and-services-inventory.md`.
3. Confirmar qué proveedores fueron contratados y qué credenciales de sandbox ya están disponibles.
4. No solicitar ni pegar secretos en chat o Git.
5. Crear únicamente nombres de variables y configuración segura por ambiente.

## Siguiente bloque técnico recomendado

### 1. Completar configuración por ambiente

- Separar `development`, `test`, `staging` y `production`.
- Validar todas las variables mediante Zod.
- Agregar al `.env.example` sólo placeholders.
- Configurar secretos en AWS Secrets Manager/Parameter Store cuando exista AWS.
- Crear pruebas de arranque que confirmen que producción rechaza secretos y URLs inseguras.

### 2. Levantar staging local reproducible

- Ejecutar PostgreSQL con Docker Compose.
- Verificar migraciones y seed desde cero.
- Agregar PostGIS y validar extensiones.
- Agregar Redis al Compose sólo si se implementa el consumidor de jobs.
- Ejecutar pruebas contra una base real, no sólo respuestas controladas `503`.

### 3. Completar API antes de integraciones externas

- Sincronizar OpenAPI con todos los endpoints.
- Completar paginación, filtros y ordenamiento.
- Revisar autorización endpoint por endpoint contra `docs/security/rbac-mvp-matrix.md`.
- Agregar pruebas de aislamiento multi-tenant.
- Agregar idempotencia para operaciones de creación, asignación y webhooks.

### 4. Después integrar servicios externos

Orden:

1. Maps/geocoding.
2. GPS y webhooks.
3. Email.
4. SMS.
5. Firebase push.
6. S3/documentos.
7. PAC CFDI/Carta Porte, sólo con aprobación fiscal.

Usar sandbox primero y credenciales separadas por ambiente.

### 5. Validación obligatoria por cada cambio

```bash
npm run typecheck
npm run test --workspace @mamalones/api
npm run build
git status --short
```

Si hay cambios de infraestructura o base de datos, además:

```bash
docker compose down -v
# volver a levantar y comprobar migraciones desde cero
# no ejecutar en una base con datos que deban conservarse
```

## Qué no hacer

- No cambiar de rama.
- No borrar `.git` ni la raíz del repositorio.
- No sobrescribir archivos completos sin leerlos antes.
- No introducir secretos reales.
- No afirmar que una integración funciona sin sandbox o prueba automatizada.
- No usar `docker compose down -v` contra datos importantes.
- No pasar a CFDI productivo sin validación fiscal.

## Definición de terminado por bloque

Un bloque sólo se considera terminado cuando:

- El código compila.
- Las pruebas pasan.
- El build pasa.
- La documentación queda actualizada.
- El cambio está en un commit claro.
- La rama está limpia.
- El push termina correctamente.
- El workflow remoto, si existe, queda en verde.

## Estado conocido al cierre

- API: 17 pruebas aprobadas en la última ejecución.
- TypeScript: aprobado.
- Build API/frontend: aprobado.
- PostgreSQL local: anteriormente no estaba disponible; validar nuevamente antes de concluir que persistencia funciona.
- Documentación creada: ADR técnico, catálogo de errores, matriz RBAC, baseline de seguridad, reporte de producción e inventario de credenciales.
