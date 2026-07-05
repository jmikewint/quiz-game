import { useEffect, useState } from "react";
import { io } from "socket.io-client";

const socket = io("http://localhost:3001");

export default function App() {
  const [screen, setScreen] = useState("lobby");
  const [username, setUsername] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [players, setPlayers] = useState([]);
  const [scores, setScores] = useState({});
  const [question, setQuestion] = useState(null);
  const [qIndex, setQIndex] = useState(0);
  const [qTotal, setQTotal] = useState(0);
  const [selected, setSelected] = useState(null);
  const [isHost, setIsHost] = useState(false);

  useEffect(() => {
    socket.on("room_update", ({ players, scores }) => {
      setPlayers(players);
      setScores(scores);
    });
    socket.on("next_question", ({ question, index, total }) => {
      setQuestion(question);
      setQIndex(index);
      setQTotal(total);
      setSelected(null);
      setScreen("game");
    });
    socket.on("score_update", ({ scores }) => setScores(scores));
    socket.on("game_over", ({ scores, players }) => {
      setScores(scores);
      setPlayers(players);
      setScreen("results");
    });
    return () => socket.removeAllListeners();
  }, []);

  function handleJoin() {
    if (!username.trim() || !roomCode.trim()) return;
    socket.emit("join_room", { roomCode, username });
    setIsHost(false);
    setScreen("waiting");
  }

  function handleCreate() {
    if (!username.trim()) return;
    const code = Math.random().toString(36).substring(2, 7).toUpperCase();
    setRoomCode(code);
    socket.emit("join_room", { roomCode: code, username });
    setIsHost(true);
    setScreen("waiting");
  }

  function handleStart() {
    socket.emit("start_game", { roomCode });
  }

  function handleAnswer(i) {
    if (selected !== null) return;
    setSelected(i);
    socket.emit("submit_answer", { roomCode, answerIndex: i });
  }

  function getUsername(id) {
    return players.find(p => p.id === id)?.username || id;
  }

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);

  if (screen === "lobby") return (
    <div style={styles.center}>
      <h1 style={styles.title}>⚡ Quiz Game</h1>
      <input style={styles.input} placeholder="Your name" value={username} onChange={e => setUsername(e.target.value)} />
      <input style={styles.input} placeholder="Room code (to join)" value={roomCode} onChange={e => setRoomCode(e.target.value.toUpperCase())} />
      <button style={styles.btn} onClick={handleJoin}>Join Room</button>
      <div style={styles.divider}>or</div>
      <button style={{...styles.btn, background:"#1D9E75"}} onClick={handleCreate}>Create Room</button>
    </div>
  );

  if (screen === "waiting") return (
    <div style={styles.center}>
      <h2 style={styles.title}>Room: <span style={{color:"#378ADD"}}>{roomCode}</span></h2>
      <p style={{color:"#888", marginBottom:16}}>Share this code with friends</p>
      <div style={styles.card}>
        <p style={styles.sectionLabel}>Players in room</p>
        {players.map(p => <div key={p.id} style={styles.playerRow}>👤 {p.username}</div>)}
      </div>
      {isHost && <button style={{...styles.btn, marginTop:20}} onClick={handleStart}>Start Game</button>}
      {!isHost && <p style={{color:"#888", marginTop:16}}>Waiting for host to start...</p>}
    </div>
  );

  if (screen === "game") return (
    <div style={styles.center}>
      <p style={styles.sectionLabel}>Question {qIndex + 1} of {qTotal}</p>
      <div style={styles.card}>
        <h2 style={{fontSize:18, marginBottom:20}}>{question.question}</h2>
        {question.options.map((opt, i) => (
          <button key={i} onClick={() => handleAnswer(i)} style={{
            ...styles.optionBtn,
            background: selected === null ? "#F5F5F0"
              : i === question.answer ? "#E1F5EE"
              : selected === i ? "#FAECE7" : "#F5F5F0",
            borderColor: selected === null ? "#E0DDD5"
              : i === question.answer ? "#1D9E75"
              : selected === i ? "#D85A30" : "#E0DDD5",
            cursor: selected !== null ? "default" : "pointer"
          }}>{opt}</button>
        ))}
      </div>
      <div style={styles.card}>
        <p style={styles.sectionLabel}>Live scores</p>
        {sorted.map(([id, score]) => (
          <div key={id} style={styles.playerRow}>
            <span>🏅 {getUsername(id)}</span>
            <span style={{fontWeight:500}}>{score} pts</span>
          </div>
        ))}
      </div>
    </div>
  );

  if (screen === "results") return (
    <div style={styles.center}>
      <h1 style={styles.title}>🏆 Game Over!</h1>
      <div style={styles.card}>
        {sorted.map(([id, score], i) => (
          <div key={id} style={{...styles.playerRow, fontSize: i === 0 ? 18 : 14}}>
            <span>{i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"} {getUsername(id)}</span>
            <span style={{fontWeight:500}}>{score} pts</span>
          </div>
        ))}
      </div>
      <button style={{...styles.btn, marginTop:20}} onClick={() => window.location.reload()}>Play Again</button>
    </div>
  );
}

const styles = {
  center: { minHeight:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"1rem", background:"#FAFAF8", fontFamily:"sans-serif" },
  title: { fontSize:28, fontWeight:600, marginBottom:20 },
  input: { width:260, padding:"10px 14px", borderRadius:8, border:"1px solid #D0CEC6", marginBottom:10, fontSize:15, outline:"none" },
  btn: { width:260, padding:"11px 0", borderRadius:8, border:"none", background:"#378ADD", color:"#fff", fontSize:15, fontWeight:500, cursor:"pointer" },
  divider: { color:"#AAA", margin:"10px 0" },
  card: { background:"#fff", border:"1px solid #E0DDD5", borderRadius:12, padding:"1.25rem", width:"100%", maxWidth:420, marginBottom:12 },
  sectionLabel: { fontSize:11, fontWeight:500, letterSpacing:"0.06em", textTransform:"uppercase", color:"#999", marginBottom:10 },
  playerRow: { display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom:"1px solid #F0EDE5", fontSize:14 },
  optionBtn: { display:"block", width:"100%", textAlign:"left", padding:"10px 14px", borderRadius:8, border:"1.5px solid", marginBottom:8, fontSize:14, transition:"background 0.2s" }
};