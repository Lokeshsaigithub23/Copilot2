const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const FEATURE_LIMITS = {
  FREE: {
    copilot: 30 * 60,
    notetaker: 30 * 60,
    voice: 10 * 60,
  },

  PRO: {
    copilot: 600 * 60,
    notetaker: 900 * 60,
    voice: 90 * 60,
  },

  PRO_PLUS: {
    copilot: 2400 * 60,
    notetaker: 3000 * 60,
    voice: 300 * 60,
  },
};

const PLAN_UPLOAD_LIMITS_MB = {
  FREE: 100,
  PRO: 500,
  PRO_PLUS: 2048,
};

function normalizeTier(planCode) {
  const code = String(planCode || "free").toLowerCase();

  if (code === "pro_plus" || code === "pro-plus") {
    return "PRO_PLUS";
  }

  if (code === "pro") {
    return "PRO";
  }

  return "FREE";
}

function getPeriod() {
  const now = new Date();

  const periodStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  );

  const periodEnd = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)
  );

  return {
    periodStart,
    periodEnd,
  };
}

async function getUserPlan(userId) {
  const subscription = await prisma.subscription.findFirst({
    where: {
      userId,
      status: "ACTIVE",
    },
    include: {
      plan: true,
    },
    orderBy: {
      endDate: "desc",
    },
  });

  if (!subscription?.plan) {
    return {
      tier: "FREE",
      plan: null,
    };
  }

  return {
    tier: normalizeTier(subscription.plan.code),
    plan: subscription.plan,
  };
}

async function getFeatureUsage(userId, feature) {
  const { periodStart, periodEnd } = getPeriod();

  const usage = await prisma.featureUsage.findUnique({
    where: {
      userId_feature_periodStart: {
        userId,
        feature,
        periodStart,
      },
    },
  });

  return {
    usage,
    periodStart,
    periodEnd,
  };
}

async function getFeatureStatus(userId, feature) {
  const { tier } = await getUserPlan(userId);

  const limits = FEATURE_LIMITS[tier];
  const limitSeconds = limits?.[feature] ?? 0;

  const { usage, periodStart, periodEnd } =
    await getFeatureUsage(userId, feature);

  const usedSeconds = usage?.usedSeconds || 0;
  const remainingSeconds = Math.max(
    0,
    limitSeconds - usedSeconds
  );

  return {
    userId,
    tier,
    feature,
    limitSeconds,
    usedSeconds,
    remainingSeconds,
    allowed: remainingSeconds > 0,
    periodStart,
    periodEnd,
  };
}

async function recordUsage(userId, feature, seconds) {
  if (!seconds || seconds <= 0) {
    return;
  }

  const { periodStart, periodEnd } = getPeriod();

  await prisma.featureUsage.upsert({
    where: {
      userId_feature_periodStart: {
        userId,
        feature,
        periodStart,
      },
    },
    create: {
      userId,
      feature,
      periodStart,
      periodEnd,
      usedSeconds: Math.ceil(seconds),
    },
    update: {
      usedSeconds: {
        increment: Math.ceil(seconds),
      },
      periodEnd,
    },
  });
}

async function checkFeatureAccess(userId, feature, requiredSeconds = 0) {
  const status = await getFeatureStatus(userId, feature);

  const required = Math.max(0, Number(requiredSeconds) || 0);

  return {
    ...status,
    requiredSeconds: required,
    allowed: status.remainingSeconds >= required,
  };
}

async function getUploadLimit(userId) {
  const { tier } = await getUserPlan(userId);

  return {
    tier,
    maxUploadMb: PLAN_UPLOAD_LIMITS_MB[tier],
    maxUploadBytes:
      PLAN_UPLOAD_LIMITS_MB[tier] * 1024 * 1024,
  };
}

module.exports = {
  FEATURE_LIMITS,
  PLAN_UPLOAD_LIMITS_MB,
  normalizeTier,
  getUserPlan,
  getFeatureUsage,
  getFeatureStatus,
  recordUsage,
  checkFeatureAccess,
  getUploadLimit,
};