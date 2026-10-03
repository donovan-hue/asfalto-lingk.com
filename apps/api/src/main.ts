import * as Sentry from '@sentry/node';
import { env } from './config/env.js';
import { app } from './app.js';

if (env.SENTRY_DSN) {
  Sentry.init({dsn: env.SENTRY_DSN, environment: env.SENTRY_ENVIRONMENT});
}
import { closeDatabase } from './database.js';
import { logger } from './logger.js';

const port = env.PORT;

app.listen(port, '0.0.0.0', () => {
  logger.info({port}, 'Mamalones API listening');
});

async function shutdown(signal: string) { logger.info({signal}, 'API shutting down'); await closeDatabase(); process.exit(0); }
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
