const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const { createAuthenticateToken } = require('./middleware/auth');
const { createAuthService } = require('./services/auth.service');
const aiService = require('./services/ai.service');
const { createAuthController } = require('./controllers/auth.controller');
const { createEmailService } = require('./services/email.service');
const {
  createEmailVerificationService
} = require('./services/email-verification.service');
const { createProfileController } = require('./controllers/profile.controller');
const { createSessionController } = require('./controllers/session.controller');
const { createAiController } = require('./controllers/ai.controller');
const { createReferralController } = require('./controllers/referral.controller');
const { createReferralService } = require('./services/referral.service');
const { createCreditService } = require('./services/credit.service');
const { createAuthRoutes } = require('./routes/auth.routes');
const { createProfileRoutes } = require('./routes/profile.routes');
const { createSessionRoutes } = require('./routes/session.routes');
const { createCampaignService } = require('./services/campaign.service');
const { createCampaignController } = require('./controllers/campaign.controller');
const { createCampaignRoutes } = require('./routes/campaign.routes');
const {
  createReferralQualificationService
} = require('./services/referral-qualification.service');
const { createReferralMilestoneService } = require('./services/referral-milestone.service');
const {
  createCreditMaturityService
} = require('./services/credit-maturity.service');
const {
  createCreditExpiryService
} = require('./services/credit-expiry.service');
const { createAiRoutes } = require('./routes/ai.routes');
const { createReferralRoutes } = require('./routes/referral.routes');
const { createUploadRoutes } = require('./routes/upload.routes');
const { createVoiceAgentRoutes } = require('./routes/voice-agent.routes');
const { createVideoRoutes } = require('./routes/video.routes');
const { createInterviewPanelRoutes } = require('./routes/interview-panel.routes');

// Build the cors() options from config.corsOrigins.
//
// An empty list means "no origin restriction". config.js refuses to produce an
// empty list in production, so that only ever applies to local development.
function corsOptions(config) {
  const allowed = config.corsOrigins || [];
  if (allowed.length === 0) return {};

  return {
    origin: (origin, callback) => {
      // Requests with no Origin header (curl, server-to-server, health checks)
      // are not browser cross-origin requests, so CORS does not apply.
      if (!origin || allowed.includes(origin)) return callback(null, true);
      // Reject by withholding the header rather than throwing: an error here
      // surfaces as a 500, which misreports a policy decision as a server
      // fault and lets any origin fill the logs with stack traces.
      callback(null, false);
    },
    credentials: true
  };
}

