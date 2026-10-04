const { checkPrinterHardware, getCachedPrinterHardwareStatus } = require('../apps/kiosk/dist/main/services/PrinterMonitorService.js');
const { queryPrinterHealth, getDefaultPrinterName, setIsBypassMode } = require('../apps/kiosk/dist/main/services/PrintService.js');

async function testCurrent() {
  setIsBypassMode(false);
  console.log('1. Default printer name:', getDefaultPrinterName());
  
  console.log('\n2. Calling checkPrinterHardware()...');
  const hw = await checkPrinterHardware();
  console.log('checkPrinterHardware result:', JSON.stringify(hw, null, 2));

  console.log('\n3. Calling queryPrinterHealth()...');
  const health = await queryPrinterHealth(undefined, true);
  console.log('queryPrinterHealth result:', JSON.stringify(health, null, 2));
}

testCurrent();
