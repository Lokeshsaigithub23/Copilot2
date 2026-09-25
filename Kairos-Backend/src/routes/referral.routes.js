const express = require('express');

function createReferralRoutes(controller, authenticateToken) {
  const router = express.Router();

  router.get('/me', authenticateToken, controller.me);
  router.get('/circle', authenticateToken, controller.circle);
  router.get('/rewards', authenticateToken, controller.rewards);
  router.get('/credits', authenticateToken, controller.credits);
  router.get('/leaderboard', controller.leaderboard);
  router.patch('/me', authenticateToken, controller.updateProfile);
  router.post('/claim-code', authenticateToken, controller.claimCode);
  router.post('/qualify',authenticateToken,controller.qualify);
  router.get('/milestones',authenticateToken,controller.milestones);
  return router;
}

module.exports = {
  createReferralRoutes
};