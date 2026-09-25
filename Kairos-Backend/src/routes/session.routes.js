const express = require('express');
function createSessionRoutes(controller, authenticateToken) { const router = express.Router(); router.use(authenticateToken); router.post('/', controller.create); router.post('/:id/audio', controller.upload.single('file'), controller.uploadAudio); router.get('/:id/audio', controller.getAudio); router.get('/', controller.list); router.delete('/:id', controller.delete); return router; }
module.exports = { createSessionRoutes };
