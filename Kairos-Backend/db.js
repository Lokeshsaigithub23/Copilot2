const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { spawnSync } = require('child_process');
const { ensurePrismaEnv } = require('./scripts/prisma-env');
const { createCreditService } = require('./src/services/credit.service');

const databaseUrl = ensurePrismaEnv();

// Ensure the local dev schema exists before connecting. Never do this in
// production: `prisma db push` mutates the schema in place, and with more than
// one task running it races. Production schema changes go through
// `prisma migrate deploy`, run once as a pre-deploy step.
if (process.env.NODE_ENV !== 'production') {
  try {
    const ensureScript = require.resolve('./scripts/ensure-database.js');
    spawnSync(process.execPath, [ensureScript], {
      stdio: 'inherit',
      env: process.env
    });
  } catch (e) {
    console.warn('[db] Auto schema push warning:', e.message);
  }
}

const prisma = new PrismaClient();
const creditService = createCreditService({ prisma });

// Never log the raw URL -- for postgres it carries the password.
function describeDatabase(url) {
  if (url.startsWith('file:')) return `SQLite (${url.slice('file:'.length)})`;
  try {
    const parsed = new URL(url);
    return `${parsed.protocol.replace(':', '')} ${parsed.host}${parsed.pathname}`;
  } catch (_) {
    return 'configured database';
  }
}

console.log('[db] Using database:', describeDatabase(databaseUrl));

const defaultRoles = [
  'Java Developer',
  'Spring Boot Engineer',
  'Fullstack Engineer',
  'Backend Developer',
  'Frontend Developer',
  'DevOps Engineer',
  'Solution Architect',
  'Python Developer',
  'Data Engineer',
  'QA Automation Engineer'
];

const defaultSkills = [
  'Java',
  'Spring Boot',
  'Microservices',
  'REST APIs',
  'Hibernate / JPA',
  'JavaScript',
  'Node.js',
  'Express',
  'React',
  'TypeScript',
  'Python',
  'Django',
  'SQL',
  'PostgreSQL',
  'SQLite',
  'AWS',
  'Docker',
  'Kubernetes',
  'CI/CD',
  'System Design',
  'OOP (Object Oriented Programming)',
  'Data Structures',
  'Algorithms'
];

function normalizeEmail(email) {
  return String(email || '').toLowerCase().trim();
}

function parsePayload(payloadJson) {
  if (!payloadJson) return {};
  try {
    return JSON.parse(payloadJson);
  } catch (_) {
    return {};
  }
}

function serializePayload(payload) {
  try {
    return JSON.stringify(payload || {});
  } catch (_) {
    return '{}';
  }
}

function toSessionDto(session) {
  if (!session) return null;
  const payload = parsePayload(session.payloadJson);
  return {
    ...session,
    payload,
    payloadJson: undefined,
    _id: session.id
  };
}

async function seedDb() {
  await Promise.all(defaultRoles.map((name) => prisma.role.upsert({
    where: { name },
    update: {},
    create: { name }
  })));

  await Promise.all(defaultSkills.map((name) => prisma.skill.upsert({
    where: { name },
    update: {},
    create: { name }
  })));

  if (process.env.SEED_DEFAULT_USER === 'true') {
    const email = normalizeEmail(process.env.SEED_DEFAULT_USER_EMAIL || 'demo@copilotiq.local');
    const password = process.env.SEED_DEFAULT_USER_PASSWORD || 'change-me-now';
    const existing = await prisma.user.findUnique({ where: { email } });
    if (!existing) {
      await prisma.user.create({
        data: {
          email,
          password: bcrypt.hashSync(password, 10),
          name: process.env.SEED_DEFAULT_USER_NAME || 'Demo User'
        }
      });
      console.log(`[db] Seeded local demo user: ${email}`);
    }
  }
}

const ready = prisma.$connect()
  .then(seedDb)
  .then(() => {
    console.log('[db] Database ready.');
  })
  .catch((err) => {
    console.error('[db] Database initialization failed:', err.message);
    throw err;
  });

