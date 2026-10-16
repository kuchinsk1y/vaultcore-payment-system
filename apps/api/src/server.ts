import { fastify } from './app';
import { OutboxWorker } from './modules/outbox/outbox.worker';
import { WebhookProcessor } from './modules/webhooks/webhooks.processor';

const start = async () => {
  try {
    const outboxWorker = new OutboxWorker(fastify.log);
    const webhookProcessor = new WebhookProcessor(fastify.log);
    outboxWorker.start();
    webhookProcessor.start();

    // Graceful shutdown
    fastify.addHook('onClose', async () => {
      outboxWorker.stop();
      webhookProcessor.stop();
    });

    const port = parseInt(process.env.PORT || '3000', 10);
    // Bind to loopback by default; set HOST=0.0.0.0 explicitly (e.g. in a container)
    const host = process.env.HOST || '127.0.0.1';
    await fastify.listen({ port, host });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
