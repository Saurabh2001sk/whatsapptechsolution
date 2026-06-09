const speakeasy = require('speakeasy');
const QRCode = require('qrcode');

async function createTotpEnrollment(email) {
  const safeEmail = String(email || '').trim().toLowerCase() || 'admin';

  const secret = speakeasy.generateSecret({
    name: `BOS WhatsApp (${safeEmail})`,
    issuer: 'BOS WhatsApp',
    length: 20,
  });

  const qrCodeDataUrl = await QRCode.toDataURL(secret.otpauth_url);

  return {
    secret: secret.base32,
    qrCodeDataUrl,
    otpauthUrl: secret.otpauth_url,
  };
}

function cleanTotpToken(token) {
  return String(token || '').replace(/\D/g, '').slice(0, 6);
}

function verifyTotp(secret, token) {
  const cleanToken = cleanTotpToken(token);

  if (!secret || cleanToken.length !== 6) {
    return false;
  }

  return speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token: cleanToken,
    window: 1,
  });
}

module.exports = {
  createTotpEnrollment,
  cleanTotpToken,
  verifyTotp,
};