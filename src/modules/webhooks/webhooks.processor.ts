import { db } from '../../infrastructure/database';
import { sql } from 'kysely';

export class WebhookProcessor {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private logger: any;
  private pollIntervalMs: number;

  constructor(logger: any = console, pollIntervalMs: number = 5000) {
    this.logger = logger;
    this.pollIntervalMs = pollIntervalMs;
  }

  public start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.logger.info('WebhookProcessor started');
    
    // Kick off the polling loop without awaiting
    this.poll();
  }

  public stop() {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.logger.info('WebhookProcessor stopped');
  }

  // Exposed for testing
  public async processBatch(): Promise<number> {
    let processedCount = 0;
    try {
      await db.transaction().execute(async (trx) => {
        // Find RECEIVED events and lock them for this transaction, skipping any already locked
        const pendingEvents = await trx
          .selectFrom('webhook_events')
          .selectAll()
          .where('status', '=', 'RECEIVED')
          .orderBy('created_at', 'asc')
          .limit(10)
          .forUpdate()
          .skipLocked()
          .execute();

        if (pendingEvents.length === 0) {
          return;
        }

        this.logger.info(`WebhookProcessor: Found ${pendingEvents.length} RECEIVED events to process`);

        for (const event of pendingEvents) {
          try {
            if (event.event_type === 'payment.succeeded') {
              const payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;
              const { account_id, amount, currency } = payload;
              
              if (!account_id || !amount || !currency) {
                throw new Error('Invalid payload for payment.succeeded');
              }
              
              // Verify account exists
              const account = await trx
                .selectFrom('accounts')
                .select('id')
                .where('id', '=', account_id)
                .forUpdate()
                .executeTakeFirst();
                
              if (!account) {
                 throw new Error('Account not found');
              }

              // Create ledger transaction
              const [ledgerTx] = await trx
                .insertInto('ledger_transactions')
                .values({
                  description: `Webhook payment for ${account_id}`,
                })
                .returning('id')
                .execute();

              // Insert CREDIT ledger entry
              await trx
                .insertInto('ledger_entries')
                .values({
                  ledger_transaction_id: ledgerTx.id,
                  account_id: account_id,
                  direction: 'CREDIT',
                  amount: amount,
                  currency: currency,
                })
                .execute();
                
              this.logger.info(`WebhookProcessor: Successfully processed payment.succeeded for account ${account_id}`);
            } else {
              this.logger.info(`WebhookProcessor: Ignored unsupported event_type: ${event.event_type}`);
            }
            
            // Mark as processed
            await trx
              .updateTable('webhook_events')
              .set({
                status: 'PROCESSED',
                processed_at: sql`now()`
              })
              .where('id', '=', event.id)
              .execute();

          } catch (error) {
            this.logger.error(error, `WebhookProcessor: Failed to process event ${event.id}`);
            // Mark as failed if it's an unrecoverable error during processing 
            // (e.g. account not found, bad payload)
            await trx
              .updateTable('webhook_events')
              .set({
                status: 'FAILED',
                processed_at: sql`now()`
              })
              .where('id', '=', event.id)
              .execute();
          }
            
          processedCount++;
        }
      });
    } catch (error) {
      this.logger.error(error, 'WebhookProcessor: Error processing batch');
    }
    
    return processedCount;
  }

  private async poll() {
    if (!this.isRunning) return;

    await this.processBatch();

    // Schedule next iteration
    if (this.isRunning) {
      this.timer = setTimeout(() => this.poll(), this.pollIntervalMs);
    }
  }
}
