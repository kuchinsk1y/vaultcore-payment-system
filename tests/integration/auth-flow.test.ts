import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fastify } from '../../apps/api/server';
import { db } from '../../src/infrastructure/database';
import crypto from 'crypto';

describe('Auth & Financial Flow Integration', () => {
  let token: string;
  let defaultAccountId: string;
  let secondaryAccountId: string;
  let otherUserToken: string;
  let otherUserAccountId: string;
  
  const testEmail = `test_${Date.now()}@example.com`;
  const otherEmail = `other_${Date.now()}@example.com`;
  const testPassword = 'SecurePassword123!';

  beforeAll(async () => {
    await fastify.ready();
  });

  afterAll(async () => {
    // Teardown handled manually or ignored for local integration testing (we use unique emails)
  });

  it('1. Should register a new user and auto-provision a checking account', async () => {
    const response = await fastify.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: testEmail,
        password: testPassword,
        full_name: 'Test User'
      }
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    
    expect(body.token).toBeDefined();
    expect(body.user.email).toBe(testEmail);
    expect(body.defaultAccount.id).toBeDefined();
    
    token = body.token;
    defaultAccountId = body.defaultAccount.id;
  });

  it('2. Should log in the user and return a JWT', async () => {
    const response = await fastify.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: testEmail,
        password: testPassword
      }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.token).toBeDefined();
  });

  it('3. Should fetch user accounts strictly scoped to their user_id', async () => {
    const response = await fastify.inject({
      method: 'GET',
      url: '/accounts',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    expect(response.statusCode).toBe(200);
    const accounts = JSON.parse(response.body);
    expect(accounts.length).toBe(1);
    expect(accounts[0].id).toBe(defaultAccountId);
  });

  it('4. Should allow user to create a secondary account', async () => {
    const response = await fastify.inject({
      method: 'POST',
      url: '/accounts',
      headers: {
        Authorization: `Bearer ${token}`
      },
      payload: {
        currency: 'EUR'
      }
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.id).toBeDefined();
    secondaryAccountId = body.id;
  });

  it('5. Should fund default account (direct ledger insert bypass for testing)', async () => {
    const [ledgerTx] = await db
      .insertInto('ledger_transactions')
      .values({ description: 'Initial Test Funding' })
      .returning('id')
      .execute();

    await db.insertInto('ledger_entries')
      .values({
        ledger_transaction_id: ledgerTx.id,
        account_id: defaultAccountId,
        direction: 'CREDIT',
        amount: 5000,
        currency: 'EUR'
      })
      .execute();
  });

  it('6. Should allow transfer between own accounts', async () => {
    const idempotencyKey = crypto.randomUUID();
    
    const response = await fastify.inject({
      method: 'POST',
      url: '/transfers',
      headers: {
        Authorization: `Bearer ${token}`,
        'Idempotency-Key': idempotencyKey
      },
      payload: {
        source_account_id: defaultAccountId,
        destination_account_id: secondaryAccountId,
        amount: 1000,
        currency: 'EUR'
      }
    });

    expect(response.statusCode).toBe(201);
    const transfer = JSON.parse(response.body);
    expect(transfer.status).toBe('SUCCESS');
  });

  it('7. Should reject transfer if source account belongs to another user (403 Forbidden)', async () => {
    // Create another user
    const regRes = await fastify.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: otherEmail, password: 'SecurePassword123!', full_name: 'Other' }
    });
    expect(regRes.statusCode).toBe(201);
    const otherBody = JSON.parse(regRes.body);
    otherUserToken = otherBody.token;
    otherUserAccountId = otherBody.defaultAccount.id;

    // First user tries to steal from second user's account
    const idempotencyKey = crypto.randomUUID();
    const response = await fastify.inject({
      method: 'POST',
      url: '/transfers',
      headers: {
        Authorization: `Bearer ${token}`, // 1st User Token
        'Idempotency-Key': idempotencyKey
      },
      payload: {
        source_account_id: otherUserAccountId, // 2nd User Account
        destination_account_id: defaultAccountId, // 1st User Account
        amount: 500,
        currency: 'EUR'
      }
    });

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body).message).toBe('Not authorized to transfer from this account');
  });
});
