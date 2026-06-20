import { Hono } from 'hono';
import { Bindings, AppVariables } from '../types/env';

const app = new Hono<{ Bindings: Bindings; Variables: AppVariables }>();

async function getClientWithOwnership(c: any, clientId: string) {
  const userId = c.get('userId');
  const role = c.get('role');

  const client = await c.env.DB.prepare(
    'SELECT therapist_user_id, client_user_id FROM clients WHERE id = ?'
  )
    .bind(clientId)
    .first() as { therapist_user_id: string | null; client_user_id: string | null } | null;

  if (!client) {
    return null;
  }

  const isAuthorized =
    role === 'admin' ||
    (role === 'therapist' && client.therapist_user_id === userId) ||
    (role === 'client' && client.client_user_id === userId);

  if (!isAuthorized) {
    return { ...client, isAuthorized: false };
  }

  return { ...client, isAuthorized: true };
}

app.get('/client/:clientId', async (c) => {
  const clientId = c.req.param('clientId');
  const userId = c.get('userId');
  const authorizedClient = await getClientWithOwnership(c, clientId);

  if (!authorizedClient) {
    return c.json({ error: 'Client profile not found' }, 404);
  }

  if (!authorizedClient.isAuthorized) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  await c.env.DB.prepare(
    'UPDATE messages SET read_at = CURRENT_TIMESTAMP WHERE client_id = ? AND sender_user_id != ? AND read_at IS NULL'
  )
    .bind(clientId, userId)
    .run();

  const messages = await c.env.DB.prepare('SELECT * FROM messages WHERE client_id = ? ORDER BY created_at ASC')
    .bind(clientId)
    .all();

  return c.json(messages.results || []);
});

app.post('/client/:clientId', async (c) => {
  const clientId = c.req.param('clientId');
  const userId = c.get('userId');
  const authorizedClient = await getClientWithOwnership(c, clientId);

  if (!authorizedClient) {
    return c.json({ error: 'Client profile not found' }, 404);
  }

  if (!authorizedClient.isAuthorized) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const messageBody = body.body || body.text;

  if (!messageBody || typeof messageBody !== 'string' || messageBody.trim() === '') {
    return c.json({ error: 'Message body is required' }, 400);
  }

  const id = crypto.randomUUID();
  await c.env.DB.prepare('INSERT INTO messages (id, client_id, sender_user_id, body) VALUES (?, ?, ?, ?)')
    .bind(id, clientId, userId, messageBody.trim())
    .run();

  const message = await c.env.DB.prepare('SELECT * FROM messages WHERE id = ?')
    .bind(id)
    .first();

  return c.json(message);
});

export default app;
