import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../../infrastructure/database';
import { verifyJwt } from '../../infrastructure/middleware/jwt-auth';
import { AuditService } from '../audit/audit.service';

const SearchContactSchema = z.object({
  phone_number: z.string(),
});

const AddContactSchema = z.object({
  contact_user_id: z.string().uuid(),
});

export const contactsRoutes: FastifyPluginAsync = async (fastify) => {
  // 1. Search for a contact by phone number
  fastify.post('/search', { preHandler: [verifyJwt] }, async (request, reply) => {
    try {
      const { phone_number } = SearchContactSchema.parse(request.body);
      
      const user = await db.selectFrom('users')
        .select(['id', 'full_name', 'email'])
        .where('phone_number', '=', phone_number)
        .where('id', '!=', request.userId) // Don't search for yourself
        .executeTakeFirst();
        
      if (!user) {
        return reply.status(404).send({ error: 'Not Found', message: 'No user found with this phone number' });
      }

      // Find their accounts
      const accounts = await db.selectFrom('accounts')
        .select(['id as account_id', 'currency'])
        .where('user_id', '=', user.id)
        .where('status', '=', 'ACTIVE')
        .execute();

      return reply.send({
        user: {
          id: user.id,
          full_name: user.full_name,
          email: user.email,
        },
        accounts
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Bad Request', issues: error.issues });
      }
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });

  // 2. Add a contact
  fastify.post('/', { preHandler: [verifyJwt] }, async (request, reply) => {
    try {
      const { contact_user_id } = AddContactSchema.parse(request.body);
      
      const existing = await db.selectFrom('contacts')
        .select('id')
        .where('user_id', '=', request.userId)
        .where('contact_user_id', '=', contact_user_id)
        .executeTakeFirst();
        
      if (existing) {
        return reply.status(409).send({ error: 'Conflict', message: 'Contact already exists' });
      }

      const [contact] = await db.insertInto('contacts')
        .values({
          user_id: request.userId,
          contact_user_id
        })
        .returning(['id', 'contact_user_id', 'created_at'])
        .execute();
        
      await AuditService.log({ userId: request.userId, action: 'contact.added', metadata: { contactUserId: contact_user_id }, request });
      return reply.status(201).send(contact);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Bad Request', issues: error.issues });
      }
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });

  // 3. Get all saved contacts
  fastify.get('/', { preHandler: [verifyJwt] }, async (request, reply) => {
    try {
      const contacts = await db.selectFrom('contacts as c')
        .innerJoin('users as u', 'c.contact_user_id', 'u.id')
        .select([
          'c.id as contact_id',
          'u.id as user_id',
          'u.full_name',
          'u.email',
          'u.phone_number'
        ])
        .where('c.user_id', '=', request.userId)
        .orderBy('u.full_name', 'asc')
        .execute();

      // For each contact, fetch their accounts
      // To avoid N+1 queries, we could join or fetch them all. For simplicity here, fetch all active accounts for these users
      const contactUserIds = contacts.map(c => c.user_id);
      
      let accounts: any[] = [];
      if (contactUserIds.length > 0) {
        accounts = await db.selectFrom('accounts')
          .select(['user_id', 'id as account_id', 'currency'])
          .where('user_id', 'in', contactUserIds)
          .where('status', '=', 'ACTIVE')
          .execute();
      }

      const contactsWithAccounts = contacts.map(contact => ({
        ...contact,
        accounts: accounts.filter(a => a.user_id === contact.user_id).map(a => ({
          account_id: a.account_id,
          currency: a.currency
        }))
      }));

      return reply.send(contactsWithAccounts);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  });
};
