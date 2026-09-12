# OPERATOR RUNBOOK: PICTOLABS BOOTH #1
## Field Operations & Emergency Handbook for Retail Deployment

> **Target Unit:** Commercial Photobooth #1 (Mall / Cinema Enclosure)  
> **Audience:** Non-technical field operators, mall staff, and duty technicians  
> **Classification:** Operational Standard Operating Procedure (SOP)  
> **Emergency Hotline:** Call Lead Technician / Founder immediately for Severity 1 faults  

---

# 1. Daily Opening Procedure

Perform this procedure every morning 30 minutes before mall doors open to the public (typically 09:30 WIB for a 10:00 WIB mall opening).

## Power on checklist
- [ ] Open the rear cabinet lock with physical Key #1.
- [ ] Check the main wall socket: ensure the 220V plug is firmly seated and the wall outlet switch is ON.
- [ ] Check the UPS (black box at cabinet base):
  - [ ] Press and hold the power button for 2 seconds until you hear a single beep.
  - [ ] Confirm the green "Online" LED stays solid (not flashing, no continuous alarm).
- [ ] Check the internal power strip: confirm all 4 connected plugs are tight:
  - Mini-PC power brick
  - DNP printer power cord
  - Canon camera AC coupler adapter
  - LED light controller
- [ ] The Mini-PC will turn on automatically when AC power engages (BIOS Auto-Power On).
- [ ] Watch the front touchscreen: within 45 seconds, the Windows boot logo appears, followed by the Pictolabs Welcome Screen showing **"TOUCH SCREEN TO START"**.

## Camera checklist
- [ ] Look through the internal camera shelf:
  - [ ] Confirm the Canon DSLR power switch is flipped to **ON**.
  - [ ] Confirm the mode dial on top of the camera is set to **M** (Manual).
  - [ ] Confirm the lens focus switch is set to **MF** (Manual Focus).
  - [ ] Check that the lens focus ring still has its black security tape in place (prevents vibration drift).
  - [ ] Confirm the dummy battery coupler door is snapped shut completely (if open, camera turns off).
  - [ ] Confirm the thick black USB cable with cylinder beads (ferrite core) is firmly plugged into the camera side port and the internal PC.
- [ ] Test the live viewfinder on screen:
  - [ ] Tap the discreet **Staff** button at the top-right of the Welcome Screen.
  - [ ] Enter the 6-digit technician PIN: `885926`.
  - [ ] Tap **Uji Preview LiveView**.
  - [ ] Confirm the camera stream shows a crisp, centered image of the booth interior.
  - [ ] Tap **Matikan Preview LiveView** when done.

## Printer checklist
- [ ] Check the DNP printer status LED on the printer front panel:
  - **Solid Green:** Ready to print.
  - **Flashing Green:** Warming up (wait 30 seconds).
  - **Red / Flashing Red:** Paper out, ribbon out, or door open.
- [ ] Check remaining paper count:
  - [ ] Look through the paper window or read the count on the Operator Control Panel screen.
  - [ ] If remaining count is under 50 sheets, load a new paper roll before opening (see Section 3).
- [ ] Empty the paper scrap bin:
  - [ ] Pull out the blue or black plastic scrap box at the bottom front of the printer.
  - [ ] Dump all paper ribbon strips into the trash bin.
  - [ ] Slide the scrap box firmly back in until it clicks.
- [ ] Run a cut test:
  - [ ] In the Operator Control Panel, tap **Uji Potong (Cut Test)**.
  - [ ] Confirm the printer feeds and cleanly cuts a single blank test slip.

## Internet checklist
- [ ] Look at the 4G/5G cellular router on the internal shelf:
  - [ ] Power LED: Solid green.
  - [ ] Internet / WAN LED: Solid blue or green (indicates active cellular connection).
  - [ ] Signal bar LEDs: At least 2 bars lit.
- [ ] If the router displays a red LED:
  - [ ] Unplug the router power cable.
  - [ ] Wait 10 seconds.
  - [ ] Plug it back in and wait 60 seconds for reconnection.

