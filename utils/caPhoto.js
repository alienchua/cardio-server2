const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { validateImage } = require('./qgPhoto');
const { uploadBufferToS3, getSignedReadUrl } = require('./s3Upload');

const invalid = () => Object.assign(new Error('Photo upload is missing or expired. Remove it and upload again.'), { status: 400 });
const validDraft = (draftKey) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(draftKey));

const uploadCaPhoto = async ({ buffer, contentType, draftKey, userId }) => {
  if (!validDraft(draftKey)) throw Object.assign(new Error('Invalid CA draft'), { status: 400 });
  validateImage(buffer, contentType);
  const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[contentType];
  const key = `ca/line-check/${draftKey}/${crypto.randomUUID()}.${extension}`;
  const uploaded = await uploadBufferToS3({ key, buffer, contentType });
  const photo = { storage_key: key, url: uploaded.url, file_name: key.split('/').pop(), content_type: contentType, file_size: buffer.length };
  return { ...photo, url: getSignedReadUrl(key), upload_token: jwt.sign({ photo, draftKey: String(draftKey), userId: String(userId) }, process.env.JWT_SECRET, { algorithm: 'HS256', audience: 'ca-photo', expiresIn: '7d' }) };
};

const verifyCaPhoto = (token, draftKey, userId) => {
  try {
    const receipt = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'], audience: 'ca-photo' });
    if (!validDraft(draftKey) || receipt.draftKey !== String(draftKey) || receipt.userId !== String(userId)) throw invalid();
    return receipt.photo;
  } catch { throw invalid(); }
};

module.exports = { uploadCaPhoto, verifyCaPhoto };
