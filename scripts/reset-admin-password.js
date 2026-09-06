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
  const newPassword = args[0] || 'admin123';
  const username = args[1] || 'admin';
  const hashedPassword = hashPassword(newPassword);

  console.log(`Setting password for user '${username}' to: '${newPassword}'...`);

  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  try {
    await pool.query(
      `INSERT INTO users (username, password, role)
       VALUES ($1, $2, 'admin')
       ON CONFLICT (username) DO UPDATE SET password = EXCLUDED.password`,
      [username, hashedPassword]
    );
    console.log(`✓ Password updated for '${username}'`);
  } catch (error) {
    console.error('Failed to update password:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