## Dashboard health check
- [ ] In the kiosk Operator Control Panel, verify the hardware summary:
  - Thermal Printer: `✓ SIAP`
  - Sensor Kamera: `✓ CANON DSLR`
  - Mode Bypass Printer: `NONAKTIF` (Hardware gate active)
- [ ] Tap **Kembali ke Booth** to lock the panel and return to the customer Welcome Screen.
- [ ] Open the admin dashboard on your technician phone (`https://admin.pictolabs.id`):
  - [ ] Confirm Booth #1 badge is **ONLINE** (green).
  - [ ] Confirm heartbeat age shows less than 60 seconds ago.
  - [ ] Confirm all 5 pillars show green (Camera, Printer, Storage, Heartbeat, Payment).
- [ ] Clean the front touchscreen glass with a microfiber cloth and glass spray.
- [ ] Lock the rear door securely and keep the key in the operator pouch.

---

# 2. Daily Closing Procedure

Perform this procedure every night within 15 minutes after mall closing announcements (typically 22:00 WIB).

## Shutdown procedure
- [ ] Walk up to the booth. Tap the **Staff** button at the top-right corner.
- [ ] Enter the 6-digit PIN: `885926`.
- [ ] Scroll down to the bottom right of the Operator Control Panel.
- [ ] Tap **Keluar ke Windows**.
- [ ] On the pop-up confirmation, tap **Keluar ke Windows**.
- [ ] On the Windows desktop, tap the Windows Start icon at bottom-left, tap the Power icon, and select **Shut down**.
- [ ] Wait 30 seconds until the touchscreen turns completely black and the Mini-PC blue power LED turns off.
- [ ] Open the rear cabinet door with Key #1.
- [ ] Turn off the UPS by pressing and holding the power button for 3 seconds until you hear a long beep and its LEDs go dark.
- [ ] Leave the main wall outlet plug connected so the UPS charges overnight if the mall maintains night power. If mall management requires master breaker shutdown, unplug the main wall cord.

## Printer inspection
- [ ] Check the printer paper level: note the approximate remaining roll diameter or check the last recorded sheet count.
- [ ] Pull out and empty the front paper scrap box. Never leave scrap cuttings inside overnight (prevents paper dust accumulation on printer rollers).
- [ ] Ensure the printer print exit slot is clear of loose photo sheets.

## Storage verification
- [ ] On your phone dashboard, check the total completed sessions for the day.
- [ ] Confirm the unsynced session count is `0`.
- [ ] Confirm all customer transactions show settled or closed.

## Incident logging
- [ ] Open the physical booth logbook notebook kept inside the rear door pocket.
- [ ] Write the date, opening paper count, closing paper count, and total prints made.
- [ ] Record any customer complaints, paper jams, payment disputes, or hardware faults encountered during the day.
- [ ] Sign your name and closing time.
- [ ] Lock the rear cabinet door firmly. Check that the door does not rattle.

---

# 3. Incident Response

Follow these resolution steps in order. Do not skip steps.

## Camera Offline

### Symptoms
- Kiosk Welcome Screen displays yellow warning banner: `KAMERA CADANGAN AKTIF` or `KAMERA TERPUTUS`.
- LiveView preview is black or shows low-quality webcam video instead of DSLR.
- Taking photos fails or freezes on countdown "1".

### Root Causes
1. Camera USB cable loose or knocked out of port.
2. ACK-E10 AC power coupler unseated or coupler door slightly ajar.
3. Camera power switch accidentally turned OFF.
4. Camera mode dial shifted away from "M".

### Resolution Steps
1. Open the rear cabinet door.
2. Look at the back of the Canon DSLR:
   - Check the top switch: turn it to **ON**.
   - Check the mode dial: turn it to **M**.
   - Check the small display on the back of the camera. If it is completely blank, the camera has no power.
3. Check the camera bottom: open and firmly snap the battery door shut. The camera will not turn on if the battery door latch is not fully closed.
4. Unplug the camera USB cable from the side of the camera, wait 5 seconds, and firmly plug it back in.
5. In the kiosk screen, tap **Staff** -> enter PIN `885926` -> tap **Perbarui Status**.
6. Check if Sensor Kamera changes to `✓ CANON DSLR`.
7. Tap **Uji Preview LiveView** to confirm the live view works.
8. If still offline, restart the kiosk application using **Restart Kiosk** button.

