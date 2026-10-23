# Google Play production release

Package: `com.parallelcode.phone`. Public policy: <https://parallelcode.app/android-privacy/>.
The policy source bundled in the app is `app/src/main/assets/privacy.html`. Keep the
website's `pc-landing-page/public/android-privacy/index.html` identical when updating it.

## Build and promote

1. Run `./gradlew testDebugUnitTest assembleDebug lintRelease bundleRelease` with the Android SDK installed.
2. After the reviewed changes reach `main`, run the Android workflow with `version_name`
   set to the public version (for example `0.2.0`). The workflow retains its run-number
   version-code sequence and uploads the signed AAB to internal testing.
3. Install that exact Play build and test pairing, terminal/chat replies, task creation,
   notifications, backups, and the privacy policy before pairing and in Settings → About.
4. Verify the merged release manifest has no `ACCESS_BACKGROUND_LOCATION` or `AD_ID`.
5. With Wait for VPN enabled and VPN off: home Wi-Fi can bypass the wait while the
   app is visible; leaving the app must clear that exception. With VPN active or
   Wait for VPN disabled, background notifications should still work. Denying
   foreground location must not prevent other app features.
6. Complete Play Console app-content declarations, reviewer access, store assets,
   pricing/countries, and production access. Promote the tested bundle to production
   and submit for review. Submission is not publication; verify approval and rollout.

Promote before the next `android/` push to `main`: that push publishes a newer
internal build over the release candidate (it remains in the app bundle explorer).
Confirm that "The Front End" in the privacy policy matches the Play developer name.

Do not promote an older internal bundle containing background location. Do not
create a new signing key: use the existing upload key and Play App Signing.
Production does not publish automatically on every push.

## Store listing (English)

Name: Parallel Code

Short description: Monitor coding agents on your computer and respond from your phone.

Full description:

Parallel Code is the Android companion for Parallel Code on macOS and Linux.
Keep up with your coding agents, review their progress, and respond when they need you.

• See which agents are working, need input, or have changes ready to review.
• Read terminal output and built-in chats, send replies, and answer agent questions.
• Review code changes and task notes, and start new tasks on your computer.
• Receive optional notifications when agents need input, encounter an error, or finish.
• Keep several computers linked and switch between them.
• Customize themes, quick replies, and a home-screen widget.
• Back up settings and saved connections to a location you choose.

Requires the Parallel Code desktop app and a reachable connection to your computer.
Coding agents run on your computer; the phone app does not include an AI subscription
or hosted coding service. Connect over your trusted local network, an encrypted VPN,
or an HTTPS endpoint you configure. Scan the Connect Phone QR code or paste its link,
then pair with the desktop to enable replies and task actions.

Optional foreground location access identifies your home Wi-Fi so the app can skip
waiting for a VPN while it is open. No background location is requested. For
background notifications, connect your VPN or turn off Wait for VPN.

Website: https://parallelcode.app
Support: contact@super-productivity.com
Category: Productivity
Ads: No
Government app: No
Financial features: None
Health features: None
Advertising ID: No (verify merged manifest for each release).

## Release notes (this release)

Home Wi-Fi now skips Wait for VPN only while the app is open; the app no longer asks
for background location. For agent notifications at home, connect your VPN or turn
off Wait for VPN.

## Declarations requiring care

Do not answer Data safety with an unconditional "no data collected":
Google's scanner SDK collects diagnostics, usage events, and device/installation
identifiers. See https://developers.google.com/ml-kit/android-data-disclosure.
Prompts, terminal commands, notes and task actions leave the phone for the chosen
desktop, and user-selected cloud backup providers may receive backup contents.
Ordinary HTTP connections are supported, so do not claim all data is encrypted in transit.
Wi-Fi names remain local. Android speech recognition is delegated to the user's
recognizer; audio is not recorded by this app. Review applicable user-initiated
sharing exemptions against https://support.google.com/googleplay/android-developer/answer/10787469.

Foreground service justification: the user explicitly enables agent notifications
in Settings. A persistent notification identifies the running service. It maintains
a live connection to the user's own desktop to deliver time-sensitive input requests,
errors and task completion notifications. Turning agent notifications off stops it.
Provide a real device demonstration video showing enabling, ongoing notification,
background event delivery and disabling. Do not submit an invented video URL.

Reviewer access must be reusable and exercise the desktop-dependent functionality.
Never publish a developer's personal desktop tokens or expose a working development
machine for review. Use an isolated demo environment or a clearly labeled demo mode.
