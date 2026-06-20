import { createMiddleware } from 'hono/factory';
import { Bindings, AppVariables } from '../types/env';

// Memory cache for JWKS keys to avoid fetching on every request
const cachedKeys: Record<string, any> = {};

function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    arr[i] = raw.charCodeAt(i);
  }
  return arr;
}

function decodeJwt(jwt: string) {
  const parts = jwt.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT format');
  
  const header = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0])));
  const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1])));
  
  return { header, payload };
}

async function verifyClerkToken(jwt: string, jwksUri: string): Promise<any> {
  const { header, payload } = decodeJwt(jwt);
  
  // Expiration check
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && now > payload.exp) {
    throw new Error('JWT is expired');
  }
  if (payload.nbf && now < payload.nbf) {
    throw new Error('JWT is not active yet');
  }

  // Get matching JWK key
  let jwk = cachedKeys[header.kid];
  if (!jwk) {
    const res = await fetch(jwksUri);
    if (!res.ok) {
      throw new Error(`Failed to fetch JWKS from ${jwksUri}`);
    }
    const jwks = await res.json() as any;
    for (const key of jwks.keys) {
      cachedKeys[key.kid] = key;
    }
    jwk = cachedKeys[header.kid];
  }

  if (!jwk) {
    throw new Error('JWK not found');
  }

  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['verify']
  );

  const parts = jwt.split('.');
  const message = new TextEncoder().encode(parts[0] + '.' + parts[1]);
  const signature = base64UrlDecode(parts[2]);

  const isValid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    signature,
    message
  );

  if (!isValid) {
    throw new Error('Invalid signature');
  }

  return payload;
}

export const clerkAuth = () => {
  return createMiddleware<{ Bindings: Bindings; Variables: AppVariables }>(async (c, next) => {
    // Dev bypass (only in development)
    if (c.env.APP_ENV === 'development') {
      const devUser = c.req.header('X-Dev-User');
      if (devUser === 'therapist' || devUser === 'client' || devUser === 'admin') {
        c.set('userId', `mock-${devUser}-id`);
        c.set('role', devUser as 'therapist' | 'client' | 'admin');
        await next();
        return;
      }
    }

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
      const jwksUri = c.env.CLERK_JWKS_URL || `${c.env.CLERK_ISSUER || 'https://settled-badger-61.clerk.accounts.dev'}/.well-known/jwks.json`;

      const payload = await verifyClerkToken(token, jwksUri);
      c.set('userId', payload.sub);
      
      const user = await c.env.DB.prepare('SELECT role FROM users WHERE clerk_user_id = ?')
        .bind(payload.sub)
        .first<{ role: string }>();
        
      if (user && user.role) {
        c.set('role', user.role as 'therapist' | 'client' | 'admin');
      } else {
        c.set('role', 'client');
      }
      
      await next();
    } catch (e) {
      console.error('Auth error', e);
      return c.json({ error: 'Unauthorized', message: (e as Error).message }, 401);
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
