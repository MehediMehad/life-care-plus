import { Response } from 'express';

const isProduction = process.env.NODE_ENV === 'production';

export const cookieSet = (res: Response, key: string, token: string, maxAge: number) => {
  res.cookie(key, token, {
    secure: isProduction,
    httpOnly: true,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge,
  });
};
