import * as bcrypt from 'bcryptjs';
import config from '../config';

const hashPassword = async (password: string): Promise<string> => {
  return await bcrypt.hash(password, Number(config.salt_round));
};

const comparePassword = async (password: string, hash: string): Promise<boolean> => {
  return await bcrypt.compare(password, hash);
};

export const passwordHelpers = {
  hashPassword,
  comparePassword,
};
