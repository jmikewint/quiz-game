const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "http://localhost:5173", methods: ["GET", "POST"] }
});

const QUESTION_TIME = 20;
const VOTE_TIME = 12;

const CATEGORIES = [
  { id: "", label: "🎲 Any" },
  { id: "9",  label: "🧠 General" },
  { id: "17", label: "🔬 Science" },
  { id: "23", label: "📜 History" },
  { id: "27", label: "🐾 Animals" },
  { id: "21", label: "⚽ Sports" },
  { id: "11", label: "🎬 Film" },
  { id: "12", label: "🎵 Music" },
  { id: "15", label: "🎮 Games" },
];

const rooms = {};

function decode(str) {
  return str
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'")
    .replace(/&ldquo;/g, "\u201C").replace(/&rdquo;/g, "\u201D");
}

function shuffle(arr) {
  return arr.map(v => ({ v, sort: Math.random() })).sort((a, b) => a.sort - b.sort).map(({ v }) => v);
}

async function fetchQuestions(categoryId) {
  try {
    const url = `https://opentdb.com/api.php?amount=8&type=multiple${categoryId ? `&category=${categoryId}` : ""}`;
    const res = await fetch(url);
    const data = await res.json();
    return data.results.map(q => {
      const correct = decode(q.correct_answer);
      const allOptions = shuffle([correct, ...q.incorrect_answers.map(decode)]);
      return {
        question: decode(q.question),
        options: allOptions,
        answer: allOptions.indexOf(correct),
        category: decode(q.category),
        difficulty: q.difficulty
      };
    });
  } catch (err) {
    console.error("API failed:", err.message);
    return [
      { question: "What is the capital of France?", options: ["Berlin", "Madrid", "Paris", "Rome"], answer: 2, category: "Geography", difficulty: "easy" },
      { question: "Which planet is closest to the sun?", options: ["Venus", "Mercury", "Earth", "Mars"], answer: 1, category: "Science", difficulty: "easy" },
      { question: "How many sides does a hexagon have?", options: ["5", "7", "8", "6"], answer: 3, category: "Math", difficulty: "easy" },
      { question: "What is H2O commonly known as?", options: ["Salt", "Sugar", "Water", "Oxygen"], answer: 2, category: "Science", difficulty: "easy" },
    ];
  }
}

function getRoom(roomCode) { return rooms[roomCode]; }

function broadcastRoom(roomCode) {
  const room = getRoom(roomCode);
  if (!room) return;
  io.to(roomCode).emit("room_update", {
    players: room.players,
    scores: room.scores,
    streaks: room.streaks,
  });
}

function startVotingPhase(roomCode) {
  const room = getRoom(roomCode);
  if (!room) return;

  room.phase = "voting";
  room.votes = {};
  room.voteTimeLeft = VOTE_TIME;

  io.to(roomCode).emit("voting_start", {
    players: room.players,
    scores: room.scores,
    correctAnswer: room.questions[room.currentQ].answer,
    answers: room.roundAnswers,
    timeLeft: VOTE_TIME,
  });

  room.voteTimer = setInterval(() => {
    room.voteTimeLeft--;
    io.to(roomCode).emit("vote_timer", { timeLeft: room.voteTimeLeft });
    if (room.voteTimeLeft <= 0) {
      clearInterval(room.voteTimer);
      resolveVotes(roomCode);
    }
  }, 1000);
}

function resolveVotes(roomCode) {
  const room = getRoom(roomCode);
  if (!room) return;
  clearInterval(room.voteTimer);

  const voteCounts = {};
  room.players.forEach(p => { voteCounts[p.id] = 0; });
  Object.values(room.votes).forEach(targetId => {
    if (voteCounts[targetId] !== undefined) voteCounts[targetId]++;
  });

  // Most voted player loses — ties go to nobody (saboteur escapes)
  const sorted = Object.entries(voteCounts).sort((a, b) => b[1] - a[1]);
  const topVotes = sorted[0]?.[1] || 0;
  const topCandidates = sorted.filter(([_, v]) => v === topVotes);

  // Saboteur caught only if they alone have the most votes and at least 1 vote was cast
  const saboteurCaught =
    topVotes > 0 &&
    topCandidates.length === 1 &&
    topCandidates[0][0] === room.saboteurId;

  if (saboteurCaught) {
    room.saboteurCaughtCount = (room.saboteurCaughtCount || 0) + 1;
    room.scores[room.saboteurId] = Math.max(0, (room.scores[room.saboteurId] || 0) - 150);
    room.players.forEach(p => {
      if (p.id !== room.saboteurId && room.votes[p.id] === room.saboteurId) {
        room.scores[p.id] = (room.scores[p.id] || 0) + 75;
      }
    });
  } else {
    room.scores[room.saboteurId] = (room.scores[room.saboteurId] || 0) + 100;
  }

  const mostVoted = topCandidates.length === 1 ? topCandidates[0][0] : null;

  io.to(roomCode).emit("vote_result", {
    saboteurId: room.saboteurId,
    saboteurCaught,
    mostVoted,
    voteCounts,
    scores: room.scores,
    players: room.players,
  });

  setTimeout(() => advanceQuestion(roomCode), 3000);
}
function startQuestionTimer(roomCode) {
  const room = getRoom(roomCode);
  if (!room) return;
  room.timeLeft = QUESTION_TIME;
  room.phase = "question";
  io.to(roomCode).emit("timer_update", { timeLeft: room.timeLeft });

  room.timer = setInterval(() => {
    room.timeLeft--;
    io.to(roomCode).emit("timer_update", { timeLeft: room.timeLeft });
    if (room.timeLeft <= 0) {
      clearInterval(room.timer);
      startVotingPhase(roomCode);
    }
  }, 1000);
}

