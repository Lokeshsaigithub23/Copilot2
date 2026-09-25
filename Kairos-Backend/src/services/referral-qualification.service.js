function createReferralQualificationService({
  prisma,
  creditService,
  referralMilestoneService,
  now = () => new Date()
}) {
  async function qualifyReferral(attributionId) {
    if (!attributionId) {
        throw new Error('attributionId is required');
    }

    const attribution =
        await prisma.referralAttribution.findUnique({
        where: {
            id: attributionId
        }
        });

    if (!attribution) {
        return {
        qualified: false,
        status: 'not_found',
        reason: 'Referral attribution not found'
        };
    }

    // Qualification is a one-time decision.
    if (attribution.qualifiedAt) {
        return {
        qualified: true,
        status: 'already_qualified',
        attributionId
        };
    }

    if (attribution.status === 'rejected') {
        return {
        qualified: false,
        status: 'rejected',
        reason:
            attribution.rejectedReason ||
            'Referral rejected'
        };
    }

    const referee =
        await prisma.user.findUnique({
        where: {
            id: attribution.refereeUserId
        }
        });

    if (!referee) {
        return {
        qualified: false,
        status: 'rejected',
        reason: 'Referee user not found'
        };
    }

    /*
    * Day-7 gate.
    *
    * ReferralAttribution.createdAt represents
    * the referral signup/join time.
    *
    * The specification requires the account
    * to still be active on day 7 before
    * qualification can happen.
    */
    const currentTime = now();

    const qualifiesAfter =
        new Date(
        attribution.createdAt.getTime() +
        7 * 24 * 60 * 60 * 1000
        );

    if (currentTime < qualifiesAfter) {
        return {
        qualified: false,
        status: 'pending',
        reason: 'Day-7 qualification window has not been reached',
        qualifiesAfter
        };
    }

    // Account must still be active on day 7.
    if (referee.bannedAt) {
        await prisma.referralAttribution.update({
        where: {
            id: attribution.id
        },
        data: {
            status: 'rejected',
            rejectedReason: 'Account is banned'
        }
        });

        return {
        qualified: false,
        status: 'rejected',
        reason: 'Account is banned'
        };
    }

    /*
    * Requirement 1:
    * At least one interview session lasting
    * 5 minutes or longer.
    */
    const qualifyingSession =
        await prisma.session.findFirst({
        where: {
            userId: referee.id,
            durationSeconds: {
            gte: 300
            }
        },
        orderBy: {
            createdAt: 'asc'
        }
        });
    /*
     * Requirement 1:
     * Email must be verified OR the user must
     * have completed a verified Google sign-in.
     *
     * The current backend does not have a persisted
     * email-verification flow, so Google sign-in is
     * the currently supported verification path.
     */
    const googleSignIn =
      await prisma.auditEvent.findFirst({
        where: {
          actorId: referee.id,
          action: 'GOOGLE_SIGN_IN'
        }
      });

    const verifiedEmailOrGoogle =
      referee.emailVerified === true || !!googleSignIn;

    if (!verifiedEmailOrGoogle) {
      return {
        qualified: false,
        status: 'pending',
        reason:
          'Email verification or verified Google sign-in is required'
      };
    }
    if (!qualifyingSession) {
        return {
        qualified: false,
        status: 'pending',
        reason:
            'No session of at least 300 seconds'
        };
    }

    /*
    * Requirement 2:
    * At least 3 Copilot answers requested
    * across the account lifetime.
    */
    const copilotRequests =
        await prisma.auditEvent.count({
        where: {
            actorId: referee.id,
            action: 'COPILOT_ANSWER_REQUESTED'
        }
        });

    if (copilotRequests < 3) {
        return {
        qualified: false,
        status: 'pending',
        reason:
            'Fewer than 3 Copilot answer requests',
        copilotRequests
        };
    }

    /*
    * Fraud gate.
    */
    if (attribution.fraudStatus === 'rejected') {
        await prisma.referralAttribution.update({
        where: {
            id: attribution.id
        },
        data: {
            status: 'rejected',
            rejectedReason:
            'Fraud check rejected referral'
        }
        });

        return {
        qualified: false,
        status: 'rejected',
        reason:
            'Fraud check rejected referral'
        };
    }

    if (attribution.fraudStatus === 'suspicious') {
        await prisma.referralAttribution.update({
        where: {
            id: attribution.id
        },
        data: {
            status: 'review'
        }
        });

        return {
        qualified: false,
        status: 'review',
        reason:
            'Referral requires fraud review'
        };
    }

    return awardQualification(attribution);
    }

  async function qualifyPendingReferrals() {
    const currentTime = now();

    const attributions = await prisma.referralAttribution.findMany({
      where: {
        status: 'joined',
        qualifiedAt: null,
        referrerUserId: {
          not: null
        },
        createdAt: {
          lte: new Date(
            currentTime.getTime() - 7 * 24 * 60 * 60 * 1000
          )
        }
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    const results = [];

    for (const attribution of attributions) {
      try {
        const result = await qualifyReferral(attribution.id);

        results.push({
          attributionId: attribution.id,
          ...result
        });
      } catch (error) {
        console.error(
          `[referral-qualification] Failed for ${attribution.id}:`,
          error
        );

        results.push({
          attributionId: attribution.id,
          qualified: false,
          status: 'error',
          reason: error.message
        });
      }
    }

    return {
      checked: attributions.length,
      results
    };
  }   
     

  async function awardQualification(attribution) {
    return prisma.$transaction( async (tx) => {
      // Re-check inside transaction so retries do not
      // create another qualification.
      const existing =
        await tx.referralQualification.findUnique({
          where: {
            attributionId: attribution.id
          }
        });

      if (existing) {
        return {
          qualified: true,
          status: 'already_qualified',
          qualificationId: existing.id
        };
      }

      // Get the actual referral code so the configured
      // referrer reward is used.
      const referralCode =
        await tx.referralCode.findUnique({
          where: {
            id: attribution.codeId
          }
        });

      if (!referralCode) {
        throw new Error(
          'Referral code not found'
        );
      }

      const awardedCredits =
        Number(referralCode.referrerCredits) || 0;

      if (awardedCredits <= 0) {
        throw new Error(
          'Referral reward amount must be greater than zero'
        );
      }

      const maturesAt = new Date(
        now().getTime() +
          7 * 24 * 60 * 60 * 1000
      );

      const qualification =
        await tx.referralQualification.create({
          data: {
            attributionId: attribution.id,
            referrerUserId:
              attribution.referrerUserId,
            awardedCredits,
            maturesAt
          }
        });

      await tx.referralAttribution.update({
        where: {
          id: attribution.id
        },
        data: {
          status: 'qualified',
          qualifiedAt: now()
        }
      });

    const updatedReferralProfile =
        await tx.referralProfile.update({
            where: {
            userId: attribution.referrerUserId
            },
            data: {
            qualifiedCount: {
                increment: 1
            }
            },
            select: {
            qualifiedCount: true
            }
        });
    const milestoneResult =
        await referralMilestoneService.processMilestones(
            attribution.referrerUserId,
            updatedReferralProfile.qualifiedCount,
            tx
        );    

      // Put reward into pending balance.
      const creditResult =
        await creditService.addPendingCredits(
          {
            userId:
              attribution.referrerUserId,
            amount: awardedCredits,
            entryType: 'referral_award',
            idempotencyRef:
              `refq:${qualification.id}`,
            refType:
              'referral_qualification',
            refId: qualification.id,
            maturesAt,
            reason:
              'Qualified referral reward'
          },
          tx
        );

      await tx.referralQualification.update({
        where: {
          id: qualification.id
        },
        data: {
          ledgerEntryId:
            creditResult.ledger.id
        }
      });

      return {
        qualified: true,
        status: 'qualified',
        qualificationId:
            qualification.id,
        awardedCredits,
        maturesAt,
        milestones: milestoneResult.unlocked
      };
      },
      {
        maxWait: 10000,
        timeout: 30000
      }
    );
  }
  return {
    qualifyReferral,
    qualifyPendingReferrals
  };
}

module.exports = {
  createReferralQualificationService
};