import { describe, it, expect } from 'vitest';
import { checkDatabaseConnection } from '../../src/infrastructure/database';

describe('Database Integration', () => {
  it('should successfully connect to the PostgreSQL database', async () => {
    const isConnected = await checkDatabaseConnection();
    expect(isConnected).toBe(true);
  });
});
