import { Hono } from 'hono';
import { Bindings, AppVariables } from '../types/env';
import { requireRole } from '../middleware/auth';

const app = new Hono<{ Bindings: Bindings; Variables: AppVariables }>();

function isAuthorizedClientAccess(row: { therapist_user_id: string | null; client_user_id: string | null } | null, userId: string, role: string) {
  if (!row) return false;
  return role === 'admin'
    || (role === 'therapist' && row.therapist_user_id === userId)
    || (role === 'client' && row.client_user_id === userId);
}

async function getClientOwnership(c: any, clientId: string) {
  const userId = c.get('userId');
  const role = c.get('role');

  const client = await c.env.DB.prepare('SELECT therapist_user_id, client_user_id FROM clients WHERE id = ?')
    .bind(clientId)
    .first() as { therapist_user_id: string | null; client_user_id: string | null } | null;

  if (!client) {
    return null;
  }

  return {
    ...client,
    isAuthorized: isAuthorizedClientAccess(client, userId, role),
  };
}

async function getPlanWithOwnership(c: any, planId: string) {
  const userId = c.get('userId');
  const role = c.get('role');

  const row = await c.env.DB.prepare(
    `SELECT p.id AS plan_id, p.client_id, c.therapist_user_id
       FROM plans p
       LEFT JOIN clients c ON p.client_id = c.id
       WHERE p.id = ?`
  )
    .bind(planId)
    .first() as { plan_id: string; client_id: string; therapist_user_id: string | null } | null;

  if (!row) {
    return null;
  }

  return {
    ...row,
    isAuthorized: role === 'admin' || (role === 'therapist' && row.therapist_user_id === userId),
  };
}

async function getPlanStatistics(c: any, planId: string, clientId: string) {
  const totalRow = (await c.env.DB.prepare('SELECT COUNT(*) AS total_activities FROM plan_activities WHERE plan_id = ?')
    .bind(planId)
    .first()) as { total_activities: number } | null;

  const completionRow = (await c.env.DB.prepare(
    `SELECT COUNT(*) AS completion_count
     FROM activity_completions
     WHERE client_id = ?
       AND activity_id IN (SELECT id FROM plan_activities WHERE plan_id = ?)`
  )
    .bind(clientId, planId)
    .first()) as { completion_count: number } | null;

  const weeklyRow = (await c.env.DB.prepare(
    `SELECT COUNT(DISTINCT activity_id) AS weekly_completed_activities
     FROM activity_completions
     WHERE client_id = ?
       AND completed_at >= datetime('now', '-7 days')
       AND activity_id IN (SELECT id FROM plan_activities WHERE plan_id = ?)`
  )
    .bind(clientId, planId)
    .first()) as { weekly_completed_activities: number } | null;

  const totalActivities = totalRow?.total_activities || 0;
  const completionCount = completionRow?.completion_count || 0;
  const weeklyCompletedActivities = weeklyRow?.weekly_completed_activities || 0;

  return {
    total_activities: Number(totalActivities),
    completion_count: Number(completionCount),
    weekly_completed_activities: Number(weeklyCompletedActivities),
    weekly_completion_rate: Number(totalActivities) > 0 ? Math.round((Number(weeklyCompletedActivities) / Number(totalActivities)) * 100) : 0
  };
}

// GET /me (for clients) - Must be defined before other general GET endpoints
app.get('/me', async (c) => {
  const userId = c.get('userId');
  
  // Look up client by clerk_user_id (which is saved as client_user_id in clients table)
  const client = await c.env.DB.prepare('SELECT id FROM clients WHERE client_user_id = ?')
    .bind(userId)
    .first<{ id: string }>();
    
  if (!client) {
    return c.json({ error: 'Client profile not found. Please ask your therapist to add you.' }, 404);
  }
  
  const plan = await c.env.DB.prepare('SELECT * FROM plans WHERE client_id = ? AND status = ?')
    .bind(client.id, 'active')
    .first();
    
  if (!plan) {
    return c.json(null);
  }
  
  const activities = await c.env.DB.prepare('SELECT * FROM plan_activities WHERE plan_id = ? ORDER BY sort_order ASC')
    .bind(plan.id)
    .all();

  const statistics = await getPlanStatistics(c, (plan as any).id, client.id);
    
  return c.json({
    ...plan,
    activities: activities.results || [],
    statistics
  });
});

