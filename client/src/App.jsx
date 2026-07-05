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
  const [waiting, setWaiting] = useState(false);
  const [timeLeft, setTimeLeft] = useState(15);
  const [loading, setLoading] = useState(false);

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
      setWaiting(false);
      setTimeLeft(15);
      setLoading(false);
      setScreen("game");
    });
    socket.on("timer_update", ({ timeLeft }) => setTimeLeft(timeLeft));
    socket.on("score_update", ({ scores, players }) => {
      setScores(scores);
      setPlayers(players);
    });
    socket.on("game_over", ({ scores, players }) => {
      setScores(scores);
      setPlayers(players);
      setScreen("results");
    });
    return () => socket.removeAllListeners();
  }, []);

  function handleJoin() {
    if (!username.trim() || !roomCode.trim()) return;
    const code = roomCode.trim().toUpperCase();
    setRoomCode(code);
    socket.emit("join_room", { roomCode: code, username: username.trim() });
    setIsHost(false);
    setScreen("waiting");
  }

  function handleCreate() {
    if (!username.trim()) return;
    const code = Math.random().toString(36).substring(2, 7).toUpperCase();
    setRoomCode(code);
    socket.emit("join_room", { roomCode: code, username: username.trim() });
    setIsHost(true);
    setScreen("waiting");
  }

  function handleStart() {
    setLoading(true);
    socket.emit("start_game", { roomCode });
  }

  function handleAnswer(i) {
    if (selected !== null || waiting) return;
    setSelected(i);
    setWaiting(true);
    socket.emit("submit_answer", { roomCode, answerIndex: i });
  }

  function getUsername(id) {
    return players.find(p => p.id === id)?.username || id;
  }

  const timerColor = timeLeft > 10 ? "#1D9E75" : timeLeft > 5 ? "#BA7517" : "#D85A30";
  const timerPct = (timeLeft / 15) * 100;
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const medals = ["🥇", "🥈", "🥉"];

  if (screen === "lobby") return (
    <div style={s.page}>
      <div style={s.hero}>
        <div style={s.heroIcon}>⚡</div>
        <h1 style={s.heroTitle}>Quiz Game</h1>
        <p style={s.heroSub}>Real-time multiplayer trivia</p>
      </div>
      <div style={s.card}>
        <p style={s.label}>Your name</p>
        <input
          style={s.input}
          placeholder="Enter your name"
          value={username}
          onChange={e => setUsername(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleJoin()}
        />
        <p style={{...s.label, marginTop:12}}>Room code</p>
        <input
          style={s.input}
          placeholder="e.g. AB12C"
          value={roomCode}
          onChange={e => setRoomCode(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === "Enter" && handleJoin()}
        />
        <button style={s.btnPrimary} onClick={handleJoin}>Join Room</button>
        <div style={s.dividerRow}><div style={s.dividerLine}/><span style={s.dividerText}>or</span><div style={s.dividerLine}/></div>
        <button style={s.btnGreen} onClick={handleCreate}>Create New Room</button>
      </div>
    </div>
  );

  if (screen === "waiting") return (
    <div style={s.page}>
      <div style={s.hero}>
        <div style={s.roomCodeBadge}>{roomCode}</div>
        <p style={s.heroSub}>Share this code with friends to join</p>
      </div>
      <div style={s.card}>
        <p style={s.label}>Players ({players.length})</p>
        {players.map((p, i) => (
          <div key={p.id} style={s.playerRow}>
            <span style={s.playerAvatar}>{p.username[0].toUpperCase()}</span>
            <span style={s.playerName}>{p.username}</span>
            {p.id === socket.id && <span style={s.youBadge}>you</span>}
            {i === 0 && <span style={s.hostBadge}>host</span>}
          </div>
        ))}
        {players.length < 2 && (
          <p style={s.waitingText}>⏳ Waiting for at least one more player...</p>
        )}
      </div>
      {isHost ? (
        <button
          style={{...s.btnPrimary, opacity: loading || players.length < 2 ? 0.6 : 1}}
          onClick={handleStart}
          disabled={loading || players.length < 2}
        >
          {loading ? "Loading questions..." : "Start Game"}
        </button>
      ) : (
        <p style={s.waitingText}>Waiting for the host to start the game...</p>
      )}
    </div>
  );

  if (screen === "game") return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.gameHeader}>
        <span style={s.qCounter}>Q{qIndex + 1}/{qTotal}</span>
        <span style={{...s.timer, color: timerColor}}>{timeLeft}s</span>
      </div>

      {/* Timer bar */}
      <div style={s.timerBarBg}>
        <div style={{...s.timerBarFill, width:`${timerPct}%`, background: timerColor}} />
      </div>

      {/* Question */}
      <div style={s.card}>
        <p style={s.questionText}>{question.question}</p>
        <div style={{marginTop:16}}>
          {question.options.map((opt, i) => {
            let bg = "#F5F5F0", border = "#E0DDD5", color = "#1A1915";
            if (selected !== null) {
              if (i === question.answer) { bg = "#E1F5EE"; border = "#1D9E75"; color = "#085041"; }
              else if (i === selected) { bg = "#FAECE7"; border = "#D85A30"; color = "#993C1D"; }
              else { bg = "#FAFAF8"; color = "#AAA"; }
            }
            return (
              <button key={i} onClick={() => handleAnswer(i)} style={{
                ...s.optionBtn, background: bg, borderColor: border, color,
                cursor: selected !== null ? "default" : "pointer",
                transform: selected === null ? undefined : "none"
              }}>
                <span style={s.optionLetter}>{["A","B","C","D"][i]}</span>
                {opt}
              </button>
            );
          })}
        </div>
        {waiting && <p style={s.waitingText}>Waiting for other players...</p>}
      </div>

      {/* Live scores */}
      <div style={s.card}>
        <p style={s.label}>Live scores</p>
        {sorted.map(([id, score], i) => (
          <div key={id} style={s.scoreRow}>
            <span style={s.medal}>{medals[i] || "🎮"}</span>
            <span style={s.playerName}>{getUsername(id)}</span>
            <span style={s.scoreVal}>{score} pts</span>
          </div>
        ))}
      </div>
    </div>
  );

  if (screen === "results") return (
    <div style={s.page}>
      <div style={s.hero}>
        <div style={s.heroIcon}>🏆</div>
        <h1 style={s.heroTitle}>Game Over!</h1>
        <p style={s.heroSub}>{getUsername(sorted[0]?.[0])} wins!</p>
      </div>
      <div style={s.card}>
        <p style={s.label}>Final scores</p>
        {sorted.map(([id, score], i) => (
          <div key={id} style={{
            ...s.scoreRow,
            background: i === 0 ? "#FFFBEA" : "transparent",
            borderRadius: 8,
            padding: "10px 8px",
            marginBottom: 4
          }}>
            <span style={{...s.medal, fontSize: i === 0 ? 24 : 18}}>{medals[i] || "🎮"}</span>
            <span style={{...s.playerName, fontWeight: i === 0 ? 600 : 400, fontSize: i === 0 ? 16 : 14}}>
              {getUsername(id)}
            </span>
            <span style={{...s.scoreVal, fontSize: i === 0 ? 16 : 14}}>{score} pts</span>
          </div>
        ))}
      </div>
      <button style={s.btnPrimary} onClick={() => window.location.reload()}>Play Again</button>
    </div>
  );
}

