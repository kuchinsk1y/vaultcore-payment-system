import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { fastify } from '../../src/app';
import { issueTestToken } from '../helpers/auth';
import { signAccessToken } from '../../src/modules/security/jwt';
import { db } from '../../src/infrastructure/database';
import { seedSystemData } from '../helpers/seed';
import { sql } from 'kysely';

describe('Users and Accounts API', () => {
  beforeAll(async () => {
    await fastify.ready();
    // Clean up DB before tests
    await sql`TRUNCATE TABLE accounts, users CASCADE`.execute(db);
    await seedSystemData();
  });

  afterAll(async () => {
    await fastify.close();
    await db.destroy();
  });

  let createdUserId: string;

  describe('POST /users', () => {
    it('should create a new user', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/users',
        payload: {
          email: 'api-test@example.com',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload);
      expect(body.id).toBeDefined();
      expect(body.email).toBe('api-test@example.com');
      
      createdUserId = body.id;
    });

    it('should return 400 for invalid email', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/users',
        payload: {
          email: 'not-an-email',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 409 for duplicate email', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/users',
        payload: {
          email: 'api-test@example.com',
        },
      });

      expect(response.statusCode).toBe(409);
      const body = JSON.parse(response.payload);
      expect(body.error).toBe('Conflict');
    });
  });

  describe('POST /accounts', () => {
    it('should create a new account for the user', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/accounts',
        headers: { 'authorization': `Bearer ${await issueTestToken(createdUserId)}` },
        payload: {
          currency: 'EUR',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload);
      expect(body.id).toBeDefined();
      expect(body.user_id).toBe(createdUserId);
      expect(body.currency).toBe('EUR');
      expect(body.status).toBe('ACTIVE');
    });

    it('should reject a token whose session does not exist (401)', async () => {
      const fakeToken = signAccessToken('00000000-0000-0000-0000-000000000000', crypto.randomUUID());
      const response = await fastify.inject({
        method: 'POST',
        url: '/accounts',
        headers: { 'authorization': `Bearer ${fakeToken}` },
        payload: {
          currency: 'USD',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 400 for invalid currency format', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/accounts',
        headers: { 'authorization': `Bearer ${await issueTestToken(createdUserId)}` },
        payload: {
          currency: 'EURO', // Too long (expected 3)
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.error).toBe('Bad Request');
    });
  });
});
