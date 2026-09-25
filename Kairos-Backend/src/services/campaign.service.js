function createCampaignService({ prisma }) {
  function normalizeSlug(slug) {
    return String(slug || '').trim().toLowerCase();
  }

  function normalizeStatus(status) {
    return String(status || '').trim().toLowerCase();
  }

  async function createCampaign(data) {
    const {
      name,
      slug,
      kind = 'referral',
      startsAt,
      endsAt = null,
      budgetCredits = null,
      createdByAdminId
    } = data || {};

    if (!name || !String(name).trim()) {
      throw new Error('Campaign name is required');
    }

    const normalizedSlug = normalizeSlug(slug);

    if (!normalizedSlug) {
      throw new Error('Campaign slug is required');
    }

    if (!startsAt) {
      throw new Error('Campaign start date is required');
    }

    if (!createdByAdminId) {
      throw new Error('createdByAdminId is required');
    }

    if (
      budgetCredits !== null &&
      (!Number.isInteger(budgetCredits) || budgetCredits < 0)
    ) {
      throw new Error('budgetCredits must be a non-negative integer');
    }

    const existing = await prisma.campaign.findUnique({
      where: { slug: normalizedSlug }
    });

    if (existing) {
      throw new Error('Campaign slug already exists');
    }

    return prisma.campaign.create({
      data: {
        name: String(name).trim(),
        slug: normalizedSlug,
        kind: String(kind || 'referral').trim(),
        startsAt: new Date(startsAt),
        endsAt: endsAt ? new Date(endsAt) : null,
        budgetCredits,
        status: 'draft',
        createdByAdminId
      }
    });
  }

  async function listCampaigns() {
    return prisma.campaign.findMany({
      orderBy: {
        createdAt: 'desc'
      },
      include: {
        codes: true
      }
    });
  }

  async function getCampaign(id) {
    if (!id) {
      throw new Error('Campaign id is required');
    }

    return prisma.campaign.findUnique({
      where: { id },
      include: {
        codes: true
      }
    });
  }

  async function updateCampaign(id, data) {
    if (!id) {
      throw new Error('Campaign id is required');
    }

    const updateData = {};

    if (data.name !== undefined) {
      updateData.name = String(data.name).trim();
    }

    if (data.slug !== undefined) {
      updateData.slug = normalizeSlug(data.slug);
    }

    if (data.kind !== undefined) {
      updateData.kind = String(data.kind).trim();
    }

    if (data.startsAt !== undefined) {
      updateData.startsAt = new Date(data.startsAt);
    }

    if (data.endsAt !== undefined) {
      updateData.endsAt = data.endsAt
        ? new Date(data.endsAt)
        : null;
    }

    if (data.budgetCredits !== undefined) {
      if (
        data.budgetCredits !== null &&
        (!Number.isInteger(data.budgetCredits) ||
          data.budgetCredits < 0)
      ) {
        throw new Error(
          'budgetCredits must be a non-negative integer'
        );
      }

      updateData.budgetCredits = data.budgetCredits;
    }

    return prisma.campaign.update({
      where: { id },
      data: updateData
    });
  }

  async function updateStatus(id, status) {
    if (!id) {
      throw new Error('Campaign id is required');
    }

    const normalizedStatus = normalizeStatus(status);

    const allowedStatuses = [
      'draft',
      'active',
      'paused',
      'completed'
    ];

    if (!allowedStatuses.includes(normalizedStatus)) {
      throw new Error('Invalid campaign status');
    }

    return prisma.campaign.update({
      where: { id },
      data: {
        status: normalizedStatus
      }
    });
  }

  async function createCampaignCode(campaignId, data) {
    if (!campaignId) {
      throw new Error('campaignId is required');
    }

    const {
      code,
      activatesAt = null,
      expiresAt = null,
      maxRedemptions = null,
      refereeCredits = 100,
      referrerCredits = 250,
      notes = ''
    } = data || {};

    const normalizedCode = String(code || '')
      .trim()
      .toUpperCase();

    if (!normalizedCode) {
      throw new Error('Referral code is required');
    }

    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId }
    });

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    const existing = await prisma.referralCode.findUnique({
      where: { code: normalizedCode }
    });

    if (existing) {
      throw new Error('Referral code already exists');
    }

    if (
      maxRedemptions !== null &&
      (!Number.isInteger(maxRedemptions) ||
        maxRedemptions < 0)
    ) {
      throw new Error(
        'maxRedemptions must be a non-negative integer'
      );
    }

    return prisma.referralCode.create({
      data: {
        code: normalizedCode,
        kind: 'campaign',
        campaignId,
        status: 'active',
        activatesAt: activatesAt
          ? new Date(activatesAt)
          : campaign.startsAt,
        expiresAt: expiresAt
          ? new Date(expiresAt)
          : campaign.endsAt,
        maxRedemptions,
        refereeCredits,
        referrerCredits,
        notes: String(notes || '')
      }
    });
  }

  async function listCampaignCodes(campaignId) {
    if (!campaignId) {
      throw new Error('campaignId is required');
    }

    return prisma.referralCode.findMany({
      where: {
        campaignId
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
  }

  return {
    createCampaign,
    listCampaigns,
    getCampaign,
    updateCampaign,
    updateStatus,
    createCampaignCode,
    listCampaignCodes
  };
}

module.exports = {
  createCampaignService
};