const express = require('express');

function createCampaignRoutes(controller, authenticateToken) {
  const router = express.Router();

  router.get(
    '/',
    authenticateToken,
    controller.list
  );

  router.post(
    '/',
    authenticateToken,
    controller.create
  );

  router.get(
    '/:id',
    authenticateToken,
    controller.get
  );

  router.patch(
    '/:id',
    authenticateToken,
    controller.update
  );

  router.patch(
    '/:id/status',
    authenticateToken,
    controller.updateStatus
  );

  router.post(
    '/:id/codes',
    authenticateToken,
    controller.createCode
  );

  router.get(
    '/:id/codes',
    authenticateToken,
    controller.listCodes
  );

  return router;
}

module.exports = {
  createCampaignRoutes
};