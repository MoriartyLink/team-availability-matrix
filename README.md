Team Availability Matrix

A real-time availability and shift tracking tool for distributed teams. Built to provide immediate visibility into team schedules without overhead.

Tech Stack

Framework: React, TypeScript, Vite

Styling: Tailwind CSS

Backend & State: Firebase (Auth, Firestore)

Utilities: date-fns (time manipulation), lucide-react (icons)

Prerequisites

Node.js (v18+)

Firebase project with Firestore and Authentication enabled.

Setup Instructions

Install dependencies:

npm install


Configure environment:
Duplicate the example environment file and inject your Firebase configuration.

cp .env.example .env


Update .env with your specific VITE_FIREBASE_* keys.

Run locally:

npm run dev


Architecture Overview

src/App.tsx: Core UI matrix and state management.

src/lib/firebase.ts: Firebase initialization and auth setup.

src/lib/firebaseService.ts: Firestore read/write operations.

src/types.ts: Strict data models for Shifts, Users, and Team mapping.

Build for Production

Generate an optimized static build:

npm run build


The output will be available in the dist/ directory, ready for standard static hosting or Firebase Hosting.
