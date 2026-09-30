# Inventario de servicios externos y credenciales

**Objetivo:** identificar qué cuentas deben contratarse/crearse antes de staging y producción. No registrar secretos en Git ni en documentos.

## 1. Servicios requeridos para el núcleo productivo

| Servicio | Uso | Credenciales/configuración | Ambiente |
|---|---|---|---|
| AWS | Infraestructura, red, cómputo y despliegue | `AWS_ACCOUNT_ID`, región, IAM/role de CI, OIDC, presupuesto | staging/prod |
| AWS Secrets Manager o SSM Parameter Store | Secretos y configuración sensible | ARNs, políticas IAM; no usar claves planas en CI | staging/prod |
| Amazon RDS PostgreSQL + PostGIS | Base de datos transaccional y geoespacial | endpoint, DB, usuario por secreto, TLS, security group | staging/prod |
| Amazon ElastiCache Redis | rate limiting, cache y jobs | endpoint, TLS, auth token, security group | staging/prod |
| Amazon S3 | documentos, evidencias y archivos | bucket por ambiente, IAM role, región, URLs firmadas, KMS | staging/prod |
| Route 53 + ACM | DNS y certificados TLS | dominio, hosted zone, certificados y validación DNS | staging/prod |
| Load Balancer / WAF | entrada HTTP, protección y reglas | listeners, certificados, Web ACL, IP/rate rules | staging/prod |

## 2. Servicios de negocio requeridos

| Servicio | Uso | Qué solicitar |
|---|---|---|
| Proveedor de mapas | geocoding, rutas, distancia, ETA, tráfico | API key restringida, project ID, APIs habilitadas, cuotas y billing |
| Proveedor GPS/telemática | posiciones de unidades y estados | cuenta empresarial, API/webhook, firma HMAC, sandbox, frecuencia, reintentos |
| PAC autorizado por SAT | CFDI 4.0 y Carta Porte | contrato, sandbox/prod, API key, usuario, certificado, pruebas de timbrado/cancelación |
| Proveedor de correo transaccional | avisos, recuperación y documentos | dominio remitente, API key/role, SPF, DKIM, DMARC, webhooks |
| Proveedor SMS | OTP, alertas e incidencias | cuenta, SID/API key, número remitente, plantillas, límites y webhook |
| Firebase Cloud Messaging | push móvil/web | proyecto Firebase, apps registradas, credenciales server-side, VAPID web |
| Servicio de monitoreo | errores y performance | DSN/API key, proyectos por ambiente, retención y PII scrubbing |

## 3. Servicios opcionales según alcance aprobado

| Servicio | Cuándo se requiere | Credenciales |
|---|---|---|
| Pasarela de pagos | si se cobra en línea | merchant account, public/private keys, webhook signing secret, sandbox/prod |
| OAuth Microsoft/Google | si se habilita inicio de sesión social | client ID/secret o workload identity, redirect URIs, scopes |
| Servicio de mapas avanzado | si se necesitan tráfico, matriz o optimización | APIs adicionales, cuotas y autorización de facturación |
| Servicio de firma electrónica | si documentos requieren firma | tenant, API key/certificado, callback y evidencias |
| Plataforma BI | si reportes salen del sistema | workspace, service principal/API key y dataset permissions |
| PagerDuty/Slack | si se requiere guardia operativa | integración, webhook, grupos y políticas de escalamiento |

## 4. Cuentas internas que también deben prepararse

- GitHub Organization: repositorio, branch protection, environments `development`, `staging`, `production`, reviewers y OIDC AWS.
- Registro de contenedores: ECR u otro, con escaneo y retención.
- Dominio oficial y subdominios por ambiente.
- Cuenta corporativa de soporte y buzones `no-reply`, `support` y `security`.
- Cuenta fiscal/administrativa con responsables de PAC y SAT.
- Dispositivos GPS de prueba y unidades asociadas.
- Dispositivos Android/iOS para pruebas de la PWA.

## 5. Variables a incorporar al inventario de configuración

Nombres sugeridos, sin valores reales:

```text
AWS_REGION
AWS_ACCOUNT_ID
AWS_ROLE_ARN
AWS_S3_BUCKET
AWS_KMS_KEY_ARN
DATABASE_URL
REDIS_URL
MAPS_PROVIDER
MAPS_API_KEY
GPS_PROVIDER_BASE_URL
GPS_PROVIDER_API_KEY
GPS_WEBHOOK_SECRET
PAC_BASE_URL
PAC_API_KEY
PAC_USERNAME
PAC_CERTIFICATE_SECRET_ARN
MAIL_PROVIDER_API_KEY
MAIL_FROM
SMS_PROVIDER_API_KEY
SMS_FROM
FIREBASE_PROJECT_ID
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY
SENTRY_DSN
PUBLIC_APP_URL
API_PUBLIC_URL
```

## 6. Orden recomendado para crear cuentas

1. Dominio, GitHub Organization y AWS Organizations/accounts.
2. AWS networking, IAM/OIDC, Secrets Manager, RDS, Redis, S3, Route 53, ACM y WAF.
3. Proveedor de mapas y GPS con sandbox.
4. PAC con sandbox y validación del responsable fiscal.
5. Email, SMS y Firebase.
6. Monitoreo, alertas y soporte.
7. Pagos, OAuth y firma electrónica sólo si el alcance aprobado los incluye.

## 7. Reglas de seguridad para las credenciales

- Nunca pegar secretos reales en Git, issues, documentación o chat.
- Crear credenciales separadas para development, staging y production.
- Usar roles temporales/OIDC para CI/CD en lugar de access keys permanentes.
- Restringir API keys por dominio, IP, API habilitada y cuota.
- Guardar secretos en Secrets Manager/Parameter Store y rotarlos.
- Habilitar MFA en cuentas administrativas.
- Registrar propietario, fecha de creación, fecha de rotación y procedimiento de revocación.
- Probar primero sandbox; no usar credenciales productivas en desarrollo.