---

## Printer Error

### Symptoms
- Red blinking light on front of DNP printer.
- Customer Welcome Screen shows red warning banner: `PEMELIHARAAN PRINTER`.
- Screen says printer paper jam or cover open.

### Root Causes
1. Paper strip scrap bin full, backing up into print slot.
2. Paper jam inside rollers.
3. Ribbon cartridge loose or snapped.
4. Front printer access door not latched shut.

### Resolution Steps
1. Open the rear booth door.
2. Pull out the black scrap box at front base of printer. Empty all paper cuttings.
3. Press the front release lever on the DNP printer and pull the printer mechanism forward.
4. Check the paper path:
   - If paper is stuck between rollers, gently cut the jammed paper with clean scissors across the feed path.
   - Do not pull jammed paper with brute force, or you will damage the thermal print head.
   - Turn the paper feed spool manually to release tension.
5. Inspect the ink ribbon (the plastic roll with cyan/magenta/yellow film):
   - If ribbon is loose, wind the white gear clockwise until the ribbon film is tight and flat.
   - If ribbon is torn, use clear tape to splice the two torn ends squarely together, then wind the gear 3 full turns until smooth film appears.
6. Push the printer mechanism firmly back into its chassis until both left and right latches click solidly.
7. The printer will initialize, advance 4 blank calibration sheets, and cut them into the scrap box.
8. When the front LED turns solid green, tap **Staff** -> PIN `885926` -> **Uji Potong (Cut Test)**.
9. If test cut passes, tap **Kembali ke Booth**.

---

## Printer Out of Paper

### Resolution Steps
1. When paper runs out, the printer front LED turns solid red and the kiosk blocks new sessions.
2. Open rear door. Press the printer release lever and slide printer drawer forward.
3. Lift the blue lever to open the ribbon compartment. Lift out the empty ribbon spools and discard them.
4. Remove the empty paper core:
   - Lift the white paper holders on left and right.
   - Remove the empty cardboard tube.
5. Unpack a fresh DNP 4x6 media box (contains 1 paper roll + 1 ribbon).
6. Install the new paper roll:
   - Insert the blue paper spool adapter into the paper roll's blue side, and the white adapter into the white side.
   - Set the roll into the printer cradles.
   - Remove the protective seal sticker from the paper roll.
   - Feed the paper edge under the guide roller until the printer beeps.
7. Install the new ribbon:
   - Place the yellow supply spool in the rear brackets.
   - Place the white take-up spool in the front brackets.
   - Wind the white gear clockwise until the ribbon film is tight with no wrinkles.
8. Close the printer drawer firmly until it locks with a click.
9. The printer will feed and cut 4 blank calibration sheets automatically.
10. Verify front LED turns solid green.
11. On kiosk screen, tap **Staff** -> enter PIN `885926` -> verify status is `✓ SIAP`.
12. Tap **Kembali ke Booth**.

---

## Payment Failure

### Resolution Steps
1. If a customer scans QRIS, money is deducted from their bank account, but kiosk stays on the QRIS screen:
2. **Do not restart the booth immediately** (restarting cancels the active order).
3. Ask customer to show the transaction receipt on their banking app (BCA/GoPay/ShopeePay/Mandiri):
   - Verify the transaction status says **"Berhasil" / "Success"**.
   - Note the exact amount paid (e.g., IDR 35,000) and the transaction time.
4. Open the Operator Control Panel:
   - Tap **Staff** button (top-right) -> enter PIN `885926`.
5. Look at the **Payment Bypass** section:
   - The active transaction ID will be listed automatically.
   - Tap **⚡ Bypass Pembayaran (Lunas)**.
6. The kiosk will immediately confirm the payment as successful and advance the customer to the photo session.
7. Write the customer's name, bank reference number, and order ID in the paper incident logbook.

---

## Internet Offline

### Symptoms
- Dashboard shows booth as `OFFLINE` or `DEGRADED`.
- Softfile download QR code does not load or takes a long time.
- QRIS payment generation says "Koneksi bermasalah".