function createApp({ db, config }) {
  const app = express();
  const authenticateToken = createAuthenticateToken(config.jwtSecret);
  const authService = createAuthService({
    db,
    config
  });

  const emailService = createEmailService({
    config
  });

  const emailVerificationService = createEmailVerificationService({
    prisma: db.prisma || db,
    emailService,
    config
  });

  const authController = createAuthController({
    db,
    authService,
    emailVerificationService
  });
  const profileController = createProfileController({ db });
  const sessionController = createSessionController({ db, config });
  const aiController = createAiController({
    aiService,
    prisma: db.prisma || db
  });
  const referralService = createReferralService({
    prisma: db.prisma || db
  });
  const campaignService = createCampaignService({
    prisma: db.prisma || db
  });
  const creditService = createCreditService({
    prisma: db.prisma || db
  });
  const referralMilestoneService =
    createReferralMilestoneService({
      prisma: db.prisma || db
    });

  const referralQualificationService =
    createReferralQualificationService({
      prisma: db.prisma || db,
      creditService,
      referralMilestoneService
    });
  const creditMaturityService =
  createCreditMaturityService({
    prisma: db.prisma || db,
    creditService
  });
  const creditExpiryService =
  createCreditExpiryService({
    prisma: db.prisma || db
  });
  const REFERRAL_MATURITY_INTERVAL_MS =
    60 * 60 * 1000; // 1 hour

  const runReferralCreditJobs = async () => {
    try {
      const maturityResult =
        await creditMaturityService.maturePendingCredits();

      if (maturityResult.matured > 0) {
        console.log(
          `[referral-maturity] Matured ${maturityResult.matured} reward(s).`
        );
      }

      const expiryResult =
        await creditExpiryService.expireCredits();

      if (expiryResult.expired > 0) {
        console.log(
          `[referral-expiry] Expired ${expiryResult.expired} reward(s).`
        );
      }
    } catch (error) {
      console.error(
        '[referral-credit-jobs] Failed:',
        error
      );
    }
  };

  setInterval(
    runReferralCreditJobs,
    REFERRAL_MATURITY_INTERVAL_MS
  );

  runReferralCreditJobs();

  const REFERRAL_QUALIFICATION_INTERVAL_MS =
    60 * 60 * 1000; // 1 hour

  const runReferralQualificationJob = async () => {
    try {
      const result =
        await referralQualificationService.qualifyPendingReferrals();

      if (result.checked > 0) {
        console.log(
          `[referral-qualification] Checked ${result.checked} referral(s).`
        );

        const qualified = result.results.filter(
          (item) => item.status === 'qualified'
        ).length;

        if (qualified > 0) {
          console.log(
            `[referral-qualification] Qualified ${qualified} referral(s).`
          );
        }
      }
    } catch (error) {
      console.error(
        '[referral-qualification] Job failed:',
        error
      );
    }
  };

  setInterval(
    runReferralQualificationJob,
    REFERRAL_QUALIFICATION_INTERVAL_MS
  );

  runReferralQualificationJob();

  const referralController = createReferralController({
    prisma: db.prisma || db,
    referralService,
    creditService,
    referralQualificationService,
    referralMilestoneService
  });

  const campaignController = createCampaignController({
    campaignService
  });

  app.use(cors(corsOptions(config)));
  app.use(express.json({ limit: '100mb' }));
  app.use((req, res, next) => {
    req.requestId = crypto.randomUUID();
    res.setHeader('X-Request-Id', req.requestId);
    console.log(`[${new Date().toISOString()}] ${req.requestId} ${req.method} ${req.path}`);
    next();
  });
  const uploadDir = config?.uploadDirectory || path.resolve(path.join(__dirname, '../../uploads'));
  app.use('/uploads', express.static(uploadDir));
  app.use('/meta', express.static(path.join(uploadDir, 'meta')));
  app.get('/', (_, res) => res.json({ ok: true, message: 'Copilot Backend API Online' }));
  app.get('/health', (_, res) => res.json({ status: 'healthy' }));
  app.get('/health/live', (_, res) => res.json({ status: 'healthy' }));
  app.get('/health/ready', async (_, res) => {
    try {
      await db.ready;
      res.json({ status: 'ready' });
    } catch (err) {
      console.error('Readiness check failed:', err.message);
      res.status(503).json({ status: 'unavailable' });
    }
  });

  app.use('/api/auth', createAuthRoutes(authController));
  app.use(
    '/api/referrals',
    createReferralRoutes(referralController, authenticateToken)
  );
  app.use(
    '/api/campaigns',
    createCampaignRoutes(campaignController, authenticateToken)
  );
  app.use('/api/profiles', createProfileRoutes(profileController, authenticateToken));
  app.use('/api/interview-panel-sessions', createSessionRoutes(sessionController, authenticateToken));
  app.use('/api/sessions', createSessionRoutes(sessionController, authenticateToken));
  app.use('/api', createAiRoutes(aiController, authenticateToken));
  app.use('/api/upload', createUploadRoutes(authenticateToken));
  app.use('/api/interview-panel', createInterviewPanelRoutes(authenticateToken));
  app.use('/api/video', createVideoRoutes(authenticateToken));
  app.use('/api/voice-agent', createVoiceAgentRoutes(authenticateToken));
  app.use((err, req, res, next) => {
    console.error('Unhandled server error:', {
      requestId: req.requestId,
      name: err.name,
      message: err.message,
      stack: process.env.NODE_ENV === 'production' ? undefined : err.stack
    });
    res.status(500).json({ error: { message: 'An unexpected error occurred on the server.', requestId: req.requestId } });
  });
  return app;
}

module.exports = { createApp };
