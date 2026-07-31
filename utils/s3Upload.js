const crypto = require('crypto');
const https = require('https');

const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const hmac = (key, value, encoding) => crypto.createHmac('sha256', key).update(value).digest(encoding);

const encodeKey = (key) => key.split('/').map(encodeURIComponent).join('/');

const getSignatureKey = (secretKey, dateStamp, region, service) => {
  const kDate = hmac(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
};

const uploadBufferToS3 = ({ key, buffer, contentType }) => {
  const region = process.env.AWS_REGION;
  const bucket = process.env.AWS_S3_BUCKET;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!region || !bucket || !accessKeyId || !secretAccessKey) {
    const error = new Error('AWS S3 env is incomplete');
    error.status = 500;
    throw error;
  }

  const service = 's3';
  const host = `${bucket}.s3.${region}.amazonaws.com`;
  const encodedKey = encodeKey(key);
  const path = `/${encodedKey}`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = hash(buffer);
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';

  const canonicalHeaders = [
    `content-type:${contentType}`,
    `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`
  ].join('\n') + '\n';

  const canonicalRequest = [
    'PUT',
    path,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    hash(canonicalRequest)
  ].join('\n');

  const signingKey = getSignatureKey(secretAccessKey, dateStamp, region, service);
  const signature = hmac(signingKey, stringToSign, 'hex');
  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return new Promise((resolve, reject) => {
    const req = https.request({
      method: 'PUT',
      host,
      path,
      headers: {
        Authorization: authorization,
        'Content-Type': contentType,
        'Content-Length': buffer.length,
        'X-Amz-Content-Sha256': payloadHash,
        'X-Amz-Date': amzDate
      }
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({
            key,
            url: `https://${host}/${encodedKey}`
          });
          return;
        }
        const error = new Error(`S3 upload failed (${res.statusCode}): ${body || res.statusMessage}`);
        error.status = 502;
        reject(error);
      });
    });

    req.on('error', reject);
    req.write(buffer);
    req.end();
  });
};

module.exports = {
  uploadBufferToS3
};