### Resolution Steps
1. Customers can still take photos and print physical photo sheets even if internet drops (the kiosk stores photos locally).
2. Check the 4G/5G cellular router inside the cabinet:
   - If lights are off: check router power cable.
   - If WAN light is red/blinking: pull the router power plug, wait 10 seconds, plug back in.
3. If cellular router has no signal (e.g. basement mall area):
   - Switch to emergency smartphone hotspot:
     - Turn on Personal Hotspot on technician phone (SSID: `Pictolabs-Backup`, Pass: `picto2026`).
     - Access Operator Control Panel -> **Keluar ke Windows**.
     - Click Wi-Fi icon at bottom right of taskbar, connect to `Pictolabs-Backup`.
     - Double-click the Pictolabs desktop icon to reopen the kiosk app.
4. Once internet reconnects, all photos queued during the outage will upload to cloud automatically in the background.

---

## Email Delivery Failure

### Resolution Steps
1. If customer states their softfile email did not arrive after 2 minutes:
2. Ask customer to check their **Spam**, **Junk**, or **Promotions** folder in their email app.
3. Check for common typos (e.g. `.con` instead of `.com`, `gamil.com` instead of `gmail.com`).
4. To resend from the booth:
   - If customer is still at the booth finish screen, tap the email input box, re-enter the corrected email, and tap **Kirim Ulang**.
5. To resend from remote dashboard:
   - Open `https://admin.pictolabs.id` on your phone.
   - Tap **Support** -> search by customer phone number, transaction ID, or approximate time.
   - Open session -> tap **Kirim Ulang Email** -> enter verified email -> tap **Kirim**.

---

## QR Gallery Failure

### Resolution Steps
1. If customer scans the QR code with their phone camera and gets an error page or infinite loading:
2. Check if customer's phone has active mobile data enabled.
3. Have customer connect to mall public Wi-Fi and rescan.
4. If the link still fails:
   - Take a clear photo of the customer's printed physical photostrip showing the unique session ID printed at the bottom edge (e.g. `SES-10928`).
   - Open `https://admin.pictolabs.id` on technician phone.
   - Look up the session ID under **Support**.
   - Tap **Salin Tautan Download** and send the direct link to the customer via WhatsApp.

---

## Booth Offline

### Symptoms
- Dashboard indicates booth has not reported heartbeat for >5 minutes.
- Mall management calls reporting booth is dark or frozen.

### Resolution Steps
1. Arrive at booth within 30 minutes.
2. Check booth power cord and mall outlet.
3. Check UPS power status.
4. If screen is black, tap the screen firmly. If no response, open rear cabinet and check Mini-PC power light.
5. If Mini-PC is off, press its power button once.
6. If Mini-PC is on but screen is black, check the HDMI cable between PC and monitor.
7. Follow the Emergency Recovery procedures in Section 4 below.

---

# 4. Emergency Recovery

## Application Crash
If the Pictolabs application freezes, turns solid white, or closes unexpectedly:
1. The automated Watchdog daemon will restart the application automatically within 3 seconds.
2. If the screen remains stuck on desktop after 10 seconds:
   - Double-tap the **Pictolabs Kiosk** shortcut on the Windows desktop.
   - The application will launch in fullscreen kiosk mode.
3. If an error dialog appears on screen, tap **OK** to dismiss it, then launch the app shortcut.

## Windows Restart
If the entire operating system is sluggish or peripherals become unresponsive:
1. Tap the **Staff** button (top-right) -> enter PIN `885926`.
2. Tap **Restart Kiosk** -> confirm on pop-up.
3. If touch is unresponsive:
   - Open rear cabinet door.
   - Plug the spare USB keyboard (kept in cabinet pouch) into any open USB port.
   - Press `Ctrl + Alt + Delete` -> click the Power icon at bottom right -> click **Restart**.
   - Unplug the keyboard once restart starts.
4. Booth will reboot and load the Welcome Screen automatically.

## Power Outage
If the mall suffers a sudden electrical blackout:
1. The internal UPS battery will immediately beep, providing battery power for 10–15 minutes.
2. If customers are currently inside the booth:
   - Allow them to finish their current session and collect their print (the UPS will power the printer).
   - Inform waiting customers that the booth is temporarily pausing due to mall power outage.
