/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';
import { 
  FileText, 
  Image as ImageIcon, 
  Link as LinkIcon, 
  Upload, 
  Copy, 
  Check, 
  Zap, 
  Briefcase, 
  TrendingUp, 
  AlertCircle,
  Loader2,
  Trash2,
  Share2
} from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';

// Constants
const MODEL_NAME = "gemini-3-flash-preview";

/// Types
type InvestmentStance = 'BUY' | 'SELL' | 'HOLD' | null;

interface AnalysisResult {
  asset: string;
  summary: string;
  stance: InvestmentStance;
  logic: string[];
}

export default function App() {
  const [inputUrl, setInputUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
      setInputUrl('');
      setError(null);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png']
    },
    maxFiles: 1,
    multiple: false
  } as any);

  const handleCopy = async () => {
    if (!result) return;

    const telegramOutput = `
🏦 **Financial Analysis Report**

📦 **Asset:** ${result.asset}

📝 **Summary:**
${result.summary}

📊 **Stance:**
[${result.stance || 'HOLD'}] for ${result.asset}

💡 **Core Logic:**
${result.logic.map(bullet => `• ${bullet}`).join('\n')}
    `.trim();

    try {
      await navigator.clipboard.writeText(telegramOutput);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.onerror = error => reject(error);
    });
  };

  const analyze = async () => {
    if (!file && !inputUrl) {
      setError('Please provide a document or a URL.');
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setResult(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
      let contents: any[] = [];

      if (file) {
        const base64Data = await fileToBase64(file);
        contents.push({
          inlineData: {
            mimeType: file.type,
            data: base64Data
          }
        });
      } else if (inputUrl) {
        const res = await fetch('/api/extract-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: inputUrl })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to extract URL content');
        contents.push({ text: `Article Content: ${data.text}` });
      }

      const prompt = `
        Perform a professional financial analysis on the provided content. 
        Focus on accuracy, clarity, and actionable insights for an investment report.
        Use **bolding** (double asterisks) for important terms and metrics within the sections.

        You MUST use the following delimiters to ensure full data extraction:
        
        [ASSET_START]
        Identify the specific stock ticker or asset name being discussed (e.g., NVDA, Bitcoin, S&P 500).
        [ASSET_END]

        [SUMMARY_START]
        A comprehensive yet concise executive summary. Do not truncate important details.
        [SUMMARY_END]

        [STANCE_START]
        Declare exactly [BUY], [SELL], or [HOLD].
        [STANCE_END]

        [LOGIC_START]
        List 3 to 5 critical bullet points (metrics, market conditions, or risks) supporting the stance.
        Each bullet MUST start with a dash (-).
        [LOGIC_END]

        DO NOT include any conversational filler.
      `;

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: [...contents, { text: prompt }],
        config: {
          temperature: 0.1,
        }
      });

      const text = response.text;
      if (!text) throw new Error('No analysis generated.');

      const assetMatch = text.match(/\[ASSET_START\]\s*([\s\S]*?)\s*\[ASSET_END\]/i);
      const summaryMatch = text.match(/\[SUMMARY_START\]\s*([\s\S]*?)\s*\[SUMMARY_END\]/i);
      const stanceMatch = text.match(/\[STANCE_START\]\s*(?:\[)?(BUY|SELL|HOLD)(?:\])?\s*\[STANCE_END\]/i);
      const logicMatch = text.match(/\[LOGIC_START\]\s*([\s\S]*?)\s*\[LOGIC_END\]/i);
      
      const asset = assetMatch ? assetMatch[1].trim() : "Unknown Asset";
      const summary = summaryMatch ? summaryMatch[1].trim() : "Summary extraction incomplete.";
      const stance = stanceMatch ? (stanceMatch[1].toUpperCase() as InvestmentStance) : 'HOLD';
      const logicRaw = logicMatch ? logicMatch[1].trim() : "";
      
      const logicBullets = logicRaw.split('\n')
        .map(line => line.trim().replace(/^[-•\*1-9\.]\s*/, ''))
        .filter(line => line.length > 3)
        .slice(0, 5);

      setResult({
        asset,
        summary,
        stance,
        logic: logicBullets.length > 0 ? logicBullets : ['Data extraction required manual review.']
      });

      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 300);

    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred during terminal analysis.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 font-sans flex flex-col">
      {/* Header Section */}
      <header className="h-20 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-6 sm:px-10 sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-cyan-500 rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.4)] border border-cyan-400/30 shrink-0">
            <TrendingUp size={22} className="text-slate-950" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white leading-none">
              WealthWiz
            </h1>
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-cyan-400 mt-1 opacity-80">
              AI INVESTMENT ANALYSIS APP
            </p>
          </div>
        </div>
        <div className="flex gap-6 items-center text-[10px] font-bold">
          <div className="flex items-center gap-2 text-cyan-400/80">
            <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse"></div>
            <span className="hidden sm:inline uppercase tracking-widest">System Active</span>
          </div>
          <div className="h-6 w-px bg-slate-800"></div>
          <button className="hover:text-cyan-400 transition-colors uppercase tracking-widest opacity-60">Dashboard</button>
        </div>
      </header>

      <main className="flex-1 max-w-[1440px] mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-0 overflow-hidden">
        {/* Left Panel */}
        <section className="lg:col-span-4 bg-slate-900/40 p-6 sm:p-10 flex flex-col justify-between border-r border-slate-800/80 backdrop-blur-md">
          <div>
            <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-8 flex items-center gap-2">
               <span className="w-6 h-px bg-slate-800" />
               Input Source
            </h2>
            
            <div className="space-y-6">
              {!inputUrl && (
                <div 
                  {...getRootProps()} 
                  className={cn(
                    "cursor-pointer border border-dashed rounded-2xl p-10 flex flex-col items-center justify-center transition-all duration-300",
                    isDragActive ? "border-cyan-500 bg-cyan-500/5" : "border-slate-800 hover:border-slate-600 bg-slate-900/60",
                    file ? "border-cyan-500/40 bg-cyan-950/20" : ""
                  )}
                >
                  <input {...getInputProps()} />
                  {file ? (
                    <div className="flex flex-col items-center gap-3 text-center">
                      <div className="w-12 h-12 bg-slate-800 text-cyan-400 rounded-xl flex items-center justify-center border border-slate-700">
                        {file.type === 'application/pdf' ? <FileText size={24} /> : <ImageIcon size={24} />}
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-white truncate max-w-[150px]">{file.name}</p>
                        <p className="text-[9px] font-bold text-cyan-500/60 uppercase tracking-widest">READY FOR PROCESSING</p>
                      </div>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setFile(null);
                        }}
                        className="mt-4 text-[9px] font-black uppercase tracking-widest text-slate-500 hover:text-red-400 transition-colors"
                      >
                        [ Remove File ]
                      </button>
                    </div>
                  ) : (
                    <>
                      <Upload size={20} className="text-slate-600 mb-4" />
                      <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Upload Report</p>
                      <p className="text-[9px] text-slate-600 mt-1 uppercase tracking-widest">PDF or Images</p>
                    </>
                  )}
                </div>
              )}

              {!file && (
                <div className="space-y-4">
                  {!inputUrl && (
                    <div className="flex items-center gap-3">
                      <div className="h-px flex-1 bg-slate-800"></div>
                      <span className="text-[9px] font-bold text-slate-700">OR</span>
                      <div className="h-px flex-1 bg-slate-800"></div>
                    </div>
                  )}
                  <div className="relative group">
                    <LinkIcon size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within:text-cyan-400 transition-colors" />
                    <input 
                      type="url"
                      placeholder="Enter source URL..."
                      className="w-full bg-slate-900/60 border border-slate-800 rounded-xl py-4 pl-12 pr-4 text-xs font-medium focus:outline-none focus:border-cyan-500/50 transition-all placeholder:text-slate-700"
                      value={inputUrl}
                      onChange={(e) => {
                        setInputUrl(e.target.value);
                        setFile(null);
                        setError(null);
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="mt-12 space-y-4">
             {error && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 bg-red-950/20 border border-red-900/50 rounded-xl flex items-start gap-3"
              >
                <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
                <p className="text-[10px] font-bold text-red-200 leading-tight uppercase tracking-widest">{error}</p>
              </motion.div>
            )}

            <button 
              onClick={analyze}
              disabled={isAnalyzing || (!file && !inputUrl)}
              className={cn(
                "w-full py-5 bg-cyan-600 text-slate-950 font-black rounded-xl hover:bg-white active:scale-[0.98] transition-all flex items-center justify-center gap-4 uppercase tracking-[0.2em] text-[10px] shadow-lg shadow-cyan-950/20 disabled:opacity-20",
                isAnalyzing ? "cursor-wait" : ""
              )}
            >
              {isAnalyzing ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <span>Run Analysis</span>
                  <Zap size={16} fill="currentColor" />
                </>
              )}
            </button>
          </div>
        </section>

        {/* Right Panel */}
        <section className="lg:col-span-8 bg-slate-950 p-6 sm:p-12 flex flex-col relative overflow-y-auto custom-scrollbar">
          <div className="max-w-3xl mx-auto w-full flex-1">
            <AnimatePresence mode="wait">
              {result ? (
                <motion.div 
                  key="result"
                  ref={resultRef}
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="space-y-12"
                >
                  <div className="flex flex-col sm:flex-row gap-6 sm:items-center justify-between pb-8 border-b border-slate-900/50">
                    <div>
                       <h3 className="text-2xl font-bold tracking-tight text-white mb-1">Analysis Terminal</h3>
                       <p className="text-[9px] font-black text-cyan-500/80 uppercase tracking-[0.2em] flex items-center gap-2">
                         <span className="w-1 h-1 bg-cyan-500 rounded-full"></span>
                         {result.asset} Report • Validated
                       </p>
                    </div>
                    <div className="flex gap-3">
                      <button 
                        onClick={handleCopy}
                        className={cn(
                          "flex items-center justify-center gap-3 px-6 py-2.5 rounded-lg font-bold text-[10px] uppercase tracking-widest transition-all border",
                          copied ? "bg-cyan-500 border-cyan-500 text-slate-950" : "bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800"
                        )}
                      >
                        {copied ? <Check size={14} /> : <Copy size={14} />}
                        {copied ? 'Copied' : 'Export'}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-4 gap-12">
                    <div className="xl:col-span-3 space-y-16">
                      <section>
                        <h3 className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] mb-6 flex items-center gap-3">
                          <span className="w-4 h-px bg-slate-800"></span>
                          Executive Summary
                        </h3>
                        <p className="text-lg leading-relaxed text-slate-100 font-medium tracking-tight">
                          {result.summary}
                        </p>
                      </section>

                      <section>
                        <h3 className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] mb-6 flex items-center gap-3">
                          <span className="w-4 h-px bg-slate-800"></span>
                          Core Logic
                        </h3>
                        <ul className="space-y-5">
                          {result.logic.map((item, idx) => (
                            <li key={idx} className="flex items-start gap-5 group">
                              <div className="w-6 h-6 rounded bg-slate-900 border border-slate-800 text-cyan-400 flex items-center justify-center text-[10px] font-black flex-shrink-0 mt-1">
                                {idx + 1}
                              </div>
                              <p className="text-base font-medium text-slate-400 group-hover:text-slate-100 transition-colors leading-relaxed">{item}</p>
                            </li>
                          ))}
                        </ul>
                      </section>
                    </div>

                    <div className="xl:col-span-1 flex flex-col items-center">
                      <div className="sticky top-32 w-full flex flex-col items-center gap-8">
                        <h4 className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Investment Stance</h4>
                        
                        <div className={cn(
                          "w-36 h-36 rounded-3xl border-2 flex flex-col items-center justify-center relative shadow-2xl",
                          result.stance === 'BUY' ? "border-emerald-500/40 bg-emerald-500/5 shadow-emerald-500/10" :
                          result.stance === 'SELL' ? "border-red-500/40 bg-red-500/5 shadow-red-500/10" :
                          "border-amber-500/40 bg-amber-500/5 shadow-amber-500/10"
                        )}>
                          <span className={cn(
                            "text-4xl font-black italic",
                            result.stance === 'BUY' ? "text-emerald-400" :
                            result.stance === 'SELL' ? "text-red-400" :
                            "text-amber-400"
                          )}>
                            {result.stance}
                          </span>
                        </div>

                        <div className="text-center">
                           <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest mb-1">Asset ID</p>
                           <p className="text-sm font-bold text-white">{result.asset}</p>
                        </div>

                        <button 
                          onClick={() => {
                            setResult(null);
                            setFile(null);
                            setInputUrl('');
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          className="text-[9px] font-black uppercase tracking-widest text-slate-600 hover:text-cyan-400 transition-colors mt-4"
                        >
                          [ Clear Analysis ]
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <div key="empty" className="h-[60vh] flex flex-col items-center justify-center text-slate-700 gap-8">
                  <div className="w-16 h-16 border-2 border-slate-800 rounded-2xl flex items-center justify-center bg-slate-900 shadow-xl relative group">
                    <div className="absolute inset-0 bg-cyan-500/5 blur-xl group-hover:bg-cyan-500/10 transition-all"></div>
                    <TrendingUp size={32} className="text-cyan-500/40 relative z-10" />
                  </div>
                  <div className="text-center space-y-2">
                     <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-slate-500">Standby for Input</p>
                     <p className="text-xs italic text-slate-600">Terminal analysis engine is online and awaiting source.</p>
                  </div>
                </div>
              )}
            </AnimatePresence>
          </div>
        </section>
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #334155;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #06b6d4;
        }
      `}</style>
    </div>
  );
}

