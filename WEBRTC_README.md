# WebRTC Implementation for Coach App

## Overview

This document explains how the coach app connects to WebRTC sessions using the same signaling mechanism as the user app (@calmoraa). Both apps share the same Supabase project and database, allowing coaches and users to join the same meeting rooms.

## Architecture

### Shared Components

Both apps use:
- **Same Supabase project/database** - Shared signaling backend
- **Same room ID format** - `sessionId` from `coach_sessions.id`
- **Same signaling channel** - Supabase Realtime channel: `room:${sessionId}`
- **Same message schema** - Identical offer/answer/ICE candidate payloads
- **Same ICE servers** - `/api/ice-servers` endpoint (Xirsys with STUN fallback)

### Key Differences

- **Domains**: Apps are hosted on different Netlify accounts/domains
- **Auth**: Each app uses its own Supabase auth session (token-based, no shared cookies)
- **Default mode**: Coach app defaults to "viewer mode" (receives only, no local tracks)

## How It Works

### 1. Room Connection

**User App Flow:**
1. User navigates to `/room/[sessionId]`
2. App loads session data and validates access
3. WebRTC hook initializes with `sessionId` and `currentUserId`
4. Connects to Supabase Realtime channel `room:${sessionId}`

**Coach App Flow:**
1. Coach navigates to `/room/[sessionId]` (same route structure)
2. App loads session data and validates coach access
3. WebRTC hook initializes with `sessionId`, `currentUserId`, and `sessionToken`
4. Connects to **the same** Supabase Realtime channel `room:${sessionId}`

### 2. Signaling Mechanism

Both apps use **Supabase Realtime broadcast channels** for WebRTC signaling:

```typescript
// Channel name pattern (identical in both apps)
const channel = supabase.channel(`room:${sessionId}`, {
  config: { broadcast: { self: false } }
});

// Message schema (identical in both apps)
{
  type: 'broadcast',
  event: 'signal',
  payload: {
    type: 'offer' | 'answer' | 'ice-candidate',
    from: userId, // Used to ignore own signals
    offer/answer/candidate: RTCSessionDescriptionInit | RTCIceCandidateInit
  }
}
```

### 3. Initiator Selection

**Deterministic leader election** ensures only one peer creates the offer:

```typescript
// Both apps use the same logic
const sortedIds = [currentUserId, otherUserId].sort();
const isInitiator = sortedIds[0] === currentUserId;
```

- Lower user ID (alphabetically) becomes the initiator
- Initiator creates the SDP offer
- Other peer receives offer and creates answer
- Both exchange ICE candidates via the same channel

### 4. User ID Resolution

