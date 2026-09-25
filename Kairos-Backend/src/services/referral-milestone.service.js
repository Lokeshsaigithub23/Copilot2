function createReferralMilestoneService({ prisma }) {
  async function processMilestones(userId, qualifiedCount,db = prisma) {
    if (!userId) {
      throw new Error('userId is required');
    }

    if (!Number.isInteger(qualifiedCount) || qualifiedCount < 0) {
      throw new Error('qualifiedCount must be a non-negative integer');
    }

    const definitions = await db.milestoneDefinition.findMany({
      where: {
        active: true,
        threshold: {
          lte: qualifiedCount
        }
      },
      orderBy: {
        threshold: 'asc'
      }
    });

    const unlocked = [];

    for (const definition of definitions) {
      const existing = await db.referralMilestone.findUnique({
        where: {
          userId_threshold: {
            userId,
            threshold: definition.threshold
          }
        }
      });

      if (existing) {
        continue;
      }

      const milestone = await db.referralMilestone.create({
        data: {
          id: `milestone_${userId}_${definition.threshold}`,
          userId,
          threshold: definition.threshold,
          countAtUnlock: qualifiedCount
        }
      });

      unlocked.push({
        id: milestone.id,
        threshold: milestone.threshold,
        countAtUnlock: milestone.countAtUnlock,
        unlockedAt: milestone.unlockedAt,
        title: definition.title,
        description: definition.description,
        unlockKey: definition.unlockKey,
        iconKey: definition.iconKey
      });
    }

    return {
      userId,
      qualifiedCount,
      unlocked
    };
  }

  async function getUserMilestones(userId) {
    if (!userId) {
      throw new Error('userId is required');
    }

    return prisma.referralMilestone.findMany({
      where: {
        userId,
        revokedAt: null
      },
      orderBy: {
        threshold: 'asc'
      }
    });
  }

  return {
    processMilestones,
    getUserMilestones
  };
}

module.exports = {
  createReferralMilestoneService
};