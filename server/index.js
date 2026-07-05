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

// Decode HTML entities that the API returns (e.g. &amp; → &)
function decode(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&ldquo;/g, "\u201C")
    .replace(/&rdquo;/g, "\u201D");
}

function shuffle(arr) {
  return arr
    .map(v => ({ v, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ v }) => v);
}

async function fetchQuestions() {
  try {
    const res = await fetch("https://opentdb.com/api.php?amount=10&type=multiple");
    const data = await res.json();
    return data.results.map(q => {
      const correct = decode(q.correct_answer);
      const allOptions = shuffle([correct, ...q.incorrect_answers.map(decode)]);
      return {
        question: decode(q.question),
        options: allOptions,
        answer: allOptions.indexOf(correct)
      };
    });
  } catch (err) {
    console.error("Failed to fetch questions, using fallback:", err.message);
    // Fallback in case the API is down
    return [
      { question: "What does HTML stand for?", options: ["HyperText Markup Language", "HighText Machine Language", "HyperText Machine Language", "None"], answer: 0 },
      { question: "Which language runs in the browser?", options: ["Python", "Java", "JavaScript", "C++"], answer: 2 },
      { question: "What does CSS stand for?", options: ["Creative Style Sheets", "Cascading Style Sheets", "Computer Style Sheets", "Colorful Style Sheets"], answer: 1 },
      { question: "What tag creates a hyperlink in HTML?", options: ["<link>", "<a>", "<href>", "<url>"], answer: 1 },
      { question: "Which company created React?", options: ["Google", "Microsoft", "Meta", "Apple"], answer: 2 },
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
        }, 1500);
      } else {
        io.to(roomCode).emit("game_over", { scores: room.scores, players: room.players });
      }
    }
  }, 1000);
}

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join_room", ({ roomCode, username }) => {
    if (!rooms[roomCode]) {
      rooms[roomCode] = { players: [], currentQ: 0, started: false, scores: {}, answers: {}, questions: [] };
    }
    const room = rooms[roomCode];
    const existing = room.players.find(p => p.id === socket.id);
    if (!existing) {
      room.players.push({ id: socket.id, username });
      room.scores[socket.id] = 0;
    }
    socket.join(roomCode);
    io.to(roomCode).emit("room_update", { players: room.players, scores: room.scores });
    console.log(`${username} joined room ${roomCode}`);
  });

  socket.on("start_game", async ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room) return;

    console.log("Fetching questions from API...");
    room.questions = await fetchQuestions();
    console.log(`Got ${room.questions.length} questions`);

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
    if (!room) return;

    room.answers[socket.id] = answerIndex;
    const correct = room.questions[room.currentQ].answer;
    if (answerIndex === correct) room.scores[socket.id] += 100;

    io.to(roomCode).emit("score_update", { scores: room.scores, players: room.players });

    const totalPlayers = room.players.length;
    const totalAnswers = Object.keys(room.answers).length;

    if (totalAnswers >= totalPlayers) {
      clearInterval(room.timer);
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
        }, 1500);
      } else {
        io.to(roomCode).emit("game_over", { scores: room.scores, players: room.players });
      }
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    for (const roomCode in rooms) {
      const room = rooms[roomCode];
      room.players = room.players.filter(p => p.id !== socket.id);
      delete room.scores[socket.id];
      if (room.players.length === 0) {
        clearInterval(room.timer);
        delete rooms[roomCode];
      } else {
        io.to(roomCode).emit("room_update", { players: room.players, scores: room.scores });
      }
    }
  });
});

server.listen(3001, () => console.log("Server running on port 3001"));