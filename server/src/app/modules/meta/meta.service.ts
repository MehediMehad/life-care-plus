import { PaymentStatus, UserRole } from '@prisma/client';
import { IAuthUser } from '../../interfaces/common';
import prisma from '../../../shared/prisma';

const fetchDashboardMetaData = async (user: IAuthUser) => {
  let metaData;
  switch (user?.role) {
    case UserRole.SUPER_ADMIN:
      metaData = getSuperAdminMetaData();
      break;
    case UserRole.ADMIN:
      metaData = getAdminMetaData();
      break;
    case UserRole.DOCTOR:
      metaData = getDoctorMetaData(user as IAuthUser);
      break;
    case UserRole.PATIENT:
      metaData = getPatientMetaData(user);
      break;
    default:
      throw new Error('Invalid user role!');
  }

  return metaData;
};

// ❌পুরনো পদ্ধতি (ধীরে কাজ করে)  -> protiti table a akbar akbar kore jasse and await korai akta query complete na howai next query korte passena. So niche transaction system follow kora hoiase. Jar fole akta transaction er moddhe jotogulo query ase, sobai aksathe randomly call hobe.
// const getSuperAdminMetaData = async () => {
//   const appointmentCount = await prisma.appointment.count();
//   const patientCount = await prisma.patient.count();
//   const doctorCount = await prisma.doctor.count();
//   const adminCount = await prisma.admin.count();
//   const paymentCount = await prisma.payment.count();

//   const totalRevenue = await prisma.payment.aggregate({
//     _sum: { amount: true },
//     where: {
//       status: PaymentStatus.PAID,
//     },
//   });

//   const barChartData = await getBarChartData();
//   const pieCharData = await getPieChartData();

//   return {
//     appointmentCount,
//     patientCount,
//     doctorCount,
//     adminCount,
//     paymentCount,
//     totalRevenue,
//     barChartData,
//     pieCharData,
//   };
// };

// ✅ দ্রুত কাজ করার পদ্ধতি --> Transaction use kore all query aksate exicute howa suro korbe. Kono query er jonno wait korebena. Ai system ke bole N+1 Query Optimization
const getSuperAdminMetaData = async () => {
  // ✅ সব খাবার একসাথে এক ট্রে-তে নিয়ে আসা (Parallel Execution)
  const [appointmentCount, patientCount, doctorCount, adminCount, paymentCount, totalRevenue] =
    await prisma.$transaction([
      prisma.appointment.count(),
      prisma.patient.count(),
      prisma.doctor.count(),
      prisma.admin.count(),
      prisma.payment.count(),
      prisma.payment.aggregate({
        _sum: { amount: true },
        where: { status: PaymentStatus.PAID },
      }),
    ]);

  const barChartData = await getBarChartData();
  const pieCharData = await getPieChartData();

  return {
    appointmentCount,
    patientCount,
    doctorCount,
    adminCount,
    paymentCount,
    totalRevenue,
    barChartData,
    pieCharData,
  };
};

// ❌পুরনো পদ্ধতি (ধীরে কাজ করে)
// const getAdminMetaData = async () => {
//   const appointmentCount = await prisma.appointment.count();
//   const patientCount = await prisma.patient.count();
//   const doctorCount = await prisma.doctor.count();
//   const paymentCount = await prisma.payment.count();

//   const totalRevenue = await prisma.payment.aggregate({
//     _sum: { amount: true },
//     where: {
//       status: PaymentStatus.PAID,
//     },
//   });

//   const barChartData = await getBarChartData();
//   const pieCharData = await getPieChartData();

//   return {
//     appointmentCount,
//     patientCount,
//     doctorCount,
//     paymentCount,
//     totalRevenue,
//     barChartData,
//     pieCharData,
//   };
// };

// ✅ দ্রুত কাজ করার পদ্ধতি
const getAdminMetaData = async () => {
  const [appointmentCount, patientCount, doctorCount, paymentCount, totalRevenue] =
    await prisma.$transaction([
      prisma.appointment.count(),
      prisma.patient.count(),
      prisma.doctor.count(),
      prisma.payment.count(),
      prisma.payment.aggregate({
        _sum: { amount: true },
        where: {
          status: PaymentStatus.PAID,
        },
      }),
    ]);

  const barChartData = await getBarChartData();
  const pieCharData = await getPieChartData();

  return {
    appointmentCount,
    patientCount,
    doctorCount,
    paymentCount,
    totalRevenue,
    barChartData,
    pieCharData,
  };
};

// ❌পুরনো পদ্ধতি (ধীরে কাজ করে)
// const getDoctorMetaData = async (user: IAuthUser) => {
//   const doctorData = await prisma.doctor.findUniqueOrThrow({
//     where: {
//       email: user?.email,
//     },
//   });

//   const appointmentCount = await prisma.appointment.count({
//     where: {
//       doctorId: doctorData.id,
//     },
//   });

//   const patientCount = await prisma.appointment.groupBy({
//     by: ['patientId'],
//     _count: {
//       id: true,
//     },
//   });

//   const reviewCount = await prisma.review.count({
//     where: {
//       doctorId: doctorData.id,
//     },
//   });

//   const totalRevenue = await prisma.payment.aggregate({
//     _sum: {
//       amount: true,
//     },
//     where: {
//       appointment: {
//         doctorId: doctorData.id,
//       },
//       status: PaymentStatus.PAID,
//     },
//   });

//   const appointmentStatusDistribution = await prisma.appointment.groupBy({
//     by: ['status'],
//     _count: { id: true },
//     where: {
//       doctorId: doctorData.id,
//     },
//   });

//   const formattedAppointmentStatusDistribution = appointmentStatusDistribution.map(
//     ({ status, _count }) => ({
//       status,
//       count: Number(_count.id),
//     }),
//   );

