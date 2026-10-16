import { Transaction } from 'kysely';

export interface OutboxEventInput {
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  payload: any;
}

export class OutboxService {
  /**
   * Writes an event to the outbox table as part of a transaction.
   * This guarantees that the event is committed if and only if the transaction succeeds.
   */
  static async writeEvent(trx: Transaction<any>, event: OutboxEventInput): Promise<void> {
    await trx
      .insertInto('outbox_events')
      .values({
        aggregate_type: event.aggregate_type,
        aggregate_id: event.aggregate_id,
        event_type: event.event_type,
        payload: JSON.stringify(event.payload),
        status: 'PENDING',
        attempts: 0,
      })
      .execute();
  }
}
