import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fastify } from '../../apps/api/server';
import { db } from '../../src/infrastructure/database';
import { sql } from 'kysely';

describe('Users and Accounts API', () => {
  beforeAll(async () => {
    await fastify.ready();
    // Clean up DB before tests
    await sql`TRUNCATE TABLE accounts, users CASCADE`.execute(db);
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
        payload: {
          user_id: createdUserId,
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

    it('should return 400 for non-existent user (foreign key violation)', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/accounts',
        payload: {
          user_id: '00000000-0000-0000-0000-000000000000',
          currency: 'USD',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.message).toBe('Invalid user_id');
    });

    it('should return 400 for invalid currency format', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/accounts',
        payload: {
          user_id: createdUserId,
          currency: 'EURO', // Too long (expected 3)
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.error).toBe('Bad Request');
    });
  });
});
