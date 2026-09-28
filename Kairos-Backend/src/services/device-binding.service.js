const crypto = require('crypto');

function createDeviceBindingService({ prisma }) {
  function hashDeviceId(deviceId) {
    if (!deviceId || typeof deviceId !== 'string') {
      return null;
    }

    const normalizedDeviceId = deviceId.trim();

    if (!normalizedDeviceId) {
      return null;
    }

    return crypto
      .createHash('sha256')
      .update(normalizedDeviceId)
      .digest('hex');
  }

  async function bindDeviceToUser(userId, deviceId, client = prisma) {
    if (!userId || !deviceId) {
      return null;
    }

    const deviceIdHash = hashDeviceId(deviceId);

    if (!deviceIdHash) {
      return null;
    }

    return client.userDevice.upsert({
      where: {
        userId_deviceIdHash: {
          userId,
          deviceIdHash
        }
      },
      update: {
        lastSeenAt: new Date()
      },
      create: {
        userId,
        deviceIdHash
      }
    });
  }

  
  async function getDevicesForUser(userId, client = prisma) {
    if (!userId) {
      return [];
    }

    return client.userDevice.findMany({
      where: {
        userId
      },
      orderBy: {
        lastSeenAt: 'desc'
      }
    });
  }

  async function getUsersForDevice(deviceId, client = prisma) {
    const deviceIdHash = hashDeviceId(deviceId);

    if (!deviceIdHash) {
      return [];
    }

    return client.userDevice.findMany({
      where: {
        deviceIdHash
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true
          }
        }
      },
      orderBy: {
        lastSeenAt: 'desc'
      }
    });
  }

  return {
    hashDeviceId,
    bindDeviceToUser,
    getDevicesForUser,
    getUsersForDevice
  };
}

module.exports = {
  createDeviceBindingService
};