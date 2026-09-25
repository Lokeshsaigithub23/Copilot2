const fs = require('fs');
const path = require('path');

// ─────────────────────────────────────────
// Lazy-loaded AWS SDK (only when S3 is enabled)
// ─────────────────────────────────────────
let _s3Client = null;
let _bucket = null;

function getS3Client() {
  if (_s3Client) return _s3Client;

  const { S3Client } = require('@aws-sdk/client-s3');

  _s3Client = new S3Client({
    region: process.env.AWS_S3_REGION || 'ap-south-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
  });

  _bucket = process.env.AWS_S3_BUCKET;

  if (!_bucket) {
    throw new Error('AWS_S3_BUCKET is required when SAVE_IN_S3=true');
  }
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    throw new Error('AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required when SAVE_IN_S3=true');
  }

  console.log(`[storage] S3 enabled — bucket: ${_bucket}, region: ${process.env.AWS_S3_REGION || 'ap-south-1'}`);
  return _s3Client;
}

function getBucket() {
  if (!_bucket) getS3Client(); // triggers init
  return _bucket;
}

/**
 * Check if S3 storage is enabled.
 */
function isS3Enabled() {
  return process.env.SAVE_IN_S3 === 'true';
}

/**
 * Upload a local file to S3.
 *
 * @param {string} localPath   — absolute path to the file on disk
 * @param {string} s3Key       — S3 object key, e.g. "audio/userId/filename.mp3"
 * @returns {Promise<string>}  — public S3 URL
 */
async function uploadToS3(localPath, s3Key) {
  const { PutObjectCommand } = require('@aws-sdk/client-s3');
  const client = getS3Client();
  const bucket = getBucket();

  const fileBuffer = fs.readFileSync(localPath);
  const ext = path.extname(localPath).toLowerCase();

  const mimeMap = {
    '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.avi': 'video/x-msvideo',
    '.mkv': 'video/x-matroska', '.webm': 'video/webm', '.flv': 'video/x-flv',
    '.wmv': 'video/x-ms-wmv', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
    '.m4a': 'audio/mp4', '.ogg': 'audio/ogg'
  };

  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: s3Key,
    Body: fileBuffer,
    ContentType: mimeMap[ext] || 'application/octet-stream'
  }));

  const region = process.env.AWS_S3_REGION || 'ap-south-1';
  const s3Url = `https://${bucket}.s3.${region}.amazonaws.com/${s3Key}`;

  console.log(`[storage] Uploaded to S3: ${s3Key}`);
  return s3Url;
}

/**
 * Delete a file from S3.
 *
 * @param {string} s3Key — S3 object key to delete
 */
async function deleteFromS3(s3Key) {
  const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
  const client = getS3Client();
  const bucket = getBucket();

  await client.send(new DeleteObjectCommand({
    Bucket: bucket,
    Key: s3Key
  }));

  console.log(`[storage] Deleted from S3: ${s3Key}`);
}

/**
 * Delete a local file (safe — won't throw if file doesn't exist).
 *
 * @param {string} localPath — absolute path to file
 */
function deleteLocalFile(localPath) {
  try {
    if (localPath && fs.existsSync(localPath)) {
      fs.unlinkSync(localPath);
      console.log(`[storage] Deleted local file: ${path.basename(localPath)}`);
    }
  } catch (err) {
    console.warn(`[storage] Failed to delete local file ${localPath}:`, err.message);
  }
}

/**
 * Upload file — uses S3 or keeps local based on SAVE_IN_S3 flag.
 *
 * @param {string} localPath  — absolute path to the file on disk
 * @param {string} s3Key      — S3 key (only used if S3 enabled)
 * @param {string} localUrl   — local URL to return if S3 not enabled (e.g. "/uploads/meta/audio/file.mp3")
 * @returns {Promise<{ url: string, s3Key: string|null }>}
 */
async function uploadFile(localPath, s3Key, localUrl) {
  if (isS3Enabled()) {
    const url = await uploadToS3(localPath, s3Key);
    return { url, s3Key };
  }
  // Local mode — file is already on disk via multer
  return { url: localUrl, s3Key: null };
}

/**
 * Delete file — from S3 or local disk based on SAVE_IN_S3 flag.
 *
 * @param {string} localPath  — absolute path on disk (can be null)
 * @param {string} s3Key      — S3 key (can be null)
 */
async function deleteFile(localPath, s3Key) {
  if (isS3Enabled() && s3Key) {
    await deleteFromS3(s3Key);
  }
  deleteLocalFile(localPath);
}

module.exports = {
  isS3Enabled,
  uploadToS3,
  deleteFromS3,
  deleteLocalFile,
  uploadFile,
  deleteFile
};