// GET /client/:clientId (for therapists/admins)
app.get('/client/:clientId', requireRole(['therapist', 'admin', 'client']), async (c) => {
  const clientId = c.req.param('clientId');

  const client = await getClientOwnership(c, clientId);

  if (!client) {
    return c.json({ error: 'Client profile not found' }, 404);
  }

  if (!client.isAuthorized) {
    return c.json({ error: 'Forbidden' }, 403);
  }
  
  const plan = await c.env.DB.prepare('SELECT * FROM plans WHERE client_id = ? AND status = ?')
    .bind(clientId, 'active')
    .first();
    
  if (!plan) {
    return c.json(null);
  }
  
  const activities = await c.env.DB.prepare('SELECT * FROM plan_activities WHERE plan_id = ? ORDER BY sort_order ASC')
    .bind(plan.id)
    .all();

  const statistics = await getPlanStatistics(c, (plan as any).id, clientId);
    
  return c.json({
    ...plan,
    activities: activities.results || [],
    statistics
  });
});

// POST / (for therapists/admins)
app.post('/', requireRole(['therapist', 'admin']), async (c) => {
  const therapistId = c.get('userId');
  const role = c.get('role');
  const body = await c.req.json();
  const { client_id, title, summary, source, activities, weekly_goals } = body;
  
  if (!client_id || !title) {
    return c.json({ error: 'Missing client_id or title' }, 400);
  }

  // 1. Verify client exists
  const client = await c.env.DB.prepare('SELECT therapist_user_id FROM clients WHERE id = ?')
    .bind(client_id)
    .first<{ therapist_user_id: string | null }>();
  if (!client) {
    return c.json({ error: 'Client not found' }, 404);
  }

  if (role === 'therapist' && client.therapist_user_id !== therapistId) {
    return c.json({ error: 'Forbidden' }, 403);
  }
  
  const planId = crypto.randomUUID();
  const statements = [];
  
  // 2. Archive existing active plans
  statements.push(
    c.env.DB.prepare("UPDATE plans SET status = 'archived', updated_at = CURRENT_TIMESTAMP WHERE client_id = ? AND status = 'active'")
      .bind(client_id)
  );
  
  // 3. Insert new plan
  statements.push(
    c.env.DB.prepare("INSERT INTO plans (id, client_id, created_by_user_id, source, title, summary, status, weekly_goals_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(planId, client_id, therapistId, source || 'ai', title, summary || null, 'active', weekly_goals ? JSON.stringify(weekly_goals) : null)
  );
  
  // 4. Insert activities
  if (Array.isArray(activities)) {
    activities.forEach((act: any, idx: number) => {
      const actId = crypto.randomUUID();
      const actTitle = act.title;
      const instructions = act.instructions;
      const frequency = act.frequency || 'Daily';
      const duration_minutes = act.duration_minutes !== undefined ? act.duration_minutes : (act.durationMinutes !== undefined ? act.durationMinutes : 0);
      const sort_order = act.sort_order !== undefined ? act.sort_order : (act.sortOrder !== undefined ? act.sortOrder : idx);
      
      statements.push(
        c.env.DB.prepare("INSERT INTO plan_activities (id, plan_id, title, instructions, frequency, duration_minutes, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)")
          .bind(actId, planId, actTitle, instructions, frequency, duration_minutes, sort_order)
      );
    });
  }
  
  await c.env.DB.batch(statements);
  
  // 5. Fetch and return saved plan
  const plan = await c.env.DB.prepare("SELECT * FROM plans WHERE id = ?").bind(planId).first();
  const dbActivities = await c.env.DB.prepare("SELECT * FROM plan_activities WHERE plan_id = ? ORDER BY sort_order ASC").bind(planId).all();
  
  return c.json({
    ...plan,
    activities: dbActivities.results || []
  });
});

// PUT /:id (for therapists/admins)
app.put('/:id', requireRole(['therapist', 'admin']), async (c) => {
  const planId = c.req.param('id');
  const body = await c.req.json();
  const { title, summary, activities, weekly_goals } = body;
  
  if (!title) {
    return c.json({ error: 'Title is required' }, 400);
  }
  
  // Verify plan belongs to the requesting user
  const plan = await getPlanWithOwnership(c, planId);
  if (!plan) {
    return c.json({ error: 'Plan not found' }, 404);
  }

  if (!plan.isAuthorized) {
    return c.json({ error: 'Forbidden' }, 403);
  }
  
  const statements = [];
  
  // 1. Update plan title and summary
  statements.push(
    c.env.DB.prepare('UPDATE plans SET title = ?, summary = ?, weekly_goals_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(title, summary || null, weekly_goals ? JSON.stringify(weekly_goals) : null, planId)
  );
  
  // 2. Identify deleted activities to clean up completions
  const currentActivities = await c.env.DB.prepare('SELECT id FROM plan_activities WHERE plan_id = ?')
    .bind(planId)
    .all<{ id: string }>();
  
  const currentIds = (currentActivities.results || []).map(r => r.id);
  const newIds = (activities || []).map((act: any) => act.id).filter(Boolean);
  const deletedIds = currentIds.filter(id => !newIds.includes(id));
  
  if (deletedIds.length > 0) {
    deletedIds.forEach(id => {
      statements.push(
        c.env.DB.prepare('DELETE FROM activity_completions WHERE activity_id = ?').bind(id)
      );
    });
  }
  
  // 3. Delete all plan activities (we will recreate the kept ones and the new ones)
  statements.push(
    c.env.DB.prepare('DELETE FROM plan_activities WHERE plan_id = ?').bind(planId)
  );
  
  // 4. Insert activities
  if (Array.isArray(activities)) {
    activities.forEach((act: any, idx: number) => {
      const actId = act.id || crypto.randomUUID();
      const actTitle = act.title;
      const instructions = act.instructions;
      const frequency = act.frequency || 'Daily';
      const duration_minutes = act.duration_minutes !== undefined ? act.duration_minutes : (act.durationMinutes !== undefined ? act.durationMinutes : 0);
      const sort_order = act.sort_order !== undefined ? act.sort_order : (act.sortOrder !== undefined ? act.sortOrder : idx);
      
      statements.push(
        c.env.DB.prepare("INSERT INTO plan_activities (id, plan_id, title, instructions, frequency, duration_minutes, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)")
          .bind(actId, planId, actTitle, instructions, frequency, duration_minutes, sort_order)
      );
    });
  }
  
  await c.env.DB.batch(statements);
  
  // Fetch and return saved plan
  const updatedPlan = await c.env.DB.prepare("SELECT * FROM plans WHERE id = ?").bind(planId).first();
  const dbActivities = await c.env.DB.prepare("SELECT * FROM plan_activities WHERE plan_id = ? ORDER BY sort_order ASC").bind(planId).all();
  
  return c.json({
    ...updatedPlan,
    activities: dbActivities.results || []
  });
});

// DELETE /:id (for therapists/admins)
app.delete('/:id', requireRole(['therapist', 'admin']), async (c) => {
  const planId = c.req.param('id');
  
  // Verify plan belongs to the requesting user
  const plan = await getPlanWithOwnership(c, planId);
  if (!plan) {
    return c.json({ error: 'Plan not found' }, 404);
  }

  if (!plan.isAuthorized) {
    return c.json({ error: 'Forbidden' }, 403);
  }
  
  const statements = [
    c.env.DB.prepare('DELETE FROM activity_completions WHERE activity_id IN (SELECT id FROM plan_activities WHERE plan_id = ?)').bind(planId),
    c.env.DB.prepare('DELETE FROM plan_activities WHERE plan_id = ?').bind(planId),
    c.env.DB.prepare('DELETE FROM plans WHERE id = ?').bind(planId)
  ];
  
  await c.env.DB.batch(statements);
  
  return c.json({ success: true });
});

export default app;
