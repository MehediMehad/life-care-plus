import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Application, NextFunction, Request, Response } from 'express';
import httpStatus from 'http-status';
import cron from 'node-cron';
import globalErrorHandler from './app/middlewares/globalErrorHandler';
import { requestLogger, requestTracker } from './app/middlewares/requestLogger';
import logger from './lib/logger';
import router from './app/routes';
import { PaymentController } from './app/modules/payment/payment.controller';
import { AppointmentService } from './app/modules/appointment/appointment.service';
import { redis } from './lib/redis';
import expressSession from 'express-session';
import passport from 'passport';
import envVars from './config';
import './config/passport';
import * as Sentry from '@sentry/node';

const app: Application = express();

// Initialize Sentry
Sentry.init({
  dsn: envVars.sentryDsn,
  tracesSampleRate: 1.0,
});

app.use(
  expressSession({
    secret: envVars.expressSessionSecret as string,
    resave: false,
    saveUninitialized: false,
  }),
);
app.use(passport.initialize());
app.use(passport.session());

app.use(cookieParser());

app.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  PaymentController.handleStripeWebhookEvent,
);

app.use(
  cors({
    origin: ['http://localhost:3000', 'http://localhost:3001', envVars.frontendUrl as string],
    credentials: true,
  }),
);

// Add request tracking middleware
app.use(requestTracker);

// Add request logging middleware (Morgan with Winston)
app.use(requestLogger);

//parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Cron job for cleaning up unpaid appointments
cron.schedule('*/5 * * * *', () => {
  const startTime = Date.now();
  try {
    logger.info('🔄 Running unpaid appointment cleanup');
    AppointmentService.cancelUnpaidAppointments();
    const duration = Date.now() - startTime;
    logger.cronJob('cancelUnpaidAppointments', true, duration);
  } catch (err) {
    const duration = Date.now() - startTime;
    logger.cronJob('cancelUnpaidAppointments', false, duration);
    logger.error('❌ Cron job error', err as Error);
  }
});

app.get('/', (_req: Request, res: Response) => {
  res.send({
    Message: 'Life Care Plus Server is running..',
  });
});

app.get('/test-redis', async (req, res) => {
  await redis.set('name', 'Life Care Plus');

  const value = await redis.get('name');

  res.json({
    success: true,
    message: 'Redis is working',
    data: value,
  });
});

app.use('/api/v1', router);

// Sentry Error Handler (অবশ্যই গ্লোবাল এরর হ্যান্ডলারের আগে বসাতে হবে)
Sentry.setupExpressErrorHandler(app);

app.use(globalErrorHandler);

app.use((req: Request, res: Response, _next: NextFunction) => {
  res.status(httpStatus.NOT_FOUND).json({
    success: false,
    message: 'API NOT FOUND!',
    error: {
      path: req.originalUrl,
      message: 'Your requested path is not found!',
    },
  });
});

export default app;
