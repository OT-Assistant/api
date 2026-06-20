import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Bindings, AppVariables } from './types/env';

import { clerkAuth } from './middleware/auth';
import meRoute from './routes/me';
import aiRoute from './routes/ai';
import backofficeRoute from './routes/backoffice';
import clientsRoute from './routes/clients';
import plansRoute from './routes/plans';
import messagesRoute from './routes/messages';
import progressRoute from './routes/progress';

const app = new Hono<{ Bindings: Bindings; Variables: AppVariables }>();

app.use('*', async (c, next) => {
  const corsMiddleware = cors({
    origin: c.env.CORS_ORIGIN || 'http://localhost:4200',
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['POST', 'GET', 'OPTIONS', 'PATCH', 'PUT', 'DELETE'],
    maxAge: 600,
  });
  return corsMiddleware(c, next);
});

// Auth middleware applied to all routes except health
app.use('/api/v1/*', clerkAuth());

app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.route('/api/v1/me', meRoute);
app.route('/api/v1/ai', aiRoute);
app.route('/api/v1/backoffice', backofficeRoute);
app.route('/api/v1/clients', clientsRoute);
app.route('/api/v1/plans', plansRoute);
app.route('/api/v1/messages', messagesRoute);
app.route('/api/v1/progress', progressRoute);

export default app;
