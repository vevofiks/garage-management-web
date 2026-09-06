import { requireUser } from '@/lib/auth';
import { ok, withErrorHandling } from '@/lib/http';
import { predefinedServiceSchema } from '@/lib/schemas/predefined-service';
import db from '@/lib/db';

export const GET = withErrorHandling(async () => {
  await requireUser();
  const services = await db.prepare('SELECT id, name FROM predefined_services ORDER BY name').all();
  return ok(services);
});

export const POST = withErrorHandling(async (req) => {
  await requireUser();
  const body = await req.json();
  const { name } = predefinedServiceSchema.parse(body);

  try {
    const info = await db.prepare('INSERT INTO predefined_services (name) VALUES (?) RETURNING id').run(name);
    const service = await db.prepare('SELECT id, name FROM predefined_services WHERE id = ?').get(info.lastInsertRowid);
    return ok(service, { status: 201 });
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === '23505') {
      // The "add new" affordance is used by every staff member off the same
      // shared catalog — picking a name someone else just added a moment
      // ago should hand back that existing row, not error.
      const existing = await db.prepare('SELECT id, name FROM predefined_services WHERE name = ?').get(name);
      return ok(existing);
    }
    throw error;
  }
});
