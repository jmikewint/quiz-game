import { useEffect, useState, useRef } from "react";
import { io } from "socket.io-client";

const socket = io("http://localhost:3001");

const CATEGORIES = [
  { id: "", label: "🎲 Any category" },
  { id: "9",  label: "🧠 General Knowledge" },
  { id: "17", label: "🔬 Science & Nature" },
  { id: "23", label: "📜 History" },
  { id: "27", label: "🐾 Animals" },
  { id: "21", label: "⚽ Sports" },
  { id: "11", label: "🎬 Film" },
  { id: "12", label: "🎵 Music" },
  { id: "15", label: "🎮 Video Games" },
];

const REACTION_EMOJIS = ["🔥", "😭", "👏", "😮", "💀", "🤯"];

export default function App() {
  const [screen, setScreen] = useState("lobby");
  const [username, setUsername] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [players, setPlayers] = useState([]);
  const [scores, setScores] = useState({});
  const [streaks, setStreaks] = useState({});
  const [powerups, setPowerups] = useState({});
  const [question, setQuestion] = useState(null);
  const [qIndex, setQIndex] = useState(0);
  const [qTotal, setQTotal] = useState(0);
  const [selected, setSelected] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [timeLeft, setTimeLeft] = useState(15);
  const [loading, setLoading] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [hiddenOptions, setHiddenOptions] = useState([]);
  const [reactions, setReactions] = useState([]);
  const [toast, setToast] = useState(null);
  const [lastCorrect, setLastCorrect] = useState(null);
  const timerRef = useRef(15);

  useEffect(() => {
    socket.on("room_update", ({ players, scores, powerups }) => {
      setPlayers(players);
      setScores(scores);
      setPowerups(powerups || {});
    });

    socket.on("next_question", ({ question, index, total }) => {
      setQuestion(question);
      setQIndex(index);
      setQTotal(total);
      setSelected(null);
      setWaiting(false);
      setTimeLeft(15);
      timerRef.current = 15;
      setHiddenOptions([]);
      setLastCorrect(null);
      setLoading(false);
      setScreen("game");
    });

    socket.on("timer_update", ({ timeLeft }) => {
      setTimeLeft(timeLeft);
      timerRef.current = timeLeft;
    });

    socket.on("score_update", ({ scores, players, streaks, lastAnswer }) => {
      setScores(scores);
      setPlayers(players);
      setStreaks(streaks || {});
      if (lastAnswer) setLastCorrect(lastAnswer);
    });

    socket.on("game_over", ({ scores, players, streaks }) => {
      setScores(scores);
      setPlayers(players);
      setStreaks(streaks || {});
      setScreen("results");
    });

    socket.on("powerup_fifty_result", ({ hideIndexes }) => {
      setHiddenOptions(hideIndexes);
      showToast("50/50 used! Two wrong answers removed ✂️");
    });

    socket.on("powerup_time_result", ({ addSeconds, usedBy }) => {
      timerRef.current += addSeconds;
      setTimeLeft(t => t + addSeconds);
      const name = players.find(p => p.id === usedBy)?.username || "Someone";
      showToast(`⏱ ${name} added 10 seconds!`);
    });

    socket.on("powerup_steal_result", ({ stealerId, victimId, scores }) => {
      setScores(scores);
      const stealer = players.find(p => p.id === stealerId)?.username || "Someone";
      const victim = players.find(p => p.id === victimId)?.username || "the leader";
      showToast(`🥷 ${stealer} stole 50 pts from ${victim}!`);
    });

    socket.on("player_reaction", ({ playerId, emoji }) => {
      const name = players.find(p => p.id === playerId)?.username || "";
      const id = Date.now() + Math.random();
      const x = 10 + Math.random() * 80;
      setReactions(r => [...r, { id, emoji, name, x }]);
      setTimeout(() => setReactions(r => r.filter(r2 => r2.id !== id)), 2500);
    });

    return () => socket.removeAllListeners();
  }, [players]);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

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
    socket.emit("start_game", { roomCode, categoryId });
  }

  function handleAnswer(i) {
    if (selected !== null || waiting || hiddenOptions.includes(i)) return;
    setSelected(i);
    setWaiting(true);
    socket.emit("submit_answer", { roomCode, answerIndex: i });
  }

  function usePowerup(type) {
    const myPowerups = powerups[socket.id] || {};
    if (type === "fifty" && myPowerups.fiftyFifty) socket.emit("powerup_fifty", { roomCode });
    if (type === "time" && myPowerups.extraTime) socket.emit("powerup_time", { roomCode });
    if (type === "steal" && myPowerups.steal) socket.emit("powerup_steal", { roomCode });
  }

  function sendReaction(emoji) {
    socket.emit("send_reaction", { roomCode, emoji });
  }

  function getUsername(id) {
    return players.find(p => p.id === id)?.username || id;
  }

  const timerColor = timeLeft > 10 ? "#16a34a" : timeLeft > 5 ? "#d97706" : "#dc2626";
  const timerPct = Math.min((timeLeft / 15) * 100, 100);
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const myPowerups = powerups[socket.id] || {};
  const myStreak = streaks[socket.id] || 0;
  const medals = ["🥇", "🥈", "🥉"];

  // ─── LOBBY ───────────────────────────────────────────────
  if (screen === "lobby") return (
    <div style={s.page}>
      <div style={s.hero}>
        <div style={s.heroIcon}>⚡</div>
        <h1 style={s.heroTitle}>Quiz Game</h1>
        <p style={s.heroSub}>Real-time multiplayer trivia</p>
      </div>
      <div style={s.card}>
        <label style={s.label}>Your name</label>
        <input style={s.input} placeholder="Enter your name" value={username}
          onChange={e => setUsername(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleJoin()} />
        <label style={{...s.label, marginTop:12}}>Room code</label>
        <input style={s.input} placeholder="e.g. AB12C" value={roomCode}
          onChange={e => setRoomCode(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === "Enter" && handleJoin()} />
        <button style={s.btnBlue} onClick={handleJoin}>Join Room</button>
        <div style={s.divRow}><div style={s.divLine}/><span style={s.divText}>or</span><div style={s.divLine}/></div>
        <button style={s.btnGreen} onClick={handleCreate}>Create New Room</button>
      </div>
    </div>
  );

  // ─── WAITING ─────────────────────────────────────────────
  if (screen === "waiting") return (
    <div style={s.page}>
      <div style={s.hero}>
        <div style={s.codeBadge}>{roomCode}</div>
        <p style={s.heroSub}>Share this code with friends</p>
      </div>
      <div style={s.card}>
        <p style={s.label}>Players ({players.length})</p>
        {players.map((p, i) => (
          <div key={p.id} style={s.playerRow}>
            <div style={s.avatar}>{p.username[0].toUpperCase()}</div>
            <span style={s.playerName}>{p.username}</span>
            {p.id === socket.id && <span style={s.pill("#E0F2FE","#0369a1")}>you</span>}
            {i === 0 && <span style={s.pill("#EDE9FE","#6d28d9")}>host</span>}
          </div>
        ))}
        {players.length < 2 && <p style={s.mutedText}>⏳ Waiting for at least one more player...</p>}
      </div>

      {isHost && (
        <div style={s.card}>
          <p style={s.label}>Category</p>
          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:8}}>
            {CATEGORIES.map(cat => (
              <button key={cat.id} onClick={() => setCategoryId(cat.id)} style={{
                ...s.catBtn,
                background: categoryId === cat.id ? "#1e40af" : "#f8fafc",
                color: categoryId === cat.id ? "#fff" : "#334155",
                borderColor: categoryId === cat.id ? "#1e40af" : "#e2e8f0",
              }}>{cat.label}</button>
            ))}
          </div>
        </div>
      )}

      {isHost
        ? <button style={{...s.btnBlue, opacity: loading || players.length < 2 ? 0.5 : 1}}
            onClick={handleStart} disabled={loading || players.length < 2}>
            {loading ? "Loading questions..." : "Start Game"}
          </button>
        : <p style={s.mutedText}>Waiting for the host to start...</p>
      }
    </div>
  );

  // ─── GAME ─────────────────────────────────────────────────
  if (screen === "game") return (
    <div style={{...s.page, justifyContent:"flex-start", paddingTop:20, position:"relative", overflow:"hidden"}}>

      {/* Floating reactions */}
      {reactions.map(r => (
        <div key={r.id} style={{position:"fixed", bottom:80, left:`${r.x}%`, zIndex:999, animation:"floatUp 2.5s ease-out forwards", pointerEvents:"none", textAlign:"center"}}>
          <div style={{fontSize:28}}>{r.emoji}</div>
          <div style={{fontSize:10, color:"#888", marginTop:2}}>{r.name}</div>
        </div>
      ))}

      {/* Toast */}
      {toast && (
        <div style={{position:"fixed", top:16, left:"50%", transform:"translateX(-50%)", background:"#1e293b", color:"#fff", padding:"10px 18px", borderRadius:12, fontSize:13, fontWeight:500, zIndex:1000, boxShadow:"0 4px 20px rgba(0,0,0,0.2)", whiteSpace:"nowrap"}}>
          {toast}
        </div>
      )}

      <style>{`
        @keyframes floatUp {
          0% { opacity:1; transform:translateY(0) scale(1); }
          100% { opacity:0; transform:translateY(-120px) scale(1.3); }
        }
      `}</style>

      {/* Header row */}
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", width:"100%", maxWidth:480, marginBottom:6}}>
        <div>
          <span style={s.qLabel}>Q{qIndex+1} / {qTotal}</span>
          {question?.difficulty && (
            <span style={{...s.pill(
              question.difficulty==="easy" ? "#dcfce7" : question.difficulty==="medium" ? "#fef9c3" : "#fee2e2",
              question.difficulty==="easy" ? "#15803d" : question.difficulty==="medium" ? "#854d0e" : "#b91c1c"
            ), marginLeft:8}}>{question.difficulty}</span>
          )}
        </div>
        <div style={{fontSize:26, fontWeight:700, color:timerColor, transition:"color 0.4s", fontVariantNumeric:"tabular-nums"}}>
          {timeLeft}s
        </div>
      </div>

      {/* Timer bar */}
      <div style={{width:"100%", maxWidth:480, height:5, background:"#e2e8f0", borderRadius:99, marginBottom:14, overflow:"hidden"}}>
        <div style={{height:"100%", borderRadius:99, background:timerColor, width:`${timerPct}%`, transition:"width 1s linear, background 0.4s"}} />
      </div>

      {/* Streak badge */}
      {myStreak >= 2 && (
        <div style={{background:"linear-gradient(135deg,#f97316,#ef4444)", color:"#fff", borderRadius:99, padding:"4px 14px", fontSize:13, fontWeight:600, marginBottom:10, alignSelf:"flex-start"}}>
          🔥 {myStreak} streak — +{Math.min(myStreak-1,5)*50} bonus pts
        </div>
      )}

      {/* Question */}
      <div style={s.card}>
        {question?.category && <p style={{...s.label, marginBottom:6}}>{question.category}</p>}
        <p style={s.questionText}>{question?.question}</p>
        <div style={{marginTop:16}}>
          {question?.options.map((opt, i) => {
            const isHidden = hiddenOptions.includes(i);
            const isAnswer = i === question.answer;
            const isChosen = i === selected;
            let bg = "#f8fafc", border = "#e2e8f0", color = "#1e293b", opacity = 1;
            if (isHidden) { opacity = 0.2; }
            else if (selected !== null) {
              if (isAnswer) { bg="#dcfce7"; border="#16a34a"; color="#14532d"; }
              else if (isChosen) { bg="#fee2e2"; border="#dc2626"; color="#7f1d1d"; }
              else { opacity=0.4; }
            }
            return (
              <button key={i} onClick={() => handleAnswer(i)} disabled={isHidden} style={{
                ...s.optBtn, background:bg, borderColor:border, color, opacity,
                cursor: selected !== null || isHidden ? "default" : "pointer",
              }}>
                <span style={s.optLetter}>{["A","B","C","D"][i]}</span>
                <span>{opt}</span>
                {selected !== null && isAnswer && <span style={{marginLeft:"auto"}}>✓</span>}
                {selected !== null && isChosen && !isAnswer && <span style={{marginLeft:"auto"}}>✗</span>}
              </button>
            );
          })}
        </div>
        {waiting && <p style={{...s.mutedText, marginTop:8}}>Waiting for other players...</p>}
      </div>

      {/* Power-ups */}
      <div style={s.card}>
        <p style={s.label}>Power-ups {selected !== null && <span style={{fontWeight:400, color:"#94a3b8"}}>(answer submitted)</span>}</p>
        <div style={{display:"flex", gap:8}}>
          {[
            { key:"fifty", icon:"✂️", label:"50/50", avail: myPowerups.fiftyFifty },
            { key:"time",  icon:"⏱",  label:"+10s",  avail: myPowerups.extraTime },
            { key:"steal", icon:"🥷", label:"Steal",  avail: myPowerups.steal },
          ].map(p => (
            <button key={p.key} onClick={() => usePowerup(p.key)}
              disabled={!p.avail || selected !== null}
              style={{...s.powerBtn, opacity: p.avail && selected === null ? 1 : 0.3}}>
              <span style={{fontSize:18}}>{p.icon}</span>
              <span style={{fontSize:11, fontWeight:500}}>{p.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Reactions */}
      <div style={s.card}>
        <p style={s.label}>React</p>
        <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
          {REACTION_EMOJIS.map(e => (
            <button key={e} onClick={() => sendReaction(e)} style={s.reactBtn}>{e}</button>
          ))}
        </div>
      </div>

      {/* Live scores */}
      <div style={s.card}>
        <p style={s.label}>Live scores</p>
        {sorted.map(([id, score], i) => (
          <div key={id} style={{...s.scoreRow, background: id === socket.id ? "#f0f9ff" : "transparent"}}>
            <span style={{fontSize:16}}>{medals[i] || "🎮"}</span>
            <span style={s.playerName}>
              {getUsername(id)}
              {(streaks[id] || 0) >= 2 && <span style={{marginLeft:6, fontSize:12}}>🔥{streaks[id]}</span>}
            </span>
            <span style={{fontWeight:600, color:"#1e293b"}}>{score} pts</span>
          </div>
        ))}
      </div>
    </div>
  );

  // ─── RESULTS ──────────────────────────────────────────────
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
            background: i === 0 ? "#fefce8" : "transparent",
            borderRadius:10, padding:"10px 8px", marginBottom:4
          }}>
            <span style={{fontSize: i===0 ? 26:18}}>{medals[i] || "🎮"}</span>
            <div style={{flex:1}}>
              <div style={{fontSize: i===0?16:14, fontWeight: i===0?600:400}}>{getUsername(id)}</div>
              {(streaks[id]||0) >= 2 && <div style={{fontSize:11, color:"#f97316"}}>🔥 Best streak: {streaks[id]}</div>}
            </div>
            <span style={{fontWeight:700, fontSize: i===0?18:14}}>{score} pts</span>
          </div>
        ))}
      </div>
      <button style={s.btnBlue} onClick={() => window.location.reload()}>Play Again</button>
    </div>
  );
}

