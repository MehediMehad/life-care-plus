import { NotificationType, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import httpStatus from 'http-status';
import { Secret } from 'jsonwebtoken';
import config from '../../../config';
import { jwtHelpers } from '../../../helpers/jwtHelpers';
import prisma from '../../../shared/prisma';
import ApiError from '../../errors/ApiError';
import { addEmailJob } from '../../jobs/email.queue';
import { NotificationService } from '../notification/notification.service';

const MAX_FAILED_ATTEMPTS = 5; // ৫ বার ভুল পাসওয়ার্ড দিলে লক হবে
const LOCKOUT_DURATION_MINUTES = 30; // ৩০ মিনিটের জন্য লক থাকবে

const loginUser = async (
  payload: { email: string; password: string },
  ipAddress: string = 'unknown',
  userAgent: string = 'unknown',
) => {
  // ১. চেক করবো অ্যাকাউন্ট লক করা আছে কি না
  const recentAttempts = await prisma.loginAttempt.findMany({
    where: {
      email: payload.email,
      attemptAt: {
        gte: new Date(Date.now() - LOCKOUT_DURATION_MINUTES * 60 * 1000), // গত ৩০ মিনিটের ডাটা
      },
    },
    orderBy: { attemptAt: 'desc' },
  });

  const failedAttempts = recentAttempts.filter((a) => !a.success);

  if (failedAttempts.length >= MAX_FAILED_ATTEMPTS) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Too many failed attempts. Please try again later.');
  }

  // ২. ইউজার ডাটাবেসে আছে কি না
  const userData = await prisma.user.findUnique({
    where: {
      email: payload.email,
      status: UserStatus.ACTIVE,
    },
  });

  if (!userData) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid email or password!');
  }

  // ৩. পাসওয়ার্ড চেক
  const isCorrectPassword: boolean = await bcrypt.compare(
    payload.password,
    userData.password || '',
  );

  // ৪. লগিন অ্যাটেম্পট ডাটাবেসে সেভ করা (Security Audit)
  await prisma.loginAttempt.create({
    data: {
      email: payload.email,
      ipAddress,
      userAgent,
      success: isCorrectPassword,
    },
  });

  // যদি পাসওয়ার্ড ভুল হয়, তবে এখানেই থ্রো করে দিবে
  if (!isCorrectPassword) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid email or password!');
  }

  // ৫. লগিন সাকসেসফুল হলে আগের সব ফেইলড অ্যাটেম্পট মুছে ফেলা (যাতে সে ক্লিন চিট পায়)
  await prisma.loginAttempt.deleteMany({
    where: {
      email: payload.email,
      success: false,
    },
  });

  // ৬. আগের টোকেন জেনারেট করার কোড (এগুলো আগের মতোই থাকবে)
  const accessToken = jwtHelpers.generateToken(
    {
      email: userData.email,
      role: userData.role,
    },
    config.jwt.jwt_secret as Secret,
    config.jwt.expires_in as string,
  );

  const refreshToken = jwtHelpers.generateToken(
    {
      email: userData.email,
      role: userData.role,
    },
    config.jwt.refresh_token_secret as Secret,
    config.jwt.refresh_token_expires_in as string,
  );

  return {
    accessToken,
    refreshToken,
    needPasswordChange: userData.needPasswordChange,
  };
};

const refreshToken = async (token: string) => {
  let decodedData;
  try {
    decodedData = jwtHelpers.verifyToken(token, config.jwt.refresh_token_secret as Secret);
  } catch (err) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Invalid or expired reset token!');
  }

  const isBlacklisted = await prisma.tokenBlacklist.findUnique({
    where: { token },
  });
  if (isBlacklisted) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Token has been revoked! Please login again.');
  }

  const userData = await prisma.user.findUniqueOrThrow({
    where: {
      email: decodedData.email,
      status: UserStatus.ACTIVE,
    },
  });

  const accessToken = jwtHelpers.generateToken(
    {
      email: userData.email,
      role: userData.role,
    },
    config.jwt.jwt_secret as Secret,
    config.jwt.expires_in as string,
  );

  const refreshToken = jwtHelpers.generateToken(
    {
      email: userData.email,
      role: userData.role,
    },
    config.jwt.refresh_token_secret as Secret,
    config.jwt.refresh_token_expires_in as string,
  );

  return {
    accessToken,
    refreshToken,
    needPasswordChange: userData.needPasswordChange,
  };
};

