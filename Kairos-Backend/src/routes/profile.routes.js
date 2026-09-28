const express = require('express');

function createProfileRoutes(controller, authenticateToken) {
  const router = express.Router();

  router.use(authenticateToken);

  router.get('/role-skills', controller.roleSkills);

  // Get devices associated with the authenticated user.
  router.get('/devices', controller.getDevices);

  return router;
}

module.exports = { createProfileRoutes };