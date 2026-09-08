const { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Load .env
function loadEnvFile(filePath) {
  if (fs.existsSync(filePath)) {
    const lines = fs.readFileSync(filePath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
        if (!process.env[key] && val) {
          process.env[key] = val;
        }
      }
    }
  }
}
loadEnvFile(path.join(__dirname, '.env'));

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucketName = process.env.R2_BUCKET_NAME || 'pictolabs-media-prod';

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

async function testAccessibility() {
  const testKey = `test/real_upload_${Date.now()}.jpg`;
  const realFileBuffer = fs.readFileSync(path.join(__dirname, '..', 'frame_test.jpg'));

  console.log(`[1] Uploading real JPEG image (${realFileBuffer.length} bytes) to ${bucketName}/${testKey}...`);
  const putRes = await s3.send(new PutObjectCommand({
    Bucket: bucketName,
    Key: testKey,
    Body: realFileBuffer,
    ContentType: 'image/jpeg',
  }));
  console.log('  -> Uploaded! ETag:', putRes.ETag);

  console.log(`[2] Verifying HeadObject for ${testKey}...`);
  const headRes = await s3.send(new HeadObjectCommand({
    Bucket: bucketName,
    Key: testKey,
  }));
  console.log('  -> Confirmed in bucket! ContentLength:', headRes.ContentLength, 'bytes, ContentType:', headRes.ContentType);

  console.log(`[3] Generating Presigned GET URL...`);
  const getCmd = new GetObjectCommand({ Bucket: bucketName, Key: testKey });
  const presignedGetUrl = await getSignedUrl(s3, getCmd, { expiresIn: 300 });
  console.log('  -> Presigned GET URL generated:\n    ', presignedGetUrl);

  console.log(`[4] Fetching object via Presigned GET URL over HTTPS...`);
  const httpStatus = await new Promise((resolve, reject) => {
    https.get(presignedGetUrl, (res) => {
      let dataLen = 0;
      res.on('data', (chunk) => dataLen += chunk.length);
      res.on('end', () => resolve({ statusCode: res.statusCode, dataLen, headers: res.headers }));
    }).on('error', reject);
  });
  console.log('  -> HTTP Status:', httpStatus.statusCode, '| Received Bytes:', httpStatus.dataLen, '| Content-Type:', httpStatus.headers['content-type']);

  console.log(`[5] Cleaning up test file from R2...`);
  await s3.send(new DeleteObjectCommand({ Bucket: bucketName, Key: testKey }));
  console.log('  -> Deleted test object successfully.');

  return {
    uploadResult: putRes.ETag,
    contentLength: headRes.ContentLength,
    httpStatus: httpStatus.statusCode,
    downloadedBytes: httpStatus.dataLen,
  };
}

testAccessibility()
  .then((res) => {
    console.log('\nSUCCESS:', JSON.stringify(res, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    console.error('FAILED:', err);
    process.exit(1);
  });
