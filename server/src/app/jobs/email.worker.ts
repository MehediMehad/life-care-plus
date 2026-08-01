import { Worker, Job } from 'bullmq';
import { getRedisConnection } from './connection';
import emailSender from '../../helpers/emailSender';
import logger from '../../lib/logger';

const EMAIL_QUEUE_NAME = 'email-dispatch-queue';

/**
 * BullMQ worker that processes email dispatch jobs.
 * Runs concurrently and uses nodemailer under the hood.
 */
export const emailWorker = new Worker(
  EMAIL_QUEUE_NAME,
  async (job: Job) => {
    const { email, html } = job.data;
    logger.info(`📧 Processing email job ${job.id} for ${email}`);

    try {
      await emailSender(email, html);
      logger.info(`✅ Email successfully sent to ${email}`);
    } catch (error) {
      logger.error(`❌ Failed to send email to ${email} (Job ${job.id}):`, error as Error);
      throw error; // Re-throw so BullMQ knows the job failed and can retry
    }
  },
  {
    connection: getRedisConnection() as any,
    concurrency: 5, // Process up to 5 emails in parallel
  },
);

emailWorker.on('completed', (job) => {
  logger.info(`🎉 Email Job ${job.id} has completed successfully.`);
});

emailWorker.on('failed', (job, err) => {
  logger.error(`⚠️ Email Job ${job?.id} failed permanently: ${err.message}`);
});
