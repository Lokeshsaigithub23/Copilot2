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

    // Permanently delete the authenticated user account and all user-owned data in one transaction.
    deleteAccount: async (req, res) => {
      try {
        const userId = req.user?.id || req.user?.userId;

        if (!userId) {
          return res.status(401).json({
            error: { message: "Authenticated user not found." }
          });
        }

        const prisma = db.prisma;

        if (!prisma) {
          throw new Error("Database client is unavailable.");
        }

        const existingUser = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, email: true }
        });

        if (!existingUser) {
          return res.status(404).json({
            error: { message: "Account not found." }
          });
        }

        await prisma.$transaction(async (tx) => {
          await tx.referralQualification.deleteMany({
            where: { referrerUserId: userId }
          });

          await tx.referralMilestone.deleteMany({
            where: { userId }
          });

          await tx.referralAttribution.deleteMany({
            where: { refereeUserId: userId }
          });

          await tx.referralAttribution.updateMany({
            where: { referrerUserId: userId },
            data: { referrerUserId: null }
          });

          await tx.referralCode.updateMany({
            where: { ownerUserId: userId },
            data: { ownerUserId: null }
          });

          const creditAccount = await tx.creditAccount.findUnique({
            where: { userId },
            select: { id: true }
          });

          if (creditAccount) {
            await tx.creditLedger.deleteMany({
              where: { accountId: creditAccount.id }
            });

            await tx.creditAccount.delete({
              where: { id: creditAccount.id }
            });
          }

          await tx.user.delete({
            where: { id: userId }
          });
        }, { maxWait: 15000, timeout: 30000 });

        return res.json({
          ok: true,
          message: "Account deleted successfully."
        });
      } catch (err) {
        console.error("Delete account error:", err);
        return res.status(500).json({
          error: { message: "Failed to delete account." }
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