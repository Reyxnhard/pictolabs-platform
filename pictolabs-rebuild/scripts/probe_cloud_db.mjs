async function main() {
  const loginRes = await fetch('https://api.pictolabs.id/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@pictolabs.id', password: 'pictolabs2026' }),
  });
  const { accessToken } = await loginRes.json();

  const boothsRes = await fetch('https://api.pictolabs.id/api/booths', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const booths = await boothsRes.json();
  console.log('All Booths in Cloud DB:', booths.length);
  for (const b of booths) {
    console.log(`\nBooth: "${b.name}" (${b.id})`);
    console.log('  hasAdminPin:', b.hasAdminPin);
    console.log('  status:', b.status);
    console.log('  deviceSecret:', b.device?.deviceSecret ? b.device.deviceSecret.substring(0, 16) + '...' : 'NONE');
    console.log('  hostname:', b.device?.hostname);

    // Let's test the verify-pin endpoint for various PINs against this booth
    for (const testPin of ['112233', '885926', '1234', '123456', '081299']) {
      const vRes = await fetch(`https://api.pictolabs.id/api/booths/${b.id}/verify-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: testPin }),
      });
      const vData = await vRes.json();
      console.log(`  PIN '${testPin}' -> HTTP ${vRes.status} verified: ${vData.verified}`);
    }
  }
}

main().catch(console.error);
