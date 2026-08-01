import { Server as SocketServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Server as HttpServer } from 'http';
import { Redis } from 'ioredis';
import config from '../config';
import { jwtHelpers } from '../helpers/jwtHelpers';
import { Secret } from 'jsonwebtoken';
import logger from '../lib/logger';
import prismaClient from '../shared/prisma';
const prisma = prismaClient as any;
import { UserRole } from '@prisma/client';

// Extend Socket.io Socket to include user info
declare module 'socket.io' {
  interface Socket {
    user?: {
      userId: string;
      email: string;
      role: UserRole;
    };
  }
}

export function initializeSocket(httpServer: HttpServer) {
  const io = new SocketServer(httpServer, {
    cors: {
      origin: ['http://localhost:3000', 'http://localhost:3001', config.frontendUrl as string],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Redis adapter for scaling (reuse existing REDIS_URL)
  const redisUrl = config.redisUrl;
  if (redisUrl) {
    try {
      const pubClient = new Redis(redisUrl, { maxRetriesPerRequest: null });
      const subClient = pubClient.duplicate();

      io.adapter(createAdapter(pubClient, subClient));
      logger.info('✅ Socket.io Redis adapter connected');
    } catch (error) {
      logger.error('⚠️ Socket.io Redis adapter failed, running without adapter', error as Error);
    }
  }

  // Authentication middleware — validate JWT on connection
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization;

      if (!token) {
        return next(new Error('Authentication token missing'));
      }

      // Remove "Bearer " prefix if present
      const cleanToken = token.replace('Bearer ', '');

      const decoded = jwtHelpers.verifyToken(cleanToken, config.jwt.jwt_secret as Secret);

      // Look up the user ID from the database using email
      const user = await prisma.user.findUnique({
        where: { email: decoded.email },
        select: { id: true, email: true, role: true },
      });

      if (!user) {
        return next(new Error('User not found'));
      }

      // Attach user info to socket
      socket.user = {
        userId: user.id,
        email: user.email,
        role: user.role,
      };

      next();
    } catch (error) {
      next(new Error('Invalid authentication token'));
    }
  });

  // Connection handling
  io.on('connection', (socket) => {
    const user = socket.user!;
    logger.info(`✅ Socket connected: ${user.email} (${user.role})`);

    // Join user-specific room (by user ID)
    socket.join(`user:${user.userId}`);

    // Join role-specific room
    socket.join(`role:${user.role.toLowerCase()}`);

    // Join admin room for both ADMIN and SUPER_ADMIN
    if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') {
      socket.join('role:admin');
    }

    // Join doctor-specific room
    if (user.role === 'DOCTOR') {
      socket.join(`doctor:${user.userId}`);
    }

    // Join patient-specific room
    if (user.role === 'PATIENT') {
      socket.join(`patient:${user.userId}`);
    }

    // Broadcast online status to admins
    io.to('role:admin').emit('user:online', {
      userId: user.userId,
      email: user.email,
      role: user.role,
      timestamp: new Date().toISOString(),
    });

    // ব্রডকাস্ট: ইউজার অনলাইনে এসেছে (সবার জন্য)
    io.emit('user_status_changed', { userId: user.userId, isOnline: true });

    // ==========================================
    // 💬 CHAT SYSTEM EVENTS
    // ==========================================

    // ১. নির্দিষ্ট চ্যাট রুমে জয়েন করা (যাতে মেসেজ লিক না হয়!)
    socket.on('join_chat_room', (data: { conversationId: string }) => {
      const roomName = `chat:${data.conversationId}`;
      socket.join(roomName);
      logger.info(`User ${user.userId} joined chat room: ${roomName}`);
    });

    socket.on('leave_chat_room', (data: { conversationId: string }) => {
      const roomName = `chat:${data.conversationId}`;
      socket.leave(roomName);
      logger.info(`User ${user.userId} left chat room: ${roomName}`);
    });

    // ২. মেসেজ পাঠানো (রিয়েল-টাইম + ডাটাবেস সেভ)
    socket.on(
      'send_message',
      async (data: { conversationId: string; text?: string; fileUrl?: string }) => {
        try {
          // ক. আগে মেসেজটা ডাটাবেসে সেভ করবো (যাতে ডাটা পণ্ডিত না হারায়)
          const savedMessage = await prisma.message.create({
            data: {
              conversationId: data.conversationId,
              senderId: user.userId, // যে ইউজার লগড-ইন আছে, তার আইডি
              text: data.text,
              fileUrl: data.fileUrl,
            },
          });

          // খ. সেভ কনফার্ম হলে ওই রুমের অন্য ইউজারকে সাথে সাথে মেসেজটা ছুঁড়ে মারবো!
          const roomName = `chat:${data.conversationId}`;
          io.to(roomName).emit('receive_message', savedMessage);

          // গ. সাইডবারের আনরিড ব্যাজ আপডেট করার জন্য রিসিভারকে নোটিফাই করবো
          const conv = await prisma.conversation.findUnique({
            where: { id: data.conversationId },
            select: { participantIds: true },
          });
          if (conv) {
            const receiverId = conv.participantIds.find((id: any) => id !== user.userId);
            if (receiverId) {
              io.to(`user:${receiverId}`).emit('new_message_notification', {
                conversationId: data.conversationId,
                message: savedMessage,
              });
            }
          }
        } catch (error) {
          logger.error('Error saving chat message', error as Error);
          socket.emit('message_error', { message: 'Failed to send message' });
        }
      },
    );

    // ৭. মেসেজ ডিলিট (Unsend) করা
    socket.on('unsend_message', async (data: { messageId: string; conversationId: string }) => {
      try {
        await prisma.message.update({
          where: { id: data.messageId },
          data: { isDeleted: true, text: '', fileUrl: null }, // টেক্সট ও ফাইল মুছে দিলাম প্রাইভেসি রক্ষার্থে
        });

        // অন্য ইউজারকে জানিয়ে দেয়া যে মেসেজ ডিলিট হয়েছে
        const roomName = `chat:${data.conversationId}`;
        io.to(roomName).emit('message_deleted', data.messageId);
      } catch (error) {
        logger.error('Error deleting message:', error as Error);
      }
    });

    // ৮. মেসেজ রিঅ্যাকশন (Emoji Reaction - Multi-user JSON)
    socket.on(
      'react_to_message',
      async (data: { messageId: string; conversationId: string; reaction: string }) => {
        try {
          // প্রথমে মেসেজটা খুঁজে বের করবো তার বর্তমান রিঅ্যাকশন ডাটা নেওয়ার জন্য
          const message = await prisma.message.findUnique({
            where: { id: data.messageId },
            select: { reaction: true },
          });

          if (!message) return;

          // রিঅ্যাকশন ডাটাটাকে একটা অবজেক্ট হিসেবে ধরবো
          let currentReactions: Record<string, string> = {};
          if (message.reaction && typeof message.reaction === 'object') {
            currentReactions = message.reaction as Record<string, string>;
          }

          // যদি ইউজার নতুন রিঅ্যাকশন দেয় তাহলে অ্যাড/আপডেট করবো, আর খালি পাঠালে রিমুভ করবো
          if (data.reaction) {
            currentReactions[user.userId] = data.reaction;
          } else {
            delete currentReactions[user.userId];
          }

          // ডাটাবেসে আপডেট করা হলো
          const updatedMessage = await prisma.message.update({
            where: { id: data.messageId },
            data: { reaction: currentReactions },
          });

          // রুমে সবাইকে জানিয়ে দেয়া যে রিঅ্যাকশন আপডেট হয়েছে (পুরো JSON অবজেক্ট পাঠানো হলো)
          const roomName = `chat:${data.conversationId}`;
          io.to(roomName).emit('message_reaction_updated', {
            messageId: data.messageId,
            reaction: currentReactions,
          });
        } catch (error) {
          logger.error('Error adding reaction:', error as Error);
        }
      },
    );

    // ৩. টাইপিং ইন্ডিকেটর ("Doctor is typing...")
    socket.on('typing', (data: { conversationId: string }) => {
      const roomName = `chat:${data.conversationId}`;
      // 'to()' ব্যবহার করলে যে টাইপ করছে সে ছাড়া ওই রুমের বাকি সবাই ইভেন্টটা পাবে
      socket.to(roomName).emit('user_typing', {
        userId: user.userId,
        isTyping: true,
      });
    });

    socket.on('stop_typing', (data: { conversationId: string }) => {
      const roomName = `chat:${data.conversationId}`;
      socket.to(roomName).emit('user_typing', {
        userId: user.userId,
        isTyping: false,
      });
    });

    // ৪. ইউজার অনলাইনে আছে কি না চেক করা (প্রথমবার লোড হলে)
    socket.on('check_user_status', async (data: { userId: string }, callback) => {
      try {
        const roomName = `user:${data.userId}`;
        const sockets = await io.in(roomName).fetchSockets();

        let lastSeen: Date | null = null;
        if (sockets.length === 0) {
          const u = await prisma.user.findUnique({
            where: { id: data.userId },
            select: { lastSeen: true },
          });
          lastSeen = u?.lastSeen || null;
        }

        if (typeof callback === 'function') {
          callback({ isOnline: sockets.length > 0, lastSeen });
        }
      } catch (error) {
        if (typeof callback === 'function') {
          callback({ isOnline: false, lastSeen: null });
        }
      }
    });

    // ৫. মেসেজ 'Seen' মার্ক করা
    socket.on('mark_messages_seen', async (data: { conversationId: string }) => {
      try {
        // ডাটাবেসে আপডেট করা (যে মেসেজগুলো এই ইউজার পাঠায়নি, সেগুলো seen হবে)
        await prisma.message.updateMany({
          where: {
            conversationId: data.conversationId,
            senderId: { not: user.userId },
            isSeen: false,
          },
          data: { isSeen: true },
        });

        const roomName = `chat:${data.conversationId}`;
        // অন্য ইউজারকে জানানো যে তার মেসেজগুলো সিন হয়ে গেছে
        io.to(roomName).emit('messages_seen', {
          conversationId: data.conversationId,
          seenByUserId: user.userId,
        });
      } catch (error) {
        logger.error('Error marking messages as seen', error as Error);
      }
    });

    // --- Video Call Notification Logic ---
    socket.on('doctor_joined_call', async (data: { videoCallingId: string }) => {
      console.log(
        '🔥 [SOCKET] Received doctor_joined_call for videoCallingId:',
        data.videoCallingId,
      );
      try {
        // ডাটাবেস থেকে অ্যাপয়েন্টমেন্ট এবং রোগীর ইমেইল খুঁজে বের করছি
        const appointment = await prisma.appointment.findFirst({
          where: { videoCallingId: data.videoCallingId },
          select: { patient: { select: { email: true } } },
        });

        if (appointment && appointment.patient?.email) {
          // ইউজারের রিয়েল আইডি (User.id) বের করছি ইমেইল দিয়ে
          const user = await prisma.user.findUnique({
            where: { email: appointment.patient.email },
            select: { id: true },
          });

          if (user) {
            const roomName = `user:${user.id}`;
            console.log(`✅ [SOCKET] Patient User found! Emitting to room: ${roomName}`);
            io.to(roomName).emit('doctor_calling', {
              videoCallingId: data.videoCallingId,
              message: 'Doctor has joined the video call. Please join now!',
            });
          } else {
            console.log(
              `❌ [SOCKET] User record not found for patient email: ${appointment.patient.email}`,
            );
          }
        } else {
          console.log(
            `❌ [SOCKET] No appointment/patient found for videoCallingId: ${data.videoCallingId}`,
          );
        }
      } catch (error) {
        logger.error('Error finding appointment for call notification:', error as Error);
      }
    });
    // ------------------------------------

    // Handle disconnection
    socket.on('disconnect', async (reason) => {
      logger.info(`❌ Socket disconnected: ${user.email} (${reason})`);

      try {
        // ডাটাবেসে lastSeen আপডেট করা
        await prisma.user.update({
          where: { id: user.userId },
          data: { lastSeen: new Date() },
        });
      } catch (err) {
        logger.error('Error updating lastSeen', err as Error);
      }

      io.to('role:admin').emit('user:offline', {
        userId: user.userId,
        email: user.email,
        role: user.role,
        timestamp: new Date().toISOString(),
        reason,
      });

      // ব্রডকাস্ট: ইউজার অফলাইনে চলে গেছে (সাথে lastSeen টাইমটাও পাঠিয়ে দিচ্ছি)
      io.emit('user_status_changed', {
        userId: user.userId,
        isOnline: false,
        lastSeen: new Date().toISOString(),
      });
    });

    // Handle errors
    socket.on('error', (error) => {
      logger.error('Socket error', error as Error);
    });
  });

  return io;
}

export type SocketIOServer = ReturnType<typeof initializeSocket>;
