import { Doctor, Prisma, UserStatus } from '@prisma/client';
import { askOpenRouter } from '../../../helpers/openRouterClient';
import { paginationHelper } from '../../../helpers/paginationHelper';
import prisma from '../../../shared/prisma';
import { IPaginationOptions } from '../../interfaces/pagination';
import { doctorSearchableFields } from '../doctor/doctor.constants';
import { IDoctorFilterRequest, IDoctorUpdate } from '../doctor/doctor.interface';
import { redisHelper } from '../../../helpers/redisHelper';
import { doctorCacheKeys } from './doctor.constants';

const DOCTOR_CACHE_TTL = 60 * 60; // 1 hour

const getAllFromDB = async (filters: IDoctorFilterRequest, options: IPaginationOptions) => {
  const { limit, page, skip, sortBy, sortOrder } = paginationHelper.calculatePagination(options);
  const { searchTerm, specialties, ...filterData } = filters;

  const cacheKey = doctorCacheKeys.adminList(filters, options);

  console.log('cacheKey', cacheKey);

  const result = await redisHelper.getOrSetCache(
    cacheKey,
    async () => {
      const andConditions: Prisma.DoctorWhereInput[] = [];

      if (searchTerm) {
        andConditions.push({
          OR: doctorSearchableFields.map((field) => ({
            [field]: {
              contains: searchTerm,
              mode: 'insensitive',
            },
          })),
        });
      }

      if (specialties && specialties.length > 0) {
        const specialtiesArray = Array.isArray(specialties) ? specialties : [specialties];

        andConditions.push({
          doctorSpecialties: {
            some: {
              specialities: {
                title: {
                  in: specialtiesArray,
                  mode: 'insensitive',
                },
              },
            },
          },
        });
      }

      if (Object.keys(filterData).length > 0) {
        const filterConditions = Object.keys(filterData).map((key) => ({
          [key]: {
            equals: (filterData as any)[key],
          },
        }));

        andConditions.push(...filterConditions);
      }

      andConditions.push({
        isDeleted: false,
      });

      const whereConditions: Prisma.DoctorWhereInput =
        andConditions.length > 0 ? { AND: andConditions } : {};

      const data = await prisma.doctor.findMany({
        where: whereConditions,
        skip,
        take: limit,
        orderBy: sortBy && sortOrder ? { [sortBy]: sortOrder } : { averageRating: 'desc' },
        include: {
          doctorSpecialties: {
            include: {
              specialities: {
                select: {
                  title: true,
                },
              },
            },
          },
          doctorSchedules: {
            include: {
              schedule: true,
            },
          },
          review: {
            select: {
              rating: true,
            },
          },
        },
      });

      const total = await prisma.doctor.count({
        where: whereConditions,
      });

      return {
        meta: {
          total,
          page,
          limit,
        },
        data,
      };
    },
    DOCTOR_CACHE_TTL,
  );

  console.log("result", result);


  return result;
};

const getByIdFromDB = async (id: string): Promise<Doctor | null> => {
  const cacheKey = doctorCacheKeys.details(id);

  const result = await redisHelper.getOrSetCache(
    cacheKey,
    async () => {
      const doctor = await prisma.doctor.findUnique({
        where: {
          id,
          isDeleted: false,
        },
        include: {
          doctorSpecialties: {
            include: {
              specialities: true,
            },
          },
          doctorSchedules: {
            include: {
              schedule: true,
            },
          },
          review: true,
        },
      });

      return doctor;
    },
    DOCTOR_CACHE_TTL,
  );

  return result;
};

