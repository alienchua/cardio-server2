const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { uploadBufferToS3 } = require('./s3Upload');
const fail = (message) => Object.assign(new Error(message), { status: 400 });

const validateImage = (buffer, contentType) => {
  if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > 10 * 1024 * 1024) throw fail('Choose a photo up to 10 MB');
  const valid = contentType === 'image/jpeg' ? buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
    : contentType === 'image/png' ? buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
    : contentType === 'image/webp' && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  if (!valid) throw fail('Choose a JPEG, PNG or WebP photo');
};

const uploadPhoto = async ({ buffer, contentType, jobId, userId }) => {
  validateImage(buffer, contentType);
  const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[contentType];
  const key = `qg/defects/${jobId}/${crypto.randomUUID()}.${extension}`;
  const uploaded = await uploadBufferToS3({ key, buffer, contentType });
  const photo = { storage_key: key, url: uploaded.url, file_name: key.split('/').pop(), content_type: contentType, file_size: buffer.length };
  return { ...photo, upload_token: jwt.sign({ photo, jobId: String(jobId), userId: String(userId) }, process.env.JWT_SECRET, { algorithm: 'HS256', audience: 'qg-photo', expiresIn: '7d' }) };
};

const verifyPhoto = (input, jobId, userId) => {
  try {
    const receipt = jwt.verify(input?.upload_token, process.env.JWT_SECRET, { algorithms: ['HS256'], audience: 'qg-photo' });
    if (receipt.jobId !== String(jobId) || receipt.userId !== String(userId)) throw new Error('Wrong owner');
    return receipt.photo;
  } catch { throw fail('Photo upload is missing or expired. Remove the photo and upload it again.'); }
};
module.exports = { validateImage, uploadPhoto, verifyPhoto };
