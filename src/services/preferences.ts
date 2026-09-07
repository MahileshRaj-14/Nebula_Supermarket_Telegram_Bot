import prisma from '../db/client.js';

export async function setPreference(telegramUserId: string, key: string, value: string) {
  const cleanKey = key.trim().toLowerCase();
  const cleanVal = value.trim();

  return await prisma.preference.upsert({
    where: {
      telegramUserId_key: {
        telegramUserId,
        key: cleanKey,
      },
    },
    update: {
      value: cleanVal,
    },
    create: {
      telegramUserId,
      key: cleanKey,
      value: cleanVal,
    },
  });
}

export async function getPreference(telegramUserId: string, key: string) {
  const cleanKey = key.trim().toLowerCase();
  const pref = await prisma.preference.findUnique({
    where: {
      telegramUserId_key: {
        telegramUserId,
        key: cleanKey,
      },
    },
  });

  return pref ? pref.value : null;
}

export async function getAllPreferences(telegramUserId: string) {
  return await prisma.preference.findMany({
    where: { telegramUserId },
  });
}
