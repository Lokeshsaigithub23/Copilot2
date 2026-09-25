const crypto = require('crypto');

const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000;

function createEmailVerificationService({ prisma, emailService, config }) {
  async function createVerificationToken(user) {
    const rawToken = crypto.randomBytes(32).toString('hex');

    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');

    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MS);

    await prisma.emailVerificationToken.updateMany({
      where: {
        userId: user.id,
        usedAt: null
      },
      data: {
        usedAt: new Date()
      }
    });

    await prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt
      }
    });

    const verificationUrl =
      `${config.email.verificationUrl}?token=${encodeURIComponent(rawToken)}`;

    await emailService.sendVerificationEmail({
      to: user.email,
      name: user.name,
      verificationUrl
    });

    return {
      expiresAt
    };
  }

  async function verifyEmail(rawToken) {
    if (!rawToken) {
      return {
        success: false,
        reason: 'missing_token'
      };
    }

    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');

    const token = await prisma.emailVerificationToken.findUnique({
      where: {
        tokenHash
      },
      include: {
        user: true
      }
    });

    if (!token) {
      return {
        success: false,
        reason: 'invalid_token'
      };
    }

    if (token.usedAt) {
      return {
        success: false,
        reason: 'token_already_used'
      };
    }

    if (token.expiresAt <= new Date()) {
      return {
        success: false,
        reason: 'token_expired'
      };
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: {
          id: token.userId
        },
        data: {
          emailVerified: true
        }
      });

      await tx.emailVerificationToken.update({
        where: {
          id: token.id
        },
        data: {
          usedAt: new Date()
        }
      });
    });

    return {
      success: true
    };
  }

  return {
    createVerificationToken,
    verifyEmail
  };
}

module.exports = {
  createEmailVerificationService
};