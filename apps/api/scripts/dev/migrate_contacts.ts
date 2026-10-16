import { sql } from 'kysely';
import { db } from '../../src/infrastructure/database';

async function run() {
  console.log('Creating contacts table...');
  await db.schema
    .createTable('contacts')
    .ifNotExists()
    .addColumn('id', 'uuid', (cb) => cb.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn('user_id', 'uuid', (cb) => cb.notNull().references('users.id').onDelete('cascade'))
    .addColumn('contact_user_id', 'uuid', (cb) => cb.notNull().references('users.id').onDelete('cascade'))
    .addColumn('created_at', 'timestamp', (cb) => cb.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint('contacts_user_id_contact_user_id_unique', ['user_id', 'contact_user_id'])
    .execute();

  console.log('Updating dummy users with phone numbers...');
  
  await db.updateTable('users')
    .set({ phone_number: '+447700900077' })
    .where('full_name', '=', 'Emma Watson')
    .execute();
    
  await db.updateTable('users')
    .set({ phone_number: '+12025550188' })
    .where('full_name', '=', 'James Carter')
    .execute();
    
  // Ensure Tymur has a phone number too just in case
  await db.updateTable('users')
    .set({ phone_number: '+48111222333' })
    .where('full_name', '=', 'Tymur Kuchynskyi')
    .execute();

  console.log('Done!');
  process.exit(0);
}
run().catch(console.error);
