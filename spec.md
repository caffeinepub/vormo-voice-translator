# Vormo Voice Translator

## Current State
App has had repeated backend compilation errors preventing deployment. Remote mode room creation fails.

## Requested Changes (Diff)

### Add
- Clean Motoko backend with room creation, joining, and message polling
- Two-phone remote mode: User A creates room, User B joins with same code
- Speech recognition per user (Hindi or Chinese)
- Translation via MyMemory API
- TTS playback of received translation

### Modify
- Complete rewrite of backend to be minimal and error-free
- Complete rewrite of frontend to be clean and simple

### Remove
- All previous broken backend code
- Local/pass-the-phone mode complexity

## Implementation Plan
1. Motoko backend: createRoom, joinRoom, sendMessage, getMessages - simple stable data structures
2. React frontend: room code input, create/join, Hindi/Chinese speak buttons, translation display, TTS playback, polling for partner messages
