import { requireRole, hashPassword } from '@/lib/auth';
import { ok, badRequest, withErrorHandling } from '@/lib/http';
import { userSchema } from '@/lib/schemas/user';
import { logAudit } from '@/lib/audit';
import db from '@/lib/db';

export const GET = withErrorHandling(async () => {
  await requireRole('admin');

  const users = await db.prepare('SELECT id, username, role, created_at FROM users ORDER BY created_at DESC').all();
  return ok(users);
});

export const POST = withErrorHandling(async (req) => {
  const currentUser = await requireRole('admin');

  const body = await req.json();
  const { username, password, role } = userSchema.parse(body);

  if (!password) {
    return badRequest('Password is required for new users');
  }

  const hashed = hashPassword(password);

  try {
    const info = await db
      .prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?) RETURNING id')
      .run(username, hashed, role);

    logAudit(currentUser, 'user.created', `Created ${role} account "${username}"`);
    const newUser = await db.prepare('SELECT id, username, role, created_at FROM users WHERE id = ?').get(info.lastInsertRowid);
    return ok(newUser);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === '23505') {
      return badRequest('Username already exists');
    }
    throw error;
  }
});