const updateIntoDB = async (id: string, payload: IDoctorUpdate) => {
  const { specialties, removeSpecialties, ...doctorData } = payload;

  const doctorInfo = await prisma.doctor.findUniqueOrThrow({
    where: {
      id,
      isDeleted: false,
    },
  });

  await prisma.$transaction(async (transactionClient) => {
    if (Object.keys(doctorData).length > 0) {
      await transactionClient.doctor.update({
        where: {
          id,
        },
        data: doctorData,
      });
    }

    if (removeSpecialties && Array.isArray(removeSpecialties) && removeSpecialties.length > 0) {
      const existingDoctorSpecialties = await transactionClient.doctorSpecialties.findMany({
        where: {
          doctorId: doctorInfo.id,
          specialitiesId: {
            in: removeSpecialties,
          },
        },
      });

      if (existingDoctorSpecialties.length !== removeSpecialties.length) {
        const foundIds = existingDoctorSpecialties.map((ds) => ds.specialitiesId);

        const notFound = removeSpecialties.filter((id) => !foundIds.includes(id));

        throw new Error(`Cannot remove non-existent specialties: ${notFound.join(', ')}`);
      }

      await transactionClient.doctorSpecialties.deleteMany({
        where: {
          doctorId: doctorInfo.id,
          specialitiesId: {
            in: removeSpecialties,
          },
        },
      });
    }

    if (specialties && Array.isArray(specialties) && specialties.length > 0) {
      const existingSpecialties = await transactionClient.specialties.findMany({
        where: {
          id: {
            in: specialties,
          },
        },
        select: {
          id: true,
        },
      });

      const existingSpecialtyIds = existingSpecialties.map((s) => s.id);

      const invalidSpecialties = specialties.filter((id) => !existingSpecialtyIds.includes(id));

      if (invalidSpecialties.length > 0) {
        throw new Error(`Invalid specialty IDs: ${invalidSpecialties.join(', ')}`);
      }

      const currentDoctorSpecialties = await transactionClient.doctorSpecialties.findMany({
        where: {
          doctorId: doctorInfo.id,
          specialitiesId: {
            in: specialties,
          },
        },
        select: {
          specialitiesId: true,
        },
      });

      const currentSpecialtyIds = currentDoctorSpecialties.map((ds) => ds.specialitiesId);

      const newSpecialties = specialties.filter((id) => !currentSpecialtyIds.includes(id));

      if (newSpecialties.length > 0) {
        const doctorSpecialtiesData = newSpecialties.map((specialtyId) => ({
          doctorId: doctorInfo.id,
          specialitiesId: specialtyId,
        }));

        await transactionClient.doctorSpecialties.createMany({
          data: doctorSpecialtiesData,
        });
      }
    }
  });

  const result = await prisma.doctor.findUnique({
    where: {
      id: doctorInfo.id,
    },
    include: {
      doctorSpecialties: {
        include: {
          specialities: true,
        },
      },
    },
  });

  // Doctor update হলে doctor list এবং details cache clear হবে
  await redisHelper.deleteCacheByPattern(doctorCacheKeys.allDoctorLists());
  await redisHelper.deleteCacheByPattern(doctorCacheKeys.details(id));

  return result;
};

const deleteFromDB = async (id: string): Promise<Doctor> => {
  const result = await prisma.$transaction(async (transactionClient) => {
    const deleteDoctor = await transactionClient.doctor.delete({
      where: {
        id,
      },
    });

    await transactionClient.user.delete({
      where: {
        email: deleteDoctor.email,
      },
    });

    return deleteDoctor;
  });

  // Doctor delete হলে doctor cache clear হবে
  await redisHelper.deleteCacheByPattern(doctorCacheKeys.allDoctorLists());
  await redisHelper.deleteCacheByPattern(doctorCacheKeys.details(id));

  return result;
};

const softDelete = async (id: string): Promise<Doctor> => {
  const result = await prisma.$transaction(async (transactionClient) => {
    const deleteDoctor = await transactionClient.doctor.update({
      where: { id },
      data: {
        isDeleted: true,
      },
    });

    await transactionClient.user.update({
      where: {
        email: deleteDoctor.email,
      },
      data: {
        status: UserStatus.DELETED,
      },
    });

    return deleteDoctor;
  });

  // Soft delete হলেও doctor cache clear হবে
  await redisHelper.deleteCacheByPattern(doctorCacheKeys.allDoctorLists());
  await redisHelper.deleteCacheByPattern(doctorCacheKeys.details(id));

  return result;
};

type PatientInput = {
  symptoms: string;
};

