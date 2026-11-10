import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

export const E2E_MIN_OFFSET_DAYS = 400;

const root = path.resolve(__dirname, '..');

function readEnv(file: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (match) env[match[1]] = match[2];
  }
  return env;
}

/**
 * Deletes the vacation requests earlier e2e runs left behind (approved ones cannot be removed through
 * the API), so random date ranges never collide with old data. Only rows starting at least
 * E2E_MIN_OFFSET_DAYS from today are touched: seed and hand-made dev data are left alone.
 */
export default async function globalSetup(): Promise<void> {
  const env = { ...readEnv(path.join(root, '.env')), ...process.env };
  const { Client } = createRequire(path.join(root, 'backend/package.json'))('pg');
  const client = new Client({
    host: env.POSTGRES_HOST ?? 'localhost',
    port: Number(env.POSTGRES_PORT ?? 5432),
    user: env.APP_DB_USER,
    password: env.APP_DB_PASSWORD,
    database: env.POSTGRES_DB,
  });
  await client.connect();
  try {
    await client.query('DELETE FROM vacation_requests WHERE start_date >= current_date + $1::int', [
      E2E_MIN_OFFSET_DAYS,
    ]);
  } finally {
    await client.end();
  }
}
