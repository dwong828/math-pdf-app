import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createWorker } from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';
import 'katex/dist/katex.min.css';
import { InlineMath } from 'react-katex';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

const CATEGORIES = ["algebra", "number theory", "measurement", "geometry", "probability"];
const DIFFICULTIES = ["easy", "medium", "hard", "insane"];
const MCQ_OPTIONS = ["A", "B", "C", "D"];

const MathLabPro = () => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [viewMode, setViewMode] = useState("editor"); 
  const [activeFilter, setActiveFilter] = useState("all");
  
  const [seconds, setSeconds] = useState(0);
  const timerRef = useRef(null);

  const [userAnswers, setUserAnswers] = useState({});
  const [secondAttemptAnswers, setSecondAttemptAnswers] = useState({});
  const [testChecked, setTestChecked] = useState(false); 
  const [finalChecked, setFinalChecked] = useState(false); 

  // --- 1. CORE UTILITIES ---
  const generateId = () => Math.random().toString(36).substr(2, 9);

  const createNewQuestion = (id = 1, text = "") => ({
    uuid: generateId(),
    id,
    question: text,
    answer: "",
    type: "short", 
    options: { A: "", B: "", C: "", D: "" },
    difficulty: "", 
    categories: { algebra: false, "number theory": false, measurement: false, geometry: false, probability: false }
  });

  const normalize = (str) => {
    if (!str) return "";
    return String(str).toUpperCase().replace(/[^A-D0-9.]/g, "").split("").sort().join("");
  };

  const isCorrect = (qId, attempt) => {
    const q = data.find(item => item.uuid === qId);
    if (!q || attempt === undefined || attempt === null) return false;
    const normalizedAttempt = normalize(attempt);
    const normalizedAnswer = normalize(q.answer);
    if (q.type === 'mcq') return normalizedAttempt === normalizedAnswer;
    return String(attempt).trim().toLowerCase() === String(q.answer).trim().toLowerCase();
  };

  // --- 2. LOGIC & STATE ---
  const hasErrors = useMemo(() => {
    if (!data || data.length === 0) return false;
    return data.some(q => !isCorrect(q.uuid, userAnswers[q.uuid]));
  }, [data, userAnswers]);

  // Success condition: checked and no errors on first try
  const isPerfectRun = testChecked && !hasErrors;

  const scoreStats = useMemo(() => {
    if (!testChecked || !data) return { correct: 0, partial: 0, wrong: 0, total: 0 };
    let correct = 0, partial = 0, wrong = 0;
    data.forEach(q => {
      if (isCorrect(q.uuid, userAnswers[q.uuid])) {
        correct++;
      } else if (finalChecked) {
        if (isCorrect(q.uuid, secondAttemptAnswers[q.uuid])) partial++;
        else wrong++;
      }
    });
    return { correct, partial, wrong, total: data.length };
  }, [testChecked, finalChecked, userAnswers, secondAttemptAnswers, data]);

  // Timer Effect: Stops if finalChecked OR if it's a perfect run
  useEffect(() => {
    if (viewMode === 'app' && !finalChecked && !isPerfectRun) {
      timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [viewMode, finalChecked, isPerfectRun]);

  // --- 3. RENDERERS ---
  const renderContent = (content) => {
    if (!content) return "";
    const textStr = String(content);
    const parts = textStr.split(/((?<!\\)\$.*?(?<!\\)\$)/g);
    return parts.map((part, i) => {
      if (part.startsWith('$') && part.endsWith('$') && part.length > 1) {
        const mathContent = part.slice(1, -1);
        try { return <InlineMath key={i} math={mathContent} />; } 
        catch (e) { return <span key={i} style={{ color: 'red' }}>{part}</span>; }
      }
      return <span key={i}>{part.replace(/\\(\$)/g, '$1')}</span>;
    });
  };

  const handleReset = () => {
    if (window.confirm("Reset test?")) {
      setTestChecked(false);
      setFinalChecked(false);
      setUserAnswers({});
      setSecondAttemptAnswers({});
      setSeconds(0);
    }
  };

  const saveJson = async () => {
    const cleanData = data.map(({ uuid, ...rest }) => rest).sort((a, b) => a.id - b.id);
    const blob = new Blob([JSON.stringify(cleanData, null, 2)], { type: 'application/json' });
    try {
      const handle = await window.showSaveFilePicker({ suggestedName: 'math_lab.json' });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
    } catch (e) {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = 'math_lab.json';
      link.click();
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: 'auto', fontFamily: 'system-ui, sans-serif', backgroundColor: '#f1f5f9', minHeight: '100vh' }}>
      
      {/* HEADER */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', backgroundColor: '#fff', padding: '15px 25px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
        <h2 style={{ margin: 0, flex: 1 }}>MathLab Pro</h2>
        {viewMode === 'app' && (
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ display: 'inline-block', padding: '6px 20px', background: isPerfectRun ? '#10b981' : '#1e293b', color: '#fff', borderRadius: '30px', fontWeight: 'bold', fontFamily: 'monospace', fontSize: '18px', transition: '0.3s' }}>
              {Math.floor(seconds / 60).toString().padStart(2, '0')}:{(seconds % 60).toString().padStart(2, '0')}
            </div>
          </div>
        )}
        <div style={{ flex: 1, display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          {viewMode === 'app' && (
            <button 
              onClick={() => {
                if (finalChecked || isPerfectRun) handleReset();
                else if (testChecked && hasErrors) setFinalChecked(true);
                else setTestChecked(true);
              }}
              style={{ padding: '10px 20px', background: (finalChecked || isPerfectRun) ? '#94a3b8' : (testChecked && hasErrors ? '#f59e0b' : '#10b981'), color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              {(finalChecked || isPerfectRun) ? "Reset Test" : (testChecked && hasErrors ? "Check 2nd Attempt" : "Check 1st Attempt")}
            </button>
          )}
          <button onClick={() => setViewMode(viewMode === 'editor' ? 'app' : 'editor')} style={{ padding: '10px 20px', background: '#4f46e5', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
            {viewMode === 'editor' ? "Launch Test" : "Editor"}
          </button>
        </div>
      </div>

      {/* STATS BAR */}
      {viewMode === 'app' && testChecked && (
        <div style={{ background: '#fff', marginBottom: '20px', padding: '15px', borderRadius: '12px', display: 'flex', gap: '20px', justifyContent: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
           <span style={{ color: '#10b981', fontWeight: 'bold' }}>✓ Correct: {scoreStats.correct}</span>
           {(finalChecked || isPerfectRun) && <span style={{ color: '#f59e0b', fontWeight: 'bold' }}>⚠ Partial: {scoreStats.partial}</span>}
           <span style={{ color: '#64748b' }}>Total Questions: {scoreStats.total}</span>
           {isPerfectRun && <span style={{ color: '#10b981', marginLeft: '10px' }}>🌟 Perfect Score!</span>}
        </div>
      )}

      {/* APP CONTENT */}
      {viewMode === 'app' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '20px' }}>
          {data.map(q => {
            const firstCorrect = isCorrect(q.uuid, userAnswers[q.uuid]);
            const secondCorrect = isCorrect(q.uuid, secondAttemptAnswers[q.uuid]);
            let borderColor = (finalChecked || isPerfectRun) ? (firstCorrect ? '#10b981' : (secondCorrect ? '#f59e0b' : '#ef4444')) : (testChecked && firstCorrect ? '#10b981' : '#e2e8f0');
            
            return (
              <div key={q.uuid} style={{ background: '#fff', padding: '20px', borderRadius: '12px', border: `2px solid ${borderColor}`, boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                <div style={{ fontSize: '11px', color: '#6366f1', fontWeight: 'bold', marginBottom: '10px' }}>Q{q.id}</div>
                <div style={{ marginBottom: '15px' }}>{renderContent(q.question)}</div>
                
                <div style={{ opacity: testChecked ? 0.6 : 1 }}>
                  {q.type === 'mcq' ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      {MCQ_OPTIONS.map(opt => (
                        <button 
                          key={opt} 
                          disabled={testChecked} 
                          onClick={() => {
                            const current = userAnswers[q.uuid] || "";
                            const next = current.includes(opt) ? current.replace(opt, "") : current + opt;
                            setUserAnswers(p => ({ ...p, [q.uuid]: next }));
                          }} 
                          style={{ padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', background: userAnswers[q.uuid]?.includes(opt) ? '#4f46e5' : '#fff', color: userAnswers[q.uuid]?.includes(opt) ? '#fff' : '#1e293b', cursor: 'pointer', textAlign: 'left' }}>
                          <strong>{opt}:</strong> {renderContent(q.options?.[opt])}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <input type="text" disabled={testChecked} value={userAnswers[q.uuid] || ""} onChange={(e) => setUserAnswers(p => ({...p, [q.uuid]: e.target.value}))} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }} placeholder="Type answer..." />
                  )}
                </div>

                {testChecked && !firstCorrect && !isPerfectRun && (
                  <div style={{ marginTop: '15px', borderTop: '2px dashed #f1f5f9', paddingTop: '15px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#f59e0b', marginBottom: '8px' }}>SECOND ATTEMPT:</div>
                    {q.type === 'mcq' ? (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        {MCQ_OPTIONS.map(opt => (
                          <button 
                            key={opt} 
                            disabled={finalChecked} 
                            onClick={() => {
                              const current = secondAttemptAnswers[q.uuid] || "";
                              const next = current.includes(opt) ? current.replace(opt, "") : current + opt;
                              setSecondAttemptAnswers(p => ({ ...p, [q.uuid]: next }));
                            }} 
                            style={{ padding: '10px', borderRadius: '6px', border: '1px solid #f59e0b', background: secondAttemptAnswers[q.uuid]?.includes(opt) ? '#f59e0b' : '#fff', color: secondAttemptAnswers[q.uuid]?.includes(opt) ? '#fff' : '#1e293b', cursor: 'pointer', textAlign: 'left' }}>
                            <strong>{opt}:</strong> {renderContent(q.options?.[opt])}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <input type="text" disabled={finalChecked} value={secondAttemptAnswers[q.uuid] || ""} onChange={(e) => setSecondAttemptAnswers(p => ({...p, [q.uuid]: e.target.value}))} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #f59e0b' }} placeholder="Try again..." />
                    )}
                    {finalChecked && !secondCorrect && <div style={{ color: '#ef4444', fontSize: '13px', marginTop: '10px', fontWeight: 'bold' }}>Correct: {q.answer}</div>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* EDITOR TOOLBAR & VIEW */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div style={{ background: '#fff', padding: '15px', borderRadius: '12px', display: 'flex', gap: '12px' }}>
            <button onClick={() => document.getElementById('pdf-in').click()} style={{ padding: '10px 15px', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', background: '#fff' }}>📄 Extract PDF</button>
            <button onClick={() => document.getElementById('json-in').click()} style={{ padding: '10px 15px', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', background: '#fff' }}>📁 Open JSON</button>
            <button onClick={saveJson} style={{ padding: '10px 15px', background: '#10b981', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>💾 Save JSON</button>
            <input id="pdf-in" type="file" accept=".pdf" onChange={async (e) => {
               const file = e.target.files[0]; if(!file) return;
               setLoading(true); setStatus("OCR Processing...");
               try {
                 const worker = await createWorker('eng');
                 const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
                 let fullText = "";
                 for (let i = 1; i <= pdf.numPages; i++) {
                   const page = await pdf.getPage(i);
                   const viewport = page.getViewport({ scale: 2.0 });
                   const canvas = document.createElement('canvas');
                   await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
                   const { data: { text } } = await worker.recognize(canvas);
                   fullText += text;
                 }
                 const questions = [];
                 const qRegex = /(\d+)[.)]\s*([\s\S]+?)(?=\n\d+[.)]|$)/g;
                 let match;
                 while ((match = qRegex.exec(fullText)) !== null) {
                   questions.push(createNewQuestion(parseInt(match[1]), match[2].trim()));
                 }
                 setData(questions.sort((a,b) => a.id - b.id));
                 await worker.terminate();
               } catch(err) { alert(err.message); }
               setLoading(false); setStatus("");
            }} style={{ display: 'none' }} />
            <input id="json-in" type="file" accept=".json" onChange={(e) => {
              const reader = new FileReader();
              reader.onload = (ev) => setData(JSON.parse(ev.target.result).map(i => ({...createNewQuestion(), ...i, uuid: generateId()})));
              reader.readAsText(e.target.files[0]);
            }} style={{ display: 'none' }} />
          </div>

          {data.map(q => (
            <div key={q.uuid} style={{ background: '#fff', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
               <div style={{ display: 'flex', gap: '10px' }}>
                 <input type="number" value={q.id} onChange={(e) => setData(p => p.map(i => i.uuid === q.uuid ? {...i, id: parseInt(e.target.value)} : i))} style={{ width: '50px', height: '40px' }} />
                 <textarea value={q.question} onChange={(e) => setData(p => p.map(i => i.uuid === q.uuid ? {...i, question: e.target.value} : i))} style={{ flex: 1, padding: '10px', borderRadius: '6px' }} placeholder="Question ($math$)..." />
                 <button onClick={() => setData(p => p.map(i => i.uuid === q.uuid ? {...i, type: i.type === 'mcq' ? 'short' : 'mcq'} : i))} style={{ padding: '0 10px', borderRadius: '6px', border: '1px solid #cbd5e1', background: q.type === 'mcq' ? '#4f46e5' : '#fff', color: q.type === 'mcq' ? '#fff' : '#000' }}>{q.type.toUpperCase()}</button>
                 <button onClick={() => setData(p => p.filter(i => i.uuid !== q.uuid))} style={{ color: 'red', border: 'none', background: 'none' }}>✕</button>
               </div>
               {q.type === 'mcq' && (
                 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '15px' }}>
                   {MCQ_OPTIONS.map(opt => (
                     <input key={opt} value={q.options[opt]} onChange={(e) => setData(p => p.map(i => i.uuid === q.uuid ? {...i, options: {...i.options, [opt]: e.target.value}} : i))} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }} placeholder={`Option ${opt}`} />
                   ))}
                 </div>
               )}
               <input value={q.answer} onChange={(e) => setData(p => p.map(i => i.uuid === q.uuid ? {...i, answer: e.target.value} : i))} style={{ width: '100%', marginTop: '10px', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px' }} placeholder="Answer (e.g. A or ABC)" />
            </div>
          ))}
          <button onClick={() => setData(p => [...p, createNewQuestion(data.length + 1)])} style={{ padding: '15px', borderRadius: '12px', border: '2px dashed #cbd5e1', background: '#fff', cursor: 'pointer', fontWeight: 'bold' }}>+ Add Question</button>
        </div>
      )}
    </div>
  );
};

export default MathLabPro;