import { UserRole } from '@prisma/client';
import express, { NextFunction, Request, Response } from 'express';
import auth from '../../middlewares/auth';
import { authLimiter } from '../../middlewares/rateLimiter';
import { AuthController } from '../auth/auth.controller';
import passport from 'passport';
import config from '../../../config';

const router = express.Router();

router.post('/login', authLimiter, AuthController.loginUser);

router.post('/refresh-token', AuthController.refreshToken);

router.post(
  '/change-password',
  auth(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DOCTOR, UserRole.PATIENT),
  AuthController.changePassword,
);

router.post('/forgot-password', AuthController.forgotPassword);

router.post(
  '/reset-password',
  (req: Request, res: Response, next: NextFunction) => {
    //user is resetting password without token and logged in newly created admin or doctor
    if (!req.headers.authorization && req.cookies.accessToken) {
      auth(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DOCTOR, UserRole.PATIENT)(req, res, next);
    } else {
      //user is resetting password via email link with token
      next();
    }
  },
  AuthController.resetPassword,
);

router.get('/me', AuthController.getMe);

// For Google Authentication
// ১. এই রাউটে হিট করলে গুগল লগিন পেজে নিয়ে যাবে
router.get('/google', (req, res, next) => {
  const redirect = req.query.redirect || '/';
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    state: redirect as string,
  })(req, res, next);
});
// ২. গুগল লগিন সাকসেসফুল হলে গুগল এই লিংকে ডাটা পাঠাবে
router.get(
  '/google/callback',
  passport.authenticate('google', { failureRedirect: `${config.frontendUrl}/login?error=true` }),
  AuthController.socialLoginCallback,
);

// For Facebook Authentication
// ১. এই রাউটে হিট করলে ফেসবুক লগিন পেজে নিয়ে যাবে
router.get('/facebook', (req, res, next) => {
  const redirect = req.query.redirect || '/';
  passport.authenticate('facebook', {
    scope: ['public_profile', 'email'], // আমরা ইমেইল পারমিশন চাচ্ছি
    state: redirect as string,
  })(req, res, next);
});

// ২. ফেসবুক লগিন সাকসেসফুল হলে ডাটা এখানে আসবে
router.get(
  '/facebook/callback',
  async (req, res, next) => {
    const code = req.query.code as string;

    // ১. চেক করবো এই কোড দিয়ে অলরেডি লগিন হয়েছে কিনা (Redis Cache)
    if (code) {
      const { redis } = await import('../../../lib/redis');
      const cachedUrl = await redis.get(`fb_code_${code}`);
      if (cachedUrl) {
        // যদি অলরেডি প্রসেস হয়ে থাকে, তবে আগের তৈরি করা URL-এই রিডাইরেক্ট করে দিবো!
        return res.redirect(cachedUrl);
      }
    }

    passport.authenticate('facebook', (err: any, user: any, info: any) => {
      if (err) {
        if (err.message && err.message.includes('code has been used')) {
          return res.redirect(`${config.frontendUrl}/login?error=code_used`);
        }
        return res.redirect(`${config.frontendUrl}/login?error=true`);
      }
      if (!user) {
        return res.redirect(`${config.frontendUrl}/login?error=true`);
      }
      req.logIn(user, (loginErr) => {
        if (loginErr) return next(loginErr);
        next();
      });
    })(req, res, next);
  },
  AuthController.socialLoginCallback,
);

router.post('/exchange-code', AuthController.exchangeSocialCode);

router.post('/logout', AuthController.logout);

export const AuthRoutes = router;
