const express = require('express');
function createProfileRoutes(controller, authenticateToken) { const router = express.Router(); router.use(authenticateToken); router.get('/role-skills', controller.roleSkills); return router; }
module.exports = { createProfileRoutes };
