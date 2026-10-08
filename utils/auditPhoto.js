const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { uploadBufferToS3 } = require('./s3Upload');
const fail = (message) => Object.assign(new Error(message), { status: 400 });

const { validateImage } = require('./qgPhoto');

const uploadPhoto = async ({ buffer, contentType, jobId, userId }) => {
  validateImage(buffer, contentType);
  const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[contentType];
  const key = `audit/defects/${jobId}/${crypto.randomUUID()}.${extension}`;
  const uploaded = await uploadBufferToS3({ key, buffer, contentType });
  const photo = { storage_key: key, url: uploaded.url, file_name: key.split('/').pop(), content_type: contentType, file_size: buffer.length };
  return { ...photo, upload_token: jwt.sign({ photo, jobId: String(jobId), userId: String(userId) }, process.env.JWT_SECRET, { algorithm: 'HS256', audience: 'audit-photo', expiresIn: '7d' }) };
};

const verifyPhoto = (input, jobId, userId) => {
  try {
    const receipt = jwt.verify(input?.upload_token, process.env.JWT_SECRET, { algorithms: ['HS256'], audience: 'audit-photo' });
    if (receipt.jobId !== String(jobId) || receipt.userId !== String(userId)) throw new Error('Wrong owner');
    return receipt.photo;
  } catch { throw fail('Photo upload is missing or expired. Remove the photo and upload it again.'); }
};
module.exports = { validateImage, uploadPhoto, verifyPhoto };
