const { PrismaClient } = require('@prisma/client');
const {
  createReferralQualificationService
} = require('../src/services/referral-qualification.service');
const {
  createReferralMilestoneService
} = require('../src/services/referral-milestone.service');
const {
  createCreditService
} = require('../src/services/credit.service');

const prisma = new PrismaClient();

const creditService = createCreditService({
  prisma
});

const referralMilestoneService =
  createReferralMilestoneService({
    prisma
  });

const referralQualificationService =
  createReferralQualificationService({
    prisma,
    creditService,
    referralMilestoneService
  });

async function main() {
  const attribution =
    await prisma.referralAttribution.findFirst({
      where: {
        status: 'joined',
        qualifiedAt: null
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

  if (!attribution) {
    throw new Error(
      'No unqualified referral attribution found.'
    );
  }

  console.log('Testing attribution:', attribution.id);
  console.log('Referee:', attribution.refereeUserId);
  console.log('Referrer:', attribution.referrerUserId);

  /*
   * We intentionally call the real qualification service.
   *
   * Because this referral is still inside the 7-day window,
   * the service should safely return "pending".
   *
   * No database records should be modified.
   */
  const result =
    await referralQualificationService.qualifyReferral(
      attribution.id
    );

  console.log('\nQualification result:');
  console.dir(result, { depth: null });
}

main()
  .catch((error) => {
    console.error(
      '\nQualification integration test failed:',
      error
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });