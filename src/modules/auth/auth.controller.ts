import crypto from 'crypto';
import { FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from 'bcrypt';
import { db } from '../../infrastructure/database';
import { signJwt } from '../../infrastructure/middleware/jwt-auth';
export interface RegisterBody {
  email: string;
  password: string;
  full_name: string;
}

export interface LoginBody {
  email: string;
  password: string;
}

export const registerUser = async (request: FastifyRequest<{ Body: RegisterBody }>, reply: FastifyReply) => {
  const { email, password, full_name } = request.body;

  try {
    // Check if user exists
    const existingUser = await db
      .selectFrom('users')
      .where('email', '=', email)
      .select('id')
      .executeTakeFirst();

    if (existingUser) {
      return reply.status(409).send({ error: 'CONFLICT', message: 'User with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userId = crypto.randomUUID();
    const accountId = crypto.randomUUID();

    // Run in transaction: Create User -> Create Default Account
    const result = await db.transaction().execute(async (trx) => {
      const newUser = await trx
        .insertInto('users')
        .values({
          id: userId,
          email,
          password_hash: passwordHash,
          full_name,
        })
        .returning(['id', 'email', 'full_name', 'created_at'])
        .executeTakeFirstOrThrow();

      const newAccount = await trx
        .insertInto('accounts')
        .values({
          id: accountId,
          user_id: newUser.id,
          currency: 'EUR',
          status: 'ACTIVE',
        })
        .returning(['id', 'currency', 'status'])
        .executeTakeFirstOrThrow();

      return { user: newUser, account: newAccount };
    });

    const token = signJwt(result.user.id);

    return reply.status(201).send({
      message: 'Registration successful',
      token,
      user: result.user,
      defaultAccount: result.account
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({ error: 'INTERNAL_SERVER_ERROR', message: 'Registration failed' });
  }
};

export const loginUser = async (request: FastifyRequest<{ Body: LoginBody }>, reply: FastifyReply) => {
  const { email, password } = request.body;

  try {
    const user = await db
      .selectFrom('users')
      .where('email', '=', email)
      .select(['id', 'email', 'password_hash', 'full_name'])
      .executeTakeFirst();

    if (!user || !user.password_hash) {
      return reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Invalid credentials' });
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Invalid credentials' });
    }

    const token = signJwt(user.id);

    return reply.send({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name
      }
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({ error: 'INTERNAL_SERVER_ERROR', message: 'Login failed' });
  }
};