const changePassword = async (user: any, payload: any) => {
  const userData = await prisma.user.findUniqueOrThrow({
    where: {
      email: user.email,
      status: UserStatus.ACTIVE,
    },
  });

  // পাসওয়ার্ড আছে কিনা তা আগে চেক করে নিচ্ছি এবং স্ট্রিংয়ে কনভার্ট করে দিচ্ছি
  if (!userData.password) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Password not set for this user. Please login via social providers.',
    );
  }

  const isCorrectPassword: boolean = await bcrypt.compare(
    String(payload.oldPassword),
    userData.password,
  );

  if (!isCorrectPassword) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Password incorrect!');
  }

  const hashedPassword: string = await bcrypt.hash(payload.newPassword, Number(config.salt_round));

  await prisma.user.update({
    where: {
      email: userData.email,
    },
    data: {
      password: hashedPassword,
      needPasswordChange: false,
    },
  });

  // Emit notification for password change
  await NotificationService.emitNotification(userData.id, {
    type: NotificationType.SYSTEM_ANNOUNCEMENT,
    title: 'Password Changed',
    message: 'Your password has been changed successfully.',
    priority: 'HIGH',
    actionUrl: '/dashboard/settings',
  });

  return {
    message: 'Password changed successfully!',
  };
};

const forgotPassword = async (payload: { email: string }) => {
  const userData = await prisma.user.findUniqueOrThrow({
    where: {
      email: payload.email,
      status: UserStatus.ACTIVE,
    },
  });

  const resetPassToken = jwtHelpers.generateToken(
    { email: userData.email, userId: userData.id, role: userData.role },
    config.jwt.reset_pass_secret as Secret,
    config.jwt.reset_pass_token_expires_in as string,
  );

  const resetPassLink =
    config.reset_pass_link + `?email=${encodeURIComponent(userData.email)}&token=${resetPassToken}`;

  await addEmailJob({
    email: userData.email,
    html: `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Reset Your Password</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
            <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                    <td align="center" style="padding: 40px 0;">
                        <table role="presentation" style="width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                            <!-- Header -->
                            <tr>
                                <td style="padding: 40px 40px 20px 40px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px 8px 0 0;">
                                    <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">Life Care Plus</h1>
                                </td>
                            </tr>
                            <!-- Content -->
                            <tr>
                                <td style="padding: 40px;">
                                    <h2 style="margin: 0 0 20px 0; color: #333333; font-size: 24px; font-weight: 600;">Reset Your Password</h2>
                                    <p style="margin: 0 0 20px 0; color: #666666; font-size: 16px; line-height: 24px;">
                                        Hello,
                                    </p>
                                    <p style="margin: 0 0 30px 0; color: #666666; font-size: 16px; line-height: 24px;">
                                        We received a request to reset your password for your Life Care Plus account. Click the button below to create a new password:
                                    </p>
                                    <!-- Button -->
                                    <table role="presentation" style="margin: 0 auto;">
                                        <tr>
                                            <td style="border-radius: 6px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
                                                <a href="${resetPassLink}" style="border: none; color: #ffffff; padding: 14px 32px; text-decoration: none; font-size: 16px; font-weight: 600; display: inline-block; border-radius: 6px;">
                                                    Reset Password
                                                </a>
                                            </td>
                                        </tr>
                                    </table>
                                    <p style="margin: 30px 0 20px 0; color: #666666; font-size: 14px; line-height: 20px;">
                                        Or copy and paste this link into your browser:
                                    </p>
                                    <p style="margin: 0 0 30px 0; color: #667eea; font-size: 14px; line-height: 20px; word-break: break-all;">
                                        ${resetPassLink}
                                    </p>
                                    <div style="border-top: 1px solid #eeeeee; padding-top: 20px; margin-top: 30px;">
                                        <p style="margin: 0 0 10px 0; color: #999999; font-size: 14px; line-height: 20px;">
                                            <strong>Security Notice:</strong>
                                        </p>
                                        <ul style="margin: 0 0 20px 0; padding-left: 20px; color: #999999; font-size: 14px; line-height: 20px;">
                                            <li>This link will expire in 15 minutes</li>
                                            <li>If you didn't request this password reset, please ignore this email</li>
                                            <li>For security reasons, never share this link with anyone</li>
                                        </ul>
                                    </div>
                                </td>
                            </tr>
                            <!-- Footer -->
                            <tr>
                                <td style="padding: 30px 40px; background-color: #f8f9fa; border-radius: 0 0 8px 8px; text-align: center;">
                                    <p style="margin: 0 0 10px 0; color: #999999; font-size: 14px;">
                                        © ${new Date().getFullYear()} Life Care Plus. All rights reserved.
                                    </p>
                                    <p style="margin: 0; color: #999999; font-size: 12px;">
                                        This is an automated email. Please do not reply.
                                    </p>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
        </html>
        `,
  });
};

