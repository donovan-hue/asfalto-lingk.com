import cors from 'cors';
import express from 'express';
import {login, requireAuth} from './modules/auth/auth.js';
import {databaseReady, pool} from './database.js';
import {env} from './config/env.js';
import {createUser, createUserSchema, findUser, updateUserStatus, updateUserStatusSchema} from './modules/users.js';
import {logger} from './logger.js';
import {requestContext} from './middleware.js';
import {failure, success} from './response.js';
import {revokeRefreshToken, rotateRefreshToken} from './modules/auth/tokens.js';
import {audit} from './audit.js';
import {findCompany} from './modules/companies.js';
import {clientSchema, createClient, listClients} from './modules/clients.js';
import {createDriver, createVehicle, driverSchema, listDrivers, listVehicles, vehicleSchema} from './modules/fleet.js';
import {assignShipment, assignmentSchema, changeStatus, createShipment, findShipment, listShipments, shipmentSchema, statusSchema} from './modules/shipments.js';
import {apiRateLimit, authRateLimit} from './rate-limit.js';
import helmet from 'helmet';
import * as Sentry from '@sentry/node';

export const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet());
const allowedOrigins = new Set(env.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean));
app.use(cors({ origin: (origin, callback) => { if (!origin || allowedOrigins.has(origin)) callback(null, true); else callback(new Error('Origin not allowed')); }, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(requestContext);
app.use('/api/', apiRateLimit);
app.use('/api/v1/auth/login', authRateLimit);

app.get('/health', async (_request, response) => {
  const dbReady = await databaseReady();
  response.status(dbReady ? 200 : 503).json({
    status: dbReady ? 'ok' : 'degraded',
    dependencies: { database: dbReady ? 'ok' : 'unavailable' },
    service: 'mamalones-api',
    timestamp: new Date().toISOString(),
  });
});

app.post('/api/v1/auth/login', async (request, response) => {
  const {email, password} = request.body as {email?: string; password?: string};
  if (!email || !password) { failure(response, 400, 'VALIDATION_ERROR', 'Email y contraseña son requeridos'); return; }
  try {
    const result = await login(email, password);
    if (!result) { failure(response, 401, 'INVALID_CREDENTIALS', 'Credenciales incorrectas'); return; }
    success(response, result);
  } catch (error) {
    logger.error({err: error}, 'authentication database failure');
    failure(response, 503, 'AUTH_SERVICE_UNAVAILABLE', 'El servicio de autenticación no está disponible');
  }
});

app.post('/api/v1/auth/refresh', async (request, response) => {
  const token = request.body?.refreshToken;
  if (typeof token !== 'string' || !token) { failure(response, 400, 'VALIDATION_ERROR', 'refreshToken es requerido'); return; }
  try { const result = await rotateRefreshToken(token); if (!result) { failure(response, 401, 'INVALID_REFRESH_TOKEN', 'Refresh token inválido o expirado'); return; } success(response, result); }
  catch (error) { logger.error({err:error}, 'refresh token failure'); failure(response, 503, 'AUTH_SERVICE_UNAVAILABLE', 'El servicio de autenticación no está disponible'); }
});
app.post('/api/v1/auth/logout', async (request, response) => {
  const token = request.body?.refreshToken;
  if (typeof token === 'string' && token) { try { await revokeRefreshToken(token); } catch (error) { logger.error({err:error}, 'logout failure'); failure(response, 503, 'AUTH_SERVICE_UNAVAILABLE', 'El servicio de autenticación no está disponible'); return; } }
  response.status(204).send();
});

app.get('/api/v1/auth/me', requireAuth, (request, response) => { success(response, {user: request.user}); });

app.get('/api/v1/shipments/:id/timeline', requireAuth, async (request,response)=>{try{const result=await pool.query('SELECT id,old_status,new_status,changed_by,created_at FROM shipment_status_history WHERE company_id=$1 AND shipment_id=$2 ORDER BY created_at ASC',[request.user!.companyId,String(request.params.id)]);success(response,result.rows);}catch(error){logger.error({err:error},'shipment timeline failure');failure(response,503,'SHIPMENT_SERVICE_UNAVAILABLE','El servicio de envíos no está disponible');}});
app.get('/api/v1/shipments/:id', requireAuth, async (request,response)=>{try{const shipment=await findShipment(request.user!.companyId,String(request.params.id));if(!shipment){failure(response,404,'SHIPMENT_NOT_FOUND','Envío no encontrado');return;}success(response,shipment);}catch(error){logger.error({err:error},'shipment detail failure');failure(response,503,'SHIPMENT_SERVICE_UNAVAILABLE','El servicio de envíos no está disponible');}});
app.patch('/api/v1/shipments/:id/assign', requireAuth, async (request,response)=>{if(request.user!.role==='client'){failure(response,403,'FORBIDDEN','Permiso insuficiente');return;}const parsed=assignmentSchema.safeParse(request.body);if(!parsed.success){failure(response,400,'VALIDATION_ERROR','Asignación inválida',parsed.error.flatten().fieldErrors);return;}try{const result=await assignShipment(request.user!.companyId,String(request.params.id),parsed.data.vehicleId,parsed.data.driverId,request.user!.sub);if(result.kind==='not_found'){failure(response,404,'SHIPMENT_NOT_FOUND','Envío no encontrado');return;}if(result.kind==='unavailable'){failure(response,409,'RESOURCE_UNAVAILABLE','Vehículo o conductor no disponible');return;}await audit({userId:request.user!.sub,companyId:request.user!.companyId,action:'shipment.assigned',tableName:'shipments',recordId:result.shipment.id,newValues:{vehicleId:parsed.data.vehicleId,driverId:parsed.data.driverId}});success(response,result.shipment);}catch(error){logger.error({err:error},'shipment assignment failure');failure(response,503,'SHIPMENT_SERVICE_UNAVAILABLE','El servicio de envíos no está disponible');}});

app.get('/api/v1/shipments', requireAuth, async (request,response)=>{try{success(response,await listShipments(request.user!.companyId,typeof request.query.status==='string'?request.query.status:undefined));}catch(error){logger.error({err:error},'shipments list failure');failure(response,503,'SHIPMENT_SERVICE_UNAVAILABLE','El servicio de envíos no está disponible');}});
app.post('/api/v1/shipments', requireAuth, async (request,response)=>{if(request.user!.role==='client'){failure(response,403,'FORBIDDEN','Permiso insuficiente');return;}const parsed=shipmentSchema.safeParse(request.body);if(!parsed.success){failure(response,400,'VALIDATION_ERROR','Datos de envío inválidos',parsed.error.flatten().fieldErrors);return;}try{const shipment=await createShipment(request.user!.companyId,parsed.data);await audit({userId:request.user!.sub,companyId:request.user!.companyId,action:'shipment.created',tableName:'shipments',recordId:shipment.id,newValues:{folio:shipment.folio,status:shipment.status}});success(response,shipment,201);}catch(error){logger.error({err:error},'shipment create failure');failure(response,503,'SHIPMENT_SERVICE_UNAVAILABLE','El servicio de envíos no está disponible');}});
app.patch('/api/v1/shipments/:id/status', requireAuth, async (request,response)=>{if(request.user!.role==='client'){failure(response,403,'FORBIDDEN','Permiso insuficiente');return;}const parsed=statusSchema.safeParse(request.body);if(!parsed.success){failure(response,400,'VALIDATION_ERROR','Estado inválido',parsed.error.flatten().fieldErrors);return;}try{const result=await changeStatus(request.user!.companyId,String(request.params.id),parsed.data.status,request.user!.sub);if(result.kind==='not_found'){failure(response,404,'SHIPMENT_NOT_FOUND','Envío no encontrado');return;}if(result.kind==='invalid_transition'){failure(response,409,'INVALID_STATUS_TRANSITION','Transición de estado no permitida',{from:result.from,to:parsed.data.status});return;}success(response,result.shipment);}catch(error){logger.error({err:error},'shipment status failure');failure(response,503,'SHIPMENT_SERVICE_UNAVAILABLE','El servicio de envíos no está disponible');}});

app.get('/api/v1/fleet/drivers', requireAuth, async (request,response)=>{try{success(response,await listDrivers(request.user!.companyId,request.query.available==='true'));}catch(error){logger.error({err:error},'drivers list failure');failure(response,503,'FLEET_SERVICE_UNAVAILABLE','El servicio de flota no está disponible');}});
app.get('/api/v1/fleet/vehicles', requireAuth, async (request,response)=>{try{success(response,await listVehicles(request.user!.companyId,request.query.available==='true'));}catch(error){logger.error({err:error},'vehicles list failure');failure(response,503,'FLEET_SERVICE_UNAVAILABLE','El servicio de flota no está disponible');}});
app.post('/api/v1/fleet/drivers', requireAuth, async (request,response)=>{if(request.user!.role==='client'){failure(response,403,'FORBIDDEN','Permiso insuficiente');return;}const parsed=driverSchema.safeParse(request.body);if(!parsed.success){failure(response,400,'VALIDATION_ERROR','Datos de conductor inválidos',parsed.error.flatten().fieldErrors);return;}try{const driver=await createDriver(request.user!.companyId,parsed.data);await audit({userId:request.user!.sub,companyId:request.user!.companyId,action:'driver.created',tableName:'drivers',recordId:driver.id});success(response,driver,201);}catch(error){logger.error({err:error},'driver create failure');failure(response,503,'FLEET_SERVICE_UNAVAILABLE','El servicio de flota no está disponible');}});
app.post('/api/v1/fleet/vehicles', requireAuth, async (request,response)=>{if(request.user!.role==='client'){failure(response,403,'FORBIDDEN','Permiso insuficiente');return;}const parsed=vehicleSchema.safeParse(request.body);if(!parsed.success){failure(response,400,'VALIDATION_ERROR','Datos de vehículo inválidos',parsed.error.flatten().fieldErrors);return;}try{const vehicle=await createVehicle(request.user!.companyId,parsed.data);await audit({userId:request.user!.sub,companyId:request.user!.companyId,action:'vehicle.created',tableName:'vehicles',recordId:vehicle.id});success(response,vehicle,201);}catch(error){logger.error({err:error},'vehicle create failure');failure(response,503,'FLEET_SERVICE_UNAVAILABLE','El servicio de flota no está disponible');}});

app.get('/api/v1/clients', requireAuth, async (request,response)=>{try{success(response,await listClients(request.user!.companyId));}catch(error){logger.error({err:error},'clients list failure');failure(response,503,'CLIENT_SERVICE_UNAVAILABLE','El servicio de clientes no está disponible');}});
app.post('/api/v1/clients', requireAuth, async (request,response)=>{if(!['admin','dispatcher'].includes(request.user!.role)){failure(response,403,'FORBIDDEN','Permiso insuficiente');return;}const parsed=clientSchema.safeParse(request.body);if(!parsed.success){failure(response,400,'VALIDATION_ERROR','Datos de cliente inválidos',parsed.error.flatten().fieldErrors);return;}try{const client=await createClient(request.user!.companyId,parsed.data);await audit({userId:request.user!.sub,companyId:request.user!.companyId,action:'client.created',tableName:'clients',recordId:client.id,newValues:{code:client.code,name:client.name}});success(response,client,201);}catch(error:unknown){if((error as {code?:string}).code==='23505'){failure(response,409,'CLIENT_CODE_EXISTS','El código de cliente ya existe');return;}logger.error({err:error},'client create failure');failure(response,503,'CLIENT_SERVICE_UNAVAILABLE','El servicio de clientes no está disponible');}});

app.get('/api/v1/company', requireAuth, async (request, response) => { try { const company=await findCompany(request.user!.companyId); if(!company){failure(response,404,'COMPANY_NOT_FOUND','Empresa no encontrada');return;} success(response,company); } catch(error){logger.error({err:error},'company detail failure');failure(response,503,'COMPANY_SERVICE_UNAVAILABLE','El servicio de empresas no está disponible');} });



app.post('/api/v1/users', requireAuth, async (request, response) => {
  if (request.user!.role !== 'admin') { failure(response, 403, 'FORBIDDEN', 'Permiso insuficiente'); return; }
  const parsed = createUserSchema.safeParse(request.body);
  if (!parsed.success) { failure(response, 400, 'VALIDATION_ERROR', 'Datos de usuario inválidos', parsed.error.flatten().fieldErrors); return; }
  try {
    const user = await createUser(request.user!.companyId, parsed.data);
    await audit({userId:request.user!.sub, companyId:request.user!.companyId, action:'user.created', tableName:'users', recordId:user.id, newValues:{email:user.email,role:user.role}});
    success(response, user, 201);
  } catch (error: unknown) {
    const code = (error as {code?:string}).code;
    if (code === '23505') { failure(response, 409, 'USER_ALREADY_EXISTS', 'El correo ya está registrado'); return; }
    logger.error({err: error}, 'users create failure');
    failure(response, 503, 'USER_SERVICE_UNAVAILABLE', 'El servicio de usuarios no está disponible');
  }
});

app.get('/api/v1/users/:id', requireAuth, async (request, response) => { try { const user=await findUser(request.user!.companyId,String(request.params.id)); if(!user){failure(response,404,'USER_NOT_FOUND','Usuario no encontrado');return;} success(response,user); } catch(error){logger.error({err:error},'user detail failure');failure(response,503,'USER_SERVICE_UNAVAILABLE','El servicio de usuarios no está disponible');} });
app.patch('/api/v1/users/:id/status', requireAuth, async (request, response) => { if(request.user!.role!=='admin'){failure(response,403,'FORBIDDEN','Permiso insuficiente');return;} const parsed=updateUserStatusSchema.safeParse(request.body); if(!parsed.success){failure(response,400,'VALIDATION_ERROR','Estado inválido',parsed.error.flatten().fieldErrors);return;} try{const user=await updateUserStatus(request.user!.companyId,String(request.params.id),parsed.data.isActive);if(!user){failure(response,404,'USER_NOT_FOUND','Usuario no encontrado');return;}await audit({userId:request.user!.sub,companyId:request.user!.companyId,action:parsed.data.isActive?'user.activated':'user.deactivated',tableName:'users',recordId:user.id,newValues:{isActive:user.is_active}});success(response,user);}catch(error){logger.error({err:error},'user status failure');failure(response,503,'USER_SERVICE_UNAVAILABLE','El servicio de usuarios no está disponible');} });

app.get('/api/v1/users', requireAuth, async (request, response) => {
  try {
    const result = await pool.query('SELECT id, email, first_name, last_name, role, is_active, created_at FROM users WHERE company_id=$1 ORDER BY created_at DESC', [request.user!.companyId]);
    success(response, result.rows);
  } catch (error) {
    logger.error({err: error}, 'users list failure');
    failure(response, 503, 'USER_SERVICE_UNAVAILABLE', 'El servicio de usuarios no está disponible');
  }
});

app.get('/api/v1', (_request, response) => {
  response.json({ name: 'Mamalones API', version: 'v1', status: 'ready' });
});

app.use((_request, response) => {
  failure(response, 404, 'NOT_FOUND', 'Ruta no encontrada');
});

app.use((error: Error, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  if (error.message === 'Origin not allowed') {
    failure(response, 403, 'CORS_ORIGIN_NOT_ALLOWED', 'Origen no autorizado');
    return;
  }
  Sentry.captureException(error);
  logger.error({err: error}, 'unhandled request error');
  failure(response, 500, 'INTERNAL_SERVER_ERROR', 'Error interno del servidor');
});