function advanceQuestion(roomCode) {
  const room = getRoom(roomCode);
  if (!room) return;
  room.currentQ++;
  room.roundAnswers = {};
  room.hint = null;

  // Pick new saboteur each round
  const idx = Math.floor(Math.random() * room.players.length);
  room.saboteurId = room.players[idx]?.id;

  if (room.currentQ < room.questions.length) {
    room.players.forEach(p => {
      const isSaboteur = p.id === room.saboteurId;
      io.to(p.id).emit("next_question", {
        question: room.questions[room.currentQ],
        index: room.currentQ,
        total: room.questions.length,
        isSaboteur,
        correctAnswer: isSaboteur ? room.questions[room.currentQ].answer : null,
      });
    });
    startQuestionTimer(roomCode);
  } else {
    // Game over
    const saboteurWins =
      (room.saboteurCaughtCount || 0) < Math.floor(room.questions.length / 2);
    io.to(roomCode).emit("game_over", {
      scores: room.scores,
      players: room.players,
      streaks: room.streaks,
      saboteurId: room.saboteurId,
    });
  }
}

io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

  socket.on("join_room", ({ roomCode, username }) => {
    if (!rooms[roomCode]) {
      rooms[roomCode] = {
        players: [], currentQ: -1, started: false,
        scores: {}, streaks: {}, questions: [],
        roundAnswers: {}, votes: {}, hint: null,
        saboteurId: null, phase: "lobby",
        saboteurCaughtCount: 0,
      };
    }
    const room = rooms[roomCode];
    if (!room.players.find(p => p.id === socket.id)) {
      room.players.push({ id: socket.id, username });
      room.scores[socket.id] = 0;
      room.streaks[socket.id] = 0;
    }
    socket.join(roomCode);
    broadcastRoom(roomCode);
  });

  socket.on("start_game", async ({ roomCode, categoryId }) => {
    const room = rooms[roomCode];
    if (!room) return;
    room.questions = await fetchQuestions(categoryId);
    room.started = true;
    room.currentQ = 0;
    room.roundAnswers = {};
    room.saboteurCaughtCount = 0;

    // Pick first saboteur
    const idx = Math.floor(Math.random() * room.players.length);
    room.saboteurId = room.players[idx]?.id;

    // Send question individually so saboteur gets extra info
    room.players.forEach(p => {
      const isSaboteur = p.id === room.saboteurId;
      io.to(p.id).emit("next_question", {
        question: room.questions[0],
        index: 0,
        total: room.questions.length,
        isSaboteur,
        correctAnswer: isSaboteur ? room.questions[0].answer : null,
      });
    });
    startQuestionTimer(roomCode);
  });

  socket.on("submit_answer", ({ roomCode, answerIndex }) => {
    const room = rooms[roomCode];
    if (!room || room.roundAnswers[socket.id] !== undefined) return;
    room.roundAnswers[socket.id] = answerIndex;

    const correct = room.questions[room.currentQ].answer;
    const isCorrect = answerIndex === correct;

    if (isCorrect) {
      room.streaks[socket.id] = (room.streaks[socket.id] || 0) + 1;
      const streakBonus = Math.min(room.streaks[socket.id] - 1, 5) * 30;
      room.scores[socket.id] += 100 + streakBonus;
    } else {
      room.streaks[socket.id] = 0;
    }

    // Tell everyone someone answered (not what they picked)
    io.to(roomCode).emit("player_answered", {
      playerId: socket.id,
      totalAnswered: Object.keys(room.roundAnswers).length,
      totalPlayers: room.players.length,
    });

    broadcastRoom(roomCode);

    if (Object.keys(room.roundAnswers).length >= room.players.length) {
      clearInterval(room.timer);
      startVotingPhase(roomCode);
    }
  });

  socket.on("send_hint", ({ roomCode, hint }) => {
    const room = rooms[roomCode];
    if (!room || room.saboteurId !== socket.id) return;
    room.hint = hint;
    const username = room.players.find(p => p.id === socket.id)?.username;
    io.to(roomCode).emit("hint_received", { hint, username });
  });

  socket.on("submit_vote", ({ roomCode, targetId }) => {
    const room = rooms[roomCode];
    if (!room || room.votes[socket.id]) return;
    room.votes[socket.id] = targetId;

    io.to(roomCode).emit("vote_update", {
      votedCount: Object.keys(room.votes).length,
      totalPlayers: room.players.length,
    });

    if (Object.keys(room.votes).length >= room.players.length) {
      clearInterval(room.voteTimer);
      resolveVotes(roomCode);
    }
  });

  socket.on("send_reaction", ({ roomCode, emoji }) => {
    const room = rooms[roomCode];
    if (!room) return;
    const username = room.players.find(p => p.id === socket.id)?.username;
    io.to(roomCode).emit("player_reaction", { playerId: socket.id, emoji, username });
  });

  socket.on("disconnect", () => {
    for (const roomCode in rooms) {
      const room = rooms[roomCode];
      room.players = room.players.filter(p => p.id !== socket.id);
      delete room.scores[socket.id];
      if (room.players.length === 0) {
        clearInterval(room.timer);
        clearInterval(room.voteTimer);
        delete rooms[roomCode];
      } else {
        broadcastRoom(roomCode);
      }
    }
  });
});

server.listen(3001, () => console.log("Server running on port 3001"));