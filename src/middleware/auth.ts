import { createMiddleware } from 'hono/factory';
import { verifyToken } from '@clerk/backend';
import { Bindings, AppVariables } from '../types/env';

export const clerkAuth = () => {
  return createMiddleware<{ Bindings: Bindings; Variables: AppVariables }>(async (c, next) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    
    const token = authHeader.replace('Bearer ', '');
    
    // Backoffice bypass
    if (c.env.BACKOFFICE_SECRET && token === c.env.BACKOFFICE_SECRET) {
      c.set('userId', 'backoffice');
      c.set('role', 'admin');
      await next();
      return;
    }

    try {
      const verified = await verifyToken(token, {
        secretKey: c.env.CLERK_SECRET_KEY,
      });
      c.set('userId', verified.sub);
      
      const user = await c.env.DB.prepare('SELECT role FROM users WHERE clerk_user_id = ?')
        .bind(verified.sub)
        .first<{ role: string }>();
        
      if (user && user.role) {
        c.set('role', user.role as 'therapist' | 'client' | 'admin');
      } else {
        c.set('role', 'client');
      }
      
      await next();
    } catch (e) {
      console.error('Auth error', e);
      return c.json({ error: 'Unauthorized' }, 401);
    }
  });
};

export const requireRole = (allowedRoles: ('therapist' | 'client' | 'admin')[]) => {
  return createMiddleware<{ Variables: AppVariables }>(async (c, next) => {
    const role = c.get('role');
    if (!allowedRoles.includes(role)) {
      return c.json({ error: 'Forbidden' }, 403);
    }
    await next();
  });
};
