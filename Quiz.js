import { useEffect, useState, useRef } from 'react';
import { db } from '../lib/firebase';
import { collection, addDoc } from 'firebase/firestore';

// Quiz loads questions from /data/quiz.json (BG/EN).
// Features: 30 questions, 3 jokers (50/50, skip, hint), 20-minute timer, ban on visibility change,
// sounds for correct/wrong/applause, saves to Firestore leaderboard if configured.

export default function Quiz({lang='bg'}){
  const [player,setPlayer] = useState('Гост');
  const [questions,setQuestions] = useState([]);
  const [index,setIndex] = useState(0);
  const [answers,setAnswers] = useState([]);
  const [running,setRunning] = useState(false);
  const [secondsLeft,setSecondsLeft] = useState(20*60);
  const [jokers,setJokers] = useState({fifty:1,skip:1,hint:1});
  const timerRef = useRef(null);
  const audio = useRef({
    correct: new Audio('/sounds/correct.wav'),
    wrong: new Audio('/sounds/wrong.wav'),
    applause: new Audio('/sounds/applause.wav'),
    tick: new Audio('/sounds/timer_start.wav')
  });

  useEffect(()=>{
    fetch('/data/quiz.json').then(r=>r.json()).then(d=>setQuestions(d)).catch(()=>setQuestions([]));
    const p = localStorage.getItem('pg_player_name'); if(p) setPlayer(p);
  },[]);

  useEffect(()=>{
    if(running){
      timerRef.current = setInterval(()=> setSecondsLeft(s=>{
        if(s<=1){ clearInterval(timerRef.current); submit(); return 0; }
        return s-1;
      }),1000);
      document.addEventListener('visibilitychange', handleVis);
    }
    return ()=>{ clearInterval(timerRef.current); document.removeEventListener('visibilitychange', handleVis); }
  },[running]);

  function handleVis(){
    if(document.hidden){
      const ban = Date.now() + 60*60*1000; // 1 hour
      localStorage.setItem('pg_ban_until', String(ban));
      clearInterval(timerRef.current);
      document.removeEventListener('visibilitychange', handleVis);
      setRunning(false);
      alert('🚫 Опита се да измамиш, хитрецо! 😏 Бан 1 час.');
    }
  }

  function start(){
    const ban = Number(localStorage.getItem('pg_ban_until')||0);
    if(ban > Date.now()){ alert('Забранен си още '+Math.ceil((ban-Date.now())/60000)+' минути'); return; }
    const name = localStorage.getItem('pg_player_name') || prompt('Име за класацията (или остави празно):') || 'Гост';
    localStorage.setItem('pg_player_name', name); setPlayer(name);
    // pick random 30 if file longer
    const pool = [...questions];
    const chosen = pool.slice(0,30);
    setQuestions(chosen);
    setAnswers(Array(chosen.length).fill(null));
    setIndex(0);
    setJokers({fifty:1,skip:1,hint:1});
    setSecondsLeft(20*60);
    setRunning(true);
    try{ audio.current.tick.play(); }catch(e){}
  }

  function selectOption(opt){
    const a = [...answers]; a[index] = opt; setAnswers(a);
  }

  function useFifty(){
    if(jokers.fifty<=0) return alert('Нямаш 50/50 жокер');
    const q = questions[index];
    if(!q) return;
    // compute two wrong options to hide by marking them in a state
    const wrongs = q.opts_bg.map((_,i)=>i).filter(i=>i!==q.a);
    // remove two wrongs (choose randomly)
    const rem = wrongs.sort(()=>0.5-Math.random()).slice(0,2);
    // store hidden options in question object temporarily
    q._hidden = rem;
    setQuestions([...questions]);
    setJokers(j=>({...j,fifty:j.fifty-1}));
  }

  function useSkip(){
    if(jokers.skip<=0) return alert('Нямаш жокер Прескочи');
    setJokers(j=>({...j,skip:j.skip-1}));
    setIndex(i=> Math.min(questions.length-1, i+1));
  }

  function useHint(){
    if(jokers.hint<=0) return alert('Нямаш жокер Подсказка');
    const q = questions[index];
    alert('Подсказка: ' + (q.hint_bg || q.hint_en || '—'));
    setJokers(j=>({...j,hint:j.hint-1}));
  }

  async function submit(){
    if(!running) return;
    clearInterval(timerRef.current);
    setRunning(false);
    document.removeEventListener('visibilitychange', handleVis);
    for(let i=0;i<questions.length;i++){ if(answers[i]===null){ alert('Отговорете на всички въпроси преди проверка.'); setIndex(i); return; } }
    let correct = 0;
    for(let i=0;i<questions.length;i++){
      if(answers[i]===questions[i].a) correct++;
    }
    const timeTaken = 20*60 - secondsLeft;
    const title = getTitle(correct);
    try{ await addDoc(collection(db,'leaderboard'),{name:player,correct,time:timeTaken,title,ts:Date.now()}); }catch(e){ /* ignore */ }
    if(correct === questions.length){
      try{ audio.current.applause.play(); }catch(e){};
      alert('Браво! Всички отговори са верни — отключена е Тайната рецепта! 👑');
    } else {
      try{ audio.current.wrong.play(); }catch(e){};
      alert('Резултат: '+correct+'/'+questions.length+' • '+title);
    }
  }

  function getTitle(s){ if(s===questions.length) return '👑 Кулинарен Майстор'; if(s>=Math.ceil(questions.length*0.7)) return '👨‍🍳 Шеф Алеко'; if(s>=Math.ceil(questions.length*0.4)) return '🍴 Кулинарен откривател'; return '🥄 Готвач-начинаещ'; }

  if(questions.length===0) return (<div className='card'><h2>Открий тайната — Quiz</h2><div>Зареждане на въпроси...</div></div>);

  const q = questions[index];

  return (<div className='card'>
    <h2>🧠 Открий Тайната — Quiz</h2>
    {!running && <div><div>Играч: <strong>{player}</strong></div><div style={{marginTop:8}}><button onClick={start}>Започни Quiz</button></div></div>}
    {running && q && (<div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><div><strong>Въпрос {index+1}/{questions.length}</strong></div><div><strong>Таймер: {Math.floor(secondsLeft/60).toString().padStart(2,'0')}:{(secondsLeft%60).toString().padStart(2,'0')}</strong></div></div>
      <div style={{marginTop:8}}><strong>{q.q_bg || q.q_en}</strong><div className='muted'>Подсказка: {q.hint_bg || q.hint_en}</div></div>
      <div style={{marginTop:8}}>
        {q.opts_bg.map((o,i)=>{
          const hidden = q._hidden && q._hidden.includes(i);
          return (<button key={i} onClick={()=>selectOption(i)} disabled={hidden} style={{display:'block',width:'100%',padding:8,marginTop:6,opacity:hidden?0.35:1,background:answers[index]===i?'#dff7dd':'#fff'}}>{o}</button>)
        })}
      </div>
      <div style={{display:'flex',gap:8,marginTop:8}}>
        <button onClick={()=>setIndex(Math.max(0,index-1))}>Назад</button>
        <button onClick={()=>setIndex(Math.min(questions.length-1,index+1))}>Напред</button>
        <button onClick={submit}>Провери</button>
      </div>
      <div style={{marginTop:10,display:'flex',gap:8,alignItems:'center'}}>
        <button onClick={useFifty}>50/50 ({jokers.fifty})</button>
        <button onClick={useSkip}>Прескочи ({jokers.skip})</button>
        <button onClick={useHint}>Подсказка ({jokers.hint})</button>
      </div>
    </div>)}
  </div>)
}
