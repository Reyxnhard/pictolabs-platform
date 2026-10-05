# PICTOLABS COMMERCIAL BOOTH #1 PRE-LAUNCH READINESS PLAN
## Technical Validation, Operational Hardening & Go-Live Protocol for Unattended Retail Deployment

> **Target Deployment:** Commercial Photobooth Unit #1 (Mall Retail Deployment)  
> **Target Date:** September 2026  
> **Target Enclosure:** Windows 10/11 IoT Enterprise Touchscreen Kiosk + Ubuntu 24.04 VPS Cloud  
> **Status:** 📋 **PLANNING & VERIFICATION SPECIFICATION ONLY (NO CODE MODIFICATIONS)**  
> **Document Purpose:** Exhaustive engineering readiness criteria to validate zero-failure retail deployment across all 12 operational pillars.

---

## Executive Summary & Go/No-Go Standard

This pre-launch readiness plan establishes the non-negotiable technical requirements and acceptance criteria for deploying **Pictolabs Booth #1** in an unattended retail commercial environment (shopping mall / cinema lobby). 

Unattended commercial photobooths have **zero tolerance for operational downtime**. A single failure—whether a broken payment webhook, a jammed printer spooler, an unhandled camera sleep state, or a customer escaping into the Windows desktop—results in immediate revenue loss, customer disputes, and brand damage.

Before Booth #1 is powered on for paying mall customers, every single item in this 12-pillar matrix must achieve an explicit **PASSED** status.

---

## 1. Midtrans Production Readiness

### Objective
Transition payment processing from the Midtrans Sandbox simulator to live production Midtrans Core API (Dynamic QRIS), ensuring instantaneous settlement synchronization, cryptographic webhook verification, duplicate transaction rejection, and automated reconciliation.

### Dependencies
- Midtrans Production Merchant Account with completed business KYC.
- Production Merchant Credentials: `MIDTRANS_SERVER_KEY`, `MIDTRANS_CLIENT_KEY`, `MIDTRANS_MERCHANT_ID`.
- Public HTTPS Webhook endpoint bound to production domain: `https://api.pictolabs.id/api/payments/webhook`.
- Active QRIS payment channel (GoPay / ShopeePay / BCA QRIS / National EMVCo standard).
- PostgreSQL `payments` and `transactions` tables with unique constraint on `orderId`.

### Acceptance Criteria
- **AC-1.1**: Production environment variables configured in production `.env`:
  `PAYMENT_GATEWAY_ENV=production`, `MIDTRANS_IS_PRODUCTION=true`, and verified live merchant keys loaded.
