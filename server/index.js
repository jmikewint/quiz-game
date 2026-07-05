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

const QUESTION_TIME = 15;
const rooms = {};

const CATEGORIES = {
  "9":  "General Knowledge",
  "17": "Science & Nature",
  "23": "History",
  "27": "Animals",
  "21": "Sports",
  "11": "Film",
  "12": "Music",
  "15": "Video Games",
};

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
    const url = `https://opentdb.com/api.php?amount=10&type=multiple${categoryId ? `&category=${categoryId}` : ""}`;
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
    console.error("API failed, using fallback:", err.message);
    return [
      { question: "What does HTML stand for?", options: ["HyperText Markup Language", "HighText Machine Language", "HyperText Machine Language", "None"], answer: 0, category: "Technology", difficulty: "easy" },
      { question: "Which language runs in the browser?", options: ["Python", "Java", "JavaScript", "C++"], answer: 2, category: "Technology", difficulty: "easy" },
      { question: "What does CSS stand for?", options: ["Creative Style Sheets", "Cascading Style Sheets", "Computer Style Sheets", "Colorful Style Sheets"], answer: 1, category: "Technology", difficulty: "easy" },
    ];
  }
}

function startQuestionTimer(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;
  let timeLeft = QUESTION_TIME;
  io.to(roomCode).emit("timer_update", { timeLeft });
  room.timer = setInterval(() => {
    timeLeft--;
    io.to(roomCode).emit("timer_update", { timeLeft });
    if (timeLeft <= 0) {
      clearInterval(room.timer);
      advanceQuestion(roomCode);
    }
  }, 1000);
}

function advanceQuestion(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;
  room.currentQ++;
  room.answers = {};
  if (room.currentQ < room.questions.length) {
    setTimeout(() => {
      io.to(roomCode).emit("next_question", {
        question: room.questions[room.currentQ],
        index: room.currentQ,
        total: room.questions.length
      });
      startQuestionTimer(roomCode);
    }, 2000);
  } else {
    io.to(roomCode).emit("game_over", { scores: room.scores, players: room.players, streaks: room.streaks });
  }
}

io.on("connection", (socket) => {
  console.log("Connected:", socket.id);

  socket.on("join_room", ({ roomCode, username }) => {
    if (!rooms[roomCode]) {
      rooms[roomCode] = {
        players: [], currentQ: 0, started: false,
        scores: {}, answers: {}, questions: [], streaks: {},
        powerups: {}, reactions: {}
      };
    }
    const room = rooms[roomCode];
    if (!room.players.find(p => p.id === socket.id)) {
      room.players.push({ id: socket.id, username });
      room.scores[socket.id] = 0;
      room.streaks[socket.id] = 0;
      room.powerups[socket.id] = { fiftyFifty: 1, extraTime: 1, steal: 1 };
    }
    socket.join(roomCode);
    io.to(roomCode).emit("room_update", { players: room.players, scores: room.scores, powerups: room.powerups });
    console.log(`${username} joined ${roomCode}`);
  });

  socket.on("start_game", async ({ roomCode, categoryId }) => {
    const room = rooms[roomCode];
    if (!room) return;
    console.log(`Fetching questions for category: ${categoryId || "any"}`);
    room.questions = await fetchQuestions(categoryId);
    room.started = true;
    room.currentQ = 0;
    room.answers = {};
    io.to(roomCode).emit("next_question", {
      question: room.questions[0],
      index: 0,
      total: room.questions.length
    });
    startQuestionTimer(roomCode);
  });

  socket.on("submit_answer", ({ roomCode, answerIndex }) => {
    const room = rooms[roomCode];
    if (!room || room.answers[socket.id] !== undefined) return;
    room.answers[socket.id] = answerIndex;
    const correct = room.questions[room.currentQ].answer;
    const isCorrect = answerIndex === correct;

    if (isCorrect) {
      room.streaks[socket.id] = (room.streaks[socket.id] || 0) + 1;
      const streakBonus = Math.min(room.streaks[socket.id] - 1, 5) * 50;
      room.scores[socket.id] += 100 + streakBonus;
    } else {
      room.streaks[socket.id] = 0;
    }

    io.to(roomCode).emit("score_update", {
      scores: room.scores,
      players: room.players,
      streaks: room.streaks,
      lastAnswer: { playerId: socket.id, correct: isCorrect }
    });

    if (Object.keys(room.answers).length >= room.players.length) {
      clearInterval(room.timer);
      advanceQuestion(roomCode);
    }
  });

  // Power-up: 50/50 — eliminate two wrong answers
  socket.on("powerup_fifty", ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room || !room.powerups[socket.id]?.fiftyFifty) return;
    room.powerups[socket.id].fiftyFifty = 0;
    const q = room.questions[room.currentQ];
    const wrongIndexes = q.options.map((_, i) => i).filter(i => i !== q.answer);
    const toHide = shuffle(wrongIndexes).slice(0, 2);
    socket.emit("powerup_fifty_result", { hideIndexes: toHide });
    io.to(roomCode).emit("room_update", { players: room.players, scores: room.scores, powerups: room.powerups });
  });

  // Power-up: extra time — add 10s to the timer for everyone
  socket.on("powerup_time", ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room || !room.powerups[socket.id]?.extraTime) return;
    room.powerups[socket.id].extraTime = 0;
    io.to(roomCode).emit("powerup_time_result", { addSeconds: 10, usedBy: socket.id });
    io.to(roomCode).emit("room_update", { players: room.players, scores: room.scores, powerups: room.powerups });
  });

  // Power-up: steal — take 50 pts from the leader
  socket.on("powerup_steal", ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room || !room.powerups[socket.id]?.steal) return;
    room.powerups[socket.id].steal = 0;
    const sorted = Object.entries(room.scores).sort((a, b) => b[1] - a[1]);
    const leader = sorted.find(([id]) => id !== socket.id);
    if (leader) {
      room.scores[leader[0]] = Math.max(0, room.scores[leader[0]] - 50);
      room.scores[socket.id] += 50;
      io.to(roomCode).emit("powerup_steal_result", {
        stealerId: socket.id,
        victimId: leader[0],
        scores: room.scores
      });
    }
    io.to(roomCode).emit("room_update", { players: room.players, scores: room.scores, powerups: room.powerups });
  });

  // Player reaction
  socket.on("send_reaction", ({ roomCode, emoji }) => {
    const room = rooms[roomCode];
    if (!room) return;
    io.to(roomCode).emit("player_reaction", { playerId: socket.id, emoji });
  });

  socket.on("disconnect", () => {
    for (const roomCode in rooms) {
      const room = rooms[roomCode];
      room.players = room.players.filter(p => p.id !== socket.id);
      delete room.scores[socket.id];
      if (room.players.length === 0) {
        clearInterval(room.timer);
        delete rooms[roomCode];
      } else {
        io.to(roomCode).emit("room_update", { players: room.players, scores: room.scores, powerups: room.powerups });
      }
    }
  });
});

server.listen(3001, () => console.log("Server running on port 3001"));