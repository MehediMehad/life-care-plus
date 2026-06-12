import { UserRole } from '@prisma/client';
import { passwordHelpers } from './passwordHelpers';
import prisma from '../shared/prisma';

const seedSuperAdmin = async () => {
  try {
    const isExistSuperAdmin = await prisma.user.findFirst({
      where: {
        role: UserRole.ADMIN,
      },
    });

    if (isExistSuperAdmin) {
      console.log('Super admin already exists!');
      return;
    }

    const hashedPassword = await passwordHelpers.hashPassword('123456');

    const superAdminData = await prisma.user.create({
      data: {
        email: 'admin@gmail.com',
        password: hashedPassword,
        role: UserRole.ADMIN,
        admin: {
          create: {
            name: 'Admin',
            //email: "super@admin.com",
            contactNumber: '01234567890',
          },
        },
      },
    });

    console.log('Super Admin Created Successfully!', superAdminData);
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
};

export default seedSuperAdmin;
