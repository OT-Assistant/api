import { Hono } from 'hono';
import { Bindings, AppVariables } from '../types/env';
import { requireRole } from '../middleware/auth';

const app = new Hono<{ Bindings: Bindings; Variables: AppVariables }>();

// Only admin can access backoffice routes
app.use('/*', requireRole(['admin']));

app.get('/users', async (c) => {
  const users = await c.env.DB.prepare('SELECT id, clerk_user_id, email, role FROM users').all();
  return c.json(users.results || []);
});

app.patch('/users/:id/role', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const { role } = body;
  
  if (!['therapist', 'client', 'admin'].includes(role)) {
    return c.json({ error: 'Invalid role' }, 400);
  }
  
  await c.env.DB.prepare('UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .bind(role, id)
    .run();
    
  return c.json({ success: true });
});

export default app;
