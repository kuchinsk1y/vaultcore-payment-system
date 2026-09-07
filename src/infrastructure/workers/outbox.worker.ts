import { db } from '../database';
import { sql } from 'kysely';

export class OutboxWorker {
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
    this.logger.info('OutboxWorker started');
    
    // Kick off the polling loop without awaiting
    this.poll();
  }

  public stop() {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.logger.info('OutboxWorker stopped');
  }

  // Exposed for testing
  public async processBatch(): Promise<number> {
    let processedCount = 0;
    try {
      await db.transaction().execute(async (trx) => {
        // Find pending events and lock them for this transaction, skipping any already locked
        const pendingEvents = await trx
          .selectFrom('outbox_events')
          .selectAll()
          .where('status', '=', 'PENDING')
          .orderBy('created_at', 'asc')
          .limit(10)
          .forUpdate()
          .skipLocked()
          .execute();

        if (pendingEvents.length === 0) {
          return;
        }

        this.logger.info(`OutboxWorker: Found ${pendingEvents.length} pending events to process`);

        for (const event of pendingEvents) {
          // Simulate processing
          this.logger.info(`Event processed successfully: ${event.event_type} for aggregate ${event.aggregate_id}`);
          
          await trx
            .updateTable('outbox_events')
            .set({
              status: 'PROCESSED',
              processed_at: sql`now()`
            })
            .where('id', '=', event.id)
            .execute();
            
          processedCount++;
        }
      });
    } catch (error) {
      this.logger.error(error, 'OutboxWorker: Error processing batch');
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
