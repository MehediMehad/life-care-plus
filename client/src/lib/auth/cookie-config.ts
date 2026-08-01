export type CookieOptions = {
  secure: boolean;
  httpOnly: boolean;
  sameSite: 'none' | 'lax' | 'strict';
};

const isProduction = process.env.NODE_ENV === 'production';

export const getCookieOptions = (): CookieOptions => ({
  secure: isProduction,
  httpOnly: true,
  sameSite: isProduction ? 'none' : 'lax',
});