3. If mall power does not restore within 5 minutes:
   - Safely shut down the booth: tap **Staff** -> PIN `885926` -> **Keluar ke Windows** -> Windows Start -> **Shut down**.
   - Turn off the UPS power switch.
4. When mall power returns:
   - Turn the UPS switch back ON.
   - The Mini-PC and peripherals will boot up automatically within 45 seconds.

## UPS Failure
If the UPS beeps continuously with a solid red fault light or will not pass power:
1. Turn off the UPS.
2. Unplug the internal main power strip cable from the UPS "Battery Backup" outlet.
3. Plug the internal main power strip directly into the wall outlet surge protector (bypassing the faulty UPS).
4. Booth will power on immediately on direct AC power.
5. Request a replacement UPS from management immediately (run on direct AC only as temporary measure).

---

# 5. Escalation Matrix

When an issue cannot be resolved using Section 3 within 15 minutes, escalate according to this matrix.

| Level | Severity Definition | Examples | Max Resolution Time | Primary Contact |
| :---: | :--- | :--- | :---: | :--- |
| **Severity 1** | **Booth Down (No Revenue)** | Total power dead, printer hardware broken, camera lens failure, repeated crash loop | **30 Minutes** | Lead Technician & Operations Founder |
| **Severity 2** | **Degraded Operation** | Camera on webcam backup, printer low on paper, cellular slow, single payment dispute | **2 Hours** | Duty Field Technician |
| **Severity 3** | **Minor / Cosmetic** | Customer typo on email, light smudge on touchscreen glass, minor translation issue | **Same Day (Closing)** | Floor Operator / Store Staff |

## Contact Procedure
1. For **Severity 1**:
   - Place the physical **"Dalam Pemeliharaan Singkat"** acrylic sign over the booth touchscreen.
   - Immediately call Lead Technician via phone call (do not rely on text messages).
   - State clearly: Booth Name, Mall Branch, Error Code on screen, and steps already tried.
2. Send a photo of the screen and the rear cabinet status LEDs to the internal WhatsApp Operations Group.

---

# 6. Preventive Maintenance

Follow this schedule strictly to prevent hardware failures before they occur.

## Daily
- [ ] Clean front touchscreen with microfiber cloth and antistatic screen spray (morning & afternoon).
- [ ] Empty the printer paper scrap box every morning and evening.
- [ ] Inspect camera lens through front glass for dust or fingerprints. Wipe outer glass with optical cloth.
- [ ] Verify remaining printer paper roll count.
- [ ] Sweep and wipe floor area around the booth entrance.

## Weekly (Every Monday Morning)
- [ ] Inspect internal enclosure for dust buildup. Use hand vacuum or canned air on Mini-PC cooling vents and printer intake filters.
- [ ] Clean printer feed rollers using a lint-free cloth lightly dampened with isopropyl alcohol (IPA 90%+).
- [ ] Check camera focus tape: ensure focus ring has not slipped from 24mm / MF setting.
- [ ] Check all internal cable ties: ensure USB and power cables are not pinched by door hinges.
- [ ] Test the UPS battery backup: unplug wall power plug for 30 seconds while booth is idle; confirm UPS holds load without rebooting PC.

## Monthly (First Monday of Month)
- [ ] Full reboot of cellular router and clean cache.
- [ ] Perform thermal printer deep clean using official DNP cleaning sheet kit.
- [ ] Inspect physical cabinet hinges, locks, and door seals for wear. Lubricate lock cylinders with graphite powder.
- [ ] Inspect flash strobe tube for dark burn marks. Replace strobe bulb if flash output appears uneven.
- [ ] Audit physical spare parts inventory in cabinet pouch.

---

# 7. Spare Parts Checklist

The following spare parts and maintenance supplies must be physically present inside the rear cabinet storage pouch of Booth #1 at all times.

### Required On Site
1. **Printer Paper & Ribbon:**
   - [ ] At least 1 unopened box of genuine DNP 4x6 media (contains 2 rolls = 1,400 prints total).
