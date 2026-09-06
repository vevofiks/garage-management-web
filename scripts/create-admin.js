const crypto = require('crypto');
const { Pool } = require('pg');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derivedKey}`;
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('Error: DATABASE_URL environment variable is not set.');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const username = args[0] || 'admin';
  const password = args[1] || 'admin';
  const hashed = hashPassword(password);

  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  try {
    await pool.query(
      `INSERT INTO users (username, password, role) VALUES ($1, $2, 'admin')`,
      [username, hashed]
    );
    console.log(`Admin user created. Username: ${username}`);
  } catch (error) {
    if (error.code === '23505') {
      console.error(`Error: User '${username}' already exists.`);
    } else {
      console.error('Error creating admin:', error.message);
    }
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
