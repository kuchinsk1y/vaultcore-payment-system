import { db } from '../../infrastructure/database';
import { sql, Transaction } from 'kysely';
import { OutboxService } from '../outbox/outbox.service';

export interface RiskEvaluationResult {
  score: number;
  status: 'APPROVED' | 'FLAGGED' | 'BLOCKED';
  reason: string;
}

export class FraudService {
  /**
   * Evaluates a transfer request for potential fraud.
   * Returns a RiskEvaluationResult.
   */
  static async evaluateTransferRisk(
    userId: string,
    sourceAccountId: string,
    amount: number
  ): Promise<RiskEvaluationResult> {
    let riskScore = 0;
    const reasons: string[] = [];

    // 1. Velocity Check (e.g., > 3 transfers in the last minute)
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
    
    // We check the outbox_events or transfers table. We'll check transfers table via accounts.
    // We need to count transfers originating from this user's accounts.
    const recentTransfersCount = await db
      .selectFrom('transfers')
      .innerJoin('accounts', 'transfers.source_account_id', 'accounts.id')
      .select(db.fn.count<string>('transfers.id').as('count'))
      .where('accounts.user_id', '=', userId)
      .where('transfers.created_at', '>', oneMinuteAgo)
      .executeTakeFirst();
      
    if (recentTransfersCount && parseInt(recentTransfersCount.count) >= 3) {
      riskScore += 50;
      reasons.push('High velocity of transfers');
    }

    // 2. Amount Threshold Check (e.g. > 10,000.00 minor units = 1,000,000)
    if (amount > 1000000) {
      riskScore += 40;
      reasons.push('Unusually large transfer amount');
    }

    // 3. Card Status Check
    const frozenCards = await db
      .selectFrom('cards')
      .select('id')
      .where('account_id', '=', sourceAccountId)
      .where('status', '=', 'FROZEN')
      .executeTakeFirst();

    if (frozenCards) {
      riskScore += 100;
      reasons.push('Source account linked to a FROZEN card');
    }

    // Determine final status
    let status: 'APPROVED' | 'FLAGGED' | 'BLOCKED' = 'APPROVED';
    if (riskScore > 80) {
      status = 'BLOCKED';
    } else if (riskScore >= 50) {
      status = 'FLAGGED';
    }

    const finalReason = reasons.length > 0 ? reasons.join('; ') : 'Routine check passed';

    return {
      score: riskScore,
      status,
      reason: finalReason,
    };
  }

  /**
   * Logs the risk evaluation result to the database.
   */
  static async logRisk(
    userId: string,
    result: RiskEvaluationResult,
    transactionId?: string,
    existingTrx?: Transaction<any>
  ): Promise<void> {
    const executeLogic = async (trx: Transaction<any>) => {
      const [riskLog] = await trx
        .insertInto('risk_logs')
        .values({
          user_id: userId,
          transaction_id: transactionId || null,
          risk_score: result.score,
          status: result.status,
          reason: result.reason,
        })
        .returningAll()
        .execute();

      if (result.status === 'FLAGGED' || result.status === 'BLOCKED') {
        await OutboxService.writeEvent(trx, {
          aggregate_type: 'FRAUD_RISK',
          aggregate_id: riskLog.id,
          event_type: result.status === 'BLOCKED' ? 'fraud.blocked' : 'fraud.flagged',
          payload: {
            userId,
            transactionId,
            score: result.score,
            reason: result.reason
          }
        });
      }
    };

    if (existingTrx) {
      await executeLogic(existingTrx);
    } else {
      await db.transaction().execute(executeLogic);
    }
  }
}
