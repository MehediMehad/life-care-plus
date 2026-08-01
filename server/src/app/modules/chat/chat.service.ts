import prismaClient from '../../../shared/prisma';
import { fileUploader } from '../../../helpers/fileUploader';
const prisma = prismaClient as any;

// ১. ইউজারের সব কনভারসেশন (চ্যাট লিস্ট) আনা
const getMyConversations = async (userId: string) => {
  const conversations = await prisma.conversation.findMany({
    where: { participantIds: { has: userId } },
    include: {
      messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      _count: {
        select: {
          messages: {
            where: {
              isSeen: false,
              senderId: { not: userId },
            },
          },
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  // ম্যাজিক: প্রত্যেকটা চ্যাটের সাথে ওপর পাশের মানুষের (otherUser) নাম ও ছবি জুড়ে দিচ্ছি
  const enrichedConversations = await Promise.all(
    conversations.map(async (conv: any) => {
      const otherUserId = conv.participantIds.find((id: any) => id !== userId);
      let otherUser = null;

      if (otherUserId) {
        const user = await prisma.user.findUnique({
          where: { id: otherUserId },
          include: { doctor: true, patient: true, admin: true },
        });

        if (user) {
          otherUser = {
            id: user.id,
            name: user.doctor?.name || user.patient?.name || user.admin?.name || 'Unknown',
            photo:
              user.doctor?.profilePhoto ||
              user.patient?.profilePhoto ||
              user.admin?.profilePhoto ||
              null,
          };
        }
      }

      return {
        ...conv,
        otherUser,
        unreadCount: conv._count?.messages || 0,
      };
    }),
  );

  return enrichedConversations;
};

// ২. নির্দিষ্ট কোনো চ্যাটের সব মেসেজ আনা (চ্যাট ওপেন করলে)
const getMessages = async (conversationId: string, page: number = 1, limit: number = 20) => {
  const skip = (page - 1) * limit;

  const messages = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'desc' }, // নতুন মেসেজ আগে আনবো, পরে ফ্রন্টএন্ডে রিভার্স করবো
    skip,
    take: limit,
  });

  const total = await prisma.message.count({ where: { conversationId } });

  // ফ্রন্টএন্ডে দেখানোর সুবিধার্থে মেসেজগুলো উল্টে দিচ্ছি (পুরনো মেসেজ উপরে)
  const reversedMessages = messages.reverse();

  return {
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
    data: reversedMessages,
  };
};

// ৩. ফাইল (ছবি/পিডিএফ) আপলোড করে Cloudinary-র লিংক রিটার্ন করা
const uploadFile = async (file: Express.Multer.File) => {
  const uploadResult = await fileUploader.uploadToCloudinary(file);
  return uploadResult?.secure_url;
};

// ৪. নতুন কনভারসেশন তৈরি করা
const createConversation = async (userEmail: string, participantEmail: string) => {
  // ইমেইল দিয়ে দুজনের আসল User ID বের করা
  const user1 = await prisma.user.findUnique({ where: { email: userEmail } });
  const user2 = await prisma.user.findUnique({ where: { email: participantEmail } });

  if (!user1 || !user2) throw new Error('User not found');

  // এখন আইডি দিয়ে চেক করবো
  const existingConversation = await prisma.conversation.findFirst({
    where: {
      participantIds: {
        hasEvery: [user1.id, user2.id],
      },
    },
  });

  if (existingConversation) return existingConversation;

  // না থাকলে নতুন চ্যাটরুম
  const newConversation = await prisma.conversation.create({
    data: {
      participantIds: [user1.id, user2.id],
    },
  });

  return newConversation;
};

export const ChatService = {
  getMyConversations,
  getMessages,
  uploadFile,
  createConversation,
};