module.exports = {
  prisma,
  ready,

  getUserByEmail: async (email) => {
    return prisma.user.findUnique({
      where: { email: normalizeEmail(email) }
    });
  },

  createUser: async (email, password, name = '', referralCode = '',signupIp = '') => {
    const normalizedEmail = normalizeEmail(email);
    const normalizedReferralCode = String(referralCode || '').trim();

    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    if (existing) {
      throw new Error('User already exists');
    }

    const maxAttempts = 5;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const newReferralCode = `KAIROS-${Math.random()
        .toString(36)
        .slice(2, 8)
        .toUpperCase()}`;

      try {
        const newUser = await prisma.$transaction(
          async (tx) => {               
          /*
          * Check the supplied referral code.
          *
          * An invalid referral must not prevent registration.
          */
          let referral = null;

          if (normalizedReferralCode) {
            referral = await tx.referralCode.findUnique({
              where: {
                code: normalizedReferralCode
              }
            });

            if (referral) {
              const now = new Date();

              const isActive =
                referral.status === 'active' &&
                (!referral.activatesAt ||
                  referral.activatesAt <= now) &&
                (!referral.expiresAt ||
                  referral.expiresAt > now) &&
                (referral.maxRedemptions === null ||
                  referral.redemptionCount < referral.maxRedemptions);

              if (!isActive) {
                referral = null;
              }
            }

            /*
            * Validate campaign when the referral code belongs
            * to a campaign.
            */
            if (referral?.campaignId) {
              const campaign = await tx.campaign.findUnique({
                where: {
                  id: referral.campaignId
                }
              });

              const now = new Date();
              const refereeCredits = referral.refereeCredits || 0;

              const campaignActive =
                campaign &&
                campaign.status === 'active' &&
                campaign.startsAt <= now &&
                (!campaign.endsAt || campaign.endsAt > now);

              const campaignBudgetAvailable =
                campaign &&
                (
                  campaign.budgetCredits === null ||
                  campaign.spentCredits + refereeCredits <= campaign.budgetCredits
                );

              if (!campaignActive || !campaignBudgetAvailable) {
                referral = null;
              }
            }
          }

          /*
          * Create the new user.
          */
          const user = await tx.user.create({
            data: {
              email: normalizedEmail,
              password: bcrypt.hashSync(password, 10),
              name: name || ''
            }
          });

          /*
          * Personal referral code becomes active after 24 hours.
          */
          const codeActivatesAt = new Date(
            Date.now() + 24 * 60 * 60 * 1000
          );

          await tx.referralProfile.create({
            data: {
              userId: user.id,
              code: newReferralCode,
              codeActivatesAt,
              displayName: name || ''
            }
          });

          await tx.referralCode.create({
            data: {
              code: newReferralCode,
              kind: 'personal',
              ownerUserId: user.id,
              status: 'active',
              activatesAt: codeActivatesAt,
              refereeCredits: 100,
              referrerCredits: 250
            }
          });

          /*
          * Create referral attribution when the supplied
          * referral code is valid.
          */
          if (referral && referral.ownerUserId !== user.id) {
            const attribution = await tx.referralAttribution.create({
              data: {
                codeId: referral.id,
                refereeUserId: user.id,
                referrerUserId: referral.ownerUserId || null,
                campaignId: referral.campaignId,
                status: 'joined',
                fraudStatus: 'clean',
                fraudScore: 0,
                evidenceJson: '{}'
              }
            });

            /*
            * Update the referrer's joined count.
            */
            if (referral.ownerUserId) {
              await tx.referralProfile.update({
                where: {
                  userId: referral.ownerUserId
                },
                data: {
                  joinedCount: {
                    increment: 1
                  }
                }
              });
            }

            /*
            * Give the new user the referral signup bonus.
            */
            const refereeCredits = referral.refereeCredits || 0;

            if (refereeCredits > 0) {
              await creditService.addAvailableCredits(
                {
                  userId: user.id,
                  amount: refereeCredits,
                  entryType: 'signup_bonus',
                  idempotencyRef: `signup_bonus:${user.id}`,
                  refType: 'referral_attribution',
                  refId: attribution.id,
                  reason: 'Referral signup bonus'
                },
                tx
              );
            }

            /*
            * Increase redemption count atomically.
            *
            * This protects maxRedemptions when multiple users
            * redeem the same campaign code concurrently.
            */
            const redemptionUpdate = await tx.referralCode.updateMany({
              where: {
                id: referral.id,
                status: 'active',
                OR: [
                  {
                    maxRedemptions: null
                  },
                  {
                    maxRedemptions: {
                      gt: referral.redemptionCount
                    }
                  }
                ]
              },
              data: {
                redemptionCount: {
                  increment: 1
                }
              }
            });

            if (redemptionUpdate.count !== 1) {
              throw new Error('Referral code redemption limit reached');
            }

            /*
            * Record campaign budget usage.
            *
            * Campaign codes are invitee-only, so only the
            * invitee reward is charged against the campaign budget.
            */
            if (referral.campaignId) {
              const refereeCredits = referral.refereeCredits || 0;

              if (refereeCredits > 0) {
                const campaignSpend = await tx.$queryRaw`
                  UPDATE "Campaign"
                  SET "spentCredits" = "spentCredits" + ${refereeCredits}
                  WHERE "id" = ${referral.campaignId}
                    AND "status" = 'active'
                    AND (
                      "budgetCredits" IS NULL
                      OR "spentCredits" + ${refereeCredits} <= "budgetCredits"
                    )
                  RETURNING "id"
                `;

                if (campaignSpend.length !== 1) {
                  throw new Error('Campaign budget is no longer available');
                }
              }
            }
          }
          
          return user;
          },
          {
            maxWait: 15000,
            timeout: 30000
          } 
        );
        
        return {
          id: newUser.id,
          email: newUser.email,
          name: newUser.name
        };
      } catch (err) {
        /*
        * Retry only if the generated referral code collided
        * with an existing unique code.
        */
        if (
          err?.code === 'P2002' &&
          attempt < maxAttempts - 1
        ) {
          continue;
        }

        throw err;
      }
    }

    throw new Error('Unable to generate a unique referral code');
  },

  searchRolesAndSkills: async (query) => {
    const q = String(query || '').toLowerCase().trim();
    const [roles, skills] = await Promise.all([
      prisma.role.findMany({ orderBy: { name: 'asc' } }),
      prisma.skill.findMany({ orderBy: { name: 'asc' } })
    ]);

    if (!q) {
      return { roles, skills };
    }

    return {
      roles: roles.filter((role) => role.name.toLowerCase().includes(q)),
      skills: skills.filter((skill) => skill.name.toLowerCase().includes(q))
    };
  },

  createSession: async (sessionData, userId) => {
    // The caller is always authenticated, so userId comes from a verified JWT.
    // The previous fallbacks -- reassigning to an arbitrary existing user, or
    // inventing a shared local account -- silently filed one user's interview
    // under another user's id.
    if (!userId) {
      throw new Error('userId is required to create a session');
    }

    const userExists = await prisma.user.findUnique({ where: { id: userId } });
    if (!userExists) {
      throw new Error('Session owner does not exist');
    }

    const newSession = await prisma.session.create({
      data: {
        id: sessionData.id ? String(sessionData.id) : `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        userId,
        tech: sessionData.tech || 'Interview',
        title: sessionData.title || 'Live Session',
        durationSeconds: Number(sessionData.durationSeconds) || 0,
        durationDisplay: sessionData.durationDisplay || '00:00:00',
        questionCount: Number(sessionData.questionCount) || 0,
        rating: Number(sessionData.rating) || 0,
        payloadJson: serializePayload(sessionData.payload),
        audioFilePath: null
      }
    });

    return toSessionDto(newSession);
  },

  updateSessionAudio: async (sessionId, audioPath, userId) => {
    // Scope the lookup to the owner. Without this, any authenticated user could
    // attach audio to any session id, overwriting another user's recording.
    if (!userId) {
      throw new Error('userId is required to attach session audio');
    }

    const existing = await prisma.session.findFirst({ where: { id: sessionId, userId } });
    if (!existing) {
      throw new Error('Session not found');
    }

    const updated = await prisma.session.update({
      where: { id: sessionId },
      data: { audioFilePath: audioPath }
    });

    return toSessionDto(updated);
  },

  getSessionByUser: async (sessionId, userId) => {
    if (!userId) {
      throw new Error('userId is required to retrieve a session');
    }

    const session = await prisma.session.findFirst({ where: { id: sessionId, userId } });
    return toSessionDto(session);
  },

  deleteSession: async (sessionId, userId) => {
    if (!userId) {
      throw new Error('userId is required to delete a session');
    }

    const existing = await prisma.session.findFirst({ where: { id: sessionId, userId } });
    if (!existing) return false;

    await prisma.session.delete({ where: { id: sessionId } });
    return true;
  },

  getSessionsByUser: async (userId) => {
    // Never fall back to an unscoped query. Returning every session when the
    // caller happens to have none exposes other users' interviews.
    if (!userId) {
      throw new Error('userId is required to list sessions');
    }

    const sessions = await prisma.session.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });

    return sessions.map(toSessionDto);
  }
};
