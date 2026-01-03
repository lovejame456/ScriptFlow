import React, { useState, useEffect, useRef } from 'react';
import { Project, EpisodeStatus, GenerationTask, BatchState, EpisodeAttemptLog, PACING_TEMPLATES, StoryMemory, ProjectFailureAnalysis, EpisodeAdvice, ProjectFailureProfile, SystemInstructionSuggestion } from '../types';
import {
    ChevronLeft, ChevronRight, Save, Wand2, Check, AlertCircle, Lock,
    BookOpen, ScrollText, Play, Pause, XCircle, RotateCcw,
    Loader2, ChevronDown, ChevronUp, CheckCircle, TrendingUp, Target,
    Filter, List, Zap, Anchor, GitCommit
} from 'lucide-react';
import { api } from '../api';
import { PLATFORM_NAMES } from '../types/platform';
import { getPlatform } from '../platforms';
import { restoreFromTask } from '../lib/ai/restoreHelper';
import InstructionPicker from './InstructionPicker';
import { sortContentBySceneIndex, formatSceneHeader } from '../lib/utils/sceneSorter';

interface UnifiedWorkspaceProps {
    project: Project;
    onRefresh: () => Promise<void>;
}

const UnifiedWorkspace: React.FC<UnifiedWorkspaceProps> = ({ project, onRefresh }) => {
    // Navigation & View State
    const [currentEpIndex, setCurrentEpIndex] = useState(0);
    const [currentViewMode, setCurrentViewMode] = useState<'editor' | 'preview'>('preview');
    const [isHeaderExpanded, setIsHeaderExpanded] = useState(true);
    const [rightTab, setRightTab] = useState<'check' | 'logs' | 'canon'>('check');
    const [outlineFilter, setOutlineFilter] = useState<number | 'all'>('all');

    // Production State
    const [task, setTask] = useState<GenerationTask | null>(null);
    const [batchState, setBatchState] = useState<BatchState | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedPlatform, setSelectedPlatform] = useState<string>(project.platformId || 'generic');

    // New Data & State
    const [storyMemory, setStoryMemory] = useState<StoryMemory | null>(null);
    const [editorContent, setEditorContent] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [isGeneratingEp, setIsGeneratingEp] = useState(false);
    
    // P3: Guidance & Creative Advisor
    const [failureAnalysis, setFailureAnalysis] = useState<ProjectFailureAnalysis | null>(null);
    const [episodeAdvice, setEpisodeAdvice] = useState<EpisodeAdvice | null>(null);

    // P4: Project Intelligence (项目级创作智能进化层)
    const [projectProfile, setProjectProfile] = useState<ProjectFailureProfile | null>(null);
    const [systemSuggestion, setSystemSuggestion] = useState<SystemInstructionSuggestion | null>(null);

    // Data Refs
    const pollingInterval = useRef<NodeJS.Timeout | null>(null);

    // --- Effects ---

    // Initial Load & Polling with Resume Capability
    useEffect(() => {
        // 启动轮询（可重复调用，幂等）
        const startPolling = () => {
            // 清理旧的轮询（如果有）
            if (pollingInterval.current) {
                clearInterval(pollingInterval.current);
            }

            // 立即加载一次状态
            loadState();

            // 启动新的轮询
            pollingInterval.current = setInterval(() => {
                loadState();
                onRefresh(); // Reload project data to get new content
            }, 3000); // 3 seconds interval

            console.log('[UnifiedWorkspace] Polling started');
        };

        // 冷启动恢复逻辑：在 mount 时检查后端状态
        const handleColdStartResume = async () => {
            console.log('[UnifiedWorkspace] Cold start resume - checking task state...');
            const decision = await restoreFromTask(project.id);

            // 设置状态
            setTask(decision.task);
            setBatchState(decision.batch);

            // 如果需要轮询（正在运行或暂停），立即启动
            if (decision.shouldPoll) {
                console.log('[UnifiedWorkspace] Task is running/paused, starting polling...');
                startPolling();
            } else {
                console.log('[UnifiedWorkspace] Task is idle, polling not started');
            }
        };

        // 立即执行冷启动恢复
        handleColdStartResume();

        // 监听页面可见性变化 - 仅用于强制刷新，不决定轮询状态
        const handleVisibilityChange = async () => {
            if (!document.hidden) {
                console.log('[UnifiedWorkspace] Page visible, force refresh...');
                // 页面重新可见时，立即刷新一次数据
                await loadState();
                await onRefresh();

                // 重新启动轮询（确保在 tab 挂起恢复后轮询正常）
                // 注意：这里不是"决定"是否轮询，而是"确保"轮询在恢复后正常工作
                const decision = await restoreFromTask(project.id);
                if (decision.shouldPoll) {
                    // 如果后端显示正在运行，确保轮询在运行
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
                console.log('[UnifiedWorkspace] Polling stopped');
            }
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [project.id]);

    // Sync current episode with task progress if running
    useEffect(() => {
        if (task?.status === 'RUNNING' && task.currentEpisode) {
            // Find index of current running episode
            const idx = project.episodes?.findIndex(e => e.id === task.currentEpisode);
            if (idx !== -1 && idx !== undefined) {
                // Optional: Auto-follow could be implemented here
            }
        }
    }, [task, project.episodes]);

    // Sync Editor Content & View Mode
    useEffect(() => {
        const ep = project.episodes?.[currentEpIndex];
        if (ep) {
            // 在加载内容时按场景序号排序，确保显示顺序正确
            const sortedContent = sortContentBySceneIndex(ep.content || '');
            setEditorContent(sortedContent);
            if (ep.content || ep.status === EpisodeStatus.COMPLETED) {
                setCurrentViewMode('editor');
            } else {
                setCurrentViewMode('preview');
            }
        }
    }, [currentEpIndex, project.episodes]);

    // --- Data Loading ---

    /**
     * 加载后端状态（幂等函数）
     *
     * 此函数可以被安全地多次调用，每次都会覆盖本地状态。
     * 用于轮询刷新和恢复逻辑。
     */
    const loadState = async () => {
        try {
            const [taskData, batchData] = await Promise.all([
                api.task.get(project.id),
                api.batch.getState(project.id)
            ]);
            try { const mem = await api.storyMemory.get(project.id); setStoryMemory(mem); } catch (e) { }

            // P3: 加载失败分析和创作建议
            try {
                const [fAnalysis, eAdvice] = await Promise.all([
                    api.guidance.getFailureAnalysis(project.id),
                    api.guidance.getEpisodeAdvice(project.id)
                ]);
                setFailureAnalysis(fAnalysis);
                setEpisodeAdvice(eAdvice);
            } catch (e) {
                console.error('Failed to load guidance data:', e);
            }

            // P4: 加载项目失败画像和系统推荐
            try {
                const [profile, suggestion] = await Promise.all([
                    api.intelligence.getProjectProfile(project.id),
                    api.intelligence.getInstructionSuggestion(project.id)
                ]);
                setProjectProfile(profile);
                setSystemSuggestion(suggestion);
            } catch (e) {
                console.error('Failed to load intelligence data:', e);
            }
            
            setTask(taskData);
            setBatchState(batchData);
            setLoading(false);
        } catch (e) {
            console.error('Failed to load state:', e);
        }
    };

    const getRecentLogs = (): EpisodeAttemptLog[] => {
        try {
            const key = `scriptflow_attempts_${project.id}`;
            const data = localStorage.getItem(key);
            const logs = data ? JSON.parse(data) : [];
            return logs.slice(-20).reverse(); // More logs for sidebar
        } catch (e) {
            return [];
        }
    };

    // --- Handlers ---

    const handleStart = async () => {
        try { await api.task.start(project.id); await loadState(); }
        catch (e: any) { alert(`启动失败: ${e.message}`); }
    };

    const handlePause = async () => {
        try { await api.task.pause(project.id); await loadState(); }
        catch (e: any) { alert(`暂停失败: ${e.message}`); }
    };

    const handleResume = async () => {
        try { await api.task.resume(project.id); await loadState(); }
        catch (e: any) { alert(`恢复失败: ${e.message}`); }
    };

    const handleAbort = async () => {
        if (!confirm('确定中止？')) return;
        try { await api.task.abort(project.id); await loadState(); }
        catch (e: any) { alert(`中止失败: ${e.message}`); }
    };

    const handleSaveContent = async () => {
        if (!currentEp) return;
        setIsSaving(true);
        try {
            await api.episode.update(project.id, currentEp.id, editorContent);
            await onRefresh();
        } catch (e: any) { alert('保存失败: ' + e.message); }
        finally { setIsSaving(false); }
    };

    const handleGenerateSingleEpisode = async () => {
        if (!currentEp) return;
        setIsGeneratingEp(true);
        try {
            await api.episode.generate(project.id, currentEp.id);
            await onRefresh();
            // Auto switch to editor if success
            setCurrentViewMode('editor');
        } catch (e: any) { alert('生成失败: ' + e.message); }
        finally { setIsGeneratingEp(false); }
    };

    // P3.2: 处理微调指令
    const handleApplyInstruction = async (instructionId: string) => {
        if (!currentEp) return;
        setIsGeneratingEp(true);
        try {
            await api.guidance.applyInstruction(project.id, currentEp.id, instructionId);
            await onRefresh();
            await loadState(); // 重新加载状态，包括失败分析
            alert('微调指令已应用，剧本已重新生成');
        } catch (e: any) { 
            alert('应用指令失败: ' + e.message); 
        } finally { 
            setIsGeneratingEp(false); 
        }
    };

    // --- Helpers ---

    const currentEp = project.episodes?.[currentEpIndex];
    if (!project.episodes?.length) return <div className="p-12 text-center text-textMuted">暂无集数数据...</div>;

    /**
     * 判断当前项目阶段是否允许"标记为完成"
     *
     * S1 阶段（逐集修内容）：不允许标记为完成，只保存当前版本
     * S2 及后续阶段：允许标记为完成（终态语义）
     */
    const canMarkAsCompleted = () => {
        // S1 阶段（逐集修内容）：不允许标记为完成
        if ((project as any).phase === 'S1') return false;

        // 未定义阶段：保守处理，不允许
        if (!(project as any).phase) return false;

        // 仅在 S2 及后续阶段允许
        const allowedPhases = ['S2', 'READY_FOR_EXPORT', 'DELIVERED'];
        return allowedPhases.includes((project as any).phase);
    };

    /**
     * 根据项目阶段和剧集状态决定保存按钮的文案和样式
     */
    const getSaveButtonConfig = () => {
        const isDraft = currentEp.status === EpisodeStatus.DRAFT || currentEp.status === EpisodeStatus.DEGRADED;
        const canComplete = canMarkAsCompleted();

        if (isDraft) {
            if (canComplete) {
                // S2 及后续阶段 + DRAFT → 允许标记完成（终态语义）
                return {
                    text: '保存并标记完成',
                    className: 'bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 border border-orange-500/30'
                };
            } else {
                // S1 阶段 + DRAFT → 非终态语义（可反复生成/修改）
                return {
                    text: '保存草稿',
                    className: 'bg-primary/20 hover:bg-primary/30 text-primary'
                };
            }
        } else {
            // 已完成剧集
            return {
                text: '保存修改',
                className: 'bg-primary/20 hover:bg-primary/30 text-primary'
            };
        }
    };

    /**
     * 计算进度百分比（状态驱动）
     *
     * 只有通过质量检查且 status === COMPLETED 的剧集才会被计入 batch.completed。
     * DRAFT / GENERATING / FAILED 状态的剧集不会推进进度。
     *
     * 状态驱动保证：batch.completed 数组在 batchRunner.ts 中严格按 episode.status === COMPLETED 维护
     */
    const getProgress = () => {
        if (!batchState) return 0;
        const total = batchState.endEpisode - batchState.startEpisode + 1;
        const done = batchState.completed.length;
        return Math.round((done / total) * 100);
    };

    const getStatusColor = (status?: string) => {
        switch (status) {
            case 'RUNNING': return 'text-emerald-400';
            case 'PAUSED': return 'text-amber-400';
            case 'FAILED': return 'text-red-400';
            case 'DONE': return 'text-primary';
            default: return 'text-gray-400';
        }
    };

    // Filter episodes for list
    const filteredEpisodes = project.episodes.filter(ep => {
        if (outlineFilter === 'all') return true;
        return ep.outline?.act === outlineFilter;
    });

    return (
        <div className="flex flex-col h-full bg-background animate-in fade-in duration-500 overflow-hidden">

            {/* --- Top: Production Header --- */}
            <div className={`border-b border-white/5 bg-surface/50 backdrop-blur-md z-20 transition-all duration-300 ${isHeaderExpanded ? 'h-auto py-4' : 'h-14 py-2'}`}>
                <div className="px-6 flex items-center justify-between">

                    {/* Left: Project Status */}
                    <div className="flex items-center gap-6">
                        <button onClick={() => setIsHeaderExpanded(!isHeaderExpanded)} className="p-1 bg-white/5 rounded hover:bg-white/10 text-textMuted">
                            {isHeaderExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>

                        <div className="flex flex-col">
                            <div className="flex items-center gap-3">
                                <h1 className="text-lg font-bold text-white tracking-tight">{project.name}</h1>
                                {task?.status && (
                                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full bg-white/5 flex items-center gap-1.5 ${getStatusColor(task.status)}`}>
                                        <span className={`w-1.5 h-1.5 rounded-full bg-current animate-pulse`} />
                                        {task.status}
                                    </span>
                                )}
                            </div>
                            {isHeaderExpanded && (
                                <div className="flex items-center gap-3 text-xs text-textMuted mt-1">
                                    <span>{project.genre}</span>
                                    <span>•</span>
                                    <span>{project.totalEpisodes} 集</span>
                                    <span>•</span>
                                    {/* 状态驱动：batch.completed 只包含 status === COMPLETED 的剧集 */}
                                    <span>{batchState ? `${Math.max(0, ...batchState.completed)} / ${project.totalEpisodes} Completed` : 'Ready'}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Center: Controls (Only Show when Expanded or Simple when Collapsed) */}
                    <div className="flex items-center gap-4">
                        {(!task || task.status === 'IDLE') && (
                            <button onClick={handleStart} className="flex items-center gap-2 px-6 py-2 bg-primary hover:bg-primaryHover text-white font-bold rounded-lg text-sm shadow-glow transition-all">
                                <Play size={16} fill="currentColor" />
                                <span>开始冷启动验证</span>
                            </button>
                        )}

                        {task?.status === 'RUNNING' && (
                            <>
                                <button onClick={handlePause} className="p-2 bg-amber-500/10 text-amber-400 rounded-lg hover:bg-amber-500/20 border border-amber-500/20">
                                    <Pause size={18} fill="currentColor" />
                                </button>
                                <button onClick={handleAbort} className="p-2 bg-red-500/10 text-red-400 rounded-lg hover:bg-red-500/20 border border-red-500/20">
                                    <XCircle size={18} />
                                </button>
                            </>
                        )}

                        {task?.status === 'PAUSED' && (
                            <button onClick={handleResume} className="flex items-center gap-2 px-6 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-lg text-sm shadow-glow transition-all">
                                <RotateCcw size={16} />
                                <span>继续推进剧情</span>
                            </button>
                        )}
                    </div>

                    {/* Right: Progress */}
                    <div className="w-64">
                        {batchState && (
                            <div className="space-y-2">
                                {/* 暂停提示 */}
                                {batchState.status === 'PAUSED' && batchState.completed.length >= 3 && batchState.completed.length < project.totalEpisodes && (
                                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 animate-in fade-in">
                                        <div className="flex items-center gap-2 mb-1">
                                            <CheckCircle size={14} className="text-emerald-500" />
                                            <span className="text-emerald-500 font-bold text-xs uppercase tracking-wider">前 3 集已完成</span>
                                        </div>
                                        <p className="text-textMuted text-[10px]">可继续生成全集或人工修改</p>
                                    </div>
                                )}

                                {/* 进度条 */}
                                <div className="space-y-1">
                                    <div className="flex justify-between text-[10px] text-textMuted uppercase font-bold">
                                        <span>Batch Progress</span>
                                        <span>{getProgress()}%</span>
                                    </div>
                                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                                        <div className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-500" style={{ width: `${getProgress()}%` }} />
                                    </div>
                                </div>

                                {/* Run Summary */}
                                {batchState.status === 'DONE' && project.summaryText && (
                                  <div className="mt-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 animate-in fade-in">
                                    <div className="flex items-center gap-2 mb-3">
                                      <CheckCircle size={16} className="text-emerald-500" />
                                      <span className="text-xs font-bold text-emerald-500 uppercase tracking-wider">生成完成</span>
                                    </div>
                                    <details className="group">
                                      <summary className="text-xs text-textMuted cursor-pointer hover:text-white transition-colors flex items-center gap-2">
                                        <ChevronDown size={14} className="group-hover:translate-y-0.5 transition-transform" />
                                        查看运行报告
                                      </summary>
                                      <pre className="mt-3 text-xs font-mono text-emerald-300/80 whitespace-pre-wrap bg-black/30 rounded-lg p-4 border border-white/5 overflow-x-auto">
                                        {project.summaryText}
                                      </pre>
                                    </details>
                                  </div>
                                )}
                            </div>
                        )}
                    </div>

                </div>

                {/* Expanded details */}
                {isHeaderExpanded && (
                    <div className="px-6 mt-4 pt-4 border-t border-white/5 space-y-4">
                        {/* P3.3: 创作方向建议 */}
                        {episodeAdvice && (
                            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <TrendingUp size={14} className="text-blue-400" />
                                    <span className="text-xs font-bold text-blue-400 uppercase tracking-wider">
                                        创作方向建议
                                    </span>
                                </div>
                                <p className="text-xs text-white/90 mb-3">{episodeAdvice.reason}</p>
                                <div className="flex gap-2">
                                    <button 
                                        onClick={async () => {
                                            // 应用建议（调整集数）
                                            await api.project.save(project.id, { totalEpisodes: episodeAdvice.recommendedEpisodes });
                                            await api.guidance.dismissEpisodeAdvice(project.id);
                                            await onRefresh();
                                        }}
                                        className="px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 text-xs font-bold rounded-lg transition-colors"
                                    >
                                        调整为 {episodeAdvice.recommendedEpisodes} 集
                                    </button>
                                    <button 
                                        onClick={async () => {
                                            // 忽略建议
                                            await api.guidance.dismissEpisodeAdvice(project.id);
                                            await onRefresh();
                                        }}
                                        className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-textMuted text-xs font-bold rounded-lg transition-colors"
                                    >
                                        保持原计划
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* P4: 智能系统推荐 */}
                        {systemSuggestion && systemSuggestion.confidence === 'high' && (
                            <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4 animate-in fade-in">
                                <div className="flex items-center gap-2 mb-2">
                                    <Zap size={14} className="text-purple-400" />
                                    <span className="text-xs font-bold text-purple-400 uppercase tracking-wider">
                                        💡 系统建议（{systemSuggestion.confidence === 'high' ? '高置信' : '中置信'}）
                                    </span>
                                </div>
                                <p className="text-xs text-white/90 mb-3">{systemSuggestion.reason}</p>
                                <div className="flex gap-2">
                                    <button
                                        onClick={async () => {
                                            // 应用推荐指令
                                            if (currentEp) {
                                                setIsGeneratingEp(true);
                                                try {
                                                    await api.intelligence.applyRecommendation(project.id, currentEp.id, systemSuggestion.instructionId);
                                                    await onRefresh();
                                                    await loadState(); // 重新加载状态
                                                    alert('系统建议已应用，剧本已重新生成');
                                                } catch (e: any) {
                                                    alert('应用建议失败: ' + e.message);
                                                } finally {
                                                    setIsGeneratingEp(false);
                                                }
                                            } else {
                                                alert('请先选择一集');
                                            }
                                        }}
                                        className="px-3 py-1.5 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 text-xs font-bold rounded-lg transition-colors"
                                    >
                                        应用指令
                                    </button>
                                    <button
                                        onClick={async () => {
                                            // 忽略推荐
                                            await api.intelligence.dismissSuggestion(project.id);
                                            await onRefresh();
                                        }}
                                        className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-textMuted text-xs font-bold rounded-lg transition-colors"
                                    >
                                        忽略本次
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* P4: 项目失败画像摘要 */}
                        {projectProfile && projectProfile.summary && (
                            <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <AlertCircle size={14} className="text-orange-400" />
                                    <span className="text-xs font-bold text-orange-400 uppercase tracking-wider">
                                        项目画像
                                    </span>
                                </div>
                                <p className="text-xs text-white/90">{projectProfile.summary}</p>
                            </div>
                        )}

                        <div className="flex items-center gap-6 overflow-x-auto text-xs text-textMuted">
                            <div className="flex items-center gap-2">
                                <Target size={14} className="text-primary" />
                                <span>当前目标: {task?.step === 'EPISODE' ? `生成 EP${task.currentEpisode}` : '准备中'}</span>
                            </div>
                            <div className="w-px h-3 bg-white/10" />
                            {(() => {
                                const rec = project.platformId === 'hongguo'; // Simple check
                                if (!rec) return null;
                                return (
                                    <div className="flex items-center gap-2 text-rose-400">
                                        <TrendingUp size={14} />
                                        <span>红果推荐区间监控中</span>
                                    </div>
                                )
                            })()}
                        </div>
                    </div>
                )}
            </div>

            {/* --- Main Workspace Area --- */}
            <div className="flex-1 flex overflow-hidden">

                {/* --- Left: Outline & Navigation --- */}
                <div className="w-80 border-r border-white/5 bg-surface/30 backdrop-blur-xl flex flex-col z-10">
                    {/* Filter Header */}
                    <div className="p-4 border-b border-white/5 flex items-center justify-between">
                        <h3 className="text-xs font-bold text-textMuted uppercase tracking-wider flex items-center gap-2">
                            <List size={14} /> 剧本大纲
                        </h3>
                        <div className="flex items-center gap-1 bg-black/20 rounded p-0.5">
                            <button
                                onClick={() => setOutlineFilter('all')}
                                className={`px-2 py-0.5 text-[10px] rounded ${outlineFilter === 'all' ? 'bg-white/10 text-white' : 'text-textMuted hover:text-white'}`}
                            >
                                All
                            </button>
                            <button
                                onClick={() => setOutlineFilter(1)}
                                className={`px-2 py-0.5 text-[10px] rounded ${outlineFilter === 1 ? 'bg-blue-500/20 text-blue-400' : 'text-textMuted hover:text-white'}`}
                            >
                                Act 1
                            </button>
                        </div>
                    </div>

                    {/* List */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                        {filteredEpisodes.map((ep, idx) => {
                            const isActive = ep.id === currentEp.id;
                            /* Find original index since filter changes map index */
                            const originalIndex = project.episodes.findIndex(e => e.id === ep.id);
                            const isDone = ep.status === EpisodeStatus.COMPLETED;

                            return (
                                <button
                                    key={ep.id}
                                    onClick={() => setCurrentEpIndex(originalIndex)}
                                    className={`w-full text-left p-3 rounded-xl border transition-all group relative overflow-hidden ${isActive
                                        ? 'bg-primary/10 border-primary/30 shadow-[0_4px_12px_rgba(0,0,0,0.2)]'
                                        : 'bg-transparent border-transparent hover:bg-white/5 hover:border-white/5'
                                        }`}
                                >
                                    {/* Status Dot */}
                                    <div className={`absolute top-3 right-3 w-1.5 h-1.5 rounded-full ${isDone ? 'bg-emerald-500' : 'bg-white/10'
                                        }`} />

                                    <div className="flex items-center gap-2 mb-1.5">
                                        <span className={`font-mono text-[10px] font-bold ${isActive ? 'text-primary' : 'text-textMuted'}`}>
                                            EP.{String(ep.id).padStart(2, '0')}
                                        </span>
                                        <span className={`text-[9px] px-1.5 py-0.5 rounded border uppercase tracking-wider ${ep.outline?.act === 1 ? 'border-blue-500/20 text-blue-400' :
                                            ep.outline?.act === 2 ? 'border-purple-500/20 text-purple-400' :
                                                'border-orange-500/20 text-orange-400'
                                            }`}>
                                            Act {ep.outline?.act || '?'}
                                        </span>
                                    </div>
                                    <p className={`text-xs line-clamp-2 leading-relaxed ${isActive ? 'text-white' : 'text-textMuted/80 group-hover:text-white/90'}`}>
                                        {ep.outline?.summary || 'Generating...'}
                                    </p>
                                </button>
                            )
                        })}
                    </div>
                </div>

                {/* --- Center: Editor or Preview --- */}
                <div className="flex-1 flex flex-col bg-background relative shadow-[inset_0_0_100px_rgba(0,0,0,0.5)] min-h-0">

                    {/* Editor Toolbar */}
                    <div className="h-12 border-b border-white/5 flex items-center justify-between px-6 bg-surface/30 backdrop-blur-sm z-10">
                        <div className="flex items-center gap-3 text-sm font-medium text-textMuted">
                            <span className="text-white">EP {currentEp.id}</span>
                            <span className="text-white/20">|</span>
                            <span className="truncate max-w-lg" title={currentEp.outline?.summary}>{currentEp.outline?.summary || 'No Outline'}</span>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar relative">
                        {currentViewMode === 'preview' ? (
                            <div className="max-w-3xl mx-auto py-12 px-8">
                                {/* Preview / Seed Card */}
                                <div className="glass-panel p-8 rounded-3xl border border-white/10 shadow-2xl">
                                    <h2 className="text-2xl font-bold text-white mb-6">EP {currentEp.id} 大纲详情</h2>

                                    <div className="space-y-6">
                                        <div>
                                            <label className="text-xs font-bold text-textMuted uppercase tracking-wider mb-2 block">剧情概要</label>
                                            <p className="text-lg text-white leading-relaxed">{currentEp.outline?.summary || 'Content generating...'}</p>
                                        </div>
                                        <div className="grid grid-cols-2 gap-6">
                                            <div className="p-4 bg-white/5 rounded-xl border border-white/5">
                                                <label className="text-xs font-bold text-warning uppercase tracking-wider mb-2 block flex items-center gap-2">
                                                    <Zap size={12} /> 核心冲突
                                                </label>
                                                <p className="text-sm text-white/80">{currentEp.outline?.conflict || '...'}</p>
                                            </div>
                                            <div className="p-4 bg-white/5 rounded-xl border border-white/5">
                                                <label className="text-xs font-bold text-primary uppercase tracking-wider mb-2 block flex items-center gap-2">
                                                    <Anchor size={12} /> 钩子 (Hook)
                                                </label>
                                                <p className="text-sm text-white/80">{currentEp.outline?.hook || '...'}</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-12 flex justify-center gap-4">
                                        <button
                                            onClick={handleGenerateSingleEpisode}
                                            disabled={isGeneratingEp || task?.status === 'RUNNING'}
                                            className="px-8 py-3 bg-gradient-to-r from-primary to-accent hover:opacity-90 disabled:opacity-50 text-white font-bold rounded-xl shadow-glow transition-all flex items-center gap-2"
                                        >
                                            {isGeneratingEp ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                                            {isGeneratingEp ? 'AI 正在生成...' : '立即生成本集'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="max-w-3xl mx-auto py-12 px-8 min-h-full">
                                {currentEp.status === EpisodeStatus.DRAFT && (() => {
                                    const canComplete = canMarkAsCompleted();
                                    if (canComplete) {
                                        // S2 及后续阶段：鼓励标记完成
                                        return (
                                            <div className="mb-6 p-4 bg-orange-500/10 border border-orange-500/20 rounded-xl">
                                                <div className="flex items-start gap-3">
                                                    <CheckCircle size={16} className="text-orange-400 shrink-0 mt-0.5" />
                                                    <div className="flex-1">
                                                        <p className="text-sm text-orange-400 font-medium mb-1">剧本已生成</p>
                                                        <p className="text-xs text-textMuted leading-relaxed">
                                                            {currentEp.humanSummary || '可立即阅读，后台正在进行商业校验'}<br />
                                                            请编辑内容后点击「保存并标记完成」，系统将自动标记为 COMPLETED 并计入进度。
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    } else {
                                        // S1 阶段：状态提示（不鼓励终态）
                                        return (
                                            <div className="mb-6 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                                                <div className="flex items-start gap-3">
                                                    <RotateCcw size={16} className="text-blue-400 shrink-0 mt-0.5" />
                                                    <div className="flex-1">
                                                        <p className="text-sm text-blue-400 font-medium mb-1">当前阶段：修订中（S1）</p>
                                                        <p className="text-xs text-textMuted leading-relaxed">
                                                            {currentEp.humanSummary || '可立即阅读，后台正在进行商业校验'}<br />
                                                            本集可多次重写，建议在 S2 阶段再标记完成。
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    }
                                })()}
                                <textarea
                                    className="w-full h-full bg-transparent resize-none focus:outline-none font-sans text-lg leading-loose text-slate-200 placeholder-textMuted/20 selection:bg-primary/30 min-h-[800px]"
                                    value={editorContent}
                                    onChange={(e) => setEditorContent(e.target.value)}
                                    placeholder="在此处撰写剧本..."
                                    spellCheck={false}
                                    style={{ lineHeight: '2', fontFamily: "'Inter', system-ui, sans-serif" }}
                                />
                            </div>
                        )}
                    </div>
                </div>

                {/* --- Right: Tabs (Check | Logs | Canon) --- */}
                <div className="w-80 border-l border-white/5 bg-surface/30 backdrop-blur-xl flex flex-col z-10 transition-all duration-300 shrink-0">
                    {/* Tab Header */}
                    <div className="flex border-b border-white/5 shrink-0">
                        <button
                            onClick={() => setRightTab('check')}
                            className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-wider flex justify-center items-center gap-2 border-b-2 transition-colors ${rightTab === 'check' ? 'border-primary text-white bg-white/5' : 'border-transparent text-textMuted hover:text-white'}`}
                        >
                            <CheckCircle size={14} /> 质检
                        </button>
                        <button
                            onClick={() => setRightTab('logs')}
                            className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-wider flex justify-center items-center gap-2 border-b-2 transition-colors ${rightTab === 'logs' ? 'border-accent text-white bg-white/5' : 'border-transparent text-textMuted hover:text-white'}`}
                        >
                            <ScrollText size={14} /> 日志
                        </button>
                        <button
                            onClick={() => setRightTab('canon')}
                            className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-wider flex justify-center items-center gap-2 border-b-2 transition-colors ${rightTab === 'canon' ? 'border-purple-500 text-white bg-white/5' : 'border-transparent text-textMuted hover:text-white'}`}
                        >
                            <Lock size={14} /> 设定
                        </button>
                    </div>

                    {/* Tab Content */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-0 min-h-0">
                        {/* --- TAB: CHECK --- */}
                        {rightTab === 'check' && (
                            <div className="p-5 space-y-4">
                                {/* P3.1: 失败分析总结 */}
                                {failureAnalysis && failureAnalysis.degradedEpisodes > 0 && (
                                    <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3">
                                        <div className="flex items-center gap-2 mb-1">
                                            <TrendingUp size={14} className="text-rose-400" />
                                            <span className="text-xs font-bold text-rose-400 uppercase tracking-wider">
                                                失败分析
                                            </span>
                                        </div>
                                        <p className="text-xs text-white/90 mb-2">{failureAnalysis.humanSummary}</p>
                                        <div className="text-[10px] text-textMuted">
                                            降级 {failureAnalysis.degradedEpisodes} / {failureAnalysis.totalEpisodes} 集
                                        </div>
                                    </div>
                                )}

                                {/* P3.2: 微调指令 */}
                                {(currentEp.status === EpisodeStatus.DRAFT || currentEp.status === EpisodeStatus.DEGRADED) && (
                                    <InstructionPicker
                                        onApply={handleApplyInstruction}
                                        disabled={isGeneratingEp}
                                    />
                                )}

                                <div className="text-xs font-bold text-textMuted uppercase mb-2">当前集检测报告</div>
                                {currentEp.validation?.qualityCheck?.issues && currentEp.validation.qualityCheck.issues.length > 0 ? (
                                    currentEp.validation.qualityCheck.issues.map((issue, idx) => (
                                        <div key={idx} className="flex items-start gap-3 text-xs text-warning p-3 bg-warning/[0.03] rounded-xl border border-warning/10">
                                            <AlertCircle size={14} className="shrink-0 mt-0.5" />
                                            <span className="leading-relaxed opacity-90">{issue}</span>
                                        </div>
                                    ))
                                ) : (
                                    <div className="flex items-center gap-3 text-xs text-emerald-500 p-4 bg-emerald-500/[0.03] rounded-xl border border-emerald-500/10">
                                        <Check size={16} />
                                        <span className="font-medium">当前内容符合设定，暂无风险。</span>
                                    </div>
                                )}

                                {/* Context Info */}
                                <div className="mt-8 pt-6 border-t border-white/5">
                                    <div className="text-xs font-bold text-textMuted uppercase mb-4">本集焦点</div>
                                    <div className="space-y-3">
                                        <div className="p-3 bg-white/5 rounded-lg">
                                            <span className="text-[9px] text-textMuted uppercase block mb-1">Highlight</span>
                                            <span className="text-xs text-white">{currentEp.outline?.highlight || 'Pending'}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* --- TAB: LOGS --- */}
                        {rightTab === 'logs' && (
                            <div className="p-4 space-y-2">
                                {getRecentLogs().length === 0 && <div className="text-center text-xs text-textMuted py-8">暂无生成日志</div>}
                                {getRecentLogs().map((log, idx) => {
                                    // Simple Log Card
                                    return (
                                        <div key={idx} className="p-3 bg-white/5 rounded-lg border border-white/5 hover:border-white/10 transition-colors">
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="text-[10px] font-bold text-white uppercase">EP.{log.episodeIndex}</span>
                                                <span className="text-[9px] text-textMuted">{new Date(log.timestamp).toLocaleTimeString()}</span>
                                            </div>
                                            <div className={`text-xs ${!log.error ? 'text-emerald-400' : 'text-red-400'}`}>
                                                {!log.error ? 'Generation Successful' : 'Failed'}
                                            </div>
                                            {log.alignerResult && (
                                                <div className="mt-1 flex items-center gap-1">
                                                    <span className={`text-[9px] px-1 rounded border ${log.alignerResult.severity === 'PASS' ? 'border-emerald-500/50 text-emerald-500' :
                                                        'border-warning/50 text-warning'
                                                        }`}>{log.alignerResult.severity}</span>
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        )}

                        {/* --- TAB: CANON --- */}
                        {rightTab === 'canon' && (
                            <div className="p-5 space-y-4">
                                {!storyMemory ? (
                                    <div className="text-center text-textMuted text-xs">暂无设定数据</div>
                                ) : (
                                    <>
                                        {/* World Rules */}
                                        <div className="space-y-2">
                                            <div className="text-xs font-bold text-textMuted uppercase">核心法则</div>
                                            {storyMemory.canonLayer.worldRules.map((rule, idx) => (
                                                <div key={idx} className="glass-card p-3 rounded-lg border border-white/5 text-xs text-white/90">
                                                    {rule}
                                                </div>
                                            ))}
                                        </div>
                                        {/* Locked Events */}
                                        <div className="space-y-2 mt-4">
                                            <div className="text-xs font-bold text-textMuted uppercase">已锁死剧情</div>
                                            {storyMemory.plotLayer.lockedEvents.map((evt, idx) => (
                                                <div key={idx} className="glass-card p-3 rounded-lg border border-white/5">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <span className="text-xs font-bold text-white">Event {idx + 1}</span>
                                                        <Lock size={10} className="text-primary" />
                                                    </div>
                                                    <p className="text-[10px] text-textMuted leading-relaxed">{evt}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    {/* --- Bottom: Save Button Area (独立，固定在底部) --- */}
                    <div className="p-4 border-t border-white/5 bg-surface/50 backdrop-blur-sm shrink-0">
                        {currentViewMode === 'editor' && (() => {
                            const buttonConfig = getSaveButtonConfig();
                            return (
                                <button
                                    onClick={handleSaveContent}
                                    disabled={isSaving}
                                    className={`w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold rounded-xl transition-all shadow-lg hover:shadow-xl active:scale-[0.98] ${buttonConfig.className}`}
                                >
                                    {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                                    {buttonConfig.text}
                                </button>
                            );
                        })()}
                    </div>
                </div>

            </div>
        </div>
    );
};

export default UnifiedWorkspace;
