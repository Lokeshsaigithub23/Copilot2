const { PrismaClient } = require('@prisma/client');
const {
  createReferralMilestoneService
} = require('../src/services/referral-milestone.service');

const prisma = new PrismaClient();

const milestoneService =
  createReferralMilestoneService({ prisma });

async function main() {
  const profile =
    await prisma.referralProfile.findFirst({
      orderBy: {
        createdAt: 'asc'
      }
    });

  if (!profile) {
    throw new Error(
      'No ReferralProfile found in database.'
    );
  }

  console.log('Testing user:', profile.userId);

  const result =
    await milestoneService.processMilestones(
      profile.userId,
      5
    );

  console.log(
    'Milestone result:'
  );

  console.table(
    result.unlocked.map((milestone) => ({
      threshold: milestone.threshold,
      title: milestone.title,
      unlockKey: milestone.unlockKey,
      countAtUnlock:
        milestone.countAtUnlock
    }))
  );
}

main()
  .catch((error) => {
    console.error(
      'Milestone test failed:',
      error
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });