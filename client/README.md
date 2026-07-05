# ⚡ Quiz Game

A real-time multiplayer trivia game where players join a room, answer questions together, and compete on a live leaderboard.

## Demo

> Add a screenshot or screen recording here once deployed

## Features

- Create or join a room with a shareable code
- Real-time multiplayer powered by WebSockets
- Live questions fetched from the Open Trivia DB API
- 15-second countdown timer per question with auto-advance
- Live leaderboard that updates as players answer
- Automatic fallback questions if the API is unavailable

## Tech stack

- **Frontend:** React, Vite, Socket.io-client
- **Backend:** Node.js, Express, Socket.io
- **API:** Open Trivia Database (opentdb.com)

## Getting started

### Prerequisites
- Node.js v18+
- npm

### Installation

1. Clone the repo
```bash
   git clone https://github.com/YOUR-USERNAME/quiz-game.git
   cd quiz-game
```

2. Install server dependencies
```bash
   cd server && npm install
```

3. Install client dependencies
```bash
   cd ../client && npm install
```

### Running locally

Open two terminals:

```bash
# Terminal 1 — backend
cd server && node index.js

# Terminal 2 — frontend
cd client && npm run dev
```

Then open `http://localhost:5173` in two browser tabs to play.

## How to play

1. Enter your name and click **Create Room**
2. Share the room code with a friend
3. Friend enters the code and clicks **Join Room**
4. Host clicks **Start Game**
5. Answer each question before the timer runs out
6. Highest score after all questions wins 🏆

## Roadmap

- [ ] Question categories and difficulty selection
- [ ] Timer-based bonus points for faster answers
- [ ] Persistent leaderboard across sessions
- [ ] Mobile app version