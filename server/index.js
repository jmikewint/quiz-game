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

const questions = [
  { question: "What does HTML stand for?", options: ["HyperText Markup Language", "HighText Machine Language", "HyperText Machine Language", "None"], answer: 0 },
  { question: "Which language runs in the browser?", options: ["Python", "Java", "JavaScript", "C++"], answer: 2 },
  { question: "What does CSS stand for?", options: ["Creative Style Sheets", "Cascading Style Sheets", "Computer Style Sheets", "Colorful Style Sheets"], answer: 1 },
  { question: "What tag creates a hyperlink in HTML?", options: ["<link>", "<a>", "<href>", "<url>"], answer: 1 },
  { question: "Which company created React?", options: ["Google", "Microsoft", "Meta", "Apple"], answer: 2 },
];

const rooms = {};

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join_room", ({ roomCode, username }) => {
    if (!rooms[roomCode]) {
      rooms[roomCode] = { players: [], currentQ: 0, started: false, scores: {}, answers: {} };
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

  socket.on("start_game", ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room) return;
    room.started = true;
    room.currentQ = 0;
    room.answers = {};
    io.to(roomCode).emit("next_question", {
      question: questions[0],
      index: 0,
      total: questions.length
    });
  });

  socket.on("submit_answer", ({ roomCode, answerIndex }) => {
    const room = rooms[roomCode];
    if (!room) return;

    // Record this player's answer
    room.answers[socket.id] = answerIndex;

    const correct = questions[room.currentQ].answer;
    if (answerIndex === correct) room.scores[socket.id] += 100;

    io.to(roomCode).emit("score_update", { scores: room.scores, players: room.players });

    // Only advance when all players have answered
    const totalPlayers = room.players.length;
    const totalAnswers = Object.keys(room.answers).length;

    if (totalAnswers >= totalPlayers) {
      room.currentQ++;
      room.answers = {};

      if (room.currentQ < questions.length) {
        setTimeout(() => {
          io.to(roomCode).emit("next_question", {
            question: questions[room.currentQ],
            index: room.currentQ,
            total: questions.length
          });
        }, 1500);
      } else {
        io.to(roomCode).emit("game_over", { scores: room.scores, players: room.players });
      }
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    // Clean up player from any room they were in
    for (const roomCode in rooms) {
      const room = rooms[roomCode];
      room.players = room.players.filter(p => p.id !== socket.id);
      delete room.scores[socket.id];
      if (room.players.length === 0) {
        delete rooms[roomCode];
      } else {
        io.to(roomCode).emit("room_update", { players: room.players, scores: room.scores });
      }
    }
  });
});

server.listen(3001, () => console.log("Server running on port 3001"));