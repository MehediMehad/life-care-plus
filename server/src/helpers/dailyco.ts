// server/src/helpers/dailyco.ts
import config from '../config';

// এই ফাংশনটা একটা videoCallingId (UUID) রিসিভ করবে এবং সেটা দিয়ে Daily.co তে রুম বানাবে
export const createVideoRoom = async (videoCallingId: string) => {
  const DAILY_API_URL = 'https://api.daily.co/v1/rooms';

  const roomConfig = {
    name: videoCallingId, // তোমার ডাটাবেসের UUID টাই হবে রুমের নাম
    privacy: 'public',
    properties: {
      max_participants: 2,
      enable_chat: true,
      enable_screenshare: true,
    },
  };

  const response = await fetch(DAILY_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.dailyApiKey}`,
    },
    body: JSON.stringify(roomConfig),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Failed to create video room: ${JSON.stringify(errorData)}`);
  }

  const roomData = await response.json();

  // Daily.co আমাদের যে URL টা দেবে, সেটা রিটার্ন করবে
  return roomData.url;
};
