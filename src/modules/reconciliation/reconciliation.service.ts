import { db } from '../../infrastructure/database';
import { sql } from 'kysely';

export class ReconciliationService {
  private logger: any;

  constructor(logger: any = console) {
    this.logger = logger;
  }

  /**
   * Scans for stuck asynchronous events and marks them as FAILED.
   * A "stuck" event is one that has remained in a pending/received state
   * longer than the specified threshold (e.g. workers are failing or dead).
   * 
   * @param staleThresholdMinutes Threshold in minutes to consider an event stuck
   */
  public async runReconciliation(staleThresholdMinutes: number = 10): Promise<{ outboxUpdated: number, webhooksUpdated: number }> {
    this.logger.info(`Starting reconciliation sweep for events older than ${staleThresholdMinutes} minutes...`);
    
    let outboxUpdated = 0;
    let webhooksUpdated = 0;

    try {
      await db.transaction().execute(async (trx) => {
        // 1. Scan outbox_events
        const updatedOutbox = await trx
          .updateTable('outbox_events')
          .set({ status: 'FAILED' })
          .where('status', '=', 'PENDING')
          .where('created_at', '<', sql<Date>`now() - interval '1 minute' * ${staleThresholdMinutes}`)
          .returning('id')
          .execute();

        outboxUpdated = updatedOutbox.length;
        if (outboxUpdated > 0) {
          this.logger.warn(`Reconciliation: Flagged ${outboxUpdated} stuck outbox_events as FAILED.`);
        }

        // 2. Scan webhook_events
        const updatedWebhooks = await trx
          .updateTable('webhook_events')
          .set({ status: 'FAILED' })
          .where('status', '=', 'RECEIVED')
          .where('created_at', '<', sql<Date>`now() - interval '1 minute' * ${staleThresholdMinutes}`)
          .returning('id')
          .execute();

        webhooksUpdated = updatedWebhooks.length;
        if (webhooksUpdated > 0) {
          this.logger.warn(`Reconciliation: Flagged ${webhooksUpdated} stuck webhook_events as FAILED.`);
        }
      });
      
      this.logger.info(`Reconciliation sweep completed. Outbox: ${outboxUpdated}, Webhooks: ${webhooksUpdated}`);
      return { outboxUpdated, webhooksUpdated };
    } catch (error) {
      this.logger.error(error, 'Reconciliation: Failed to run reconciliation sweep');
      throw error;
    }
  }
}
