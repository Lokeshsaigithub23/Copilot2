function createCampaignController({ campaignService }) {
  function getErrorStatus(err) {
    const message = String(err?.message || '');

    if (
      message.includes('required') ||
      message.includes('already exists') ||
      message.includes('Invalid campaign status') ||
      message.includes('must be')
    ) {
      return 400;
    }

    if (
      message === 'Campaign not found'
    ) {
      return 404;
    }

    return 500;
  }

  return {
    create: async (req, res) => {
      try {
        const adminId = req.user?.id || req.user?.userId;

        if (!adminId) {
          return res.status(401).json({
            error: {
              message: 'Authentication required.'
            }
          });
        }

        const campaign =
          await campaignService.createCampaign({
            ...(req.body || {}),
            createdByAdminId: adminId
          });

        return res.status(201).json({
          campaign
        });
      } catch (err) {
        console.error('[campaign] Create error:', err);

        return res.status(getErrorStatus(err)).json({
          error: {
            message: err.message || 'Unable to create campaign.'
          }
        });
      }
    },

    list: async (req, res) => {
      try {
        const campaigns =
          await campaignService.listCampaigns();

        return res.json({
          campaigns
        });
      } catch (err) {
        console.error('[campaign] List error:', err);

        return res.status(500).json({
          error: {
            message: 'Unable to load campaigns.'
          }
        });
      }
    },

    get: async (req, res) => {
      try {
        const campaign =
          await campaignService.getCampaign(
            req.params.id
          );

        if (!campaign) {
          return res.status(404).json({
            error: {
              message: 'Campaign not found.'
            }
          });
        }

        return res.json({
          campaign
        });
      } catch (err) {
        console.error('[campaign] Get error:', err);

        return res.status(getErrorStatus(err)).json({
          error: {
            message: err.message || 'Unable to load campaign.'
          }
        });
      }
    },

    update: async (req, res) => {
      try {
        const campaign =
          await campaignService.updateCampaign(
            req.params.id,
            req.body || {}
          );

        return res.json({
          campaign
        });
      } catch (err) {
        console.error('[campaign] Update error:', err);

        return res.status(getErrorStatus(err)).json({
          error: {
            message: err.message || 'Unable to update campaign.'
          }
        });
      }
    },

    updateStatus: async (req, res) => {
      try {
        const campaign =
          await campaignService.updateStatus(
            req.params.id,
            req.body?.status
          );

        return res.json({
          campaign
        });
      } catch (err) {
        console.error(
          '[campaign] Status update error:',
          err
        );

        return res.status(getErrorStatus(err)).json({
          error: {
            message:
              err.message ||
              'Unable to update campaign status.'
          }
        });
      }
    },

    createCode: async (req, res) => {
      try {
        const code =
          await campaignService.createCampaignCode(
            req.params.id,
            req.body || {}
          );

        return res.status(201).json({
          code
        });
      } catch (err) {
        console.error(
          '[campaign] Create code error:',
          err
        );

        return res.status(getErrorStatus(err)).json({
          error: {
            message:
              err.message ||
              'Unable to create campaign code.'
          }
        });
      }
    },

    listCodes: async (req, res) => {
      try {
        const codes =
          await campaignService.listCampaignCodes(
            req.params.id
          );

        return res.json({
          codes
        });
      } catch (err) {
        console.error(
          '[campaign] List codes error:',
          err
        );

        return res.status(getErrorStatus(err)).json({
          error: {
            message:
              err.message ||
              'Unable to load campaign codes.'
          }
        });
      }
    }
  };
}

module.exports = {
  createCampaignController
};