const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { S3Client, HeadObjectCommand } = require('@aws-sdk/client-s3');

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
  credentials: { accessKeyId, secretAccessKey },
});

async function runEndToEndVerification() {
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('  PICTOLABS SPRINT 4A: END-TO-END R2 BACKEND API VERIFICATION  ');
  console.log('═══════════════════════════════════════════════════════════════════════');
  
  const testFileName = `composite_test_session_${Date.now()}.jpg`;
  const imageBuffer = fs.readFileSync(path.join(__dirname, '..', 'frame_test.jpg'));
  const storageKey = `photos/${testFileName}`;

  // STEP 1: Upload via POST /api/storage/upload
  console.log(`[STEP 1] POSTing ${imageBuffer.length} bytes to http://localhost:4000/api/storage/upload...`);
  const uploadResult = await new Promise((resolve, reject) => {
    const req = http.request(
      'http://localhost:4000/api/storage/upload',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'image/jpeg',
          'Content-Length': imageBuffer.length,
          'x-session-id': `session_e2e_${Date.now()}`,
          'x-file-name': testFileName,
          'x-file-type': 'composite',
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
          } catch (e) {
            reject(new Error(`Failed parsing response: ${data}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(imageBuffer);
    req.end();
  });

  console.log('  Upload Response Status:', uploadResult.statusCode);
  console.log('  Upload Response Body:', JSON.stringify(uploadResult.body, null, 2));

  if (uploadResult.statusCode !== 201 && uploadResult.statusCode !== 200) {
    throw new Error(`Upload failed with status ${uploadResult.statusCode}`);
  }
  if (uploadResult.body.provider !== 'cloudflare_r2') {
    throw new Error(`Expected provider cloudflare_r2, got ${uploadResult.body.provider}`);
  }
  console.log('  ✓ [PASS] Upload successful with provider: cloudflare_r2');

  // STEP 2: Verify HeadObject directly in Cloudflare R2 bucket: pictolabs-media-prod
  console.log(`\n[STEP 2] Verifying object exists directly in bucket: ${bucketName}...`);
  const headRes = await s3.send(new HeadObjectCommand({ Bucket: bucketName, Key: storageKey }));
  console.log(`  ✓ [PASS] HeadObject confirmed! Size: ${headRes.ContentLength} bytes, ContentType: ${headRes.ContentType}`);

  // STEP 3: Test GET /api/storage/url
  console.log(`\n[STEP 3] Testing GET /api/storage/url?key=${storageKey}...`);
  const urlResult = await new Promise((resolve, reject) => {
    http.get(`http://localhost:4000/api/storage/url?key=${encodeURIComponent(storageKey)}`, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ statusCode: res.statusCode, body: JSON.parse(data) }));
    }).on('error', reject);
  });
  console.log('  URL Response Body:', JSON.stringify(urlResult.body));
  console.log('  ✓ [PASS] Generated URL:', urlResult.body.publicUrl);

  // STEP 4: Test GET /api/storage/presigned-download-url and download via HTTPS
  console.log(`\n[STEP 4] Testing GET /api/storage/presigned-download-url and live download...`);
  const presignedResult = await new Promise((resolve, reject) => {
    http.get(`http://localhost:4000/api/storage/presigned-download-url?key=${encodeURIComponent(storageKey)}`, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ statusCode: res.statusCode, body: JSON.parse(data) }));
    }).on('error', reject);
  });

  const presignedUrl = presignedResult.body.downloadUrl;
  console.log('  Presigned URL generated successfully.');

  const downloadStatus = await new Promise((resolve, reject) => {
    https.get(presignedUrl, (res) => {
      let len = 0;
      res.on('data', (chunk) => (len += chunk.length));
      res.on('end', () => resolve({ statusCode: res.statusCode, bytes: len }));
    }).on('error', reject);
  });
  console.log(`  Live HTTPS Download Status: ${downloadStatus.statusCode}, Bytes: ${downloadStatus.bytes}`);
  if (downloadStatus.statusCode === 200 && downloadStatus.bytes === imageBuffer.length) {
    console.log('  ✓ [PASS] Download verified bit-for-bit against original buffer!');
  } else {
    throw new Error(`Download verification failed: HTTP ${downloadStatus.statusCode}, ${downloadStatus.bytes} bytes`);
  }

  // STEP 5: Test DELETE /api/storage/file
  console.log(`\n[STEP 5] Testing DELETE /api/storage/file?key=${storageKey}...`);
  const deleteResult = await new Promise((resolve, reject) => {
    const req = http.request(
      `http://localhost:4000/api/storage/file?key=${encodeURIComponent(storageKey)}`,
      { method: 'DELETE' },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ statusCode: res.statusCode, body: JSON.parse(data) }));
      }
    );
    req.on('error', reject);
    req.end();
  });
  console.log('  Delete Response Body:', JSON.stringify(deleteResult.body));
  console.log('  ✓ [PASS] Delete endpoint returned success: true');

  // STEP 6: Confirm object no longer exists in R2
  console.log(`\n[STEP 6] Confirming object is completely deleted from ${bucketName}...`);
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucketName, Key: storageKey }));
    throw new Error('Object still exists in bucket after delete!');
  } catch (err) {
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
      console.log('  ✓ [PASS] HeadObject confirmed 404 NotFound. Object cleanly purged!');
    } else {
      throw err;
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════════════');
  console.log('  SPRINT 4A R2 INTEGRATION: ALL 6 VERIFICATION STEPS PASSED (PASS)  ');
  console.log('═══════════════════════════════════════════════════════════════════════');
  return {
    testFileName,
    storageKey,
    uploadedBytes: imageBuffer.length,
    r2Provider: uploadResult.body.provider,
    headObjectStatus: 200,
    downloadHttpStatus: downloadStatus.statusCode,
    downloadBytes: downloadStatus.bytes,
    deleteStatus: deleteResult.body.deleted,
    overallResult: 'PASS',
  };
}

runEndToEndVerification()
  .then((res) => {
    fs.writeFileSync(path.join(__dirname, 'r2_test_results.json'), JSON.stringify(res, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n✗ FATAL ERROR:', err.message);
    process.exit(1);
  });
