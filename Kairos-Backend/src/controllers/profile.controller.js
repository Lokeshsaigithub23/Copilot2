function createProfileController({ db }) {
  return {
    roleSkills: async (req, res) => {
      try {
        res.json(await db.searchRolesAndSkills(req.query.q || ''));
      } catch (err) {
        console.error('Role & skills lookup error:', err.message);
        res.status(500).json({
          error: {
            message: 'Failed to retrieve roles and skills.'
          }
        });
      }
    },

    // Get all devices currently associated with the authenticated user.
    getDevices: async (req, res) => {
      try {
        const userId = req.user?.id || req.user?.userId;

        if (!userId) {
          return res.status(401).json({
            error: {
              message: 'Authenticated user not found.'
            }
          });
        }

        const devices = await db.getDevicesForUser(userId);

        res.json({
          userId,
          devices
        });
      } catch (err) {
        console.error('Get user devices error:', err.message);
        res.status(500).json({
          error: {
            message: 'Failed to retrieve user devices.'
          }
        });
      }
    },

    // Get all users associated with a device.
    getUsersForDevice: async (req, res) => {
      try {
        const { deviceId } = req.params;

        if (!deviceId) {
          return res.status(400).json({
            error: {
              message: 'deviceId is required.'
            }
          });
        }

        const users = await db.getUsersForDevice(deviceId);

        res.json({
          deviceId,
          users
        });
      } catch (err) {
        console.error('Get device users error:', err.message);
        res.status(500).json({
          error: {
            message: 'Failed to retrieve users for device.'
          }
        });
      }
    }
  };
}

module.exports = { createProfileController };