//   return {
//     appointmentCount,
//     reviewCount,
//     patientCount: patientCount.length,
//     totalRevenue,
//     formattedAppointmentStatusDistribution,
//   };
// };

// ✅ দ্রুত কাজ করার পদ্ধতি
const getDoctorMetaData = async (user: IAuthUser) => {
  // ১. প্রথমে ডাক্তারের ডাটা বের করতে হবে (এটি আগে লাগবেই, তাই এটি একা থাকবে)
  const doctorData = await prisma.doctor.findUniqueOrThrow({
    where: {
      email: user?.email,
    },
  });

  // ২. বাকি ৫টি কুয়েরি একসাথে (Parallel) রান করবে
  const [appointmentCount, patientCount, reviewCount, totalRevenue, appointmentStatusDistribution] =
    await prisma.$transaction([
      // Total Appointments
      prisma.appointment.count({
        where: { doctorId: doctorData.id },
      }),

      // Total Unique Patients (আপনি এটি ডিলিট করে দিয়েছিলেন, এটি লাগবে!)
      prisma.appointment.groupBy({
        by: ['patientId'],
        where: { doctorId: doctorData.id },
        _count: { id: true },
        orderBy: { patientId: 'asc' }, // <--- TS Error ফিক্স করার জন্য এটি অ্যাড করা হলো
      }),

      // Total Reviews
      prisma.review.count({
        where: { doctorId: doctorData.id },
      }),

      // Total Revenue
      prisma.payment.aggregate({
        _sum: { amount: true },
        where: {
          appointment: { doctorId: doctorData.id },
          status: PaymentStatus.PAID,
        },
      }),

      // Appointment Status Distribution
      prisma.appointment.groupBy({
        by: ['status'],
        where: { doctorId: doctorData.id },
        _count: { id: true },
        orderBy: { status: 'asc' }, // <--- TS Error ফিক্স করার জন্য এটি অ্যাড করা হলো
      }),
    ]);

  // ৩. ডাটা ফরম্যাটিং
  const formattedAppointmentStatusDistribution = appointmentStatusDistribution.map(
    ({ status, _count }) => ({
      status,
      count: Number((_count as any)?.id || 0),
    }),
  );

  return {
    appointmentCount,
    reviewCount,
    patientCount: patientCount.length,
    totalRevenue,
    formattedAppointmentStatusDistribution,
  };
};

// ❌পুরনো পদ্ধতি (ধীরে কাজ করে)
// const getPatientMetaData = async (user: IAuthUser) => {
//   const patientData = await prisma.patient.findUniqueOrThrow({
//     where: {
//       email: user?.email,
//     },
//   });

//   const appointmentCount = await prisma.appointment.count({
//     where: {
//       patientId: patientData.id,
//     },
//   });

//   const prescriptionCount = await prisma.prescription.count({
//     where: {
//       patientId: patientData.id,
//     },
//   });

//   const reviewCount = await prisma.review.count({
//     where: {
//       patientId: patientData.id,
//     },
//   });

//   const appointmentStatusDistribution = await prisma.appointment.groupBy({
//     by: ['status'],
//     _count: { id: true },
//     where: {
//       patientId: patientData.id,
//     },
//   });

//   const formattedAppointmentStatusDistribution = appointmentStatusDistribution.map(
//     ({ status, _count }) => ({
//       status,
//       count: Number(_count.id),
//     }),
//   );

//   return {
//     appointmentCount,
//     prescriptionCount,
//     reviewCount,
//     formattedAppointmentStatusDistribution,
//   };
// };

// ✅ দ্রুত কাজ করার পদ্ধতি
const getPatientMetaData = async (user: IAuthUser) => {
  const patientData = await prisma.patient.findUniqueOrThrow({
    where: {
      email: user?.email,
    },
  });

  const [appointmentCount, prescriptionCount, reviewCount, appointmentStatusDistribution] =
    await prisma.$transaction([
      prisma.appointment.count({
        where: {
          patientId: patientData.id,
        },
      }),
      prisma.prescription.count({
        where: {
          patientId: patientData.id,
        },
      }),
      prisma.review.count({
        where: {
          patientId: patientData.id,
        },
      }),
      prisma.appointment.groupBy({
        by: ['status'],
        _count: { id: true },
        where: {
          patientId: patientData.id,
        },
        orderBy: { status: 'asc' }, // <--- TS Error ফিক্স করার জন্য এটি অ্যাড করা হলো
      }),
    ]);

  const formattedAppointmentStatusDistribution = appointmentStatusDistribution.map(
    ({ status, _count }) => ({
      status,
      count: Number((_count as any)?.id || 0),
    }),
  );

  return {
    appointmentCount,
    prescriptionCount,
    reviewCount,
    formattedAppointmentStatusDistribution,
  };
};

const getBarChartData = async () => {
  const appointmentCountByMonth: { month: Date; count: bigint }[] = await prisma.$queryRaw`
        SELECT DATE_TRUNC('month', "createdAt") AS month,
        CAST(COUNT(*) AS INTEGER) AS count
        FROM "appointments"
        GROUP BY month
        ORDER BY month ASC
    `;

  return appointmentCountByMonth;
};

const getPieChartData = async () => {
  const appointmentStatusDistribution = await prisma.appointment.groupBy({
    by: ['status'],
    _count: { id: true },
  });

  const formattedAppointmentStatusDistribution = appointmentStatusDistribution.map(
    ({ status, _count }) => ({
      status,
      count: Number(_count.id),
    }),
  );

  return formattedAppointmentStatusDistribution;
};

export const MetaService = {
  fetchDashboardMetaData,
};
