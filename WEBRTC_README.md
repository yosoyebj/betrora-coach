# Room Implementation – LiveKit Cloud

## Overview

Coach-user video/audio sessions are powered by [LiveKit Cloud](https://cloud.livekit.io). When a coach or user opens `/room/[sessionId]`, the app fetches a LiveKit access token from its own API and connects to the LiveKit room. Both participants join the **same room** (room name = `sessionId`) so they can talk in real time.

## Architecture

```
calmoraa (user app)            betrora-coach (coach app)
       │                               │
       ▼                               ▼
GET /api/livekit-token          GET /api/livekit-token
  Validate auth + session         Validate auth + session
  Issue AccessToken (2h)          Issue AccessToken (2h)
       │                               │
       └──────────────┬────────────────┘
                      ▼
             LiveKit Cloud Room
           (roomName = sessionId)
```

## Token API: `/api/livekit-token`

Both apps expose `GET /api/livekit-token?sessionId=<id>`.

- **Auth**: Bearer JWT in `Authorization` header (Supabase user session).
- **Validation**: Checks `coach_sessions` + `coaches` table to confirm the caller is a participant (`user_id` or coach's `user_id`).
- **Returns**: `{ token: string, serverUrl: string }` — the LiveKit JWT and the WebSocket URL.
- Tokens expire in 2 hours.

## Environment Variables

Required in both apps (set in `.env.local` / host env):

```
LIVEKIT_URL=wss://betrora-t3up65ux.livekit.cloud
LIVEKIT_API_KEY=<your key>
LIVEKIT_API_SECRET=<your secret>
```

Get these from [cloud.livekit.io](https://cloud.livekit.io) → project → Settings → API Keys.

**If you see "invalid token" or "could not establish signal connection: invalid token":**  
LiveKit is rejecting the JWT because the signature does not match. Usually the **API Secret** is wrong:

1. In [LiveKit Cloud](https://cloud.livekit.io) go to your project → **Settings** → **Keys**.
2. Copy the **API Key** and **API Secret** again from the **same** key row (do not mix key from one row and secret from another). If you regenerated the key, you must use the new secret.
3. In your app’s `.env.local` set exactly (no quotes, no spaces around `=`):
   - `LIVEKIT_API_KEY=<paste key>`
   - `LIVEKIT_API_SECRET=<paste secret>`
4. Restart the Next.js dev server so it reloads env.

   **Also:** (A) Create a **new** API key in LiveKit Cloud and use that key+secret to rule out mismatch. (B) If your system clock is wrong, JWT validation fails; sync with NTP (e.g. `pool.ntp.org`). In dev the token API returns `_debug.serverTimeUtc` to compare with [time.is/UTC](https://time.is/UTC).

## Frontend Flow

1. **RoomLayout** fetches `/api/livekit-token` with the user's session token.
2. On success, renders `<LiveKitRoom serverUrl={serverUrl} token={token} connect audio video>`.
3. Inside `LiveKitRoom`:
   - **VideoArea**: uses `useTracks` to show remote camera (full view) + local camera (PIP).
   - **RoomAudioRenderer**: automatically plays all remote audio tracks.
   - **Footer controls**: mic/camera toggle via `useLocalParticipant`, disconnect button.
   - **Chat**: uses `useDataChannel('chat')` for ephemeral in-session messages.
4. On disconnect / leave, navigates to `/sessions`.

## Files

| File | Purpose |
|------|---------|
| `src/app/api/livekit-token/route.ts` | Token API – auth + participant check + AccessToken |
| `src/app/room/[sessionId]/components/RoomLayout.tsx` | Main room UI, token fetch, `LiveKitRoom` wrapper |
| `src/app/room/[sessionId]/components/VideoArea.tsx` | Remote + local video using LiveKit track hooks |