// ─── STYLES ────────────────────────────────────────────────
const s = {
  page: { minHeight:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"1.25rem 1rem 3rem", background:"#f8fafc", fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif", gap:0 },
  hero: { textAlign:"center", marginBottom:20 },
  heroIcon: { fontSize:52, marginBottom:6 },
  heroTitle: { fontSize:34, fontWeight:800, color:"#0f172a", margin:0, letterSpacing:-1 },
  heroSub: { fontSize:15, color:"#94a3b8", marginTop:6 },
  codeBadge: { fontSize:38, fontWeight:800, letterSpacing:8, color:"#2563eb", background:"#eff6ff", padding:"10px 28px", borderRadius:14, display:"inline-block", marginBottom:10 },
  card: { background:"#fff", border:"1px solid #e2e8f0", borderRadius:18, padding:"1.25rem", width:"100%", maxWidth:480, marginBottom:12, boxShadow:"0 1px 6px rgba(0,0,0,0.05)" },
  label: { fontSize:11, fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase", color:"#94a3b8", marginBottom:10, display:"block" },
input: { width:"100%", padding:"12px 14px", borderRadius:12, border:"1.5px solid #e2e8f0", fontSize:15, outline:"none", background:"#f8fafc", boxSizing:"border-box", marginBottom:10, color:"#0f172a" },  btnBlue: { width:"100%", maxWidth:480, padding:"14px 0", borderRadius:14, border:"none", background:"#2563eb", color:"#fff", fontSize:15, fontWeight:700, cursor:"pointer", marginBottom:10 },
  btnGreen: { width:"100%", padding:"14px 0", borderRadius:14, border:"none", background:"#16a34a", color:"#fff", fontSize:15, fontWeight:700, cursor:"pointer" },
  divRow: { display:"flex", alignItems:"center", gap:10, margin:"10px 0" },
  divLine: { flex:1, height:1, background:"#e2e8f0" },
  divText: { fontSize:13, color:"#cbd5e1" },
  playerRow: { display:"flex", alignItems:"center", gap:10, padding:"8px 0", borderBottom:"1px solid #f1f5f9" },
  avatar: { width:34, height:34, borderRadius:"50%", background:"#eff6ff", color:"#2563eb", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, fontSize:14, flexShrink:0 },
  playerName: { flex:1, fontSize:14, color:"#1e293b" },
  pill: (bg, color) => ({ fontSize:11, padding:"2px 9px", borderRadius:99, background:bg, color, fontWeight:600 }),
  mutedText: { fontSize:13, color:"#94a3b8", textAlign:"center", marginTop:10 },
  qLabel: { fontSize:13, fontWeight:600, color:"#64748b" },
  questionText: { fontSize:17, fontWeight:600, color:"#0f172a", lineHeight:1.55 },
  optBtn: { display:"flex", alignItems:"center", gap:12, width:"100%", textAlign:"left", padding:"12px 14px", borderRadius:12, border:"1.5px solid", marginBottom:8, fontSize:14, transition:"all 0.18s", background:"#f8fafc", cursor:"pointer" },
  optLetter: { width:26, height:26, borderRadius:"50%", background:"rgba(0,0,0,0.06)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, flexShrink:0 },
  powerBtn: { flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4, padding:"10px 6px", borderRadius:12, border:"1.5px solid #e2e8f0", background:"#f8fafc", cursor:"pointer", transition:"opacity 0.2s" },
  reactBtn: { fontSize:22, padding:"6px 10px", borderRadius:10, border:"1px solid #e2e8f0", background:"#f8fafc", cursor:"pointer" },
  scoreRow: { display:"flex", alignItems:"center", gap:10, padding:"8px 6px", borderBottom:"1px solid #f1f5f9" },
  catBtn: { padding:"8px 10px", borderRadius:10, border:"1.5px solid", fontSize:12, fontWeight:500, cursor:"pointer", textAlign:"left", transition:"all 0.15s" },
};