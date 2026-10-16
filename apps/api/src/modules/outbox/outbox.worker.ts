import { db } from '../../infrastructure/database';
import { sql } from 'kysely';

export class OutboxWorker {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private logger: any;
  private pollIntervalMs: number;
  private maxAttempts: number;
  private targetUrl: string | undefined;

  constructor(logger: any = console, pollIntervalMs: number = 5000, maxAttempts: number = 3) {
    this.logger = logger;
    this.pollIntervalMs = pollIntervalMs;
    this.maxAttempts = maxAttempts;
    this.targetUrl = process.env.WEBHOOK_TARGET_URL;
  }

  public start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.logger.info('OutboxWorker (Webhook Dispatcher) started');
    
    if (!this.targetUrl) {
      this.logger.warn('WEBHOOK_TARGET_URL is not set. Webhooks will fail or be skipped.');
    }
    
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
      // Step 1: Claim events by updating status to PROCESSING
      // PostgreSQL specific lock and update
      const eventsToProcess = await db.transaction().execute(async (trx) => {
        // Select events to claim
        const pendingEvents = await trx
          .selectFrom('outbox_events')
          .selectAll()
          .where('status', '=', 'PENDING')
          .orderBy('created_at', 'asc')
          .limit(10)
          .forUpdate()
          .skipLocked()
          .execute();

        if (pendingEvents.length === 0) return [];

        const eventIds = pendingEvents.map(e => e.id);

        // Mark them as processing to prevent other workers from picking them up
        await trx
          .updateTable('outbox_events')
          .set({ status: 'PROCESSING' })
          .where('id', 'in', eventIds)
          .execute();

        return pendingEvents;
      });

      if (eventsToProcess.length === 0) {
        return 0;
      }

      this.logger.info(`OutboxWorker: Processing ${eventsToProcess.length} events...`);

      // Step 2: Attempt to dispatch each event
      for (const event of eventsToProcess) {
        let success = false;
        
        if (this.targetUrl) {
          try {
            const payload = {
              id: event.id,
              type: event.event_type,
              aggregate_type: event.aggregate_type,
              aggregate_id: event.aggregate_id,
              data: event.payload,
              timestamp: event.created_at,
            };

            const response = await fetch(this.targetUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });

            if (response.ok) {
              success = true;
            } else {
              this.logger.warn(`Webhook dispatch failed with status ${response.status}`);
            }
          } catch (err: any) {
            this.logger.error(`Webhook dispatch error: ${err.message}`);
          }
        } else {
          // If no target URL, we can simulate success for dev/testing, but since this is a real dispatcher,
          // it should fail. Let's fail it so it is visible that env var is missing.
          this.logger.warn('Skipping webhook dispatch due to missing WEBHOOK_TARGET_URL');
        }

        // Step 3: Update the event status based on outcome
        const newAttempts = (event.attempts || 0) + 1;
        
        if (success) {
          await db
            .updateTable('outbox_events')
            .set({
              status: 'COMPLETED',
              attempts: newAttempts,
              processed_at: sql`now()`
            })
            .where('id', '=', event.id)
            .execute();
          this.logger.info(`Event dispatched successfully: ${event.event_type} (${event.id})`);
        } else {
          const finalStatus = newAttempts >= this.maxAttempts ? 'FAILED' : 'PENDING';
          await db
            .updateTable('outbox_events')
            .set({
              status: finalStatus,
              attempts: newAttempts
            })
            .where('id', '=', event.id)
            .execute();
          this.logger.info(`Event dispatch failed: ${event.event_type} (${event.id}). Status: ${finalStatus}`);
        }
        
        processedCount++;
      }
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
