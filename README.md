```markdown
# moriartylink/team-availability-matrix

Real-time availability and shift tracking for distributed teams. Immediate visibility. Zero overhead.

## Tech Stack

* **Core:** React, TypeScript, Vite
* **UI:** Tailwind CSS, lucide-react
* **Backend:** Firebase (Auth, Firestore)
* **Utils:** date-fns

## Prerequisites

* Node.js (v18+)
* Firebase project (Firestore & Auth enabled)

## Setup

1. **Install dependencies:**
```bash
npm install
```

2. **Configure environment:**
```bash
cp .env.example .env
```
*Inject your `VITE_FIREBASE_*` keys into `.env`.*

3. **Run locally:**
```bash
npm run dev
```

## Architecture

* `src/App.tsx`: Core UI matrix and state management.
* `src/lib/firebase.ts`: Firebase initialization and Auth setup.
* `src/lib/firebaseService.ts`: Firestore read/write operations.
* `src/types.ts`: Strict data models for Shifts, Users, and Team mapping.

## Production Build
```bash
npm run build
```
*Output generated in `dist/`. Ready for static or Firebase Hosting.*
```
