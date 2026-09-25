const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const email = String(process.argv[2] || '').trim().toLowerCase();

  if (!email) {
    throw new Error('Usage: node check-referral-user.js <email>');
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      referralProfile: true,
      creditAccount: true
    }
  });

  if (!user) {
    console.log(`User not found: ${email}`);
    return;
  }

  console.log('\nUser:');
  console.log({
    id: user.id,
    email: user.email,
    name: user.name
  });

  console.log('\nReferral Profile:');
  console.dir(user.referralProfile, { depth: null });

  console.log('\nCredit Account:');
  console.dir(user.creditAccount, { depth: null });
}

main()
  .catch((error) => {
    console.error('Database check failed:');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });