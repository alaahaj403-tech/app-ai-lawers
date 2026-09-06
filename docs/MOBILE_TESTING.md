# Trying the Android build

The API is not deployed anywhere public yet, so a phone can only translate
against a server you run. This is the shortest path.

## 1. Run the API on your computer

```bash
git clone https://github.com/alaahaj403-tech/app-ai-lawers && cd app-ai-lawers
git checkout claude/voxeli-branding-strategy-rf6fpg
pnpm install
docker compose -f infrastructure/docker-compose.yml up -d      # Postgres + Redis
cp .env.example services/api/.env                                 # set JWT_SECRET; add OPENAI_API_KEY for real translations
pnpm -r --filter './packages/*' build
pnpm db:migrate && pnpm db:seed
pnpm --filter @voxeli/api dev                                     # listens on 0.0.0.0:4000
```

Without `OPENAI_API_KEY` the API runs the **mock** provider: translations come
back as `[xx] original text` and are clearly not translations. That is enough
to exercise login, quotas, history, RTL and error states.

Find your computer's LAN address (`ipconfig` on Windows, `ip a` on Linux,
`ifconfig` on macOS), e.g. `192.168.1.20`. Phone and computer must be on the
same Wi-Fi, and the firewall must allow port 4000.

## 2. Install the APK

- Copy `app-arm64-v8a-release.apk` to the phone (most phones since 2017 are
  arm64; use `armeabi-v7a` for old 32-bit devices).
- Allow "install from unknown sources" when prompted. The APK is signed with a
  debug key, so Play Protect may warn; that is expected for a test build.

## 3. Point the app at your server

Open Voxeli → tap the server icon (top bar) → enter `http://192.168.1.20:4000`
(your address) → Save. The setting persists on the device. "Reset" returns to
the build default, which is the Android-emulator loopback `http://10.0.2.2:4000`.

## 4. Try it

Log in → Create account (password ≥ 10 characters) → type text → Translate.
Switch the phone's language to Hebrew or Arabic to see the RTL layout. Turn on
"No-history mode" to check that nothing is saved.

## 5. Talk (live translation)

Open the **Talk** tab, pick "I speak" / "They speak", tap the microphone. The
app asks for microphone permission the first time. Against a server without
`OPENAI_API_KEY` the captions are placeholder sentences that say so; with a key
you get live transcription, translation and spoken output. Speak while the
translation is playing to hear barge-in cut it off. Toggle airplane mode for a
few seconds to watch "Reconnecting…" recover without losing captions.

## What to expect and what is not there yet

- Text translation, Listen (server voice), history, favourites, no-history
  mode, login/refresh, quota display, error states, Talk: implemented end to end.
- Not yet on mobile: camera translate, learning, calls; Talk Mode B (two remote
  participants) is server-side only.
- Permissions: microphone is requested when you first tap the Talk button, not
  at start-up. Nothing is recorded; audio is streamed and discarded.
