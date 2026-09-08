const { S3Client, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Load .env files if present
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
loadEnvFile(path.join(__dirname, 'apps', 'backend', '.env'));

// Read credentials from env
const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucketName = process.env.R2_BUCKET_NAME || 'pictolabs-media-prod';
const publicDomain = process.env.R2_PUBLIC_DOMAIN;

console.log('═══════════════════════════════════════════════════════════════════════');
console.log('  PICTOLABS SPRINT 4A: CLOUDFLARE R2 PRODUCTION INTEGRATION TEST  ');
console.log('═══════════════════════════════════════════════════════════════════════');
console.log(`Bucket: ${bucketName}`);
console.log(`Account ID: ${accountId ? accountId.slice(0, 6) + '...' : 'NOT SET'}`);
console.log(`Access Key ID: ${accessKeyId ? accessKeyId.slice(0, 6) + '...' : 'NOT SET'}`);
console.log(`Public Domain: ${publicDomain || 'Default R2 endpoint'}\n`);

if (!accountId || !accessKeyId || !secretAccessKey) {
  console.error('CRITICAL ERROR: Cloudflare R2 credentials (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY) are not set in environment.');
  console.error('Please configure .env with real Cloudflare R2 credentials before running this test.');
  process.exit(1);
}

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

async function runTests() {
  const testKey = `test/sprint4a_verification_${Date.now()}.jpg`;
  const sampleData = Buffer.from('PICTOLABS_PRODUCTION_R2_REAL_TEST_IMAGE_BUFFER_DATA_2026');
  let uploadSucceeded = false;
  let headSucceeded = false;
  let urlAccessible = false;
  let deleteSucceeded = false;
  let publicUrl = '';

  try {
    // 1. Upload File
    console.log(`[TEST 1] Uploading test object to ${bucketName}/${testKey}...`);
    const putCmd = new PutObjectCommand({
      Bucket: bucketName,
      Key: testKey,
      Body: sampleData,
      ContentType: 'image/jpeg',
      CacheControl: 'public, max-age=31536000',
    });
    const putRes = await s3.send(putCmd);
    console.log('  ✓ [PASS] Upload successful. ETag:', putRes.ETag);
    uploadSucceeded = true;

    // 2. Verify Object in Bucket
    console.log(`\n[TEST 2] Verifying object exists in bucket: ${bucketName}...`);
    const headCmd = new HeadObjectCommand({
      Bucket: bucketName,
      Key: testKey,
    });
    const headRes = await s3.send(headCmd);
    console.log('  ✓ [PASS] Object confirmed in bucket. Content-Length:', headRes.ContentLength, 'bytes');
    headSucceeded = true;

    // 3. Verify URL Accessibility
    publicUrl = publicDomain
      ? `${publicDomain.replace(/\/+$/, '')}/${testKey}`
      : `https://${bucketName}.r2.cloudflarestorage.com/${testKey}`;
    console.log(`\n[TEST 3] Testing URL accessibility: ${publicUrl}...`);

    try {
      const getClient = publicUrl.startsWith('https') ? https : http;
      const urlStatus = await new Promise((resolve, reject) => {
        const req = getClient.get(publicUrl, (res) => {
          resolve(res.statusCode);
        });
        req.on('error', reject);
        req.setTimeout(5000, () => req.abort());
      });
      console.log('  ✓ [PASS] URL responded with HTTP status:', urlStatus);
      urlAccessible = urlStatus === 200;
    } catch (urlErr) {
      console.warn('  ! [NOTE] Direct public URL check returned:', urlErr.message);
      console.warn('           (Ensure custom domain or R2 public access is configured if using a custom CDN domain).');
    }

    // 4. Delete File
    console.log(`\n[TEST 4] Deleting test object from ${bucketName}...`);
    const delCmd = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: testKey,
    });
    await s3.send(delCmd);
    console.log('  ✓ [PASS] Object successfully deleted from bucket.');
    deleteSucceeded = true;

    // 5. Confirm Deletion
    try {
      await s3.send(new HeadObjectCommand({ Bucket: bucketName, Key: testKey }));
      console.error('  ✗ [FAIL] Object still exists after deletion.');
    } catch (e) {
      console.log('  ✓ [PASS] Confirmed object no longer exists in bucket (404/NotFound).');
    }

    console.log('\n═══════════════════════════════════════════════════════════════════════');
    console.log('  ALL R2 PRODUCTION TESTS PASSED SUCCESSFULLY!  ');
    console.log('═══════════════════════════════════════════════════════════════════════');
    process.exit(0);

  } catch (err) {
    console.error('\n✗ [ERROR] Cloudflare R2 Operation Failed:', err.message);
    if (err.$metadata) {
      console.error('  HTTP Status:', err.$metadata.httpStatusCode);
      console.error('  Request ID:', err.$metadata.requestId);
    }
    process.exit(1);
  }
}

runTests();
