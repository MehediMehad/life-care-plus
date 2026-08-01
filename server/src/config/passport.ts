import passport from 'passport';
import { Strategy as GoogleStrategy, Profile, VerifyCallback } from 'passport-google-oauth20';
import config from './index'; //
import prisma from '../shared/prisma';
import { Strategy as FacebookStrategy, Profile as FacebookProfile } from 'passport-facebook';

passport.use(
  new GoogleStrategy(
    {
      clientID: config.googleClientId as string,
      clientSecret: config.googleClientSecret as string,
      callbackURL: config.googleCallbackUrl as string,
    },
    async (accessToken: string, refreshToken: string, profile: Profile, done: VerifyCallback) => {
      try {
        const email = profile?.emails?.[0]?.value;
        if (!email) {
          return done(new Error('Email not found from Google'), false);
        }

        // লজিক ১: ডাটাবেজে চেক করুন এই ইমেইলের ইউজার আছে কিনা
        let user = await prisma.user.findUnique({
          where: { email },
          include: { authAccounts: true }, // Auth অ্যাকাউন্টগুলোও নিয়ে আসলাম
        });

        // লজিক ২: ইউজার না থাকলে নতুন ইউজার এবং Patient প্রোফাইল বানাবো
        if (!user) {
          user = await prisma.user.create({
            data: {
              email,
              role: 'PATIENT',
              // জাদুকরী Nested Write: একসাথে Patient এবং AuthAccount তৈরি
              patient: {
                create: {
                  name: profile?.displayName || 'Google User',
                  profilePhoto: profile?.photos?.[0]?.value,
                },
              },
              authAccounts: {
                create: {
                  provider: 'GOOGLE',
                  providerId: profile.id,
                },
              },
            },
            include: { authAccounts: true },
          });
        }

        // লজিক ৩: ইউজার থাকলে চেক করবো তার AuthAccount এ গুগল অ্যাড করা আছে কিনা
        else {
          const hasGoogleAuth = user.authAccounts.find((auth) => auth.provider === 'GOOGLE');
          if (!hasGoogleAuth) {
            // যদি গুগল দিয়ে আগে লগিন না করে থাকে, তবে AuthAccount এ গুগল যোগ করে দিবো
            await prisma.authAccount.create({
              data: {
                userId: user.id,
                provider: 'GOOGLE',
                providerId: profile.id,
              },
            });
          }
        }

        // সব ঠিক থাকলে ইউজার ডাটা রিটার্ন করে দিবো
        return done(null, user as any);
      } catch (error) {
        return done(error as Error, false);
      }
    },
  ),
);

passport.use(
  new FacebookStrategy(
    {
      clientID: config.facebookAppId as string,
      clientSecret: config.facebookAppSecret as string,
      callbackURL: config.facebookCallbackUrl as string,
      // ফেসবুক ডিফল্টভাবে ইমেইল বা ছবি দেয় না, তাই আলাদাভাবে চাইতে হয়
      profileFields: ['id', 'emails', 'name', 'picture.type(large)'],
    },
    async (accessToken: string, refreshToken: string, profile: FacebookProfile, done: any) => {
      try {
        const email = profile?.emails?.[0]?.value;
        if (!email) {
          // অনেক সময় ইউজার শুধু ফোন নাম্বার দিয়ে ফেসবুক খোলে, তখন ইমেইল থাকে না।
          return done(new Error('Email not found from Facebook account'), false);
        }

        // লজিক ১: ডাটাবেজে চেক করুন এই ইমেইলের ইউজার আছে কিনা
        let user = await prisma.user.findUnique({
          where: { email },
          include: { authAccounts: true },
        });

        // লজিক ২: ইউজার না থাকলে নতুন ইউজার এবং Patient প্রোফাইল বানাবো
        if (!user) {
          user = await prisma.user.create({
            data: {
              email,
              role: 'PATIENT',
              patient: {
                create: {
                  name:
                    profile?.displayName ||
                    `${profile.name?.givenName} ${profile.name?.familyName}`,
                  profilePhoto: profile?.photos?.[0]?.value,
                },
              },
              authAccounts: {
                create: {
                  provider: 'FACEBOOK',
                  providerId: profile.id,
                },
              },
            },
            include: { authAccounts: true },
          });
        }
        // লজিক ৩: ইউজার থাকলে চেক করবো তার AuthAccount এ ফেসবুক অ্যাড করা আছে কিনা
        else {
          const hasFacebookAuth = user.authAccounts.find((auth) => auth.provider === 'FACEBOOK');
          if (!hasFacebookAuth) {
            await prisma.authAccount.create({
              data: {
                userId: user.id,
                provider: 'FACEBOOK',
                providerId: profile.id,
              },
            });
          }
        }

        return done(null, user as any);
      } catch (error) {
        return done(error as Error, false);
      }
    },
  ),
);

// সেশনে ইউজার আইডি সেভ রাখা
passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

// সেশন থেকে ইউজার আইডি দিয়ে ইউজারের ডাটা বের করা
passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    done(null, user as any);
  } catch (error) {
    done(error, null);
  }
});
