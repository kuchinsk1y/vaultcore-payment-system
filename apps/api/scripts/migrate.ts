import fs from 'node:fs/promises';
import path from 'node:path';
import { db } from '../src/infrastructure/database';
import { sql } from 'kysely';

async function runMigrations() {
  const migrationsDir = path.join(__dirname, '../migrations');
  console.log(`Checking for migrations in ${migrationsDir}`);

  // Create migrations table if it doesn't exist
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `.execute(db);

  const files = await fs.readdir(migrationsDir);
  const sqlFiles = files.filter(f => f.endsWith('.sql')).sort();

  for (const file of sqlFiles) {
    const checkResult = await sql<{ version: string }>`SELECT version FROM schema_migrations WHERE version = ${file}`.execute(db);
    
    if (checkResult.rows.length === 0) {
      console.log(`Applying migration: ${file}`);
      const filePath = path.join(migrationsDir, file);
      const fileContent = await fs.readFile(filePath, 'utf-8');
      
      // Execute the migration SQL
      await sql.raw(fileContent).execute(db);
      
      // Record the migration
      await sql`INSERT INTO schema_migrations (version) VALUES (${file})`.execute(db);
      console.log(`Successfully applied ${file}`);
    } else {
      console.log(`Skipping ${file} (already applied)`);
    }
  }

  console.log('Migrations complete.');
  await db.destroy();
}

runMigrations().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
