function createReferralService({ prisma }) {
  function normalizeCode(code) {
    return String(code || '').trim().toUpperCase();
  }

  async function getCode(code) {
    const normalizedCode = normalizeCode(code);

    if (!normalizedCode) {
      return null;
    }

    return prisma.referralCode.findUnique({
      where: {
        code: normalizedCode
      }
    });
  }

  async function validateCode(code) {
    const referral = await getCode(code);

    if (!referral) {
      return {
        valid: false,
        reason: 'not_found'
      };
    }

    const now = new Date();

    if (referral.status !== 'active') {
      return {
        valid: false,
        reason: 'inactive'
      };
    }

    if (referral.activatesAt && referral.activatesAt > now) {
      return {
        valid: false,
        reason: 'not_active_yet'
      };
    }

    if (referral.expiresAt && referral.expiresAt <= now) {
      return {
        valid: false,
        reason: 'expired'
      };
    }

    if (
      referral.maxRedemptions !== null &&
      referral.redemptionCount >= referral.maxRedemptions
    ) {
      return {
        valid: false,
        reason: 'max_redemptions'
      };
    }

    if (referral.campaignId) {
      const campaign = await prisma.campaign.findUnique({
        where: {
          id: referral.campaignId
        }
      });

      if (!campaign) {
        return {
          valid: false,
          reason: 'campaign_not_found'
        };
      }

      if (campaign.status !== 'active') {
        return {
          valid: false,
          reason: 'campaign_inactive'
        };
      }

      if (campaign.startsAt > now) {
        return {
          valid: false,
          reason: 'campaign_not_started'
        };
      }

      if (campaign.endsAt && campaign.endsAt <= now) {
        return {
          valid: false,
          reason: 'campaign_ended'
        };
      }
    }

    return {
      valid: true,
      referral
    };
  }

  return {
    normalizeCode,
    getCode,
    validateCode
  };
}

module.exports = {
  createReferralService
};