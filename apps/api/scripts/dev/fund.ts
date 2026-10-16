import { db } from '../../src/infrastructure/database';
async function run() {
  const userId = 'a140ba11-cb43-43ee-9d0c-a523bca5fed7';
  
  let accounts = await db.selectFrom('accounts').where('user_id', '=', userId).where('currency', '=', 'PLN').selectAll().execute();
  
  // Delete duplicates if any, keep only the oldest active
  if (accounts.length > 1) {
     const toKeep = accounts[0];
     for (let i = 1; i < accounts.length; i++) {
        await db.deleteFrom('accounts').where('id', '=', accounts[i].id).execute();
     }
     accounts = [toKeep];
     console.log('Deleted duplicate PLN accounts');
  }
  
  const acc = accounts[0];
  if (!acc) return console.log('No PLN account');
  
  const [tx] = await db.insertInto('ledger_transactions').values({ description: 'Manual Funding 1000 PLN' }).returning('id').execute();
  await db.insertInto('ledger_entries').values({ ledger_transaction_id: tx.id, account_id: acc.id, direction: 'CREDIT', amount: 100000, currency: 'PLN' }).execute();
  
  console.log('Funded Tymur PLN account:', acc.id);
  process.exit(0);
}
run();
