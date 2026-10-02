const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const plans = [
  {
    code: 'free',
    name: 'Free',
    monthlyPrice: 0,
    currency: 'USD',
    includedCredits: 0,
    isActive: true
  },
  {
    code: 'pro',
    name: 'Pro',
    monthlyPrice: 29,
    currency: 'USD',
    includedCredits: 6250,
    isActive: true
  },
  {
    code: 'pro_plus',
    name: 'Pro Plus',
    monthlyPrice: 79,
    currency: 'USD',
    includedCredits: 15000,
    isActive: true
  }
];

async function main() {
  for (const plan of plans) {
    const result = await prisma.subscriptionPlan.upsert({
      where: {
        code: plan.code
      },
      update: {
        name: plan.name,
        monthlyPrice: plan.monthlyPrice,
        currency: plan.currency,
        includedCredits: plan.includedCredits,
        isActive: plan.isActive
      },
      create: plan
    });

    console.log(
      `Plan ready: ${result.code} - ${result.name} - ${result.currency} ${result.monthlyPrice}`
    );
  }

  console.log('Billing plans seeded successfully.');
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
