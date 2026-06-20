import { Hono } from 'hono';
import { Bindings, AppVariables } from '../types/env';

const app = new Hono<{ Bindings: Bindings; Variables: AppVariables }>();

app.get('/', async (c) => {
  const userId = c.get('userId');
  
  // Check if user exists in D1
  let user = await c.env.DB.prepare('SELECT * FROM users WHERE clerk_user_id = ?')
    .bind(userId)
    .first();
    
  if (!user) {
    // Return empty state or basic info, the frontend can POST to sync
    return c.json({ id: null, clerk_user_id: userId, role: 'none', name: null, email: null });
  }
  
  return c.json(user);
});

app.post('/', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();
  const { name, email } = body;
  
  let user: any = await c.env.DB.prepare('SELECT * FROM users WHERE clerk_user_id = ?')
    .bind(userId)
    .first();
    
  if (!user && email) {
    // Check if user exists by email (clerk_user_id might have changed due to recreation)
    const existingUser = await c.env.DB.prepare('SELECT * FROM users WHERE email = ?')
      .bind(email)
      .first();
      
    if (existingUser) {
      await c.env.DB.prepare('UPDATE users SET clerk_user_id = ?, name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .bind(userId, name, existingUser.id)
        .run();
        
      user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(existingUser.id).first();
      if (user && user.role === 'client' && user.email) {
        await linkClientByEmail(c.env.DB, userId, user.email);
      }
      return c.json(user);
    }
  }
  
  if (!user) {
    let initialRole = 'none';
    if (email) {
      const existingClient = await c.env.DB.prepare('SELECT id FROM clients WHERE email = ?')
        .bind(email)
        .first();
      if (existingClient) {
        initialRole = 'client';
      }
    }

    const id = crypto.randomUUID();
    await c.env.DB.prepare('INSERT INTO users (id, clerk_user_id, role, name, email) VALUES (?, ?, ?, ?, ?)')
      .bind(id, userId, initialRole, name, email)
      .run();
      
    user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
  } else {
    await c.env.DB.prepare('UPDATE users SET name = ?, email = ?, updated_at = CURRENT_TIMESTAMP WHERE clerk_user_id = ?')
      .bind(name, email, userId)
      .run();
      
    user = await c.env.DB.prepare('SELECT * FROM users WHERE clerk_user_id = ?').bind(userId).first();
  }
  
  // If user role is client, attempt auto-linking to any existing invited client profile
  if (user && user.role === 'client' && user.email) {
    await linkClientByEmail(c.env.DB, userId, user.email);
  }
  
  return c.json(user);
});

app.put('/role', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();
  const { role } = body;
  
  if (!['therapist', 'client', 'none'].includes(role)) {
    return c.json({ error: 'Invalid role' }, 400);
  }
  
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE clerk_user_id = ?')
    .bind(userId)
    .first<{ role: string; email: string | null }>();
    
  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }
  
  await c.env.DB.prepare('UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE clerk_user_id = ?')
    .bind(role, userId)
    .run();

  if (role === 'client' && user.email) {
    await linkClientByEmail(c.env.DB, userId, user.email);
  }
     
  const updatedUser = await c.env.DB.prepare('SELECT * FROM users WHERE clerk_user_id = ?').bind(userId).first();
  return c.json(updatedUser);
});

app.get('/intake', async (c) => {
  const userId = c.get('userId');
  const client = await c.env.DB.prepare('SELECT id FROM clients WHERE client_user_id = ?')
    .bind(userId)
    .first<{ id: string }>();
    
  if (!client) {
    return c.json({ error: 'Client profile not found. Please ask your therapist to add you.' }, 404);
  }
  
  const intake = await c.env.DB.prepare('SELECT * FROM intakes WHERE client_id = ?')
    .bind(client.id)
    .first();
    
  return c.json(intake || null);
});

app.put('/intake', async (c) => {
  const userId = c.get('userId');
  const client = await c.env.DB.prepare('SELECT id FROM clients WHERE client_user_id = ?')
    .bind(userId)
    .first<{ id: string }>();
    
  if (!client) {
    return c.json({ error: 'Client profile not found. Please ask your therapist to add you.' }, 404);
  }
  
  const body = await c.req.json();
  const { goals, challenges } = body;
  const goalsJson = JSON.stringify([goals]);
  
  const existing = await c.env.DB.prepare('SELECT id FROM intakes WHERE client_id = ?')
    .bind(client.id)
    .first();
    
  if (existing) {
    await c.env.DB.prepare('UPDATE intakes SET goals_json = ?, daily_challenges = ?, updated_at = CURRENT_TIMESTAMP WHERE client_id = ?')
      .bind(goalsJson, challenges || null, client.id)
      .run();
  } else {
    await c.env.DB.prepare('INSERT INTO intakes (id, client_id, goals_json, daily_challenges) VALUES (?, ?, ?, ?)')
      .bind(crypto.randomUUID(), client.id, goalsJson, challenges || null)
      .run();
  }
  
  const updated = await c.env.DB.prepare('SELECT * FROM intakes WHERE client_id = ?')
    .bind(client.id)
    .first();
    
  return c.json(updated);
});

async function linkClientByEmail(db: D1Database, clerkUserId: string, email: string) {
  const clientProfile = await db.prepare('SELECT id FROM clients WHERE email = ? AND client_user_id IS NULL')
    .bind(email)
    .first<{ id: string }>();
    
  if (clientProfile) {
    await db.prepare('UPDATE clients SET client_user_id = ?, status = "active", updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(clerkUserId, clientProfile.id)
      .run();
  }
}

export default app;