**User App:**
- `currentUserId`: From auth context (user's auth user_id)
- `otherUserId`: `session.coach?.user_id` (coach's auth user_id)

**Coach App:**
- `currentUserId`: From auth context (coach's auth user_id)
- `otherUserId`: `session.user_id` (user's auth user_id)

**Critical**: Both apps use `auth.users.id` (not `coaches.id` or other table IDs) for signaling to ensure compatibility.

### 5. Viewer Mode (Coach Default)

By default, the coach app operates in **viewer mode**:
- ✅ Creates peer connection (required for receiving)
- ✅ Subscribes to signaling channel
- ✅ Receives remote audio/video from user
- ❌ Does NOT request local camera/mic (no `getUserMedia`)
- ❌ Does NOT send local tracks

**Enabling Two-Way Communication:**

Coaches can enable their camera/mic later using the `enableLocalMedia()` function:

```typescript
const { enableLocalMedia } = useWebRTC(...);

// When coach wants to enable camera/mic
await enableLocalMedia();
```

This will:
1. Request user media (`getUserMedia`)
2. Add tracks to existing peer connection
3. Create a new offer if coach is the initiator
4. Transition to full two-way mode

## File Structure

```
betrora-coach/src/app/room/[sessionId]/
├── page.tsx              # Room page (loads session, validates access)
├── hooks/
│   └── useWebRTC.ts      # WebRTC hook (signaling, peer connection)
└── components/
    ├── RoomLayout.tsx    # Main layout (video area + controls)
    ├── VideoArea.tsx     # Video display component
    ├── Sidebar.tsx       # Chat/tasks sidebar
    └── ...

betrora-coach/src/app/api/
└── ice-servers/
    └── route.ts          # ICE server configuration endpoint
```

## Environment Variables

Required environment variables (same as user app):

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Optional: Xirsys TURN servers (for better NAT traversal)
# Application is derived from request host (x-forwarded-host / host); no XIRSYS_APPLICATION needed.
XIRSYS_API_KEY=your_xirsys_key
XIRSYS_API_SECRET=your_xirsys_secret
XIRSYS_CHANNEL=default
```

## Authentication & RLS

### Token-Based Auth

The coach app uses **token-based authentication** (no cross-site cookies):

```typescript
// Coach app creates authenticated Supabase client
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
  },
});
```

### Row Level Security (RLS)

Both apps rely on Supabase RLS policies to ensure:
- Users can only access their own sessions
- Coaches can only access sessions where they are assigned
- Signaling channel access is controlled by RLS

**Assumption**: RLS policies are already configured in the shared Supabase project. The WebRTC implementation assumes proper access control at the database level.

## Logging & Debugging

The coach app includes comprehensive logging:

### Connection States
- `connecting` - Establishing peer connection
- `connected` - WebRTC connection established
- `failed` - Connection failed (with retry option)
- `disconnected` - Cleanly disconnected

### Log Messages

All logs are prefixed with `WebRTC:` for easy filtering:

```typescript
// Connection events
console.log('WebRTC: Peer connection created', {...});
console.log('WebRTC: ✅ Peer connection established');
console.error('WebRTC: ❌ Peer connection failed', {...});

// Signaling events
console.log('WebRTC: 📥 Received offer, creating answer');
console.log('WebRTC: 📤 Sent answer');
console.log('WebRTC: 📥 Received ICE candidate', {...});

// State changes
console.log('WebRTC: Connection state changed', {
  connectionState: 'connected',
  signalingState: 'stable',
  iceConnectionState: 'connected',
});
```

### Browser DevTools

To debug WebRTC issues:

1. **Filter logs**: `WebRTC:` in console
2. **Check connection state**: Look for `connectionState` changes
3. **Monitor signaling**: Watch for offer/answer/ICE candidate exchanges
4. **Verify channel subscription**: Should see `SUBSCRIBED` status
5. **Check ICE gathering**: Monitor `iceConnectionState` changes

## Testing

### Local Testing

1. **Start user app** (@calmoraa):
   ```bash
   cd calmoraa
   npm run dev
   ```

2. **Start coach app**:
   ```bash
   cd betrora-coach
   npm run dev
   ```

3. **Test connection**:
   - User opens `/room/[sessionId]` in user app
   - Coach opens `/room/[sessionId]` in coach app (same sessionId)
   - Both should connect and see/hear each other

### Cross-Domain Testing

Since apps are on different domains:
- ✅ Token-based auth works across domains
- ✅ Supabase Realtime works across domains
- ✅ WebRTC peer connection works across domains
- ✅ TURN servers help with NAT traversal

### Common Issues

**Issue**: Coach can't see/hear user
- **Check**: Both apps subscribed to same channel (`room:${sessionId}`)
- **Check**: User IDs are different (not same user logged in both)
- **Check**: RLS policies allow coach access to session
- **Check**: Browser console for WebRTC errors

**Issue**: Connection fails
- **Check**: ICE servers are accessible (`/api/ice-servers`)
- **Check**: TURN servers configured if behind strict NAT
- **Check**: Browser permissions for camera/mic (if two-way enabled)
- **Check**: Network connectivity (firewall, VPN)

**Issue**: Signaling not working
- **Check**: Supabase Realtime is enabled in project
- **Check**: Auth token is valid and not expired
- **Check**: Channel name matches exactly (`room:${sessionId}`)
- **Check**: Message schema matches (type, from, payload structure)

## Compatibility with @calmoraa

The coach app is designed to be **100% compatible** with the user app:

| Feature | User App | Coach App | Status |
|---------|----------|-----------|--------|
| Signaling channel | `room:${sessionId}` | `room:${sessionId}` | ✅ Identical |
| Message schema | `{type, from, offer/answer/candidate}` | `{type, from, offer/answer/candidate}` | ✅ Identical |
| Initiator logic | Sorted user IDs | Sorted user IDs | ✅ Identical |
| ICE servers | `/api/ice-servers` | `/api/ice-servers` | ✅ Identical |
| Auth method | Token-based | Token-based | ✅ Identical |
| Data channel | Chat only | Chat only | ✅ Identical |
| Local media | Always enabled | Viewer mode (optional) | ⚠️ Different (by design) |

## Future Enhancements

Potential improvements:
- [ ] Add UI button to enable/disable viewer mode
- [ ] Add connection quality indicators
- [ ] Add bandwidth adaptation
- [ ] Add screen sharing support
- [ ] Add recording capabilities
- [ ] Add connection retry with exponential backoff

## References

- [WebRTC Specification](https://www.w3.org/TR/webrtc/)
- [Supabase Realtime Documentation](https://supabase.com/docs/guides/realtime)
- [@calmoraa WebRTC Implementation](../calmoraa/app/room/[sessionId]/hooks/useWebRTC.ts)
