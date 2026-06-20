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
import { openapiSpec } from './openapi';

const app = new Hono<{ Bindings: Bindings; Variables: AppVariables }>();

app.use('*', async (c, next) => {
  const corsMiddleware = cors({
    origin: (origin) => {
      if (!origin) return 'http://localhost:4200';

      const allowedOrigins = [
        'http://localhost:4200',
        'https://ot-assitant.netlify.app',
        'https://ot-assistant.netlify.app',
        'https://ot-assistant.otconnect.ir',
        'http://ot-assistant.otconnect.ir',
        'https://ot-api-dev.otconnect.ir',
        'http://ot-api-dev.otconnect.ir'
      ];

      if (allowedOrigins.includes(origin) || origin.endsWith('.netlify.app')) {
        return origin;
      }

      if (c.env.CORS_ORIGIN) {
        if (c.env.CORS_ORIGIN === '*') {
          return origin;
        }
        const envOrigins = c.env.CORS_ORIGIN.split(',').map(o => o.trim());
        if (envOrigins.includes(origin)) {
          return origin;
        }
      }

      return 'http://localhost:4200';
    },
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['POST', 'GET', 'OPTIONS', 'PATCH', 'PUT', 'DELETE'],
    maxAge: 600,
  });
  return corsMiddleware(c, next);
});

// Auth middleware applied to all routes except health
app.use('/api/v1/*', clerkAuth());

app.get('/openapi.json', (c) => {
  return c.json(openapiSpec);
});

app.get('/swagger', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>OT Assistant API - Swagger UI</title>
      <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
      <style>
        html { box-sizing: border-box; overflow-y: scroll; }
        *, *:before, *:after { box-sizing: inherit; }
        body { margin: 0; background: #fafafa; }
      </style>
    </head>
    <body>
      <div id="swagger-ui"></div>
      <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
      <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-standalone-preset.js"></script>
      <script>
        window.onload = () => {
          window.ui = SwaggerUIBundle({
            url: '/openapi.json',
            dom_id: '#swagger-ui',
            deepLinking: true,
            presets: [
              SwaggerUIBundle.presets.apis,
              SwaggerUIStandalonePreset
            ],
            layout: "BaseLayout"
          });
        };
      </script>
    </body>
    </html>
  `);
});

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

app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json({
    error: 'Internal Server Error',
    message: err.message,
    stack: err.stack,
  }, 500);
});

export default app;
