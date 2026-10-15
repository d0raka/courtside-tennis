# Courtside Tennis

A host-authoritative browser tennis game for one shared screen and two phone controllers. No in-game account, installation, camera, or microphone is required.

## Features

- One TV (or laptop) screen and two phones on the same match
- Touch or motion controls: tilt to run, swing to hit, topspin and slice
- Practice against a bot with keyboard input, no network required after the page loads
- Quick match, first to three games, sets, tiebreaks, and an arcade rally
- Reconnect: a dropped controller keeps its slot for 60 seconds

## Tech stack

- Static HTML, CSS, and JavaScript (no build step)
- PeerJS 1.5.5 for WebRTC signaling and data channels
- Vendored QR rendering in `js/qr.js`
- GitHub Pages (`.github/workflows/pages.yml` publishes the repository root)

## Play

1. Open the home page on the TV and select **Create court**.
2. Scan the QR code on both phones, or open **Join on phone** and enter the six-digit room code.
3. Pick P1 or P2. Choose touch, or set up motion: pick flick / natural / full swing, choose your hand, hold still so the phone learns your quiet grip, then make one practice swing. Returning players can reuse their last setup.
4. Tap **I'm ready** on both phones, then **Start match** on the TV.
5. Look at the TV. The phone is the racket: **tilt to run, swing to hit**. There are no gameplay buttons. A rising swing becomes topspin; a chopping swing becomes slice. If sensors are blocked, the whole glass is still the racket: drag to run, flick to swing. Hold the phone still for a second to open Leave / Recalibrate.

Keep the screen and controllers in the foreground on the same Wi-Fi with internet access. For an incompatible TV, mirror a compatible computer or tablet, or mirror one iPhone, select **Use this phone as P1**, enable motion, and join P2 from the other iPhone.

**Practice** uses a P2 bot and P1 keyboard input on the TV. Hold left / right (or A / D) to run. Space or a tap swings. The court is a 3D living-room view. Settings includes **Leave practice, pair phones**. No network is required for practice after the page loads.

## Rules

- Quick match: one game, including deuce and advantage.
- First to three games: arcade match length, full tennis point scoring.
- One set / best of three sets: two-game margin, 7-point win-by-two tiebreak at 6-6.
- Arcade rally: unlimited play with cumulative points and best-rally tracking.
- Serves must land in the diagonal service box. A fault grants a second serve; a double fault loses the point. A serve must bounce before the return.
- Split screen provides opposite baseline views and stacks on tall displays. Broadcast, classic, and dynamic cameras are also available.

## Recovery

- A disconnected controller's slot is reserved for 60 seconds. Play pauses on close or unready, or after the heartbeat timeout for a silent drop.
- Reloading a controller restores its room, player, and last control mode within the same browser session. Touch players return to Ready. Motion players recalibrate, then tap Ready.
- Reloading the host restores the room, score, and reservations within a one-hour session window. The interrupted point restarts. In-flight ball state is not restored.
- A controller left in the background for two seconds must tap Ready again. Coming back sooner keeps the ready state. **Take a break** on the play screen unreadies you and pauses the match. Tap **Ready again** on that same button to return.
- Rotating the phone recenters aim. Recalibrate only if the new grip feels off.
- Settings include a fresh room-code recovery action, which keeps the score and asks the players to pair again.

## Setup

Clone the repository and open `index.html` for practice. Phone pairing needs the pages on a network both phones can reach. GitHub Pages does that: `.github/workflows/pages.yml` uploads the repository root on every push to `main`.

There is no package install.

## Usage

Follow **Play** above. Append `?debug=1` for diagnostics. Host metrics include FPS, simulation rate, packet count, peer state, and render size. Controller settings show ping, motion force, aim, spin, and calibration. Ping comes from PING/PONG messages.

## Layout

- `index.html`, `screen.html`, `controller.html`: pages
- `js/core.js`: configuration, persistence, audio, input, scoring
- `js/engine.js`: match state machine and fixed-step physics
- `js/network.js`: PeerJS rooms, heartbeats, reconnect
- `js/motion.js`: swing detection and calibration
- `js/renderer.js`: cameras and court rendering
- `js/host.js`, `js/controller.js`, `js/home.js`: page flows
- `peerjs.min.js` and `js/qr.js`: vendored libraries

## Compatibility

Gameplay scripts use ES5-compatible syntax. Fullscreen, motion permission, audio, vibration, and wake lock are feature-detected. PeerJS loads separately, so a missing network library does not block practice. Canvas rendering is capped at 1920 by 1440 pixels, with a maximum device pixel ratio of 1.5.

PeerJS uses its cloud signaling service and direct WebRTC. There is no separate TURN relay. Guest Wi-Fi isolation or an unsupported TV WebRTC stack can still block pairing. Input timestamps are sent, but there is no clock-synchronized rollback. Host input buffering is limited to 160 ms.

## License

Project code is MIT. See [LICENSE](LICENSE).

PeerJS and the QR library keep their own notices: [LICENSE-PEERJS.txt](LICENSE-PEERJS.txt) and [LICENSE-QRCODE.txt](LICENSE-QRCODE.txt).
