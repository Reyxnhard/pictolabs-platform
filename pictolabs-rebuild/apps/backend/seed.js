const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const company = await prisma.company.create({
    data: { name: 'Pictolabs HQ' }
  });

  const branch = await prisma.branch.create({
    data: { name: 'Grand Indonesia Kiosk', location: 'Jakarta', companyId: company.id }
  });

  const booth = await prisma.booth.create({
    data: {
      name: 'PICTOLABS-DEV-01',
      deviceSecret: 'dev-secret-booth-01',
      branchId: branch.id,
      status: 'OFFLINE'
    }
  });

  await prisma.boothConfig.create({
    data: {
      boothId: booth.id,
      cameraSettings: "{}",
      printerSettings: "{}",
      generalSettings: "{}"
    }
  });

  console.log('Database seeded successfully: Booth ID', booth.id);
}

main().catch(console.error).finally(() => prisma.$disconnect());