const resetPassword = async (
  token: string | null,
  payload: { email?: string; password: string },
  user?: { email: string },
) => {
  let userEmail: string;

  // Case 1: Token-based reset (from forgot password email)
  if (token) {
    const decodedToken = jwtHelpers.verifyToken(token, config.jwt.reset_pass_secret as Secret);

    if (!decodedToken) {
      throw new ApiError(httpStatus.FORBIDDEN, 'Invalid or expired reset token!');
    }

    // Verify email from token matches the email in payload
    if (payload.email && decodedToken.email !== payload.email) {
      throw new ApiError(httpStatus.FORBIDDEN, 'Email mismatch! Invalid reset request.');
    }

    userEmail = decodedToken.email;
  }
  // Case 2: Authenticated user with needPasswordChange (newly created admin/doctor)
  else if (user && user.email) {
    console.log({ user }, 'needpassworchange');
    const authenticatedUser = await prisma.user.findUniqueOrThrow({
      where: {
        email: user.email,
        status: UserStatus.ACTIVE,
      },
    });

    // Verify user actually needs password change
    if (!authenticatedUser.needPasswordChange) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        "You don't need to reset your password. Use change password instead.",
      );
    }

    userEmail = user.email;
  } else {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Invalid request. Either provide a valid token or be authenticated.',
    );
  }

  // hash password
  const password = await bcrypt.hash(payload.password, Number(config.salt_round));

  // ১. প্রথমে চেক করুন ইউজারের Credentials আছে কি না
  const dbUser = await prisma.user.findUnique({
    where: { email: userEmail },
    include: { authAccounts: true },
  });

  const hasCredentials = dbUser?.authAccounts?.some((auth) => auth.provider === 'CREDENTIALS');

  // ৩. ডাটাবেজে আপডেট করুন
  await prisma.user.update({
    where: {
      email: userEmail,
    },
    data: {
      password,
      needPasswordChange: false,

      // জাদুকরী লজিক: যদি Credentials না থাকে, শুধু তখনই Create হবে!
      ...(hasCredentials
        ? {}
        : {
            authAccounts: {
              create: {
                provider: 'CREDENTIALS',
                providerId: userEmail, // অথবা ইউজারের আইডি
              },
            },
          }),
    },
  });
};

const getMe = async (user: any) => {
  const accessToken = user.accessToken;
  const decodedData = jwtHelpers.verifyToken(accessToken, config.jwt.jwt_secret as Secret);

  const userData = await prisma.user.findUniqueOrThrow({
    where: {
      email: decodedData.email,
      status: UserStatus.ACTIVE,
    },
    select: {
      id: true,
      email: true,
      role: true,
      needPasswordChange: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      authAccounts: {
        select: {
          id: true,
          provider: true,
          providerId: true,
        },
      },
      admin: {
        select: {
          id: true,
          name: true,
          email: true,
          profilePhoto: true,
          contactNumber: true,
          isDeleted: true,
          createdAt: true,
          updatedAt: true,
        },
      },
      doctor: {
        select: {
          id: true,
          name: true,
          email: true,
          profilePhoto: true,
          contactNumber: true,
          address: true,
          registrationNumber: true,
          experience: true,
          gender: true,
          appointmentFee: true,
          qualification: true,
          currentWorkingPlace: true,
          designation: true,
          averageRating: true,
          isDeleted: true,
          createdAt: true,
          updatedAt: true,
          doctorSpecialties: {
            include: {
              specialities: true,
            },
          },
        },
      },
      patient: {
        select: {
          id: true,
          name: true,
          email: true,
          profilePhoto: true,
          contactNumber: true,
          address: true,
          isDeleted: true,
          createdAt: true,
          updatedAt: true,
          patientHealthData: true,
        },
      },
    },
  });

  return userData;
};

const logout = async (token: string) => {
  const decodedData = jwtHelpers.verifyToken(
    token,
    config.jwt.refresh_token_secret as Secret,
  ) as any;

  // টোকেনে থাকা ইমেইল দিয়ে ইউজারের আসল আইডি বের করছি
  const user = await prisma.user.findUniqueOrThrow({
    where: { email: decodedData.email },
  });

  // টোকেনটি Blacklist এ ফেলে দেওয়া
  await prisma.tokenBlacklist.create({
    data: {
      token,
      userId: user.id,
      reason: 'logout',
      expiresAt: new Date(decodedData.exp * 1000), // টোকেনের মেয়াদ যেদিন শেষ হবে
    },
  });

  return { message: 'Logged out successfully' };
};

export const AuthServices = {
  loginUser,
  refreshToken,
  changePassword,
  forgotPassword,
  resetPassword,
  getMe,
  logout,
};
