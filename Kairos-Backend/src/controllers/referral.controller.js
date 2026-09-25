function createReferralController({ prisma, referralService, creditService, referralQualificationService,referralMilestoneService }) {
  return {
    me: async (req, res) => {
      try {
        const userId = req.user?.id;

        if (!userId) {
          return res.status(401).json({
            error: {
              message: 'Authentication required.'
            }
          });
        }

        let profile = await prisma.referralProfile.findUnique({
          where: {
            userId
          }
        });

        if (!profile) {
          const user = await prisma.user.findUnique({
            where: {
              id: userId
            },
            select: {
              id: true,
              name: true
            }
          });

          if (!user) {
            return res.status(404).json({
              error: {
                message: 'User not found.'
              }
            });
          }

          const codeActivatesAt = new Date(
            Date.now() + 24 * 60 * 60 * 1000
          );

          const newReferralCode = `KAIROS-${Math.random()
            .toString(36)
            .slice(2, 8)
            .toUpperCase()}`;

          profile = await prisma.$transaction(async (tx) => {
            const createdProfile = await tx.referralProfile.create({
              data: {
                userId: user.id,
                code: newReferralCode,
                codeActivatesAt,
                displayName: user.name || ''
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

            return createdProfile;
          });
        }

        const code = await referralService.getCode(profile.code);

        return res.json({
          profile,
          code
        });
      } catch (err) {
        console.error('Referral me error:', err);

        return res.status(500).json({
          error: {
            message: 'Unable to load referral profile.'
          }
        });
      }
    },

    credits: async (req, res) => {
      try {
        const userId = req.user?.id;

        if (!userId) {
          return res.status(401).json({
            error: {
              message: 'Authentication required.'
            }
          });
        }

        const account = await creditService.getAccount(userId);

        if (!account) {
          return res.json({
            credits: {
              availableCredits: 0,
              pendingCredits: 0,
              lifetimeEarned: 0,
              version: 0
            },
            ledger: []
          });
        }

        const ledger = await prisma.creditLedger.findMany({
          where: {
            accountId: account.id
          },
          orderBy: {
            createdAt: 'desc'
          },
          take: 50
        });

        return res.json({
          credits: {
            availableCredits: account.availableCredits,
            pendingCredits: account.pendingCredits,
            lifetimeEarned: account.lifetimeEarned,
            version: account.version
          },
          ledger
        });
      } catch (err) {
        console.error('Credits error:', err);

        return res.status(500).json({
          error: {
            message: 'Unable to load credit account.'
          }
        });
      }
    },

    rewards: async (req, res) => {
      try {
        const userId = req.user?.id;

        if (!userId) {
          return res.status(401).json({
            error: {
              message: 'Authentication required.'
            }
          });
        }

        const profile = await prisma.referralProfile.findUnique({
          where: {
            userId
          }
        });

        if (!profile) {
          return res.status(404).json({
            error: {
              message: 'Referral profile not found.'
            }
          });
        }

        const qualifications =
          await prisma.referralQualification.findMany({
            where: {
              referrerUserId: userId
            },
            orderBy: {
              createdAt: 'desc'
            }
          });

        return res.json({
          qualifiedCount: profile.qualifiedCount,
          rewards: qualifications
        });
      } catch (err) {
        console.error('Referral rewards error:', err);

        return res.status(500).json({
          error: {
            message: 'Unable to load referral rewards.'
          }
        });
      }
    },
    
    milestones: async (req, res) => {
      try {
        const userId = req.user?.id || req.user?.userId;

        if (!userId) {
          return res.status(401).json({
            error: {
              message: 'Authentication required.'
            }
          });
        }

        const milestones =
          await referralMilestoneService.getUserMilestones(
            userId
          );

        return res.json({
          milestones
        });
      } catch (err) {
        console.error(
          'Referral milestones error:',
          err
        );

        return res.status(500).json({
          error: {
            message: 'Unable to load referral milestones.'
          }
        });
      }
    },



    circle: async (req, res) => {
      try {
        const userId = req.user?.id;

        if (!userId) {
          return res.status(401).json({
            error: {
              message: 'Authentication required.'
            }
          });
        }

        const attributions =
          await prisma.referralAttribution.findMany({
            where: {
              referrerUserId: userId
            },
            orderBy: {
              createdAt: 'desc'
            }
          });

        return res.json({
          referrals: attributions
        });
      } catch (err) {
        console.error('Referral circle error:', err);

        return res.status(500).json({
          error: {
            message: 'Unable to load referral circle.'
          }
        });
      }
    },
    
    claimCode: async (req, res) => {
      try {
        const userId = req.user?.id;

        if (!userId) {
          return res.status(401).json({
            error: {
              message: 'Authentication required.'
            }
          });
        }

        const code = referralService.normalizeCode(req.body?.code);

        if (!code) {
          return res.status(400).json({
            error: {
              message: 'Referral code is required.'
            }
          });
        }

        const validation = await referralService.validateCode(code);

        if (!validation.valid) {
          return res.status(400).json({
            error: {
              message: 'Referral code is not valid.',
              code: validation.reason
            }
          });
        }

        const referral = validation.referral;

        // Prevent self-referral.
        if (referral.ownerUserId === userId) {
          return res.status(400).json({
            error: {
              message: 'You cannot use your own referral code.',
              code: 'self_referral'
            }
          });
        }

        // Check whether this user already has a referral attribution.
        const existingAttribution =
          await prisma.referralAttribution.findUnique({
            where: {
              refereeUserId: userId
            }
          });

        if (existingAttribution) {
          return res.status(409).json({
            error: {
              message: 'A referral code has already been associated with this account.',
              code: 'already_attributed'
            }
          });
        }

        return res.json({
          valid: true,
          code: {
            id: referral.id,
            code: referral.code,
            kind: referral.kind,
            ownerUserId: referral.ownerUserId,
            campaignId: referral.campaignId,
            refereeCredits: referral.refereeCredits,
            referrerCredits: referral.referrerCredits
          }
        });
      } catch (err) {
        console.error('Referral claim-code error:', err);

        return res.status(500).json({
          error: {
            message: 'Unable to validate referral code.'
          }
        });
      }
    },




    leaderboard: async (req, res) => {
      try {
        const profiles = await prisma.referralProfile.findMany({
          where: {
            leaderboardOptIn: true,
            blockedAt: null
          },
          orderBy: {
            qualifiedCount: 'desc'
          },
          take: 100
        });

        return res.json({
          leaderboard: profiles
        });
      } catch (err) {
        console.error('Referral leaderboard error:', err);

        return res.status(500).json({
          error: {
            message: 'Unable to load referral leaderboard.'
          }
        });
      }
    },

    qualify: async (req, res) => {
      try {
        const userId = req.user?.userId || req.user?.id;

        if (!userId) {
          return res.status(401).json({
            error: {
              message: 'Authentication required.'
            }
          });
        }

        const attribution = await prisma.referralAttribution.findFirst({
          where: {
            refereeUserId: userId
          },
          orderBy: {
            createdAt: 'desc'
          }
        });

        if (!attribution) {
          return res.status(404).json({
            error: {
              message: 'No referral attribution found for this user.'
            }
          });
        }

        const result =
          await referralQualificationService.qualifyReferral(
            attribution.id
          );

        return res.json(result);
      } catch (err) {
        console.error('Referral qualification error:', err);

        return res.status(500).json({
          error: {
            message: 'Unable to evaluate referral qualification.'
          }
        });
      }
},

    updateProfile: async (req, res) => {
      try {
        const userId = req.user?.id;

        if (!userId) {
          return res.status(401).json({
            error: {
              message: 'Authentication required.'
            }
          });
        }

        const profile = await prisma.referralProfile.findUnique({
          where: {
            userId
          }
        });

        if (!profile) {
          return res.status(404).json({
            error: {
              message: 'Referral profile not found.'
            }
          });
        }

        const data = {};

        if (typeof req.body?.displayName === 'string') {
          data.displayName = req.body.displayName.trim();
        }

        if (typeof req.body?.leaderboardOptIn === 'boolean') {
          data.leaderboardOptIn = req.body.leaderboardOptIn;
        }

        const updated = await prisma.referralProfile.update({
          where: {
            userId
          },
          data
        });

        return res.json({
          profile: updated
        });
      } catch (err) {
        console.error('Referral profile update error:', err);

        return res.status(500).json({
          error: {
            message: 'Unable to update referral profile.'
          }
        });
      }
    }
  };
}

module.exports = {
  createReferralController
};

