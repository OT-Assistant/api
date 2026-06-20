import { Hono } from 'hono';
import { Bindings, AppVariables } from '../types/env';
import { requireRole } from '../middleware/auth';
import { generateAIPlan } from '../services/openrouter';

const app = new Hono<{ Bindings: Bindings; Variables: AppVariables }>();

// Only therapists can generate plans
app.use('/*', requireRole(['therapist', 'admin']));

app.post('/generate', async (c) => {
  const body = await c.req.json();
  const { client_id, therapist_notes, age_range, available_equipment, session_length_minutes } = body;
  const userId = c.get('userId');
  const role = c.get('role');
  const resolvedAgeRange = typeof age_range === 'string' && age_range.trim().length > 0
    ? age_range.trim()
    : null;
  const resolvedEquipment = typeof available_equipment === 'string' && available_equipment.trim().length > 0
    ? available_equipment.trim()
    : null;
  const resolvedSessionMinutes = (() => {
    const parsed = Number(session_length_minutes);
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
  })();
  
  // 1. Fetch client, intake, and goals context
  const client = await c.env.DB.prepare('SELECT therapist_user_id, notes FROM clients WHERE id = ?')
    .bind(client_id)
    .first<{ therapist_user_id: string | null; notes: string | null }>();
  if (!client) return c.json({ error: 'Client not found' }, 404);

  if (role === 'therapist' && client.therapist_user_id !== userId) {
    return c.json({ error: 'Forbidden' }, 403);
  }
  
  const intake = await c.env.DB.prepare('SELECT * FROM intakes WHERE client_id = ?').bind(client_id).first<{
    goals_json?: string;
    daily_challenges?: string | null;
    age_range?: string | null;
    available_equipment?: string | null;
    session_length_minutes?: number | null;
  }>();
  
  // 2. Build prompt context
  const requestJson = JSON.stringify({
    clientProfile: client.notes,
    intakeAnswers: {
      goals: intake?.goals_json || 'not specified',
      challenges: intake?.daily_challenges || 'not specified',
      age: resolvedAgeRange || intake?.age_range || 'not specified',
      equipment: resolvedEquipment || intake?.available_equipment || 'not specified',
      duration: resolvedSessionMinutes || intake?.session_length_minutes || 10
    },
    therapistNotes: therapist_notes
  });
  
  // 3. Call OpenRouter
  try {
    const aiResult = await generateAIPlan(c.env, requestJson);
    const data = aiResult.data as any;
    const parsedData = JSON.parse(data.choices[0].message.content);
    
    // 4. Log the generation
    await c.env.DB.prepare('INSERT INTO ai_generation_logs (id, client_id, provider, model, request_json, response_json, status) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), client_id, 'openrouter', aiResult.model, requestJson, JSON.stringify(parsedData), 'success')
      .run();
      
    // Return parsed plan for preview
    return c.json(parsedData);
  } catch (error: any) {
    await c.env.DB.prepare('INSERT INTO ai_generation_logs (id, client_id, provider, model, request_json, status, error_message) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), client_id, 'openrouter', 'unknown', requestJson, 'error', error.message)
      .run();
      
    return c.json({ error: 'Failed to generate plan' }, 500);
  }
});

export default app;
