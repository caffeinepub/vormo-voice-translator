# Vormo Voice Translator - Remote Two-Device Mode

## Current State
Single-device pass-the-phone translator. Hindi ↔ Chinese voice translation, local only. Backend is empty (actor {}).

## Requested Changes (Diff)

### Add
- Motoko backend: room-based session management
  - createRoom() → roomCode (6-char)
  - joinRoom(code) → userId (A or B)
  - postMessage(roomCode, userId, sourceText, translatedText, direction) 
  - getMessages(roomCode, userId, afterTimestamp) → new messages for this user
  - heartbeat(roomCode, userId) to keep session alive
- Remote Mode UI:
  - Landing screen: "Start New Room" or "Join Room" (enter code)
  - Room screen: shows room code to share, connection status (waiting/connected)
  - User A = Hindi speaker, User B = Chinese speaker (auto-assigned)
  - Each user taps their mic button, speech is recognized, translated, posted to backend
  - Both devices poll every 1.5s for new messages; when message arrives for this user, play TTS audio
  - Live transcript shown on both sides
- Keep existing single-device mode as fallback/local option

### Modify
- App.tsx: Add mode selection (Local vs Remote), remote room flow
- backend.d.ts: Updated with new backend interface

### Remove
- "Pass the phone" prompt (in remote mode)

## Implementation Plan
1. Generate Motoko backend with room, message store, polling APIs
2. Update frontend: room creation/join UI, polling hook, remote translation flow, connection status display