- **AC-1.2**: Live Real-Money Transaction Test: Generate a dynamic QRIS code for IDR 35,000 on the kiosk, scan with a real Indonesian banking app (BCA Mobile/Livin' Mandiri/GoPay), and verify funds arrive in Midtrans Merchant balance.
- **AC-1.3**: Cryptographic Webhook Validation: Verify SHA-512 signature `hash(order_id + status_code + gross_amount + ServerKey)` rejects spoofed HTTP POST payloads with HTTP 403 Forbidden.
- **AC-1.4**: Sub-Second State Transition: Webhook settlement notification updates database record from `PENDING` to `SETTLED` and emits WebSocket event to kiosk in **<1.5 seconds**, automatically advancing kiosk from QRIS screen to Pose 1 countdown.
- **AC-1.5**: Idempotency & Replay Protection: Sending duplicate settlement webhooks for the same `orderId` returns HTTP 200 OK without double-incrementing print counts or re-triggering capture sessions.
- **AC-1.6**: Timeout & Expiration Enforcement: Unpaid QRIS sessions exceeding 270 seconds expire gracefully (`EXPIRED` status), releasing the kiosk back to the Welcome Screen.

### Risk Level
**CRITICAL** — Payment failure directly halts revenue generation, while duplicate or missed webhooks create immediate customer confrontations at the booth.

---

## 2. VPS Production Readiness

### Objective
Commission, harden, and benchmark the production cloud server running Ubuntu 24.04 LTS with Docker Compose, ensuring high availability, strict firewall isolation, encrypted TLS 1.3 reverse proxying, and automated daily off-site database backups.

### Dependencies
- Cloud VPS instance (minimum 2 vCPU, 4GB RAM, 80GB NVMe SSD e.g., DigitalOcean / Hetzner / AWS Lightsail).
- Static Public IPv4 address assigned to VPS.
- Cloudflare DNS records: `api.pictolabs.id` (A record to VPS IP) and `dl.pictolabs.id` (CNAME to Cloudflare R2).
- Docker Engine v26+ and Docker Compose v2+.
- Valid Let's Encrypt TLS certificates mounted into Nginx reverse proxy.

### Acceptance Criteria
- **AC-2.1**: UFW Firewall Strict Isolation: Only ports `22` (SSH key-only, password disabled), `80` (HTTP to HTTPS redirect), and `443` (HTTPS) open. PostgreSQL (5432) and Redis (6379) bound strictly to `127.0.0.1` and inaccessible from the public internet.
- **AC-2.2**: Cloudflare SSL Configuration: SSL/TLS encryption mode set to **Full (Strict)** with Always Use HTTPS enabled and TLS 1.3 enforced.
- **AC-2.3**: Production Container Orchestration: `docker-compose.prod.yml` starts `pictolabs-backend`, `pictolabs-postgres`, `pictolabs-redis`, and `pictolabs-nginx` with `restart: always` and healthcheck probes.
- **AC-2.4**: Sub-Second Healthcheck: `GET https://api.pictolabs.id/api/health` returns `{"status":"ok","db":"connected","redis":"connected"}` with HTTP 200 in **<150ms**.
- **AC-2.5**: Automated Off-Site DB Backups: Automated cron runs daily at 03:00 WIB executing `pg_dump`, encrypting the dump file, and uploading to an isolated Cloudflare R2 backup bucket with 30-day lifecycle retention.
- **AC-2.6**: WebSocket Stream Reliability: Nginx configured with `proxy_set_header Upgrade $http_upgrade` and `proxy_read_timeout 3600s` to maintain persistent WebSocket connections from mall kiosks without idle termination.

### Risk Level
**HIGH** — VPS unavailability takes down fleet telemetry, dashboard monitoring, softfile delivery, and payment settlement across all deployed booths.

---

## 3. End-to-End Hardware Validation

### Objective
Certify the complete physical integration of Commercial Booth #1 enclosure (Mini-PC, DSLR camera, thermal printer, touchscreen panel, strobe/LED lighting, and internal thermal exhaust fans) operating continuously under heavy retail workloads.

### Dependencies
- Fully assembled Commercial Booth #1 metal/wood kiosk enclosure with locking maintenance doors.
- Windows 10/11 IoT Enterprise Mini-PC (Intel Core i5, 16GB RAM, 256GB SSD).
- Single 220V AC input cord connected through an internal 600VA Line-Interactive UPS and surge protector.
- Industrial powered USB 3.0 hub (minimum 12V/3A external adapter).
- Internal 120mm silent ball-bearing exhaust fan.

### Acceptance Criteria
- **AC-3.1**: Single Power Plug Protocol: Entire booth powers up from a single standard 220V/10A wall outlet with total peak power consumption <450W (during concurrent flash charging and thermal printing).
- **AC-3.2**: Thermal Endurance: Booth operates continuously for 8 hours in ambient mall conditions (25°C–30°C) with internal enclosure temperature remaining below 38°C and Mini-PC CPU temperature remaining below 70°C.
- **AC-3.3**: USB Bus Bandwidth & Isolation: DSLR camera, thermal printer, and touchscreen controller operate on separate root hubs or dedicated high-speed controllers with zero USB bus reset events or bandwidth choking during simultaneous capture and print.
- **AC-3.4**: Lighting Synchronization: Continuous LED modeling lights and flash strobe fire consistently across 100 consecutive shutter actuations without flickering, thermal throttling, or triggering screen glare.
- **AC-3.5**: Physical Enclosure Security: No external USB ports, power buttons, or cables accessible to customers; all service ports secured behind physical key locks.

### Risk Level
**HIGH** — Thermal throttling or USB bus choking causes intermittent hardware dropouts that are difficult to diagnose remotely.

---

## 4. Camera Validation (Canon EDSDK Native Binding)

### Objective
Certify the Canon EOS DSLR camera optical pipeline via Canon EDSDK 13.x native C++ bindings for rock-solid 30 FPS LiveView viewfinder streaming, instantaneous burst capture across 4 poses, manual exposure locking, and seamless failover to webcam backup.

### Dependencies
- Canon EOS DSLR (Canon EOS 1300D / 200D / 1500D) mounted securely on rigid internal vibration-dampened bracket.
- Canon ACK-E10 continuous AC power coupler (camera battery eliminated).
- High-grade shielded USB cable with dual ferrite chokes.
- Canon EDSDK runtime libraries (`EDSDK.dll`, `EdsImage.dll`) bundled in Electron app.
- Secondary 1080p USB webcam connected as automatic emergency fallback.

### Acceptance Criteria
- **AC-4.1**: Continuous AC Power Immunity: Camera AC coupler maintains continuous operation without camera entering auto-power-down sleep mode (Auto Power Off = Disable in camera firmware).
- **AC-4.2**: Viewfinder Stream Stability: `kiosk.camera.startLiveView()` provides steady 30 FPS stream at 960x640 resolution with <50ms display latency in both `mirror` and `original` modes.
- **AC-4.3**: Shutter Burst Reliability: Camera successfully executes 50 consecutive 4-pose photo sessions (200 shutter actuations) without EDSDK timeout, buffer overflow (`EDS_ERR_TAKE_PICTURE_AF_NG`), or mirror lockup.
- **AC-4.4**: Exposure & Focus Locking: Lens set to Manual Focus (MF) at focal distance 1.2m, manual exposure (1/125s, f/5.6, ISO 200), ensuring identical exposure across all poses without auto-hunting.
- **AC-4.5**: Image Ingestion Latency: High-resolution JPEG transfers from camera RAM to kiosk local storage in **<1.2 seconds** per pose.
- **AC-4.6**: Graceful Webcam Failover: Unplugging camera USB mid-session causes `CameraService.ts` to switch to USB Webcam Backup within <1 second, logs `WEBCAM_FALLBACK` to health log, and alerts the operator without aborting the customer session.

### Risk Level
**CRITICAL** — Camera failure completely halts photobooth operations. Shutter lag or focus hunting ruins customer satisfaction.

---

## 5. Printer Validation (DNP DS-RX1HS / Thermal Spooler)

### Objective
Validate the DNP DS-RX1HS (or Citizen CY-02) dye-sublimation thermal printer for high-speed, jam-free 300 DPI 4R / 2x6 photostrip output, precise hardware paper-level tracking, clean dual-strip cutting, and automated spooler jam recovery.

### Dependencies
- DNP DS-RX1HS thermal photo printer with official Windows WHQL driver installed.
- Genuine DNP 4x6 / 2x6 media roll loaded (700 prints per roll capacity).
- Sharp 300 DPI composite layout engine (`RenderEngine.ts`).
- Windows Print Spooler service (`spoolsv.exe`) with bidir status communication enabled.

### Acceptance Criteria
- **AC-5.1**: 300 DPI Composite Precision: Sharp engine composits 4 poses, custom overlays, and branding into a 1200x1800 (4R) or 600x1800 (2x6 strip) print file in **<800ms**.
- **AC-5.2**: Print Cycle Speed: Total elapsed time from session completion to finished, dry, fingerprint-proof print ejected into tray is **<15 seconds**.
- **AC-5.3**: Clean Dual-Cut Mechanics: 2x6 photostrip layout triggers internal 2-inch cutter cleanly separating the 4x6 sheet into 2 identical 2x6 strips with zero edge fraying or paper jams across 100 continuous test prints.
- **AC-5.4**: Spooler Health Telemetry: `PrintService.ts` reads Win32 printer API status flags and correctly classifies `READY`, `PAPER_OUT`, `RIBBON_OUT`, `DOOR_OPEN`, and `JAMMED`.
- **AC-5.5**: Hardware Maintenance Gate: When remaining paper count drops below 10 sheets, kiosk health status marks `LOW_PAPER` warning; when 0 sheets remain, kiosk locks into maintenance mode, displays a customer courtesy screen, and dispatches an urgent WhatsApp replenishment alert.
- **AC-5.6**: Operator Reprint Capability: Technician can reprint the last completed session directly from the Operator Control Panel or remotely via Dashboard without re-compositing.

### Risk Level
**CRITICAL** — Paper jams or failed spooler output directly cause lost customer revenue and immediate disputes.

---

## 6. Touchscreen Validation (Industrial Capacitive Panel & Kiosk Shell)

### Objective
Certify the commercial 21.5" / 24" 10-point projected capacitive (PCAP) touchscreen display for rapid customer interaction, zero ghost-touch phenomena, edge gesture suppression, and kiosk containment.

### Dependencies
- 21.5" or 24" 1080p Full HD Projected Capacitive Touchscreen (USB HID interface).
- Windows Touch Gate and gesture blocking policies applied via `lockdown-kiosk.ps1`.
- Electron kiosk window configured with `kiosk: true`, `alwaysOnTop: true`.

### Acceptance Criteria
- **AC-6.1**: Touch Accuracy & Latency: Touch response registered in **<25ms** across 100% of the active display area; no calibration drift after 12 hours of continuous operation.
- **AC-6.2**: Anti-Ghosting & Ambient Immunity: Touch controller exhibits zero false touch triggers when exposed to commercial AC electrical noise or humid indoor mall conditions.
- **AC-6.3**: Complete Edge Gesture Suppression: Right edge swipe (Action Center), left edge swipe (Widgets/MSN), top edge swipe (Title bar), and bottom edge swipe (Taskbar) produce **zero reaction** on the display (`AllowEdgeSwipe = 0`).
- **AC-6.4**: Multi-Finger Gesture Elimination: 3-finger, 4-finger, and 5-finger pinch, spread, and swipe gestures produce no OS task switcher or desktop reveal (`TurnOffMultitouchGestures = 1`).
- **AC-6.5**: Virtual Keyboard Security: Windows On-Screen Keyboard (OSK / TabTip) cannot be invoked by customer to escape into File Explorer or browser URLs.
- **AC-6.6**: Discreet Operator Entry Access: Technician **"Staff"** button (`#btn-kiosk-admin-entry`) at top-right corner is reliably accessible with single tap, while remaining low-contrast and unobtrusive to photobooth users.

### Risk Level
**HIGH** — Touch failure makes the kiosk unusable; incomplete gesture blocking permits malicious customers to exit the photobooth application into Windows.

---

## 7. Live Photo Validation (Video Composition & GIF Generation)

### Objective
Verify the background video capture pipeline recording 2–3 second 1080p clips per pose, compositing video frames with overlays, and producing optimized MP4 and animated GIF files with zero degradation to camera countdown performance.

### Dependencies
- Background video capture stream via Electron media recorder / webcam buffer.
- Static FFmpeg binary (`ffmpeg.exe`) bundled in `pictolabs-rebuild/apps/kiosk/bin/`.
- Background worker execution (`videoEncoder.worker.js`).
- Local SQLite database session record storage (`kiosk.db`).

### Acceptance Criteria
- **AC-7.1**: Continuous Pre-Shutter Buffer: Kiosk records 2.5 seconds of 30 FPS 1080p video preceding each pose capture without frame drops or memory leaks.
- **AC-7.2**: Background Transcoding Speed: FFmpeg compiles 4 pose clips into a combined 10-second Live Photo MP4 (H.264, 1080p, <3.5MB) and boomerang GIF (<2.0MB) in **<4.5 seconds**.
- **AC-7.3**: Zero Viewfinder Stutter: Video encoding runs on a background worker thread without causing countdown timer freezes, UI hitching, or audio/video desync.
- **AC-7.4**: Local Persistence Guarantee: Completed video paths (`live_video_path`, `gif_path`) written to SQLite `sessions` table in `WAL` mode before cloud upload starts.
- **AC-7.5**: Fault Isolation: If video transcoding encounters a corrupted frame or codec error, photo composite printing proceeds without interruption; customer still receives physical print.

### Risk Level
**MEDIUM** — High-value differentiator for customer social sharing; must never block or crash physical photo printing.

---

## 8. QR Download Validation (Cloudflare R2 CDN & Customer Softfile Gallery)

### Objective
Validate the digital asset ingestion and delivery pipeline: asynchronous background upload from kiosk to Cloudflare R2, dynamic QR code display on kiosk finish screen, fast mobile gallery loading via `dl.pictolabs.id`, and streaming ZIP bundle generation.

### Dependencies
- Cloudflare R2 Object Storage bucket (`pictolabs-media-prod`) with Zero-Egress fees.
- Custom public domain `https://dl.pictolabs.id` bound to R2 bucket with SSL/TLS active.
- NestJS `StorageService.ts` and customer gallery endpoint (`/d/:sessionId`).
- Kiosk asynchronous `SyncEngine.ts` upload worker.

### Acceptance Criteria
- **AC-8.1**: Asynchronous Cloud Ingestion: Composite photo, raw photos, and Live Photo MP4 upload from kiosk to Cloudflare R2 in **<8 seconds** over standard 4G/5G mobile router.
- **AC-8.2**: Instant QR Code Readability: High-contrast QR code rendered on the Kiosk Completion Screen scans immediately on iOS Camera and Android Google Lens from 1.0m distance.
- **AC-8.3**: Mobile Gallery Loading Speed: Customer scanning QR loads branded mobile web gallery on 4G cellular data in **<1.5 seconds**.
- **AC-8.4**: In-Browser Media Playback: Mobile gallery displays high-resolution photostrip preview and plays Live Photo video inline without forced download.
- **AC-8.5**: Streaming ZIP Bundle: Tapping "Download All (ZIP)" generates and streams complete archive (all photos + Live Photo MP4) directly to mobile device in **<2.5 seconds**.
- **AC-8.6**: Offline Network Queueing: If mall internet disconnects during a session, files remain queued in SQLite `upload_queue` table and automatically sync to Cloudflare R2 once connection resumes, with zero data loss.

### Risk Level
**HIGH** — Customers expect digital copies on their smartphones before leaving the booth; upload failures result in immediate operator support requests.

---

## 9. Email Delivery Validation (Resend & DNS Authentication)

### Objective
Certify the transactional softfile delivery service via Resend API, guaranteeing 100% inbox placement (bypassing spam filters), professional responsive HTML email formatting, anti-abuse rate limiting, and dashboard redelivery capabilities.

### Dependencies
- Active Resend API account and production key (`RESEND_API_KEY`).
- Verified custom sending domain: `delivery.pictolabs.id` (or `pictolabs.id`).
- DNS authentication records configured on Cloudflare: SPF (`include:amazonses.com`), DKIM (`resend._domainkey`), DMARC (`p=none`).
- NestJS `EmailService.ts` with HTML email template.

### Acceptance Criteria
- **AC-9.1**: 100% DNS Authentication Pass: Sending domain passes SPF, DKIM, and DMARC verification on major mailbox providers (Google Workspace, Yahoo, Microsoft 365).
- **AC-9.2**: Inbox Delivery Latency: Transactional email with softfile download links arrives in customer Gmail / iCloud inbox within **<15 seconds** of entering address on kiosk screen.
- **AC-9.3**: Responsive Email Presentation: HTML email renders cleanly on mobile and desktop email clients with personalized event name, inline photostrip preview, and prominent download button.
- **AC-9.4**: Anti-Spam Rate Limiting: Kiosk and API enforce a strict limit of maximum 3 delivery emails per session; 4th attempt rejected with HTTP 429 Too Many Requests.
- **AC-9.5**: Operator One-Click Redelivery: Support operator can resend delivery email or correct customer typos from the Admin Dashboard `BoothDetailDrawer` with immediate delivery confirmation.

### Risk Level
**MEDIUM** — Secondary to on-screen QR code download, but essential for customer support when QR code is not scanned immediately.

---

## 10. WhatsApp Alert Validation (Operational Gateway)

### Objective
Validate real-time operational alerting via WhatsApp gateway (Fonnte / Wablas) to dispatch critical hardware fault warnings, supply depletion notices, and intrusion alerts to field technicians and founders within seconds.

### Dependencies
- Active WhatsApp Gateway account (Fonnte / Wablas API Key).
- Connected WhatsApp Business / sender phone number.
- Technician and founder destination numbers (`WA_ADMIN_PHONE`).
- NestJS `AlertService.ts` with deduplication and cooldown caching.

### Acceptance Criteria
- **AC-10.1**: Real-Time Dispatch Latency: WhatsApp messages arrive on technician smartphone within **<5 seconds** of event detection on the booth.
- **AC-10.2**: Brute-Force Intrusion Alert: 3 consecutive incorrect PIN attempts on the kiosk triggers an immediate `🚨 CRITICAL` WhatsApp alert: *"Percobaan Akses Ilegal Panel Teknisi: Keypad dikunci 10 menit."*
- **AC-10.3**: Hardware Fault Alerts: Disconnecting camera USB, thermal printer paper exhaustion (<10 prints), paper jam, or kiosk offline (>5m) triggers specific structured WhatsApp messages.
- **AC-10.4**: Actionable Message Structure: Every alert contains: Severity Badge, Booth Name, Mall Location, Timestamp (WIB), Error Code, Root Cause Detail, Recommended Action, and Direct Dashboard Link.
- **AC-10.5**: Alert Flood Cooldown: Duplicate alerts for the same fault on the same booth are throttled to once every 15 minutes, preventing technician notification spam.

### Risk Level
**HIGH** — If WhatsApp alerts fail, hardware faults during peak mall weekend hours sit unnoticed for hours, bleeding potential revenue.

---

## 11. Disaster Recovery Validation (Crash, Power Loss & Offline Resiliency)

### Objective
Validate platform self-healing against unexpected mall power cuts, application crashes, internet disconnects, database corruption, and frozen processes without requiring physical on-site developer presence.

### Dependencies
- Process supervisor watchdog (`watchdog-kiosk.ps1`).
- SQLite embedded database configured in Write-Ahead Logging (`WAL`) mode (`kiosk.db`).
- BIOS configuration set to `State After G3: Always Power On`.
- Windows Fast Startup disabled (`HiberbootEnabled = 0`).

### Acceptance Criteria
- **AC-11.1**: Cold Power Loss Recovery: Unplugging booth power cord during an active photo session and restoring power results in Mini-PC auto-booting into Windows, launching `Pictolabs.exe`, and displaying Welcome Screen in **<45 seconds** with **zero SQLite database corruption** (`PRAGMA integrity_check` = `ok`).
- **AC-11.2**: Application Crash Auto-Respawn: Terminating `Pictolabs.exe` via Task Manager or simulated memory fault results in watchdog detecting termination and respawning fullscreen kiosk window in **<3 seconds**.
- **AC-11.3**: Orphan Process Termination: Watchdog cleans up orphaned background processes (`ffmpeg.exe`, `node.exe`) before respawning kiosk to prevent USB port locking or camera handle exhaustion.
- **AC-11.4**: Total Internet Blackout Resilience: Complete loss of internet connection during payment or capture does not crash application: physical photos print normally, session data commits to local SQLite, and upload worker resumes sync automatically when connection returns.
- **AC-11.5**: Abandoned Session Auto-Reset: If a customer walks away mid-session without completing poses, kiosk countdown timer expires and resets safely to the Welcome Screen after 270 seconds, clearing all temporary files.

### Risk Level
**CRITICAL** — Retail kiosks operate without dedicated on-site technical staff; automatic self-healing is mandatory for business viability.

---

## 12. Pre-Launch Checklist (T-Minus 48h to T-Minus 0h Deployment Runbook)

### Objective
A rigorous, chronological go/no-go operational runbook covering all final checks from factory staging to physical mall installation and ribbon-cutting.

### Dependencies
- Successful sign-off on Items 1 through 11.
- Executed mall tenancy contract and security entry permit.
- 4G/5G Industrial IoT Cellular Router with active unlimited data SIM.

---

### Phase 1: Factory Staging & Cloud (T-Minus 48 Hours)
- [ ] **Cloud Database Migration**: Run `prisma migrate deploy` on production PostgreSQL; verify all tables, indexes, and constraints exist.
- [ ] **Midtrans Production Swap**: Set `MIDTRANS_IS_PRODUCTION=true` in production `.env`; configure live Server/Client keys; test live QRIS IDR 1,000 transaction.
- [ ] **Cloudflare R2 Verification**: Confirm bucket `pictolabs-media-prod` is bound to `dl.pictolabs.id` with HTTPS active and lifecycle retention enabled.
- [ ] **Resend DNS Audit**: Verify SPF, DKIM, and DMARC status on Resend dashboard for `delivery.pictolabs.id`.
- [ ] **WhatsApp Alert Probe**: Execute `POST /api/alerts/test` and verify WhatsApp message delivery to technician and founder phones.
- [ ] **Admin Account Security**: Change default administrator password from `pictolabs2026` to high-entropy master password; verify dashboard login.
- [ ] **Kiosk Production Build**: Build production kiosk package (`npm run build` in `apps/kiosk`); verify binary bundles clean without devtools.

---

### Phase 2: Hardware Assembly & Bench Testing (T-Minus 24 Hours)
- [ ] **DSLR Optics Calibration**: Clean lens elements; set focal length to 24mm; set focus switch to **MF** (Manual Focus); secure focus ring with gaffer tape to prevent vibration drift.
- [ ] **Camera Firmware Setup**: Set camera dial to **M** (Manual); configure shutter 1/125s, aperture f/5.6, ISO 200; disable Auto Power Off; set USB mode to PC Connect.
- [ ] **Printer Media Loading**: Load fresh 700-print roll into DNP RX1HS; verify scrap receptacle is emptied; perform cut test (`kiosk.printer.cutTest()`).
- [ ] **Windows OS Hardening**: Run `scripts\lockdown-kiosk.ps1` with Administrator privileges; verify edge gestures and notifications are completely disabled.
- [ ] **Watchdog Installation**: Register `watchdog-kiosk.ps1` as a Windows startup scheduled task running under system logon.
- [ ] **BIOS Configuration**: Access Mini-PC BIOS; set `Restore on AC Power Loss` = **Power On**; disable Fast Boot; disable USB selective suspend.
- [ ] **Dry Run Stress Test**: Execute 20 consecutive full photobooth sessions (capture, print, live photo, upload, QR display) with zero errors.

---

### Phase 3: Mall Logistics & On-Site Installation (T-Minus 4 Hours)
- [ ] **Booth Positioning**: Position enclosure in designated mall location; ensure 15cm rear clearance for cooling exhaust ventilation.
- [ ] **Leveling & Stability**: Adjust industrial leveling feet so booth does not wobble during customer touchscreen interaction.
- [ ] **Power Line Verification**: Measure wall outlet voltage with multimeter (210V–230V stable); connect UPS; verify UPS battery backup holds load.
- [ ] **Cellular Network Verification**: Power on 4G/5G IoT router; verify download speed >20 Mbps, upload speed >10 Mbps, ping <50ms to `api.pictolabs.id`.
- [ ] **Lighting Alignment**: Inspect flash bounce reflector and continuous LED strip; verify even face lighting without shadows or glare on camera lens.
- [ ] **Physical Lock Inspection**: Verify all cabinet access doors are securely locked with physical keys handed to authorized staff.

---

### Phase 4: Final Go-Live Verification (T-Minus 0 Hours)
- [ ] **Cold Boot Drill**: Cut AC power at wall switch for 10 seconds; turn on; verify booth boots automatically to Welcome Screen in <45 seconds.
- [ ] **First Paid Customer Drill**: Conduct live transaction using real customer smartphone (scan QRIS, make payment, take 4 photos, collect print, scan download QR, check email).
- [ ] **Dashboard Verification**: Check Admin Dashboard; verify Booth #1 status shows **ONLINE** with active heartbeat (<60s age) and all 5 pillars green.
- [ ] **Operator Access Verification**: Tap top-right **Staff** button; verify 6-digit PIN screen appears; enter PIN; verify Operator Control Panel opens.
- [ ] **Ribbon Cutting**: Clean touchscreen with microfiber cloth; step back; open booth to public mall traffic.

---

## 13. Summary Risk Assessment Matrix

| Pillar # | Functional Area | Risk Level | Primary Risk Event | Mitigation Strategy |
| :---: | :--- | :---: | :--- | :--- |
| **1** | **Midtrans Production** | `CRITICAL` | Webhook settlement delay leaves customer waiting at kiosk | Dynamic QRIS polling fallback every 2s in parallel with webhook listener |
| **2** | **VPS Production** | `HIGH` | Cloud API server crash halts softfile downloads and dashboard | Docker auto-restart + PostgreSQL healthchecks + daily R2 automated backup |
| **3** | **Hardware Integration** | `HIGH` | Internal overheating causes camera/printer shutdown | 120mm continuous exhaust fan + internal temperature sensor telemetry |
| **4** | **Camera Validation** | `CRITICAL` | Canon EDSDK disconnects or freezes during photo capture | Manual focus gaffer tape + AC coupler + automatic emergency webcam fallback |
| **5** | **Printer Validation** | `CRITICAL` | Paper jam or ribbon exhaustion during peak weekend rush | Win32 spooler monitoring + automated WhatsApp replenishment alert at 10 sheets |
| **6** | **Touchscreen Validation** | `HIGH` | Customer swipes edge and escapes kiosk into Windows OS | Windows registry lockdown (`AllowEdgeSwipe=0`) + Explorer shell elimination |
| **7** | **Live Photo Validation** | `MEDIUM` | Video encoding causes countdown timer stutter | FFmpeg execution isolated in background worker thread with safe fallback |
| **8** | **QR Download** | `HIGH` | Slow cloud upload causes customer to leave without softfiles | Background upload with local SQLite offline queue + Cloudflare R2 zero-egress CDN |
| **9** | **Email Delivery** | `MEDIUM` | Transactional softfile emails land in Spam / Junk folder | Full SPF, DKIM, and DMARC DNS authentication on custom sending domain |
| **10** | **WhatsApp Alerting** | `HIGH` | Silent booth failure with no technician on-site | Automated Fonnte/Wablas gateway alerts with 5s delivery and 15m cooldown |
| **11** | **Disaster Recovery** | `CRITICAL` | Mall power glitch corrupts database or leaves kiosk unpowered | BIOS AC Restore `Always On` + SQLite WAL mode corruption immunity + watchdog daemon |
| **12** | **Launch Checklist** | `CRITICAL` | Premature launch with uncalibrated lens or default credentials | Non-negotiable 4-phase signed runbook before public operation |
