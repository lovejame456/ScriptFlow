import React, { useState, useEffect, useRef } from 'react';
import { Project, EpisodeStatus, GenerationTask, BatchState } from '../types';
import { Play, RotateCcw, AlertTriangle, CheckCircle, Clock, Filter, LayoutGrid } from 'lucide-react';
import { api } from '../api';
import { restoreFromTask } from '../lib/ai/restoreHelper';

interface EpisodesViewProps {
  project: Project;
  onRefresh: () => Promise<void>;
}

const EpisodesView: React.FC<EpisodesViewProps> = ({ project, onRefresh }) => {
  const [refreshedProject, setRefreshedProject] = useState<Project>(project);
  const [task, setTask] = useState<GenerationTask | null>(null);
  const [batchState, setBatchState] = useState<BatchState | null>(null);
  const pollingInterval = useRef<NodeJS.Timeout | null>(null);

  /**
   * 启动轮询（可重复调用，幂等）
   */
  const startPolling = () => {
    // 清理旧的轮询（如果有）
    if (pollingInterval.current) {
      clearInterval(pollingInterval.current);
    }

    // 立即刷新一次
    refreshProjectData();

    // 启动新的轮询
    pollingInterval.current = setInterval(async () => {
      await refreshProjectData();
    }, 3000); // 3 秒轮询一次

    console.log('[EpisodesView] Polling started');
  };

  /**
   * 刷新项目数据（幂等函数）
   */
  const refreshProjectData = async () => {
    await onRefresh();
    const updated = await api.project.get(project.id);
    if (updated) {
      setRefreshedProject(updated);
    }
    // 同时更新 task 和 batch 状态
    const taskData = await api.task.get(project.id);
    const batchData = await api.batch.getState(project.id);
    setTask(taskData);
    setBatchState(batchData);
  };

  // 轮询和页面可见性管理
  useEffect(() => {
    // 冷启动恢复逻辑：在 mount 时检查后端状态
    const handleColdStartResume = async () => {
      console.log('[EpisodesView] Cold start resume - checking batch state...');
      const decision = await restoreFromTask(project.id);

      // 设置刷新后的项目数据
      const updated = await api.project.get(project.id);
      if (updated) {
        setRefreshedProject(updated);
      }

      // 设置 task 和 batch 状态
      setTask(decision.task);
      setBatchState(decision.batch);

      // 如果 batch 正在运行，启动轮询
      if (decision.batch && decision.batch.status === 'RUNNING') {
        console.log('[EpisodesView] Batch is running, starting polling...');
        startPolling();
      } else {
        console.log('[EpisodesView] Batch is not running, polling not started');
      }
    };

    // 立即执行冷启动恢复
    handleColdStartResume();

    // 监听页面可见性变化 - 仅用于强制刷新，不决定轮询状态
    const handleVisibilityChange = async () => {
      if (!document.hidden) {
        console.log('[EpisodesView] Page visible, force refresh...');
        // 页面重新可见时，立即刷新一次数据
        await refreshProjectData();

        // 强制刷新 task/batch 状态
        const updatedTask = await api.task.get(project.id);
        const updatedBatch = await api.batch.getState(project.id);
        setTask(updatedTask);
        setBatchState(updatedBatch);

        // 重新检查是否需要启动轮询（确保在 tab 挂起恢复后轮询正常）
        if (updatedBatch && updatedBatch.status === 'RUNNING') {
          if (!pollingInterval.current) {
            startPolling();
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // 清理函数
    return () => {
      if (pollingInterval.current) {
        clearInterval(pollingInterval.current);
        console.log('[EpisodesView] Polling stopped');
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [project.id, onRefresh]);

  const [startInput, setStartInput] = useState('1');
  const [endInput, setEndInput] = useState(String(refreshedProject.totalEpisodes));

  const stats = {
    total: refreshedProject.totalEpisodes,
    completed: (refreshedProject.episodes || []).filter(e => e.status === EpisodeStatus.COMPLETED).length,
    draft: (refreshedProject.episodes || []).filter(e => e.status === EpisodeStatus.DRAFT).length,
    failed: (refreshedProject.episodes || []).filter(e => e.status === EpisodeStatus.FAILED).length,
    generating: (refreshedProject.episodes || []).filter(e => e.status === EpisodeStatus.GENERATING).length,
  };

  // Determine which controls to show based on episode generation status
  const hasGenerating = stats.generating > 0;

  const handleStart = async () => {
    const start = parseInt(startInput);
    const end = parseInt(endInput);
    if (isNaN(start) || isNaN(end) || start < 1 || end > refreshedProject.totalEpisodes || start > end) {
      alert('请输入有效的起止集数');
      return;
    }

    if (hasGenerating) {
      alert('当前有剧集正在生成中，请等待完成');
      return;
    }

    try {
      await api.batch.start(refreshedProject.id, start, end);
      alert(`已开始生成第 ${start}-${end} 集，请在生产工作台查看进度`);
    } catch (err: any) {
      alert(`启动失败: ${err.message}`);
    }
  };

  // Determine which controls to show based on local state
  const showStart = !hasGenerating;

  return (
    <div className="h-full overflow-y-auto p-8 max-w-[1800px] mx-auto space-y-8 animate-in fade-in duration-500 custom-scrollbar">

      {/* Control Console - Floating Bar */}
      <div className="sticky top-0 z-20 glass-panel rounded-2xl p-4 flex flex-col md:flex-row justify-between items-center gap-6 shadow-2xl backdrop-blur-xl bg-surface/80 border-white/10">
        <div className="flex items-center gap-6">
            <div className="flex items-center gap-3 px-4 py-2 bg-white/5 rounded-xl border border-white/5">
                 <LayoutGrid size={18} className="text-textMuted" />
                 <span className="font-bold text-white text-lg">剧本生产中心</span>
            </div>
            <div className="h-8 w-px bg-white/10 hidden md:block"></div>
            <div className="flex gap-6 text-sm">
                <span className="flex items-center gap-2 text-textMuted"><CheckCircle size={14} className="text-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] rounded-full"/> 已完成 <span className="text-white font-mono font-bold">{stats.completed}</span></span>
                <span className="flex items-center gap-2 text-textMuted"><Clock size={14} className="text-blue-500 animate-spin"/> 正在生成本集剧情… <span className="text-white font-mono font-bold">{stats.generating}</span></span>
                {stats.draft > 0 && <span className="flex items-center gap-2 text-textMuted"><AlertTriangle size={14} className="text-orange-500"/> 可阅读 <span className="text-white font-mono font-bold">{stats.draft}</span></span>}
                {stats.failed > 0 && <span className="flex items-center gap-2 text-textMuted"><AlertTriangle size={14} className="text-danger animate-pulse"/> 失败 <span className="text-white font-mono font-bold">{stats.failed}</span></span>}
            </div>
        </div>

        <div className="flex gap-3">
            <div className="flex bg-black/20 rounded-lg p-1 border border-white/5">
                <button className="px-3 py-1.5 rounded-md text-xs font-medium text-white bg-white/10 hover:bg-white/20 transition-colors">全部</button>
                <button className="px-3 py-1.5 rounded-md text-xs font-medium text-textMuted hover:text-white hover:bg-white/5 transition-colors">仅失败</button>
            </div>

            {/* Batch Controls */}
            {showStart && (
              <div className="flex gap-2">
                <input
                  type="number"
                  min="1"
                  max={refreshedProject.totalEpisodes}
                  value={startInput}
                  onChange={(e) => setStartInput(e.target.value)}
                  className="w-16 bg-white/5 border border-white/10 rounded-lg text-center text-white text-xs focus:outline-none focus:border-primary/50"
                  placeholder="起"
                />
                <span className="text-textMuted text-xs py-2">-</span>
                <input
                  type="number"
                  min="1"
                  max={refreshedProject.totalEpisodes}
                  value={endInput}
                  onChange={(e) => setEndInput(e.target.value)}
                  className="w-16 bg-white/5 border border-white/10 rounded-lg text-center text-white text-xs focus:outline-none focus:border-primary/50"
                  placeholder="止"
                />
                <button
                  onClick={handleStart}
                  className="flex items-center gap-2 px-6 py-2 bg-primary hover:bg-primaryHover text-white font-bold rounded-lg shadow-[0_0_20px_rgba(99,102,241,0.3)] transition-all active:scale-95 text-xs uppercase tracking-wider border border-primary/50"
                >
                  <Play size={14} fill="currentColor" />
                  开始批量生成
                </button>
              </div>
            )}
        </div>
      </div>

      {/* Pause Notice (Conditional) */}
      {stats.completed >= 3 && batchState && batchState.status === 'PAUSED' && stats.completed < refreshedProject.totalEpisodes && (
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-6 animate-in slide-in-from-top-2 shadow-[0_0_30px_rgba(16,185,129,0.1)]">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <CheckCircle size={20} className="text-emerald-500" />
              <div>
                <h3 className="text-emerald-500 font-bold text-sm uppercase tracking-wider mb-1">
                  前 3 集已生成完成
                </h3>
                <p className="text-textMuted text-xs">您可以继续生成全集，或先人工修改前几集再继续</p>
              </div>
            </div>
            <button
              onClick={() => {
                setEndInput(String(refreshedProject.totalEpisodes));
                handleStart();
              }}
              className="flex items-center gap-2 px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl shadow-lg shadow-emerald-500/20 transition-all active:scale-95 text-sm uppercase tracking-wider"
            >
              <Play size={16} fill="currentColor" />
              继续生成全集
            </button>
          </div>
        </div>
      )}

      {/* Failure Queue (Conditional) */}
      {(stats.failed > 0 || stats.draft > 0) && (
          <div className="bg-danger/5 border border-danger/20 rounded-2xl p-6 animate-in slide-in-from-top-2 shadow-[0_0_30px_rgba(244,63,94,0.1)]">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-danger font-bold flex items-center gap-2 text-sm uppercase tracking-wider">
                    <AlertTriangle size={16} /> 需重试剧集
                </h3>
                <button className="text-xs bg-danger text-white px-4 py-2 rounded-lg hover:bg-danger/90 font-bold shadow-lg shadow-danger/20 transition-all active:scale-95">一键重试所有</button>
            </div>
            <div className="space-y-2">
                {(refreshedProject.episodes || []).filter(e => e.status === EpisodeStatus.DRAFT || e.status === EpisodeStatus.FAILED).map(ep => {
                  const isDraft = ep.status === EpisodeStatus.DRAFT;
                  const errorMessage = ep.humanSummary || (isDraft ? '内容质量未达标' : '系统错误，请检查日志');
                  const textColor = isDraft ? 'text-orange-500' : 'text-danger';
                  const bgColor = isDraft ? 'bg-orange-500/10 border-orange-500/20 hover:border-orange-500/30' : 'bg-danger/10 border-danger/10 hover:border-danger/30';

                  return (
                    <div key={ep.id} className={`flex justify-between items-center bg-black/40 p-3 rounded-lg border transition-colors group ${bgColor}`}>
                        <div className="flex items-center gap-3">
                             <span className={`text-xs font-mono font-bold px-2 py-1 rounded ${isDraft ? 'text-orange-500' : 'text-danger'} bg-opacity-10`}>EP {String(ep.id).padStart(2, '0')}</span>
                             <div className="flex flex-col">
                                <span className={`text-xs text-textMuted group-hover:text-white transition-colors`} title={errorMessage}>{errorMessage}</span>
                                {isDraft && (
                                    <span className="text-[10px] text-orange-400/80 mt-0.5">
                                        请人工编辑后保存，系统将自动标记为完成
                                    </span>
                                )}
                             </div>
                        </div>
                        <button className="p-2 hover:bg-danger/20 rounded-lg text-danger transition-colors"><RotateCcw size={14}/></button>
                    </div>
                  );
                })}
            </div>
          </div>
      )}

      {/* Episode Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 2xl:grid-cols-12 gap-4 pb-20">
        {(refreshedProject.episodes || []).map((ep) => {
          const isKey = ep.importance === "KEY";
          const isCompleted = ep.status === EpisodeStatus.COMPLETED;
          const isDraft = ep.status === EpisodeStatus.DRAFT;
          const isFailed = ep.status === EpisodeStatus.FAILED;
          const isGenerating = ep.status === EpisodeStatus.GENERATING;

          let borderColor = 'border-white/5';
          let bgColor = 'bg-white/[0.02]';
          let hoverClass = 'hover:border-white/20 hover:bg-white/5';

          if (isKey) {
            borderColor = 'border-accent/40';
            bgColor = 'bg-accent/[0.05]';
            hoverClass = 'hover:border-accent/60 hover:shadow-[0_0_20px_rgba(99,102,241,0.15)]';
          } else if (isCompleted) {
            borderColor = 'border-emerald-500/20';
            bgColor = 'bg-emerald-500/[0.02]';
            hoverClass = 'hover:border-emerald-500/50 hover:shadow-[0_0_20px_rgba(16,185,129,0.15)]';
          } else if (isDraft) {
            borderColor = 'border-orange-500/20';
            bgColor = 'bg-orange-500/[0.02]';
            hoverClass = 'hover:border-orange-500/50 hover:shadow-[0_0_20px_rgba(249,115,22,0.15)]';
          } else if (isFailed) {
            borderColor = 'border-danger/20';
            bgColor = 'bg-danger/[0.02]';
            hoverClass = 'hover:border-danger/50 hover:shadow-[0_0_20px_rgba(244,63,94,0.15)]';
          } else if (isGenerating) {
            borderColor = 'border-blue-500/20';
            bgColor = 'bg-blue-500/[0.02]';
            hoverClass = '';
          }

          return (
            <div
                key={ep.id}
                className={`aspect-square rounded-2xl border flex flex-col items-center justify-center relative cursor-pointer hover:-translate-y-1 transition-all duration-300 group overflow-hidden ${bgColor} ${borderColor} ${hoverClass}`}
                title={ep.importanceReason}
            >
                {/* Background Status Indicator */}
                {isGenerating && (
                    <div className="absolute inset-0 bg-gradient-to-t from-blue-500/10 to-transparent animate-pulse"></div>
                )}

                {/* KEY 标记 */}
                {isKey && (
                  <div className="absolute top-2 right-2 z-10">
                    <div className="text-[8px] bg-accent/20 text-accent px-1.5 py-0.5 rounded font-bold uppercase tracking-wider border border-accent/30">
                      KEY
                    </div>
                  </div>
                )}

                <span className={`text-2xl font-bold font-mono z-10 ${
                     isKey ? 'text-accent' :
                     isCompleted ? 'text-emerald-500' :
                     isDraft ? 'text-orange-500' :
                     isFailed ? 'text-danger' :
                     isGenerating ? 'text-blue-500' :
                     'text-textMuted/40 group-hover:text-white'
                }`}>{ep.id}</span>

                <div className={`absolute bottom-3 left-0 right-0 text-center transition-transform duration-300 ${ep.status !== EpisodeStatus.PENDING ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100'}`}>
                    <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                        isCompleted ? 'text-emerald-500 border-emerald-500/20 bg-emerald-500/10' :
                        isDraft ? 'text-orange-500 border-orange-500/20 bg-orange-500/10' :
                        isFailed ? 'text-danger border-danger/20 bg-danger/10' :
                        isGenerating ? 'text-blue-500 border-blue-500/20 bg-blue-500/10' :
                        'text-textMuted border-white/10 bg-black/40'
                    }`} title={ep.humanSummary || ''}>
                        {ep.status}
                    </span>
                </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default EpisodesView;