const getAISuggestion = async (input: PatientInput) => {
  const doctors = await prisma.doctor.findMany({
    where: { isDeleted: false },
    include: {
      doctorSpecialties: {
        include: { specialities: true },
      },
      review: { select: { rating: true } },
    },
  });

  if (doctors.length === 0) {
    return [];
  }

  const doctorsWithRatings = doctors.map((doctor: any) => {
    const allSpecialties = doctor.doctorSpecialties
      .map((ds: any) => ds.specialities?.title)
      .filter(Boolean);

    return {
      id: doctor.id,
      name: doctor.name,
      email: doctor.email,
      profilePhoto: doctor.profilePhoto,
      contactNumber: doctor.contactNumber,
      address: doctor.address,
      registrationNumber: doctor.registrationNumber,
      experience: doctor.experience,
      gender: doctor.gender,
      appointmentFee: doctor.appointmentFee,
      qualification: doctor.qualification,
      currentWorkingPlace: doctor.currentWorkingPlace,
      designation: doctor.designation,
      averageRating:
        doctor.review && doctor.review.length > 0
          ? doctor.review.reduce((sum: number, r: any) => sum + r.rating, 0) / doctor.review.length
          : 0,
      specialties: allSpecialties,
      primarySpecialty: allSpecialties[0] || 'General',
    };
  });

  const systemMessage = {
    role: 'system',
    content:
      'You are an expert medical recommendation assistant. Analyze patient symptoms and match them to the most appropriate medical specialty, then recommend suitable doctors. Be very precise in specialty matching - for example: headaches/brain issues → Neurology, chest pain/heart issues → Cardiology, kidney issues → Nephrology, etc.',
  };

  const userMessage = {
    role: 'user',
    content: `
Patient Symptoms: ${input.symptoms}

Available Doctors (JSON):
${JSON.stringify(doctorsWithRatings, null, 2)}

CRITICAL INSTRUCTIONS:
1. Carefully analyze the symptoms: "${input.symptoms}"
2. Determine the MOST RELEVANT medical specialty for these specific symptoms
3. Match ALL doctors whose specialties array contains the relevant specialty
4. A doctor may have multiple specialties - check ALL of them in the "specialties" array
5. Return ALL doctors that have a matching specialty (e.g., if 2 doctors have Neurology, return both)
6. When returning results, include ALL specialties for each doctor, with the MOST RELEVANT specialty FIRST in the array
   Example: If doctor has ["Nephrology", "Neurology"] and symptoms are "headache", return "specialties": ["Neurology", "Nephrology"]
7. Prioritize by: Best specialty match > Highest rating > Most experience
8. Return up to 10 doctors maximum (return ALL matching doctors if less than 10)
9. Return ONLY a valid JSON array with these EXACT keys for each doctor:
   - id, name, specialties (array with MATCHED specialty first), experience, averageRating, 
     appointmentFee, qualification, designation, currentWorkingPlace, profilePhoto

Example format:
[
  {
    "id": "doctor-id-1",
    "name": "Dr. Name 1",
    "specialties": ["Neurology", "Nephrology"],
    "experience": 5,
    "averageRating": 4.5,
    "appointmentFee": 2000,
    "qualification": "MBBS, MD",
    "designation": "Consultant",
    "currentWorkingPlace": "Hospital",
    "profilePhoto": "url or null"
  }
]

RESPOND WITH ONLY THE JSON ARRAY - NO EXPLANATIONS, NO MARKDOWN, NO EXTRA TEXT.
`,
  };

  try {
    const response = await askOpenRouter([systemMessage, userMessage]);

    const cleanedJson = response
      .replace(/```(?:json)?\s*/g, '')
      .replace(/```$/g, '')
      .trim();

    const suggestedDoctors = JSON.parse(cleanedJson);

    if (!Array.isArray(suggestedDoctors)) {
      console.error('AI response is not an array:', suggestedDoctors);
      return [];
    }

    return suggestedDoctors;
  } catch (error) {
    console.error('Error parsing AI suggestion response:', error);

    return doctorsWithRatings
      .sort((a: any, b: any) => b.averageRating - a.averageRating)
      .slice(0, 5)
      .map((doctor: any) => ({
        id: doctor.id,
        name: doctor.name,
        specialty: doctor.primarySpecialty,
        experience: doctor.experience,
        averageRating: doctor.averageRating,
        appointmentFee: doctor.appointmentFee,
        qualification: doctor.qualification,
        designation: doctor.designation,
        currentWorkingPlace: doctor.currentWorkingPlace,
        profilePhoto: doctor.profilePhoto,
      }));
  }
};

const getAllPublic = async (filters: IDoctorFilterRequest, options: IPaginationOptions) => {
  const { limit, page, skip, sortBy, sortOrder } = paginationHelper.calculatePagination(options);
  const { searchTerm, specialties, ...filterData } = filters;

  const cacheKey = doctorCacheKeys.publicList(filters, options);

  const result = await redisHelper.getOrSetCache(
    cacheKey,
    async () => {
      const andConditions: Prisma.DoctorWhereInput[] = [];

      if (searchTerm) {
        andConditions.push({
          OR: doctorSearchableFields.map((field) => ({
            [field]: {
              contains: searchTerm,
              mode: 'insensitive',
            },
          })),
        });
      }

      if (specialties && specialties.length > 0) {
        const specialtiesArray = Array.isArray(specialties) ? specialties : [specialties];

        andConditions.push({
          doctorSpecialties: {
            some: {
              specialities: {
                title: {
                  in: specialtiesArray,
                  mode: 'insensitive',
                },
              },
            },
          },
        });
      }

      if (Object.keys(filterData).length > 0) {
        const filterConditions = Object.keys(filterData).map((key) => ({
          [key]: {
            equals: (filterData as any)[key],
          },
        }));

        andConditions.push(...filterConditions);
      }

      andConditions.push({
        isDeleted: false,
      });

      const whereConditions: Prisma.DoctorWhereInput =
        andConditions.length > 0 ? { AND: andConditions } : {};

      const data = await prisma.doctor.findMany({
        where: whereConditions,
        skip,
        take: limit,
        orderBy: sortBy && sortOrder ? { [sortBy]: sortOrder } : { averageRating: 'desc' },
        select: {
          id: true,
          name: true,
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
          createdAt: true,
          updatedAt: true,
          doctorSpecialties: {
            include: {
              specialities: true,
            },
          },
          review: {
            select: {
              rating: true,
              comment: true,
              createdAt: true,
              patient: {
                select: {
                  name: true,
                  profilePhoto: true,
                },
              },
            },
          },
        },
      });

      const total = await prisma.doctor.count({
        where: whereConditions,
      });

      return {
        meta: {
          total,
          page,
          limit,
        },
        data,
      };
    },
    DOCTOR_CACHE_TTL,
  );

  return result;
};

export const DoctorService = {
  updateIntoDB,
  getAllFromDB,
  getByIdFromDB,
  deleteFromDB,
  softDelete,
  getAISuggestion,
  getAllPublic,
};
