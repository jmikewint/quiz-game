import { useEffect, useState } from "react";
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

const REACTIONS = ["🔥", "😭", "👏", "😮", "💀", "🤯"];
const medals = ["🥇", "🥈", "🥉"];

export default function App() {
  const [screen, setScreen] = useState("lobby");
  const [username, setUsername] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [players, setPlayers] = useState([]);
  const [scores, setScores] = useState({});
  const [streaks, setStreaks] = useState({});
  const [question, setQuestion] = useState(null);
  const [qIndex, setQIndex] = useState(0);
  const [qTotal, setQTotal] = useState(0);
  const [selected, setSelected] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [isSaboteur, setIsSaboteur] = useState(false);
  const [correctAnswer, setCorrectAnswer] = useState(null);
  const [timeLeft, setTimeLeft] = useState(20);
  const [loading, setLoading] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [hint, setHint] = useState(null);
  const [hintInput, setHintInput] = useState("");
  const [hintSent, setHintSent] = useState(false);
  const [phase, setPhase] = useState("question");
  const [voteTarget, setVoteTarget] = useState(null);
  const [voteSubmitted, setVoteSubmitted] = useState(false);
  const [votedCount, setVotedCount] = useState(0);
  const [voteTimeLeft, setVoteTimeLeft] = useState(12);
  const [voteResult, setVoteResult] = useState(null);
  const [roundAnswers, setRoundAnswers] = useState({});
  const [answeredCount, setAnsweredCount] = useState(0);
  const [reactions, setReactions] = useState([]);
  const [toast, setToast] = useState(null);
  const [revealedAnswer, setRevealedAnswer] = useState(null);

  useEffect(() => {
    socket.on("room_update", ({ players, scores, streaks }) => {
      setPlayers(players);
      setScores(scores);
      setStreaks(streaks || {});
    });

    socket.on("next_question", ({ question, index, total, isSaboteur, correctAnswer }) => {
      setQuestion(question);
      setQIndex(index);
      setQTotal(total);
      setIsSaboteur(isSaboteur);
      setCorrectAnswer(isSaboteur ? correctAnswer : null);
      setSelected(null);
      setHint(null);
      setHintInput("");
      setHintSent(false);
      setPhase("question");
      setVoteTarget(null);
      setVoteSubmitted(false);
      setVotedCount(0);
      setAnsweredCount(0);
      setRevealedAnswer(null);
      setVoteResult(null);
      setTimeLeft(20);
      setLoading(false);
      setScreen("game");
    });

    socket.on("timer_update", ({ timeLeft }) => setTimeLeft(timeLeft));

socket.on("hint_received", ({ hint, username }) => {
  setHint({ text: hint, username });
  showToast(`💬 Someone whispers: "${hint.text || hint}"`);
});

    socket.on("player_answered", ({ totalAnswered, totalPlayers }) => {
      setAnsweredCount(totalAnswered);
    });

    socket.on("voting_start", ({ players, scores, correctAnswer, answers, timeLeft }) => {
      setPhase("voting");
      setRevealedAnswer(correctAnswer);
      setRoundAnswers(answers || {});
      setVoteTimeLeft(timeLeft);
      setPlayers(players);
      setScores(scores);
    });

    socket.on("vote_timer", ({ timeLeft }) => setVoteTimeLeft(timeLeft));

    socket.on("vote_update", ({ votedCount }) => setVotedCount(votedCount));

    socket.on("vote_result", ({ saboteurId, saboteurCaught, mostVoted, voteCounts, scores, players }) => {
      setVoteResult({ saboteurId, saboteurCaught, mostVoted, voteCounts });
      setScores(scores);
      setPlayers(players);
      setPhase("result");
    });

    socket.on("game_over", ({ scores, players, streaks, saboteurId }) => {
      setScores(scores);
      setPlayers(players);
      setStreaks(streaks || {});
      setScreen("results");
    });

    socket.on("player_reaction", ({ playerId, emoji, username }) => {
      const id = Date.now() + Math.random();
      const x = 10 + Math.random() * 80;
      setReactions(r => [...r, { id, emoji, username, x }]);
      setTimeout(() => setReactions(r => r.filter(r2 => r2.id !== id)), 2500);
    });

    return () => socket.removeAllListeners();
  }, []);

  function showToast(msg, duration = 3500) {
    setToast(msg);
    setTimeout(() => setToast(null), duration);
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
    if (selected !== null) return;
    setSelected(i);
    socket.emit("submit_answer", { roomCode, answerIndex: i });
  }

  function handleSendHint() {
    if (!hintInput.trim() || hintSent) return;
    socket.emit("send_hint", { roomCode, hint: hintInput.trim() });
    setHintSent(true);
    showToast("Hint sent to all players 🕵️");
  }

  function handleVote(targetId) {
    if (voteSubmitted || targetId === socket.id) return;
    setVoteTarget(targetId);
    setVoteSubmitted(true);
    socket.emit("submit_vote", { roomCode, targetId });
  }

  function sendReaction(emoji) {
    socket.emit("send_reaction", { roomCode, emoji });
  }

  function getUsername(id) {
    return players.find(p => p.id === id)?.username || "Unknown";
  }

  const timerColor = timeLeft > 12 ? "#16a34a" : timeLeft > 6 ? "#d97706" : "#dc2626";
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const myStreak = streaks[socket.id] || 0;

  // ── LOBBY ──────────────────────────────────────────────────
  if (screen === "lobby") return (
    <div style={s.page}>
      <div style={s.hero}>
        <div style={s.heroIcon}>🕵️</div>
        <h1 style={s.heroTitle}>Quiz or Lies</h1>
        <p style={s.heroSub}>Trivia meets social deduction</p>
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
        <div style={s.divRow}>
          <div style={s.divLine}/><span style={s.divText}>or</span><div style={s.divLine}/>
        </div>
        <button style={s.btnGreen} onClick={handleCreate}>Create New Room</button>
      </div>
      <div style={{...s.card, background:"#fffbeb", border:"1px solid #fde68a"}}>
        <p style={{...s.label, color:"#92400e"}}>How to play</p>
        <p style={s.ruleText}>Each round one player is secretly the <strong>Saboteur</strong>. They know the correct answer and can send a fake hint to mislead everyone. After the question, vote for who you think the saboteur is. Catch them to earn bonus points!</p>
      </div>
    </div>
  );

  // ── WAITING ────────────────────────────────────────────────
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
            {p.id === socket.id && <span style={pill("#dbeafe","#1d4ed8")}>you</span>}
            {i === 0 && <span style={pill("#ede9fe","#6d28d9")}>host</span>}
          </div>
        ))}
        {players.length < 2 && <p style={s.mutedText}>⏳ Need at least 2 players to start</p>}
      </div>

      {isHost && (
        <div style={s.card}>
          <p style={s.label}>Category</p>
          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:8}}>
            {CATEGORIES.map(cat => (
              <button key={cat.id} onClick={() => setCategoryId(cat.id)} style={{
                ...s.catBtn,
                background: categoryId === cat.id ? "#1d4ed8" : "#f8fafc",
                color: categoryId === cat.id ? "#fff" : "#334155",
                borderColor: categoryId === cat.id ? "#1d4ed8" : "#e2e8f0",
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

  // ── GAME ───────────────────────────────────────────────────
  if (screen === "game") return (
    <div style={{...s.page, justifyContent:"flex-start", paddingTop:16, position:"relative", overflow:"hidden"}}>

      {/* Floating reactions */}
      {reactions.map(r => (
        <div key={r.id} style={{position:"fixed", bottom:80, left:`${r.x}%`, zIndex:999, pointerEvents:"none", textAlign:"center", animation:"floatUp 2.5s ease-out forwards"}}>
          <div style={{fontSize:28}}>{r.emoji}</div>
          <div style={{fontSize:10, color:"#64748b"}}>{r.username}</div>
        </div>
      ))}

      {/* Toast */}
      {toast && (
        <div style={s.toast}>{toast}</div>
      )}

      <style>{`@keyframes floatUp { 0%{opacity:1;transform:translateY(0) scale(1)} 100%{opacity:0;transform:translateY(-130px) scale(1.3)} }`}</style>

      {/* Saboteur banner */}
      {isSaboteur && phase === "question" && (
        <div style={s.saboteurBanner}>
          🕵️ You are the <strong>Saboteur</strong> — mislead them! The correct answer is <strong>{["A","B","C","D"][correctAnswer]}</strong>
        </div>
      )}

      {/* ── QUESTION PHASE ── */}
      {phase === "question" && (
        <>
          <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", width:"100%", maxWidth:480, marginBottom:6}}>
            <div>
              <span style={s.qLabel}>Q{qIndex+1}/{qTotal}</span>
              {question?.difficulty && (
                <span style={{...pill(
                  question.difficulty==="easy"?"#dcfce7":question.difficulty==="medium"?"#fef9c3":"#fee2e2",
                  question.difficulty==="easy"?"#15803d":question.difficulty==="medium"?"#854d0e":"#b91c1c"
                ), marginLeft:8, fontSize:10}}>{question.difficulty}</span>
              )}
            </div>
            <div style={{fontSize:24, fontWeight:700, color:timerColor, fontVariantNumeric:"tabular-nums"}}>{timeLeft}s</div>
          </div>

          <div style={{width:"100%", maxWidth:480, height:5, background:"#e2e8f0", borderRadius:99, marginBottom:12, overflow:"hidden"}}>
            <div style={{height:"100%", borderRadius:99, background:timerColor, width:`${(timeLeft/20)*100}%`, transition:"width 1s linear, background 0.4s"}} />
          </div>

          {/* Hint banner */}
      {hint && (
  <div style={s.hintBanner}>
    💬 <em>An anonymous tip: "{hint.text}"</em>
  </div>
)}

          {/* Answered progress */}
          <div style={{width:"100%", maxWidth:480, marginBottom:8}}>
            <p style={{...s.mutedText, textAlign:"left", margin:0}}>
              {answeredCount}/{players.length} answered
            </p>
          </div>

          <div style={s.card}>
            {question?.category && <p style={{...s.label, marginBottom:6, color:"#64748b"}}>{question.category}</p>}
            <p style={s.questionText}>{question?.question}</p>
            <div style={{marginTop:14}}>
              {question?.options.map((opt, i) => {
                let bg="#f8fafc", border="#e2e8f0", color="#1e293b", opacity=1;
                if (selected !== null) {
                  if (i === question.answer && isSaboteur) { bg="#dcfce7"; border="#16a34a"; color="#14532d"; }
                  else if (i === selected) { bg="#dbeafe"; border="#2563eb"; color="#1e3a8a"; }
                  else { opacity=0.4; }
                }
                return (
                  <button key={i} onClick={() => handleAnswer(i)} style={{
                    ...s.optBtn, background:bg, borderColor:border, color, opacity,
                    cursor: selected !== null ? "default" : "pointer",
                  }}>
                    <span style={s.optLetter}>{["A","B","C","D"][i]}</span>
                    <span style={{flex:1}}>{opt}</span>
                    {selected !== null && isSaboteur && i === question.answer && <span>✓</span>}
                  </button>
                );
              })}
            </div>
            {selected !== null && <p style={{...s.mutedText, marginTop:8}}>Waiting for others...</p>}
          </div>

          {/* Saboteur hint box */}
          {isSaboteur && !hintSent && (
            <div style={{...s.card, border:"1px solid #fbbf24", background:"#fffbeb"}}>
              <p style={{...s.label, color:"#92400e"}}>🕵️ Send a misleading hint</p>
              <div style={{display:"flex", gap:8}}>
                <input style={{...s.input, marginBottom:0, flex:1}} placeholder={`e.g. "Pretty sure it's B"`}
                  value={hintInput} onChange={e => setHintInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleSendHint()} />
                <button style={{...s.btnBlue, width:"auto", padding:"0 16px", marginBottom:0}} onClick={handleSendHint}>Send</button>
              </div>
            </div>
          )}
          {isSaboteur && hintSent && (
            <div style={{...s.card, border:"1px solid #fbbf24", background:"#fffbeb"}}>
              <p style={{...s.mutedText, margin:0}}>✅ Hint sent! Now answer normally to blend in.</p>
            </div>
          )}

          {/* Reactions */}
          <div style={s.card}>
            <p style={s.label}>React</p>
            <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
              {REACTIONS.map(e => (
                <button key={e} onClick={() => sendReaction(e)} style={s.reactBtn}>{e}</button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── VOTING PHASE ── */}
      {phase === "voting" && (
        <>
          <div style={s.voteBanner}>
            <div style={{fontSize:28, marginBottom:4}}>🗳️</div>
            <div style={{fontSize:18, fontWeight:700, color:"#0f172a"}}>Who was the Saboteur?</div>
            <div style={{fontSize:13, color:"#64748b", marginTop:2}}>{voteTimeLeft}s to vote</div>
          </div>

          <div style={{width:"100%", maxWidth:480, height:4, background:"#e2e8f0", borderRadius:99, marginBottom:14, overflow:"hidden"}}>
            <div style={{height:"100%", borderRadius:99, background:"#7c3aed", width:`${(voteTimeLeft/12)*100}%`, transition:"width 1s linear"}} />
          </div>

          {/* Show correct answer */}
          {revealedAnswer !== null && question && (
            <div style={{...s.card, background:"#f0fdf4", border:"1px solid #bbf7d0"}}>
              <p style={{...s.label, color:"#15803d"}}>Correct answer</p>
              <p style={{fontSize:15, fontWeight:600, color:"#14532d"}}>
                {["A","B","C","D"][revealedAnswer]}. {question.options[revealedAnswer]}
              </p>
            </div>
          )}

          <div style={s.card}>
            <p style={s.label}>Vote for the saboteur ({votedCount}/{players.length} voted)</p>
            {players.map(p => (
              <button key={p.id} onClick={() => handleVote(p.id)}
                disabled={voteSubmitted || p.id === socket.id}
                style={{
                  ...s.voteBtn,
                  background: voteTarget === p.id ? "#7c3aed" : p.id === socket.id ? "#f1f5f9" : "#f8fafc",
                  color: voteTarget === p.id ? "#fff" : p.id === socket.id ? "#94a3b8" : "#1e293b",
                  borderColor: voteTarget === p.id ? "#7c3aed" : "#e2e8f0",
                  cursor: voteSubmitted || p.id === socket.id ? "default" : "pointer",
                }}>
                <div style={s.avatar}>{p.username[0].toUpperCase()}</div>
                <span style={{flex:1, textAlign:"left"}}>{p.username}</span>
                {p.id === socket.id && <span style={{fontSize:12, color:"#94a3b8"}}>(you)</span>}
                {voteTarget === p.id && <span>✓</span>}
              </button>
            ))}
            {!voteSubmitted && <p style={{...s.mutedText, marginTop:8}}>You cannot vote for yourself</p>}
            {voteSubmitted && <p style={{...s.mutedText, marginTop:8}}>Vote submitted — waiting for others...</p>}
          </div>
        </>
      )}

      {/* ── VOTE RESULT ── */}
      {phase === "result" && voteResult && (
        <div style={{width:"100%", maxWidth:480}}>
          <div style={{
            ...s.card,
            background: voteResult.saboteurCaught ? "#f0fdf4" : "#fef2f2",
            border: `1px solid ${voteResult.saboteurCaught ? "#bbf7d0" : "#fecaca"}`,
            textAlign:"center"
          }}>
            <div style={{fontSize:40, marginBottom:8}}>
              {voteResult.saboteurCaught ? "🎉" : "😈"}
            </div>
            <p style={{fontSize:18, fontWeight:700, color: voteResult.saboteurCaught ? "#14532d" : "#7f1d1d", marginBottom:6}}>
              {voteResult.saboteurCaught ? "Saboteur caught!" : "Saboteur escaped!"}
            </p>
            <p style={{fontSize:14, color:"#475569"}}>
              <strong>{getUsername(voteResult.saboteurId)}</strong> was the saboteur
            </p>
            {voteResult.saboteurCaught
              ? <p style={{fontSize:13, color:"#16a34a", marginTop:4}}>Voters who guessed right earn +75 pts 🎯</p>
              : <p style={{fontSize:13, color:"#dc2626", marginTop:4}}>Saboteur earns +100 pts for staying hidden 🕵️</p>
            }
          </div>
          <p style={{...s.mutedText, textAlign:"center"}}>Next question loading...</p>
        </div>
      )}

      {/* Live scores — always visible */}
      {phase !== "result" && (
        <div style={s.card}>
          <p style={s.label}>Live scores</p>
          {sorted.map(([id, score], i) => (
            <div key={id} style={{...s.scoreRow, background: id === socket.id ? "#f0f9ff" : "transparent"}}>
              <span style={{fontSize:16}}>{medals[i] || "🎮"}</span>
              <span style={s.playerName}>
                {getUsername(id)}
                {(streaks[id]||0) >= 2 && <span style={{marginLeft:6, fontSize:11, color:"#f97316"}}>🔥{streaks[id]}</span>}
              </span>
              <span style={{fontWeight:600}}>{score} pts</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ── RESULTS ────────────────────────────────────────────────
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
            background: i===0 ? "#fefce8" : "transparent",
            borderRadius:10, padding:"10px 8px", marginBottom:4
          }}>
            <span style={{fontSize:i===0?26:18}}>{medals[i]||"🎮"}</span>
            <div style={{flex:1}}>
              <div style={{fontSize:i===0?16:14, fontWeight:i===0?700:400}}>{getUsername(id)}</div>
              {(streaks[id]||0) >= 2 && <div style={{fontSize:11, color:"#f97316"}}>🔥 streak: {streaks[id]}</div>}
            </div>
            <span style={{fontWeight:700, fontSize:i===0?18:14}}>{score} pts</span>
          </div>
        ))}
      </div>
      <button style={s.btnBlue} onClick={() => window.location.reload()}>Play Again</button>
    </div>
  );
}

// ── STYLES ─────────────────────────────────────────────────
function pill(bg, color) {
  return { fontSize:11, padding:"2px 9px", borderRadius:99, background:bg, color, fontWeight:600, display:"inline-block" };
}

const s = {
  page: { minHeight:"100vh", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"1.25rem 1rem 3rem", background:"#f8fafc", fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif", gap:0 },
  hero: { textAlign:"center", marginBottom:20 },
  heroIcon: { fontSize:52, marginBottom:6 },
  heroTitle: { fontSize:34, fontWeight:800, color:"#0f172a", margin:0, letterSpacing:-1 },
  heroSub: { fontSize:15, color:"#94a3b8", marginTop:6 },
  codeBadge: { fontSize:38, fontWeight:800, letterSpacing:8, color:"#2563eb", background:"#eff6ff", padding:"10px 28px", borderRadius:14, display:"inline-block", marginBottom:10 },
  card: { background:"#fff", border:"1px solid #e2e8f0", borderRadius:18, padding:"1.25rem", width:"100%", maxWidth:480, marginBottom:12, boxShadow:"0 1px 6px rgba(0,0,0,0.05)" },
  label: { fontSize:11, fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase", color:"#94a3b8", marginBottom:10, display:"block" },
  input: { width:"100%", padding:"12px 14px", borderRadius:12, border:"1.5px solid #e2e8f0", fontSize:15, outline:"none", background:"#f8fafc", boxSizing:"border-box", marginBottom:10, color:"#0f172a" },
  btnBlue: { width:"100%", maxWidth:480, padding:"14px 0", borderRadius:14, border:"none", background:"#2563eb", color:"#fff", fontSize:15, fontWeight:700, cursor:"pointer", marginBottom:10 },
  btnGreen: { width:"100%", padding:"14px 0", borderRadius:14, border:"none", background:"#16a34a", color:"#fff", fontSize:15, fontWeight:700, cursor:"pointer" },
  divRow: { display:"flex", alignItems:"center", gap:10, margin:"10px 0" },
  divLine: { flex:1, height:1, background:"#e2e8f0" },
  divText: { fontSize:13, color:"#cbd5e1" },
  playerRow: { display:"flex", alignItems:"center", gap:10, padding:"8px 0", borderBottom:"1px solid #f1f5f9" },
  avatar: { width:34, height:34, borderRadius:"50%", background:"#eff6ff", color:"#2563eb", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, fontSize:14, flexShrink:0 },
  playerName: { flex:1, fontSize:14, color:"#1e293b" },
  mutedText: { fontSize:13, color:"#94a3b8", textAlign:"center", marginTop:10 },
  ruleText: { fontSize:13, color:"#78350f", lineHeight:1.6, margin:0 },
  qLabel: { fontSize:13, fontWeight:600, color:"#64748b" },
  questionText: { fontSize:17, fontWeight:600, color:"#0f172a", lineHeight:1.55 },
  optBtn: { display:"flex", alignItems:"center", gap:12, width:"100%", textAlign:"left", padding:"12px 14px", borderRadius:12, border:"1.5px solid", marginBottom:8, fontSize:14, transition:"all 0.18s", cursor:"pointer" },
  optLetter: { width:26, height:26, borderRadius:"50%", background:"rgba(0,0,0,0.06)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, flexShrink:0 },
  reactBtn: { fontSize:22, padding:"6px 10px", borderRadius:10, border:"1px solid #e2e8f0", background:"#f8fafc", cursor:"pointer" },
  scoreRow: { display:"flex", alignItems:"center", gap:10, padding:"8px 6px", borderBottom:"1px solid #f1f5f9", borderRadius:8 },
  catBtn: { padding:"8px 10px", borderRadius:10, border:"1.5px solid", fontSize:12, fontWeight:500, cursor:"pointer", textAlign:"left", transition:"all 0.15s" },
  saboteurBanner: { width:"100%", maxWidth:480, background:"linear-gradient(135deg,#1e1b4b,#4c1d95)", color:"#fff", borderRadius:14, padding:"12px 16px", marginBottom:12, fontSize:14, lineHeight:1.5 },
  hintBanner: { width:"100%", maxWidth:480, background:"#fffbeb", border:"1px solid #fde68a", borderRadius:12, padding:"10px 14px", marginBottom:10, fontSize:13, color:"#78350f" },
  voteBanner: { textAlign:"center", marginBottom:12, width:"100%", maxWidth:480 },
  voteBtn: { display:"flex", alignItems:"center", gap:10, width:"100%", padding:"12px 14px", borderRadius:12, border:"1.5px solid", marginBottom:8, fontSize:14, fontWeight:500, transition:"all 0.18s" },
  toast: { position:"fixed", top:16, left:"50%", transform:"translateX(-50%)", background:"#1e293b", color:"#fff", padding:"10px 18px", borderRadius:12, fontSize:13, fontWeight:500, zIndex:1000, boxShadow:"0 4px 20px rgba(0,0,0,0.2)", whiteSpace:"nowrap" },
};