const nodemailer = require('nodemailer');

function createEmailService({ config }) {
  const transporter = nodemailer.createTransport({
    host: config.email.smtpHost,
    port: config.email.smtpPort,
    secure: config.email.smtpPort === 465,
    auth: {
      user: config.email.smtpUser,
      pass: config.email.smtpPass
    }
  });

  async function sendVerificationEmail({
    to,
    name,
    verificationUrl
  }) {
    const displayName = name || 'there';

    await transporter.sendMail({
      from: config.email.from,
      to,
      subject: 'Verify your Kairos email',

      text: [
        `Hi ${displayName},`,
        '',
        'Please verify your email address to activate your Kairos account.',
        '',
        `Verify your email: ${verificationUrl}`,
        '',
        'This verification link will expire after 24 hours.',
        '',
        'If you did not create this account, you can ignore this email.'
      ].join('\n'),

      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6;">
          <h2>Verify your Kairos email</h2>

          <p>Hi ${displayName},</p>

          <p>
            Please verify your email address to activate your Kairos account.
          </p>

          <p>
            <a
              href="${verificationUrl}"
              style="
                display:inline-block;
                padding:10px 16px;
                background:#000;
                color:#fff;
                text-decoration:none;
                border-radius:6px;
              "
            >
              Verify Email
            </a>
          </p>

          <p>This verification link will expire after 24 hours.</p>

          <p>
            If you did not create this account, you can ignore this email.
          </p>
        </div>
      `
    });
  }

  return {
    sendVerificationEmail
  };
}

module.exports = {
  createEmailService
};