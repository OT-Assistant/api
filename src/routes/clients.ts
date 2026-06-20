import { Hono } from 'hono';
import { Bindings, AppVariables } from '../types/env';
import { requireRole } from '../middleware/auth';

const app = new Hono<{ Bindings: Bindings; Variables: AppVariables }>();

// Simple therapist CRUD for clients
app.use('/*', requireRole(['therapist', 'admin']));

app.get('/', async (c) => {
  const therapistId = c.get('userId');
  
  const clients = await c.env.DB.prepare(
    `SELECT c.*, 
            COALESCE((
              SELECT COUNT(*)
              FROM messages m
              WHERE m.client_id = c.id
                AND m.sender_user_id != c.therapist_user_id
                AND m.read_at IS NULL
            ), 0) AS unread_message_count,
            (
              SELECT MAX(activity_time)
              FROM (
                SELECT completed_at AS activity_time FROM activity_completions WHERE client_id = c.id
                UNION ALL
                SELECT created_at AS activity_time FROM messages WHERE client_id = c.id
              )
            ) AS last_active_at
       FROM clients c
       WHERE c.therapist_user_id = ?`
  )
    .bind(therapistId)
    .all();

  const normalized = [];
  for (const client of (clients.results || [])) {
    const plan = await c.env.DB.prepare("SELECT id FROM plans WHERE client_id = ? AND status = 'active'").bind(client.id).first<{ id: string }>();
    let weeklyRate = 0;
    if (plan) {
      const activitiesCountRow = await c.env.DB.prepare("SELECT COUNT(*) as count FROM plan_activities WHERE plan_id = ?").bind(plan.id).first<{ count: number }>();
      const totalActs = activitiesCountRow?.count || 0;
      
      if (totalActs > 0) {
        const completedRow = await c.env.DB.prepare(
          `SELECT COUNT(DISTINCT activity_id) as count 
           FROM activity_completions 
           WHERE client_id = ? 
             AND completed_at >= datetime('now', '-7 days')
             AND activity_id IN (SELECT id FROM plan_activities WHERE plan_id = ?)`
        ).bind(client.id, plan.id).first<{ count: number }>();
        
        const completedActs = completedRow?.count || 0;
        weeklyRate = Math.round((completedActs / totalActs) * 100);
      }
    }
    
    normalized.push({
      ...client,
      unread_message_count: Number(client.unread_message_count || 0),
      last_active_at: client.last_active_at || null,
      weekly_completion_rate: weeklyRate
    });
  }
    
  return c.json(normalized);
});

app.post('/', async (c) => {
  const therapistId = c.get('userId');
  const body = await c.req.json();
  const { display_name, email, notes } = body;
  
  const id = crypto.randomUUID();
  await c.env.DB.prepare('INSERT INTO clients (id, therapist_user_id, display_name, status, notes, email) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, therapistId, display_name, 'active', notes || null, email || null)
    .run();
    
  const client = await c.env.DB.prepare('SELECT * FROM clients WHERE id = ?').bind(id).first();
  return c.json(client);
});

app.get('/:id', async (c) => {
  const therapistId = c.get('userId');
  const clientId = c.req.param('id');
  
  const client = await c.env.DB.prepare('SELECT * FROM clients WHERE id = ? AND therapist_user_id = ?')
    .bind(clientId, therapistId)
    .first();
    
  if (!client) return c.json({ error: 'Not found' }, 404);
  return c.json(client);
});

app.get('/:id/intake', async (c) => {
  const therapistId = c.get('userId');
  const clientId = c.req.param('id');
  
  const client = await c.env.DB.prepare('SELECT * FROM clients WHERE id = ? AND therapist_user_id = ?')
    .bind(clientId, therapistId)
    .first();
    
  if (!client) return c.json({ error: 'Client not found' }, 404);
  
  const intake = await c.env.DB.prepare('SELECT * FROM intakes WHERE client_id = ?').bind(clientId).first();
  return c.json(intake || null);
});

app.put('/:id', async (c) => {
  const therapistId = c.get('userId');
  const clientId = c.req.param('id');
  const body = await c.req.json();
  const { display_name, email, notes } = body;

  const client = await c.env.DB.prepare('SELECT id FROM clients WHERE id = ? AND therapist_user_id = ?')
    .bind(clientId, therapistId)
    .first();

  if (!client) {
    return c.json({ error: 'Client not found' }, 404);
  }

  await c.env.DB.prepare('UPDATE clients SET display_name = ?, email = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND therapist_user_id = ?')
    .bind(display_name, email || null, notes || null, clientId, therapistId)
    .run();

  const updatedClient = await c.env.DB.prepare('SELECT * FROM clients WHERE id = ?').bind(clientId).first();
  return c.json(updatedClient);
});

app.delete('/:id', async (c) => {
  const therapistId = c.get('userId');
  const clientId = c.req.param('id');

  const client = await c.env.DB.prepare('SELECT id FROM clients WHERE id = ? AND therapist_user_id = ?')
    .bind(clientId, therapistId)
    .first();

  if (!client) {
    return c.json({ error: 'Client not found' }, 404);
  }

  const statements = [
    c.env.DB.prepare('DELETE FROM activity_completions WHERE client_id = ?').bind(clientId),
    c.env.DB.prepare('DELETE FROM messages WHERE client_id = ?').bind(clientId),
    c.env.DB.prepare('DELETE FROM plan_activities WHERE plan_id IN (SELECT id FROM plans WHERE client_id = ?)').bind(clientId),
    c.env.DB.prepare('DELETE FROM plans WHERE client_id = ?').bind(clientId),
    c.env.DB.prepare('DELETE FROM intakes WHERE client_id = ?').bind(clientId),
    c.env.DB.prepare('DELETE FROM ai_generation_logs WHERE client_id = ?').bind(clientId),
    c.env.DB.prepare('DELETE FROM clients WHERE id = ? AND therapist_user_id = ?').bind(clientId, therapistId)
  ];

  await c.env.DB.batch(statements);

  return c.json({ success: true });
});

export default app;
