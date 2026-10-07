const express = require('express');

function createProfileRoutes(controller, authenticateToken) {
  const router = express.Router();

  router.use(authenticateToken);

  router.get('/role-skills', controller.roleSkills);

  // Get devices associated with the authenticated user.
  router.get('/devices', controller.getDevices);

  // Permanently delete the authenticated user's account and associated data.
  router.delete('/account', controller.deleteAccount);

  return router;
}

module.exports = { createProfileRoutes };