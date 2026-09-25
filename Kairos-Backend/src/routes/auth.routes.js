const express = require('express');

function createAuthRoutes(controller) {
  const router = express.Router();

  router.post('/register', controller.register);
  router.post('/login', controller.login);
  router.post('/google', controller.google);

  router.get('/verify-email', controller.verifyEmail);

  return router;
}

module.exports = { createAuthRoutes };