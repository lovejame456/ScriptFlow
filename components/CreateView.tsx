import React, { useState } from 'react';
import { Wand2, ChevronDown, ChevronUp, Sparkles, ArrowLeft, Lightbulb, CheckCircle } from 'lucide-react';
import Logo from './Logo';

interface CreateViewProps {
  onCreate: (prompt: string) => void;
  onBack: () => void;
}

interface AIResult {
  genre: string;
  recommendedEpisodes: number;
  pacingTemplateId: string;
  reason: string;
}

const CreateView: React.FC<CreateViewProps> = ({ onCreate, onBack }) => {
  const [prompt, setPrompt] = useState('');
  const [aiResult, setAiResult] = useState<AIResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleCreate = async () => {
    if (!prompt.trim()) return;

    setIsAnalyzing(true);

    // 模拟 AI 分析过程（实际在 App.tsx 中调用）
    // 这里我们调用 onCreate，实际 AI 判断会在 episodeFlow 中进行
    // 为了 UI 反馈，我们延迟一下
    setTimeout(() => {
      onCreate(prompt);
      setIsAnalyzing(false);
    }, 100);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden p-6 animate-in fade-in duration-700">

      {/* Dynamic Background Elements */}
      <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-primary/20 rounded-full blur-[120px] pointer-events-none animate-pulse-slow"></div>
      <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-accent/20 rounded-full blur-[100px] pointer-events-none animate-pulse-slow" style={{ animationDelay: '2s' }}></div>

      <button
        onClick={onBack}
        className="absolute top-8 left-8 flex items-center gap-2 px-4 py-2 rounded-full glass-card text-textMuted hover:text-white hover:border-primary/30 transition-all group z-50"
      >
        <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
        <span className="text-sm font-medium">返回工作台</span>
      </button>

      <div className="w-full max-w-4xl z-10 space-y-12">
        <div className="text-center space-y-6 flex flex-col items-center">
          {/* Main Logo Display */}
          <div className="w-20 h-20 mb-4 rounded-3xl bg-gradient-to-tr from-primary/20 to-accent/20 border border-white/10 flex items-center justify-center shadow-glow-lg animate-in zoom-in duration-700">
            <Logo size={48} />
          </div>

          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-medium text-primary shadow-glow backdrop-blur-md">
            <Sparkles size={12} fill="currentColor" />
            <span className="tracking-wide">AI 商业短剧剧本生成引擎 V3.0</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight leading-tight text-white drop-shadow-2xl">
            一句话，<br /><span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-primary/50 to-white">生成整部爆款剧</span>
          </h1>
          <p className="text-lg text-textMuted font-light max-w-2xl mx-auto">
            AI 自动判断题材、集数和节奏结构，你只需要一句话灵感。
          </p>
        </div>

        <div className="glass-panel rounded-3xl p-8 shadow-2xl transition-all duration-500 focus-within:ring-1 focus-within:ring-primary/50 focus-within:shadow-glow-lg group">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="在此输入您的灵感...&#10;例如：送外卖的穷小子意外获得万亿遗产，却必须隐瞒身份应对势利眼岳母和绿茶前女友，直到那个女人出现..."
            className="w-full h-64 bg-transparent text-xl p-8 focus:outline-none resize-none text-white placeholder-textMuted/20 leading-relaxed rounded-2xl selection:bg-primary/30"
          />
        </div>

        {/* AI 判断结果展示区 */}
        {isAnalyzing && (
          <div className="glass-card rounded-2xl p-6 border border-accent/30 animate-in fade-in duration-300">
            <div className="flex items-center gap-3 text-accent mb-4">
              <Lightbulb className="animate-pulse" size={20} />
              <span className="font-medium">AI 正在分析您的灵感...</span>
            </div>
            <div className="text-sm text-textMuted">自动判断题材、集数和节奏结构</div>
          </div>
        )}

        {/* AI 判断完成展示（仅用于演示，实际结果会在 ProjectView 显示） */}
        {aiResult && (
          <div className="glass-card rounded-2xl p-6 border border-primary/30 animate-in slide-in-from-bottom duration-300">
            <div className="flex items-center gap-3 text-primary mb-4">
              <CheckCircle size={20} />
              <span className="font-medium">AI 判断完成</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <div className="text-xs text-textMuted mb-1">AI 判断题材</div>
                <div className="text-white font-semibold">{aiResult.genre}</div>
              </div>
              <div>
                <div className="text-xs text-textMuted mb-1">推荐集数</div>
                <div className="text-white font-semibold">{aiResult.recommendedEpisodes} 集</div>
              </div>
              <div>
                <div className="text-xs text-textMuted mb-1">判断理由</div>
                <div className="text-white font-medium text-sm">{aiResult.reason}</div>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-center pt-4">
          <button
            onClick={handleCreate}
            disabled={!prompt.trim() || isAnalyzing}
            className="group relative inline-flex items-center gap-4 px-12 py-5 bg-gradient-to-r from-primary to-accent hover:to-primary disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl font-bold text-lg shadow-[0_0_30px_rgba(99,102,241,0.3)] hover:shadow-[0_0_60px_rgba(99,102,241,0.5)] transition-all duration-300 active:scale-95"
          >
            <div className="absolute inset-0 rounded-2xl bg-white/20 blur-lg opacity-0 group-hover:opacity-50 transition-opacity"></div>
            <Wand2 className="group-hover:rotate-12 transition-transform relative z-10" size={24} />
            <span className="relative z-10">{isAnalyzing ? '正在分析...' : '立即生成项目'}</span>
            <ChevronDown className="rotate-[-90deg] group-hover:translate-x-1 transition-transform relative z-10 opacity-50" size={20} />
          </button>
        </div>
      </div>

    </div>
  );
};

export default CreateView;