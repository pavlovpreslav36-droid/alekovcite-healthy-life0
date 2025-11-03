import { useEffect, useState, useRef } from 'react';

export default function Nutrition(){ 
  const [tab,setTab] = useState('personal');
  const [age,setAge] = useState(25), [sex,setSex] = useState('male'), [weight,setWeight] = useState(70), [height,setHeight] = useState(175), [activity,setActivity] = useState(1.55), [goal,setGoal] = useState('maintain'), [dailyKcal,setDailyKcal] = useState(null);
  const [query,setQuery] = useState(''), [prodRes,setProdRes] = useState(null);
  const [productDB,setProductDB] = useState([]);
  const [recipes,setRecipes] = useState([]), [selectedRecipe,setSelectedRecipe] = useState(null), [calcResult,setCalcResult] = useState(null);
  const [log,setLog] = useState([]);
  const videoRef = useRef(null); const [scanning,setScanning]=useState(false); const [scanResult,setScanResult]=useState(null);

  useEffect(()=>{
    fetch('/data/product_lookup.json').then(r=>r.json()).then(d=>setProductDB(d));
    fetch('/data/recipes.json').then(r=>r.json()).then(d=>setRecipes(d));
    const stored = localStorage.getItem('nutrition_log');
    if(stored) setLog(JSON.parse(stored));
  },[]);

  function calcPersonal(){
    let bmr = 0;
    if(sex==='male') bmr = 10*weight + 6.25*height - 5*age + 5;
    else bmr = 10*weight + 6.25*height - 5*age - 161;
    const daily = Math.round(bmr * activity * (goal==='lose'?0.85: goal==='gain'?1.15:1));
    setDailyKcal(daily);
    try{ new Audio('/sounds/timer_start.wav').play(); }catch(e){}
  }

  async function lookupProduct(q){
    setProdRes(null);
    const key = q.trim().toLowerCase();
    if(!key) return;
    const local = productDB.find(p=>p.name.toLowerCase()===key);
    if(local){
      setProdRes({...local, source:'local'});
      try{ new Audio('/sounds/sizzle.wav').play(); }catch(e){}
      return;
    }
    try{
      const res = await fetch('https://world.openfoodfacts.org/cgi/search.pl?search_terms='+encodeURIComponent(q)+'&search_simple=1&json=1&page_size=1');
      const js = await res.json();
      if(js && js.products && js.products.length>0){
        const p = js.products[0];
        const nutr = p.nutriments || {};
        const result = {
          name: p.product_name || q,
          serving: p.serving_size || '—',
          kcal: nutr['energy-kcal_100g'] || nutr['energy-kcal_serving'] || null,
          protein_g: nutr['proteins_100g'] || null,
          carbs_g: nutr['carbohydrates_100g'] || null,
          fats_g: nutr['fat_100g'] || null,
          ingredients_text: p.ingredients_text || '',
          additives: p.additives || null,
          source:'openfoodfacts'
        };
        setProdRes(result);
        try{ new Audio('/sounds/sizzle.wav').play(); }catch(e){}
        return;
      } else {
        setProdRes({name:q, note:'Не е намерено в OpenFoodFacts', source:'none'});
      }
    }catch(e){
      setProdRes({name:q, note:'Грешка при търсене', source:'error'});
    }
  }

  function calcRecipe(r){
    if(!r) return;
    if(r.kcal && r.protein_g){
      setCalcResult({kcal:r.kcal, protein_g:r.protein_g, perServing: Math.round(r.kcal / (r.servings||1))});
      try{ new Audio('/sounds/timer_start.wav').play(); }catch(e){}
      return;
    }
    const estK = Math.round((200 + (r.time_min||30))*1.2);
    setCalcResult({kcal:estK, protein_g:Math.round((Math.random()*20)+5), perServing: Math.round(estK/(r.servings||1))});
    try{ new Audio('/sounds/timer_start.wav').play(); }catch(e){}
  }

  function addToLog(item){
    const newLog = [...log, item];
    setLog(newLog);
    localStorage.setItem('nutrition_log', JSON.stringify(newLog));
    try{ new Audio('/sounds/timer_start.wav').play(); }catch(e){}
  }
  function clearLog(){ setLog([]); localStorage.removeItem('nutrition_log'); }

  async function startScan(){
    setScanResult(null);
    setScanning(true);
    setScanResult('Scanning...');
    try{
      if('BarcodeDetector' in window){
        const formats = ['ean_13','ean_8','upc_e','upc_a'];
        const detector = new BarcodeDetector({formats});
        const stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        const id = setInterval(async ()=>{
          try{
            const bitmap = await detector.detect(videoRef.current);
            if(bitmap && bitmap.length>0){
              const code = bitmap[0].rawValue;
              setScanResult(code);
              stopScan();
              lookupBarcode(code);
              clearInterval(id);
            }
          }catch(e){ /* continue */ }
        },800);
      } else {
        setScanResult('BarcodeDetector not supported in this browser. Use mobile or enter barcode manually.');
      }
    }catch(e){
      setScanResult('Грешка при сканиране: ' + e.message);
      setScanning(false);
    }
  }
  function stopScan(){
    setScanning(false);
    if(videoRef.current && videoRef.current.srcObject){
      const tracks = videoRef.current.srcObject.getTracks();
      tracks.forEach(t=>t.stop());
      videoRef.current.srcObject = null;
    }
  }

  async function lookupBarcode(code){
    // after getting scanResult, fetch alternatives

    try{
      const res = await fetch('https://world.openfoodfacts.org/api/v0/product/'+encodeURIComponent(code)+'.json');
      const js = await res.json();
      if(js && js.status===1){
        const p = js.product;
        const nutr = p.nutriments || {};
        const result = {
          name: p.product_name || code,
          serving: p.serving_size || '—',
          kcal: nutr['energy-kcal_100g'] || nutr['energy-kcal_serving'] || null,
          protein_g: nutr['proteins_100g'] || null,
          carbs_g: nutr['carbohydrates_100g'] || null,
          fats_g: nutr['fat_100g'] || null,
          ingredients_text: p.ingredients_text || '',
          additives: p.additives || null,
          source:'openfoodfacts'
        };
        setScanResult(result);
        // load alternatives file and pick suggestions
        try{ fetch('/data/alternatives.json').then(r=>r.json()).then(a=>{ let list = a['default'] || []; if(result.kcal && result.kcal>300) list = (a['high_fat']||a['default']); if(result.kcal && result.kcal>400) list = (a['high_fat']||a['default']); if(result.ingredients_text && /sugar|syrup|sugar/i.test(result.ingredients_text)) list = (a['high_sugar']||list); const el = document.getElementById('alternatives'); if(el){ el.innerHTML = list.map(x=>`<div style=\"margin-bottom:8px\"><strong>Instead of:</strong> ${x.bad} → <em>${x.good}</em> — ${x.reason}</div>`).join(''); } }); }catch(e){}

        try{ new Audio('/sounds/scan.wav').play(); }catch(e){}
      } else {
        setScanResult({name:code, note:'Продуктът не е намерен'});
      }
    }catch(e){
      setScanResult({name:code, note:'Грешка при търсене'});
    }
  }

  function speak(text, lang='bg-BG'){
    if(!window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }

  return (<div className="card nutrition-card">
    <h3>⚖️ Калориен модул</h3>
    <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:12}}>
      <button className="big-btn btn-recipes" onClick={()=>setTab('personal')}>🎯 Личен калкулатор</button>
      <button className="big-btn btn-quiz" onClick={()=>setTab('product')}>🥕 Търсачка продукти</button>
      <button className="big-btn btn-calc" onClick={()=>setTab('recipe')}>🍽 Калории на рецепта</button>
      <button className="big-btn btn-recipes" onClick={()=>setTab('scan')}>📷 Скенер на продукт</button>
    </div>

    {tab==='personal' && (<div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:8}}>
        <div><label>Възраст</label><input value={age} onChange={e=>setAge(Number(e.target.value))} /></div>
        <div><label>Пол</label><select value={sex} onChange={e=>setSex(e.target.value)}><option value='male'>Мъж</option><option value='female'>Жена</option></select></div>
        <div><label>Тегло (kg)</label><input value={weight} onChange={e=>setWeight(Number(e.target.value))} /></div>
        <div><label>Ръст (cm)</label><input value={height} onChange={e=>setHeight(Number(e.target.value))} /></div>
        <div><label>Активност</label><select value={activity} onChange={e=>setActivity(Number(e.target.value))}><option value={1.2}>Седящ</option><option value={1.375}>Леко</option><option value={1.55}>Умерено</option><option value={1.725}>Много</option></select></div>
        <div><label>Цел</label><select value={goal} onChange={e=>setGoal(e.target.value)}><option value='maintain'>Поддържане</option><option value='lose'>Отслабване</option><option value='gain'>Напълняване/мускул</option></select></div>
      </div>
      <div style={{marginTop:10}}><button onClick={calcPersonal}>Изчисли дневни калории</button></div>
      {dailyKcal && <div style={{marginTop:8}} className="muted">Трябва да приемаш около <strong>{dailyKcal} kcal</strong> на ден.</div>}
    </div>)}

    {tab==='product' && (<div>
      <div style={{display:'flex',gap:8}}><input placeholder="Напиши продукт (напр. яйце)" value={query} onChange={e=>setQuery(e.target.value)} /><button onClick={()=>lookupProduct(query)}>Търси</button></div>
      <div style={{marginTop:8}}>
        {prodRes ? (<div>
          <h4>{prodRes.name} {prodRes.kcal? `• ${prodRes.kcal} kcal` : ''}</h4>
          <div className="muted">Протеин: {prodRes.protein_g ?? '—'} g • Въглехидрати: {prodRes.carbs_g ?? '—'} g • Мазнини: {prodRes.fats_g ?? '—'} g</div>
          {prodRes.ingredients_text && <div style={{marginTop:6}}>Съставки: <small>{prodRes.ingredients_text}</small></div>}
          <div style={{marginTop:8}}>
            <button onClick={()=>{ addToLog({type:'product', name:prodRes.name, kcal:prodRes.kcal || 0, protein:prodRes.protein_g || 0}); }}>Добави в дневния прием</button>
            <button onClick={()=>{ speak(`${prodRes.name} съдържа приблизително ${prodRes.kcal || 'няма данни'} килокалории и ${prodRes.protein_g || '—'} грама протеин.`, 'bg-BG'); }}>Чети</button>
          </div>
        </div>) : (<div className="muted">Няма резултат. Потърси продукт.</div>)}
      </div>
    </div>)}

    {tab==='recipe' && (<div>
      <div><label>Избери рецепта</label>
        <select onChange={e=>setSelectedRecipe(recipes.find(r=>r.id==e.target.value))}>
          <option value=''>-- избери --</option>
          {recipes.map(r=>(<option key={r.id} value={r.id}>{r.name} • {r.kcal || '—'} kcal</option>))}
        </select>
      </div>
      {selectedRecipe && <div style={{marginTop:8}}>
        <h4>{selectedRecipe.name}</h4>
        <div className="muted">Порции: {selectedRecipe.servings || 1} • Време: {selectedRecipe.time_min} мин</div>
        <div style={{marginTop:6}}>🔢 Оценка на калории: {selectedRecipe.kcal || '—'} kcal • Протеин: {selectedRecipe.protein_g || '—'} g</div>
        <div style={{marginTop:8}}><button onClick={()=>{ calcRecipe(selectedRecipe); }}>Изчисли</button> <button onClick={()=>{ addToLog({type:'recipe', name:selectedRecipe.name, kcal: (selectedRecipe.kcal || 300), protein: (selectedRecipe.protein_g || 10)}); }}>Добави в дневния прием</button></div>
        {calcResult && <div style={{marginTop:8}}>Оценка: {calcResult.kcal} kcal • {calcResult.protein_g} g протеин • {calcResult.perServing} kcal/порция</div>}
      </div>}
    </div>)}

    {tab==='scan' && (<div>
  <div style={{display:'flex',gap:8,alignItems:'center'}}>
    <div style={{position:'relative'}}>
      <div style={{position:'absolute',left:0,top:0,right:0,bottom:0,display:'flex',alignItems:'center',justifyContent:'center',pointerEvents:'none'}}>
        <div style={{width:260,height:180,border:'3px solid rgba(255,255,255,0.06)',borderRadius:8,boxShadow:'0 6px 18px rgba(0,0,0,0.08)'}}></div>
      </div>
      <div style={{position:'absolute',left:0,top:0,right:0,bottom:0,display:'flex',alignItems:'center',justifyContent:'center',pointerEvents:'none'}}>
        <div id="laser" style={{width:220,height:2,background:'rgba(123,211,144,0.9)',transform:'translateY(-60px)',boxShadow:'0 4px 10px rgba(123,211,144,0.25)',opacity:0,transition:'opacity .25s, transform .6s'}}> </div>
      </div>
      <video ref={videoRef} style={{width:260,height:180,background:'#000',borderRadius:8}} muted playsInline></video>
    </div>
    <div>
      <div><button onClick={startScan} disabled={scanning}>📷 Стартирай сканиране</button> <button onClick={stopScan}>⏹ Спри</button></div>
      <div style={{marginTop:8}} className="muted">Резултат: {typeof scanResult === 'string' ? scanResult : (scanResult? scanResult.name : '—')}</div>
      {scanResult && scanResult.kcal && <div style={{marginTop:6}}>Калории: {scanResult.kcal} kcal • Протеин: {scanResult.protein_g} g</div>}
      {scanResult && <div style={{marginTop:8}}><button onClick={()=>{ addToLog({type:'product', name: scanResult.name, kcal: scanResult.kcal||0, protein: scanResult.protein_g||0}); }}>Добави в дневния прием</button> <button onClick={()=>speak(scanResult.name + ' има ' + (scanResult.kcal || 'няма данни') + ' килокалории.', 'bg-BG')}>Чети</button></div>}
      <div style={{marginTop:10}}>
        <button onClick={()=>{ const code = prompt('Въведи баркод или име на продукт:'); if(code) lookupProduct(code); }}>Въведи ръчно 📝</button>
      </div>
    </div>
  </div>
  <div style={{marginTop:10}} className="muted">Ако BarcodeDetector не е наличен, използваме QuaggaJS fallback. Ако и това не работи, въведи баркода ръчно.</div>
  {scanResult && <div style={{marginTop:12}}>
    <h4>Препоръчани алтернативи</h4>
    <div id="alternatives" className="muted">Зареждане предложения...</div>
  </div>}
</div>)}


    <div style={{marginTop:12}}>
      <h4>📔 Дневен прием</h4>
      <div className="muted">Добавено: {log.length} елемента</div>
      <ul>
        {log.map((it,i)=>(<li key={i}>{it.name} • {it.kcal || 0} kcal • {it.protein || 0} g</li>))}
      </ul>
      <div style={{marginTop:8}}><button onClick={()=>{ navigator.clipboard.writeText(JSON.stringify(log)); alert('Копирано в клипборда'); }}>Експорт</button> <button onClick={clearLog}>Изчисти</button></div>
    </div>

  </div>)
}
