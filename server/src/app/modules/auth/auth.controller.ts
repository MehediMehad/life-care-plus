import { Request, Response } from 'express';
import httpStatus from 'http-status';
import config from '../../../config';
import catchAsync from '../../../shared/catchAsync';
import sendResponse from '../../../shared/sendResponse';
import { AuthServices } from '../auth/auth.service';
import getTokenMaxAge from '../../../helpers/getTokenMaxAge';
import { cookieSet } from '../../../helpers/cookieSet';
import AppError from '../../errors/ApiError';
import { jwtHelpers } from '../../../helpers/jwtHelpers';
import { Secret } from 'jsonwebtoken';
import crypto from 'crypto';

const loginUser = catchAsync(async (req: Request, res: Response) => {
  const accessTokenExpiresIn = config.jwt.expires_in as string;
  const refreshTokenExpiresIn = config.jwt.refresh_token_expires_in as string;

  // convert accessTokenExpiresIn to milliseconds
  const accessTokenMaxAge: number = getTokenMaxAge(accessTokenExpiresIn);

  // convert refreshTokenExpiresIn to milliseconds
  const refreshTokenMaxAge: number = getTokenMaxAge(refreshTokenExpiresIn);

  const result = await AuthServices.loginUser(
    req.body,
    req.ip || 'unknown',
    req.headers['user-agent'] || 'unknown',
  );
  const { refreshToken, accessToken } = result;

  cookieSet(res, 'accessToken', accessToken, accessTokenMaxAge);
  cookieSet(res, 'refreshToken', refreshToken, refreshTokenMaxAge);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Logged in successfully!',
    data: {
      needPasswordChange: result.needPasswordChange,
    },
  });
});

const refreshToken = catchAsync(async (req: Request, res: Response) => {
  const { refreshToken } = req.cookies;

  const accessTokenExpiresIn = config.jwt.expires_in as string;
  const refreshTokenExpiresIn = config.jwt.refresh_token_expires_in as string;

  const accessTokenMaxAge: number = getTokenMaxAge(accessTokenExpiresIn);
  const refreshTokenMaxAge: number = getTokenMaxAge(refreshTokenExpiresIn);

  const result = await AuthServices.refreshToken(refreshToken);

  cookieSet(res, 'accessToken', result.accessToken, accessTokenMaxAge);
  cookieSet(res, 'refreshToken', result.refreshToken, refreshTokenMaxAge);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Access token genereated successfully!',
    data: {
      message: 'Access token genereated successfully!',
    },
  });
});

const changePassword = catchAsync(async (req: Request & { user?: any }, res: Response) => {
  const user = req.user;

  const result = await AuthServices.changePassword(user, req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Password Changed successfully',
    data: result,
  });
});

const forgotPassword = catchAsync(async (req: Request, res: Response) => {
  await AuthServices.forgotPassword(req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Check your email!',
    data: null,
  });
});

const resetPassword = catchAsync(async (req: Request & { user?: any }, res: Response) => {
  // Extract token from Authorization header (remove "Bearer " prefix)
  const authHeader = req.headers.authorization;
  console.log({ authHeader });
  const token = authHeader ? authHeader.replace('Bearer ', '') : null;
  const user = req.user; // Will be populated if authenticated via middleware

  await AuthServices.resetPassword(token, req.body, user);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Password Reset!',
    data: null,
  });
});

const getMe = catchAsync(async (req: Request & { user?: any }, res: Response) => {
  const accessToken = req.cookies.accessToken;

  const result = await AuthServices.getMe({ accessToken });

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'User retrieved successfully',
    data: result,
  });
});

const socialLoginCallback = catchAsync(async (req: Request, res: Response) => {
  const user = req.user as any;

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'User not found');
  }

  const accessToken = jwtHelpers.generateToken(
    {
      email: user.email,
      role: user.role,
    },
    config.jwt.jwt_secret as Secret,
    config.jwt.expires_in as string,
  );

  const refreshToken = jwtHelpers.generateToken(
    {
      email: user.email,
      role: user.role,
    },
    config.jwt.refresh_token_secret as Secret,
    config.jwt.refresh_token_expires_in as string,
  );

  // Generate one-time code and store tokens in Redis
  const oneTimeCode = crypto.randomUUID();
  const { redis } = await import('../../../lib/redis');
  await redis.set(
    `social_login_code_${oneTimeCode}`,
    JSON.stringify({ accessToken, refreshToken }),
    'EX',
    60,
  );

  // Redirect with only the one-time code (no tokens in URL)
  let redirectTo = req.query.state ? (req.query.state as string) : '';
  if (redirectTo.startsWith('/')) {
    redirectTo = redirectTo.slice(1);
  }
  const redirectUrl = `${config.frontendUrl}/${redirectTo}?code=${oneTimeCode}`;

  // Cache for Facebook double-submit prevention
  const fbCode = req.query.code as string;
  if (fbCode) {
    await redis.set(`fb_code_${fbCode}`, redirectUrl, 'EX', 60);
  }

  res.redirect(redirectUrl);
});

const exchangeSocialCode = catchAsync(async (req: Request, res: Response) => {
  const { code } = req.body;

  if (!code) {
    throw new AppError(httpStatus.BAD_REQUEST, 'Code is required');
  }

  const { redis } = await import('../../../lib/redis');
  const storedData = await redis.get(`social_login_code_${code}`);

  if (!storedData) {
    throw new AppError(httpStatus.GONE, 'Code is invalid or expired. Please login again.');
  }

  // Delete code immediately (single-use)
  await redis.del(`social_login_code_${code}`);

  const { accessToken, refreshToken } = JSON.parse(storedData);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Social login successful!',
    data: { accessToken, refreshToken },
  });
});

const logout = catchAsync(async (req: Request, res: Response) => {
  const { refreshToken } = req.cookies;

  if (refreshToken) {
    await AuthServices.logout(refreshToken);
  }

  // ব্রাউজার থেকে কুকি ডিলিট করে দেওয়া
  res.clearCookie('accessToken');
  res.clearCookie('refreshToken');

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Logged out successfully!',
    data: null,
  });
});

export const AuthController = {
  loginUser,
  refreshToken,
  changePassword,
  forgotPassword,
  resetPassword,
  getMe,
  socialLoginCallback,
  exchangeSocialCode,
  logout,
};
