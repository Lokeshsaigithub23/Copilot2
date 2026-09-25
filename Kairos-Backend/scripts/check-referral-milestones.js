const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const milestones =
    await prisma.milestoneDefinition.findMany({
      orderBy: {
        threshold: 'asc'
      }
    });

  console.table(
    milestones.map((m) => ({
      threshold: m.threshold,
      title: m.title,
      unlockKey: m.unlockKey,
      active: m.active
    }))
  );
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());