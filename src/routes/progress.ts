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

// POST /activities/:activityId/completions
// Logs a new activity completion in the activity_completions table.
app.post('/activities/:activityId/completions', async (c) => {
  const userId = c.get('userId');
  const activityId = c.req.param('activityId');

  let body: any;
  try {
    body = await c.req.json();
  } catch (e) {
    body = {};
  }

  const { effort, note } = body;
  let resolvedClientId = body.clientId || body.client_id;

  if (!resolvedClientId) {
    // Fetch client ID based on logged-in user
    const client = await c.env.DB.prepare('SELECT id FROM clients WHERE client_user_id = ?')
      .bind(userId)
      .first<{ id: string }>();

    if (!client) {
      return c.json({ error: 'Client profile not found. If you are a therapist, please provide a clientId in the request body.' }, 404);
    }
    resolvedClientId = client.id;
  } else {
    const authorizedClient = await getClientWithOwnership(c, resolvedClientId);

    if (!authorizedClient) {
      return c.json({ error: 'Client profile not found' }, 404);
    }

    if (!authorizedClient.isAuthorized) {
      return c.json({ error: 'Forbidden' }, 403);
    }
  }

  const completionId = crypto.randomUUID();

  await c.env.DB.prepare(
    'INSERT INTO activity_completions (id, activity_id, client_id, effort, note) VALUES (?, ?, ?, ?, ?)'
  )
    .bind(
      completionId,
      activityId,
      resolvedClientId,
      effort !== undefined ? effort : null,
      note !== undefined ? note : null
    )
    .run();

  const completion = await c.env.DB.prepare('SELECT * FROM activity_completions WHERE id = ?')
    .bind(completionId)
    .first();

  return c.json(completion);
});

// GET /client/:clientId
// Returns all activity completions for clientId sorted by completed_at DESC with activity title.
app.get('/client/:clientId', async (c) => {
  const clientId = c.req.param('clientId');
  const authorizedClient = await getClientWithOwnership(c, clientId);

  if (!authorizedClient) {
    return c.json({ error: 'Client profile not found' }, 404);
  }

  if (!authorizedClient.isAuthorized) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  const completions = await c.env.DB.prepare(
    `SELECT ac.*, pa.title AS activity_title
       FROM activity_completions ac
       LEFT JOIN plan_activities pa ON ac.activity_id = pa.id
       WHERE ac.client_id = ?
       ORDER BY ac.completed_at DESC`
  )
    .bind(clientId)
    .all();

  return c.json(completions.results || []);
});

export default app;
