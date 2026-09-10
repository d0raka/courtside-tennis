# Courtside Tennis

A host-authoritative browser tennis game for one shared screen and two phone controllers. No in-game account, installation, camera or microphone is required.

## Play

1. Open the home page on the TV and select **Create court**.
2. Scan the QR code on both phones, or open **Join on phone** and enter the six-digit room code.
3. Pick P1 or P2. Choose touch, or set up motion: pick flick / natural / full swing, choose your hand, hold still so the phone learns your quiet grip, then make one practice swing. Returning players can reuse their last setup.
4. Tap **I'm ready** on both phones, then **Start match** on the TV.
5. Tilt or drag to run along the baseline — you steer the player. If you hold still, they take a last step toward the ball. The serve tosses itself; swing through it. One swing is one shot. Leave shot type on Flat and a rising or chopping swing becomes topspin or slice. Touch players tap or hold/release SWING to control power.

Keep the screen and controllers foregrounded on the same Wi-Fi with internet access. For an incompatible TV, mirror a compatible computer/tablet, or mirror one iPhone, select **Use this phone as P1**, enable motion and join P2 from the other iPhone.

**Practice** uses a P2 bot and P1 keyboard/touch input. Hold ← → (or A D) to run. Space or a tap swings. No network is required for practice after the assets load.

## Rules and views

- Quick match: one game, including deuce and advantage.
- First to three games: arcade match length, full tennis point scoring.
- One set / best of three sets: two-game margin, 7-point win-by-two tiebreak at 6–6.
- Arcade rally: unlimited play with cumulative points and best-rally tracking.
- Serves must land in the diagonal service box. A fault grants a second serve; a double fault loses the point. A serve must bounce before the return.
- Split screen provides opposite baseline views and stacks on tall displays. Broadcast, classic and dynamic cameras are also available.

## Recovery

- A disconnected controller's slot is reserved for 60 seconds; play pauses immediately on close/unready or after the heartbeat timeout for silent failures.
- Reloading a controller restores its room, player and last control mode within the same browser session. Touch players return to Ready; motion players recalibrate, then tap Ready.
- Reloading the host restores the room, score and reservations within a one-hour session window. The interrupted point restarts; in-flight ball state is not restored.
- A controller left in the background for two seconds must tap Ready again. Coming back sooner keeps the ready state. Rotating the phone recenters aim without kicking you out; recalibrate only if the new grip feels wrong.
- Settings include a fresh room-code recovery action, which keeps the score and asks the players to pair again.

## Architecture and development

All production code is static under `dist/`; it is authored source, not disposable build output. `.openai/hosting.json` retains the existing Site identity. Vite is development-only; the deployed game does not ship its runtime or the QA transport.

- `dist/js/core.js`: shared configuration, guarded persistence, audio, normalized input, score rules and performance monitor.
- `dist/js/engine.js`: explicit match state machine and deterministic fixed-step physics at 120 Hz.
- `dist/js/network.js`: PeerJS abstraction, authoritative slot ownership, sequence validation, heartbeats, reconnect reservations and reliable release acknowledgement.
- `dist/js/motion.js`: play-style profiles, still-plus-practice calibration, gyroscope + accelerometer swing detection, peak firing, gravity rejection, walking-noise rejection, handedness, and orientation re-zero.
- `dist/js/renderer.js`: camera layouts, interpolation, court/player rendering and bounded visual effects.
- `dist/js/host.js`, `controller.js`: separate host/controller application flows.

Run `npm ci`, `npm test`, and `npm run build`. The build validates static entrypoints, script parsing and asset references. Use `npm run dev` to serve the game at `http://127.0.0.1:43173`. `/qa` exists only in the development server: it embeds real host/controller pages in selectable viewport sizes with an explicitly simulated peer transport. It is not evidence of WebRTC interoperability and is excluded from the deployment archive.

Append `?debug=1` (or `&debug=1`) for diagnostics. Host metrics include observed FPS, simulation scheduler rate, packet count, peer state, dropped catch-up steps and actual internal render size. Controller advanced settings show measured ping, motion force, aim, spin, calibration and dominant axis. Ping is measured from PING/PONG messages, not invented.

## Compatibility and limits

Production gameplay scripts use ES5-compatible syntax. Optional fullscreen, motion permission, audio, vibration and wake-lock APIs are feature-detected. PeerJS is loaded separately so an unsupported network library does not prevent the court or practice from opening. Canvas rendering is capped at 1920 pixels wide and 1440 pixels high, with a maximum DPR of 1.5.

PeerJS 1.5.5 uses its cloud signaling service and direct WebRTC channels. No independently provisioned TURN relay is included. Guest Wi-Fi isolation, restrictive NAT/firewalls, or unsupported TV WebRTC implementations can still prevent connection. The app reports recovery guidance; it does not pretend to offer a relay.

Input timestamps are transmitted, but clock-synchronized rollback/lag compensation is not implemented. Local phone response is immediate, while host input buffering is limited to 160 ms. Phone vibration depends on browser support; iPhone browsers may provide only visual feedback.

Read `docs/AUDIT.md` for root-cause findings and `docs/VERIFICATION.md` for the actual validation results and remaining hardware checks. PeerJS and QR-code library licenses are included in `dist/`.
