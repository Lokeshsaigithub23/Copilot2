// src/routes/billing.routes.js
const express = require('express');
const usageService = require('../services/usage.service');
function createBillingRoutes(controller, authenticateToken) {
  const router = express.Router();

  router.get('/plans', controller.plans);

  router.get(
    '/credits/balance',
    authenticateToken,
    controller.balance
  );

  router.post(
    '/billing/plan/quote',
    authenticateToken,
    controller.quote
  );

  router.post(
    '/billing/plan/purchase',
    authenticateToken,
    controller.purchase
  );

  router.post(
    '/billing/credits/checkout',
    authenticateToken,
    controller.creditCheckout
  );

  router.post(
    '/billing/plan/checkout',
    authenticateToken,
    controller.checkout
  );

  router.get(
    "/user/subscription-limits",
    authenticateToken,
    async (req, res) => {
      try {
        const userId = req.user?.id || req.user?.userId;

        if (!userId) {
          return res.status(401).json({
            error: "Unauthorized",
          });
        }

        const [copilot, notetaker, voice, upload] = await Promise.all([
          usageService.getFeatureStatus(userId, "copilot"),
          usageService.getFeatureStatus(userId, "notetaker"),
          usageService.getFeatureStatus(userId, "voice"),
          usageService.getUploadLimit(userId),
        ]);

        return res.json({
          tier: copilot.tier,

          copilot: {
            limitSeconds: copilot.limitSeconds,
            usedSeconds: copilot.usedSeconds,
            remainingSeconds: copilot.remainingSeconds,
            allowed: copilot.allowed,
          },

          notetaker: {
            limitSeconds: notetaker.limitSeconds,
            usedSeconds: notetaker.usedSeconds,
            remainingSeconds: notetaker.remainingSeconds,
            allowed: notetaker.allowed,
          },

          voice: {
            limitSeconds: voice.limitSeconds,
            usedSeconds: voice.usedSeconds,
            remainingSeconds: voice.remainingSeconds,
            allowed: voice.allowed,
          },

          upload: {
            maxUploadMb: upload.maxUploadMb,
            maxUploadBytes: upload.maxUploadBytes,
          },
        });
      } catch (error) {
        console.error("[subscription-limits] Error:", error);

        return res.status(500).json({
          error: "Failed to fetch subscription limits",
        });
      }
    }
  );

  return router;
}

module.exports = {
  createBillingRoutes
};