2. **USB Cables:**
   - [ ] 1x Spare high-grade shielded Mini-USB / Micro-USB cable with dual ferrite beads (camera connection).
   - [ ] 1x Spare USB 2.0 Type-A to Type-B printer cable (3 meters).
3. **Camera Power Backup:**
   - [ ] 1x Spare Canon ACK-E10 AC Coupler adapter set.
   - [ ] 1x Fully charged Canon LP-E10 battery + wall charger (emergency 2-hour backup if AC coupler fails).
4. **Network Backup:**
   - [ ] 1x Backup Telkomsel / Indosat 4G USB modem with active data balance.
   - [ ] 1x 5-meter Cat6 Ethernet patch cable.
5. **Power Adapter & Hardware:**
   - [ ] 1x Universal 65W/90W 19V DC laptop power brick (Mini-PC power backup).
   - [ ] 1x Compact mini USB keyboard with trackpad.
   - [ ] 1x Multi-head screwdriver (Phillips + Flathead).
   - [ ] 1x Clean optical lens cleaning cloth + microfiber screen wipes.
   - [ ] 1x Roll of black matte gaffer tape (no residue).

---

# 8. Launch Day Checklist

Complete this checklist on-site 2 hours before the public ribbon-cutting and first customer arrival.

## Physical & Mechanical
- [ ] Booth is placed on stable, level ground; all 4 leveling feet adjusted and locked; no wobble.
- [ ] At least 15cm clearance between rear exhaust vent and mall wall for air outflow.
- [ ] External cabinet clean, free of scratches, stickers straight and clean.
- [ ] Front acrylic lens and touchscreen completely free of fingerprints and glare reflections.
- [ ] Physical keys (Key #1 Cabinet, Key #2 Money box if applicable) tested and verified.

## Electrical & Safety
- [ ] Wall outlet voltage tested: stable 220V–230V.
- [ ] UPS battery fully charged (green light).
- [ ] All internal cables neatly routed and zip-tied away from moving parts and heat vents.
- [ ] Fire safety: no loose wires, cables rated for commercial continuous current.

## Hardware & Optics
- [ ] Canon DSLR set to Manual Mode (M), shutter 1/125s, aperture f/5.6, ISO 200.
- [ ] Lens switch set to Manual Focus (MF); focus ring taped securely.
- [ ] Camera AC power coupler connected securely; battery door snapped shut.
- [ ] Strobe flash fires reliably with even illumination across booth backdrop.
- [ ] Printer loaded with brand-new 700-print roll; scrap bin emptied; cut test executed successfully.
- [ ] Touchscreen responsive across all 4 corners; edge swipes produce zero Windows reaction.

## Software & Cloud
- [ ] Kiosk loads Welcome Screen automatically on boot without displaying desktop icons or taskbar.
- [ ] Discreet **Staff** button is accessible at top-right; 6-digit PIN (`885926`) opens Operator Control Panel.
- [ ] Cellular router signal strong (>3 bars 4G/5G LTE).
- [ ] Admin Dashboard displays Booth #1 as **ONLINE** with all 5 pillars green.
- [ ] Midtrans QRIS production mode verified: live test payment of IDR 35,000 processed successfully.
- [ ] WhatsApp alert gateway tested: test alert received on technician phone within 5 seconds.

## First Live Dry Run (Full Walkthrough)
- [ ] Complete 1 full customer session from start to finish:
  1. Tap screen on Welcome Screen.
  2. Select 4R layout and photo filter.
  3. Scan real QRIS via mobile banking app; verify kiosk detects payment in <2 seconds.
  4. Pose for all 4 shots; confirm flash fires and countdown works smoothly.
  5. Collect physical photo print from tray; verify razor-sharp 300 DPI quality, colors, and clean cut.
  6. Scan on-screen QR code with smartphone; verify mobile gallery loads softfiles and Live Photo video.
  7. Enter email address; verify email arrives in inbox within 15 seconds.
- [ ] Wipe touchscreen with microfiber cloth.
- [ ] Declare Booth #1 **OPERATIONAL & OPEN FOR COMMERCIAL SERVICE**.