const s = {
  page: { minHeight:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"1rem 1rem 2rem", background:"#F7F6F2", fontFamily:"-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
  hero: { textAlign:"center", marginBottom:20 },
  heroIcon: { fontSize:48, marginBottom:8 },
  heroTitle: { fontSize:32, fontWeight:700, color:"#1A1915", margin:0 },
  heroSub: { fontSize:15, color:"#888", marginTop:6 },
  roomCodeBadge: { fontSize:36, fontWeight:700, letterSpacing:6, color:"#378ADD", background:"#E6F1FB", padding:"10px 24px", borderRadius:12, display:"inline-block", marginBottom:10 },
  card: { background:"#fff", border:"1px solid #E8E5DD", borderRadius:16, padding:"1.25rem 1.25rem", width:"100%", maxWidth:440, marginBottom:12, boxShadow:"0 1px 4px rgba(0,0,0,0.06)" },
  label: { fontSize:11, fontWeight:600, letterSpacing:"0.07em", textTransform:"uppercase", color:"#999", marginBottom:8 },
  input: { width:"100%", padding:"11px 14px", borderRadius:10, border:"1.5px solid #E0DDD5", fontSize:15, outline:"none", marginBottom:10, background:"#FAFAF8", boxSizing:"border-box" },
  btnPrimary: { width:"100%", maxWidth:440, padding:"13px 0", borderRadius:12, border:"none", background:"#378ADD", color:"#fff", fontSize:15, fontWeight:600, cursor:"pointer", marginBottom:10 },
  btnGreen: { width:"100%", padding:"13px 0", borderRadius:12, border:"none", background:"#1D9E75", color:"#fff", fontSize:15, fontWeight:600, cursor:"pointer" },
  dividerRow: { display:"flex", alignItems:"center", gap:10, margin:"10px 0" },
  dividerLine: { flex:1, height:1, background:"#E8E5DD" },
  dividerText: { fontSize:13, color:"#BBB" },
  playerRow: { display:"flex", alignItems:"center", gap:10, padding:"8px 0", borderBottom:"1px solid #F0EDE5" },
  playerAvatar: { width:32, height:32, borderRadius:"50%", background:"#E6F1FB", color:"#378ADD", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:600, fontSize:14, flexShrink:0 },
  playerName: { flex:1, fontSize:14, color:"#1A1915" },
  youBadge: { fontSize:11, padding:"2px 8px", borderRadius:20, background:"#E6F1FB", color:"#378ADD", fontWeight:500 },
  hostBadge: { fontSize:11, padding:"2px 8px", borderRadius:20, background:"#EEEDFE", color:"#3C3489", fontWeight:500 },
  waitingText: { fontSize:13, color:"#999", textAlign:"center", marginTop:12, padding:"8px 0" },
  gameHeader: { display:"flex", justifyContent:"space-between", alignItems:"center", width:"100%", maxWidth:440, marginBottom:8 },
  qCounter: { fontSize:13, fontWeight:600, color:"#888", letterSpacing:"0.04em" },
  timer: { fontSize:24, fontWeight:700, transition:"color 0.5s", minWidth:48, textAlign:"right" },
  timerBarBg: { width:"100%", maxWidth:440, height:6, background:"#E8E5DD", borderRadius:99, marginBottom:14, overflow:"hidden" },
  timerBarFill: { height:"100%", borderRadius:99, transition:"width 1s linear, background 0.5s" },
  questionText: { fontSize:17, fontWeight:500, color:"#1A1915", lineHeight:1.5 },
  optionBtn: { display:"flex", alignItems:"center", gap:12, width:"100%", textAlign:"left", padding:"11px 14px", borderRadius:10, border:"1.5px solid", marginBottom:8, fontSize:14, transition:"all 0.2s", background:"#F5F5F0" },
  optionLetter: { width:24, height:24, borderRadius:"50%", background:"rgba(0,0,0,0.06)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:600, flexShrink:0 },
  scoreRow: { display:"flex", alignItems:"center", gap:10, padding:"6px 0", borderBottom:"1px solid #F0EDE5" },
  medal: { fontSize:18, flexShrink:0 },
  scoreVal: { fontWeight:600, color:"#1A1915", marginLeft:"auto" },
};