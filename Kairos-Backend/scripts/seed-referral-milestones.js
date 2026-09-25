const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const milestones = [
  {
    threshold: 1,
    title: 'Interview Insights',
    description: 'Post-session scoring and answer review',
    unlockKey: 'interview_insights',
    bonusCredits: 0,
    iconKey: 'insights',
    sortOrder: 1
  },
  {
    threshold: 3,
    title: 'Advanced Copilot',
    description: 'Deeper model and longer context window',
    unlockKey: 'advanced_copilot',
    bonusCredits: 0,
    iconKey: 'copilot',
    sortOrder: 2
  },
  {
    threshold: 5,
    title: 'Premium Question Bank',
    description: 'Resume-tailored drills',
    unlockKey: 'premium_question_bank',
    bonusCredits: 0,
    iconKey: 'question_bank',
    sortOrder: 3
  },
  {
    threshold: 10,
    title: 'Copilot Pro Circle',
    description: 'Priority processing and badge',
    unlockKey: 'copilot_pro_circle',
    bonusCredits: 0,
    iconKey: 'pro_circle',
    sortOrder: 4
  },
  {
    threshold: 12,
    title: 'Milestone 12',
    description: '',
    unlockKey: 'milestone_12',
    bonusCredits: 0,
    iconKey: 'gift',
    sortOrder: 5
  },
  {
    threshold: 15,
    title: 'Milestone 15',
    description: '',
    unlockKey: 'milestone_15',
    bonusCredits: 0,
    iconKey: 'gift',
    sortOrder: 6
  },
  {
    threshold: 20,
    title: 'Milestone 20',
    description: '',
    unlockKey: 'milestone_20',
    bonusCredits: 0,
    iconKey: 'gift',
    sortOrder: 7
  }
];

async function main() {
  for (const milestone of milestones) {
    await prisma.milestoneDefinition.upsert({
      where: {
        threshold: milestone.threshold
      },
      update: milestone,
      create: milestone
    });
  }

  console.log(
    `Seeded ${milestones.length} referral milestone definitions.`
  );
}

main()
  .catch((error) => {
    console.error('Failed to seed referral milestones:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });