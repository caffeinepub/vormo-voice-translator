# Vocal Sound Guide A-Z -- Riyaz Feature

## Current State
The app shows A-Z vocal lessons with Student/Teacher text panels and song examples. Backend stores translation messages for polling. No audio recording or interactive practice exists.

## Requested Changes (Diff)

### Add
- **Riyaz (Practice) section** on each lesson card:
  - Student mic button: student records a short singing clip using MediaRecorder API
  - After student records, a "Play" button appears so student can hear themselves
  - Teacher "Riyaz" button: teacher listens to student's recording, then records their own corrected/demonstrated version
  - Teacher's recording is stored in Motoko backend (as base64 audio) keyed by letter
  - Student can play Teacher's Riyaz response
- **Backend**: store teacher riyaz recordings per letter (base64 audio blob, short clips only)
- Two roles: Student mode and Teacher mode (simple toggle or login-free, just a mode selector at top)

### Modify
- Lesson cards: add Riyaz section below existing content
- Backend: add storeRiyaz and getRiyaz functions

### Remove
- Nothing removed

## Implementation Plan
1. Update Motoko backend: add `storeRiyaz(letter, audioBase64)` and `getRiyaz(letter)` functions
2. Add mode toggle (Student / Teacher) at top of app
3. On each lesson card, add Riyaz panel:
   - Student mode: "Sing" mic button -> records 5-10 sec via MediaRecorder -> play back own recording -> send to teacher (store with letter+timestamp)
   - Teacher mode: see student's latest recording -> play it -> record own Riyaz -> save to backend
   - Student mode: "Hear Teacher Riyaz" button -> fetches and plays teacher's recording for that letter
4. Use MediaRecorder API for recording, convert to base64 for storage
