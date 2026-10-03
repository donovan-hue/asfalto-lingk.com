import 'dotenv/config';
import { z } from 'zod';
const schema=z.object({NODE_ENV:z.enum(['development','test','staging','production']).default('development'),PORT:z.coerce.number().int().positive().default(4000),DATABASE_URL:z.string().url().default('postgresql://mamalones:mamalones_dev_password@localhost:5432/mamalones'),JWT_SECRET:z.string().min(32).default('mamalones-development-secret-change-me-32'),VITE_API_BASE_URL:z.string().url().optional(),ALLOWED_ORIGINS:z.string().default('http://localhost:5173'),SENTRY_DSN:z.string().url().optional(),SENTRY_ENVIRONMENT:z.string().default('development')});
export const env=schema.parse(process.env);
if(env.NODE_ENV==='production'&&env.JWT_SECRET==='mamalones-development-secret-change-me-32')throw new Error('JWT_SECRET must be explicitly configured in production');
if(env.NODE_ENV==='production'&&env.ALLOWED_ORIGINS.includes('localhost'))throw new Error('ALLOWED_ORIGINS must not include localhost in production');
