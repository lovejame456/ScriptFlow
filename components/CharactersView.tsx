import React, { useState, useEffect } from 'react';
import { User, Skull, Shield, ArrowLeft, Link2, Copy, Check } from 'lucide-react';
import { Character, ConflictChain, ConflictStage } from '../types';

interface CharactersViewProps {
  characters: Character[];
  conflictChain?: ConflictChain;
  onBack: () => void;
}

interface ConflictEdge {
  from: string;
  to: string;
  relationship: string;
}

const CharactersView: React.FC<CharactersViewProps> = ({ characters, conflictChain, onBack }) => {
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null);
  const [copied, setCopied] = useState(false);

  // 按角色类型分组
  const groupedCharacters = {
    主角: characters.filter(c => c.roleType === 'PROTAGONIST'),
    反派: characters.filter(c => c.roleType === 'ANTAGONIST'),
    配角: characters.filter(c => c.roleType === 'SUPPORT'),
  };

  // 生成仇恨链关系图
  const generateConflictChain = (): ConflictEdge[] => {
    if (!conflictChain || !conflictChain.stages) {
      return [];
    }

    const edges: ConflictEdge[] = [];
    const protagonist = characters.find(c => c.roleType === 'PROTAGONIST');

    if (!protagonist) {
      return edges;
    }

    // 从仇恨链构建关系
    conflictChain.stages.forEach(stage => {
      const antagonist = characters.find(c => c.name === stage.mainAntagonist);
      if (antagonist) {
        edges.push({
          from: protagonist.name,
          to: antagonist.name,
          relationship: stage.conflictSource
        });
      }
    });

    return edges;
  };

  const conflictEdges = generateConflictChain();

  // 默认选中第一个主角
  useEffect(() => {
    if (groupedCharacters.主角.length > 0 && !selectedCharacter) {
      setSelectedCharacter(groupedCharacters.主角[0]);
    }
  }, [characters]);

  // 一句话身份标签生成（≤20字）
  const generateIdentityLabel = (character: Character): string => {
    if (character.socialIdentity) {
      return character.socialIdentity.slice(0, 20);
    }
    if (character.commercialFunctionDetail) {
      return character.commercialFunctionDetail.storyFunction.slice(0, 20);
    }
    if (character.plotFunction) {
      return character.plotFunction.slice(0, 20);
    }
    return '未定义';
  };

  // 复制角色小传
  const copyCharacterProfile = () => {
    if (!selectedCharacter) return;

    const profile = generateCharacterText(selectedCharacter);
    navigator.clipboard.writeText(profile);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // 生成角色小传文本
  const generateCharacterText = (character: Character): string => {
    let text = `【角色小传 - ${character.name}】\n\n`;

    text += `【角色基础信息】\n`;
    text += `姓名：${character.name}\n`;
    text += `性别：${character.gender}\n`;
    text += `年龄区间：${character.ageRange}\n`;
    text += `当前社会身份/职业：${character.socialIdentity}\n`;
    text += `社会阶层定位：${character.commercialFunctionDetail?.storyFunction || character.plotFunction}\n\n`;

    if (character.background) {
      text += `【人物背景】\n`;
      text += `出身环境：${character.background.origin}\n`;
      text += `关键成长经历：${character.background.keyExperience.join('；')}\n`;
      text += `当前人生阶段：${character.background.lifeStage}\n\n`;
    } else if (character.description) {
      text += `【人物背景】\n`;
      text += `${character.description}\n\n`;
    }

    if (character.personalityDetail) {
      text += `【性格与行为模式】\n`;
      text += `对外呈现：${character.personalityDetail.external}\n`;
      text += `内在真实性格：${character.personalityDetail.internal}\n`;
      text += `决策习惯：${character.personalityDetail.decisionPattern}\n\n`;
    } else if (character.personality) {
      text += `【性格与行为模式】\n`;
      text += `${character.personality}\n\n`;
    }

    if (character.coreMotivationDetail) {
      text += `【核心动机】\n`;
      text += `当前最想得到：${character.coreMotivationDetail.desire}\n`;
      text += `最害怕失去：${character.coreMotivationDetail.fear}\n`;
      text += `愿意付出：${character.coreMotivationDetail.price}\n\n`;
    } else {
      text += `【核心动机】\n`;
      text += `动机：${character.motivation || character.coreDesire}\n\n`;
    }

    if (character.coreWeaknessDetail) {
      text += `【核心弱点】\n`;
      text += `致命缺陷：${character.coreWeaknessDetail.fatalFlaw}\n`;
      text += `软肋：${character.coreWeaknessDetail.storyTrigger}\n\n`;
    } else if (character.coreWeakness) {
      text += `【核心弱点】\n`;
      text += `${character.coreWeakness}\n\n`;
    }

    if (character.relationToProtagonistDetail) {
      text += `【与主角的关系 & 冲突】\n`;
      text += `关系来源：${character.relationToProtagonistDetail.origin}\n`;
      text += `当前冲突：${character.relationToProtagonistDetail.currentConflict}\n`;
      text += `未来升级方向：${character.relationToProtagonistDetail.escalationTrend}\n\n`;
    } else if (character.relationshipToProtagonist) {
      text += `【与主角的关系】\n`;
      text += `${character.relationshipToProtagonist}\n\n`;
    }

    if (character.commercialFunctionDetail) {
      text += `【商业短剧功能定位】\n`;
      text += `剧情功能：${character.commercialFunctionDetail.storyFunction}\n`;
      text += `爽点类型：${character.commercialFunctionDetail.pleasureType.join('、')}\n\n`;
    } else if (character.plotFunction) {
      text += `【商业短剧功能定位】\n`;
      text += `${character.plotFunction}\n\n`;
    }

    return text;
  };

  const roleTypeColor = (roleType: string) => {
    switch (roleType) {
      case 'PROTAGONIST':
        return 'bg-primary/20 text-primary border-primary/20';
      case 'ANTAGONIST':
        return 'bg-danger/20 text-danger border-danger/20';
      case 'SUPPORT':
        return 'bg-white/10 text-textMuted border-white/5';
      default:
        return 'bg-surfaceHighlight text-textMuted border-white/5';
    }
  };

  const roleTypeIcon = (roleType: string) => {
    switch (roleType) {
      case 'PROTAGONIST':
        return <User size={16} />;
      case 'ANTAGONIST':
        return <Skull size={16} />;
      case 'SUPPORT':
        return <Shield size={16} />;
      default:
        return <User size={16} />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-surface/50 to-surface/80 p-6 md:p-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-2 rounded-full glass-card text-textMuted hover:text-white hover:border-primary/30 transition-all group mb-6"
        >
          <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
          <span className="text-sm font-medium">返回项目概览</span>
        </button>

        <div className="text-center space-y-4">
          <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
            角色池 & 人物关系
          </h1>
          <p className="text-textMuted text-sm max-w-2xl mx-auto">
            角色设定由AI自动生成，保证剧情稳定性
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Character List */}
        <div className="lg:col-span-1 space-y-6">
          {Object.entries(groupedCharacters).map(([role, chars]) => (
            chars.length > 0 && (
              <div key={role} className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${roleTypeColor(role)}`}>
                    {roleTypeIcon(role)}
                  </div>
                  <h2 className="text-lg font-bold text-white">{role}</h2>
                  <span className="text-xs text-textMuted px-2 py-0.5 rounded-full bg-white/5">
                    {chars.length}
                  </span>
                </div>

                <div className="space-y-2">
                  {chars.map((char) => (
                    <div
                      key={char.id}
                      onClick={() => setSelectedCharacter(char)}
                      className={`glass-card rounded-xl p-4 cursor-pointer transition-all duration-200 hover:scale-[1.02] hover:border-primary/30 ${
                        selectedCharacter?.id === char.id ? 'ring-2 ring-primary/50 bg-primary/5' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-white text-base mb-1">{char.name}</h3>
                          <p className="text-xs text-textMuted">
                            {char.gender} · {char.ageRange}
                          </p>
                        </div>
                        <span className="text-xs px-2 py-1 rounded bg-white/5 text-textMuted shrink-0">
                          {role}
                        </span>
                      </div>
                      <p className="text-xs text-textMuted/70 mt-2 line-clamp-1">
                        {generateIdentityLabel(char)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )
          ))}
        </div>

        {/* Right Column: Character Detail & Conflict Chain */}
        <div className="lg:col-span-2 space-y-6">
          {/* Character Detail Panel */}
          {selectedCharacter && (
            <div className="glass-card rounded-2xl p-6 sticky top-8 animate-in slide-in-from-right duration-300">
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${roleTypeColor(selectedCharacter.roleType)}`}>
                    {roleTypeIcon(selectedCharacter.roleType)}
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-white">{selectedCharacter.name}</h2>
                    <span className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                      selectedCharacter.roleType === 'PROTAGONIST' ? 'bg-primary/20 text-primary' :
                      selectedCharacter.roleType === 'ANTAGONIST' ? 'bg-danger/20 text-danger' :
                      'bg-white/10 text-textMuted'
                    }`}>
                      {selectedCharacter.roleType === 'PROTAGONIST' ? '主角' :
                       selectedCharacter.roleType === 'ANTAGONIST' ? '反派' :
                       '配角'}
                    </span>
                  </div>
                </div>
                <button
                  onClick={copyCharacterProfile}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg glass-card text-xs text-textMuted hover:text-white transition-all"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? '已复制' : '复制小传'}
                </button>
              </div>

              {/* 角色小传内容 */}
              <div className="space-y-5">
                {/* 基础信息 */}
                <div className="glass-panel rounded-xl p-4">
                  <div className="flex items-center gap-2 text-textMuted text-xs font-bold uppercase tracking-wider mb-3">
                    <User size={14} />
                    <span>角色基础信息</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-textMuted/50 text-xs mb-1">姓名</div>
                      <div className="text-white font-medium">{selectedCharacter.name}</div>
                    </div>
                    <div>
                      <div className="text-textMuted/50 text-xs mb-1">性别/年龄</div>
                      <div className="text-white">{selectedCharacter.gender} · {selectedCharacter.ageRange}</div>
                    </div>
                    <div className="col-span-2">
                      <div className="text-textMuted/50 text-xs mb-1">社会身份/职业</div>
                      <div className="text-white">{selectedCharacter.socialIdentity}</div>
                    </div>
                    <div className="col-span-2">
                      <div className="text-textMuted/50 text-xs mb-1">社会阶层定位</div>
                      <div className="text-white">
                        {selectedCharacter.commercialFunctionDetail?.storyFunction || selectedCharacter.plotFunction}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 人物背景 */}
                {(selectedCharacter.background || selectedCharacter.description) && (
                  <div className="glass-panel rounded-xl p-4">
                    <div className="text-textMuted text-xs font-bold uppercase tracking-wider mb-3">
                      人物背景
                    </div>
                    <div className="text-white text-sm leading-relaxed space-y-2">
                      {selectedCharacter.background ? (
                        <>
                          <div>
                            <span className="text-textMuted/70">出身环境：</span>
                            {selectedCharacter.background.origin}
                          </div>
                          <div>
                            <span className="text-textMuted/70">关键成长经历：</span>
                            {selectedCharacter.background.keyExperience.join('；')}
                          </div>
                          <div>
                            <span className="text-textMuted/70">当前人生阶段：</span>
                            {selectedCharacter.background.lifeStage}
                          </div>
                        </>
                      ) : (
                        <div>{selectedCharacter.description}</div>
                      )}
                    </div>
                  </div>
                )}

                {/* 性格与行为模式 */}
                {(selectedCharacter.personalityDetail || selectedCharacter.personality) && (
                  <div className="glass-panel rounded-xl p-4">
                    <div className="text-textMuted text-xs font-bold uppercase tracking-wider mb-3">
                      性格与行为模式
                    </div>
                    <div className="text-white text-sm leading-relaxed space-y-2">
                      {selectedCharacter.personalityDetail ? (
                        <>
                          <div>
                            <span className="text-textMuted/70">对外呈现：</span>
                            {selectedCharacter.personalityDetail.external}
                          </div>
                          <div>
                            <span className="text-textMuted/70">内在性格：</span>
                            {selectedCharacter.personalityDetail.internal}
                          </div>
                          <div>
                            <span className="text-textMuted/70">决策习惯：</span>
                            {selectedCharacter.personalityDetail.decisionPattern}
                          </div>
                        </>
                      ) : (
                        <div>{selectedCharacter.personality}</div>
                      )}
                    </div>
                  </div>
                )}

                {/* 核心动机 */}
                <div className="glass-panel rounded-xl p-4">
                  <div className="text-textMuted text-xs font-bold uppercase tracking-wider mb-3">
                    核心动机
                  </div>
                  <div className="text-white text-sm leading-relaxed space-y-2">
                    {selectedCharacter.coreMotivationDetail ? (
                      <>
                        <div>
                          <span className="text-textMuted/70">最想要：</span>
                          {selectedCharacter.coreMotivationDetail.desire}
                        </div>
                        <div>
                          <span className="text-textMuted/70">最害怕失去：</span>
                          {selectedCharacter.coreMotivationDetail.fear}
                        </div>
                        <div>
                          <span className="text-textMuted/70">愿意付出：</span>
                          {selectedCharacter.coreMotivationDetail.price}
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <span className="text-textMuted/70">动机：</span>
                          {selectedCharacter.motivation || selectedCharacter.coreDesire}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* 核心弱点 */}
                {(selectedCharacter.coreWeaknessDetail || selectedCharacter.coreWeakness) && (
                  <div className="glass-panel rounded-xl p-4">
                    <div className="text-textMuted text-xs font-bold uppercase tracking-wider mb-3">
                      核心弱点
                    </div>
                    <div className="text-white text-sm leading-relaxed space-y-2">
                      {selectedCharacter.coreWeaknessDetail ? (
                        <>
                          <div>
                            <span className="text-textMuted/70">致命缺陷：</span>
                            {selectedCharacter.coreWeaknessDetail.fatalFlaw}
                          </div>
                          <div>
                            <span className="text-textMuted/70">软肋：</span>
                            {selectedCharacter.coreWeaknessDetail.storyTrigger}
                          </div>
                        </>
                      ) : (
                        <div>{selectedCharacter.coreWeakness}</div>
                      )}
                    </div>
                  </div>
                )}

                {/* 与主角的关系 */}
                <div className="glass-panel rounded-xl p-4">
                  <div className="text-textMuted text-xs font-bold uppercase tracking-wider mb-3">
                    与主角的关系 & 冲突
                  </div>
                  <div className="text-white text-sm leading-relaxed space-y-2">
                    {selectedCharacter.relationToProtagonistDetail ? (
                      <>
                        <div>
                          <span className="text-textMuted/70">关系来源：</span>
                          {selectedCharacter.relationToProtagonistDetail.origin}
                        </div>
                        <div>
                          <span className="text-textMuted/70">当前冲突：</span>
                          {selectedCharacter.relationToProtagonistDetail.currentConflict}
                        </div>
                        <div>
                          <span className="text-textMuted/70">未来升级方向：</span>
                          {selectedCharacter.relationToProtagonistDetail.escalationTrend}
                        </div>
                      </>
                    ) : (
                      <div>{selectedCharacter.relationshipToProtagonist}</div>
                    )}
                  </div>
                </div>

                {/* 商业功能定位 */}
                <div className="glass-panel rounded-xl p-4">
                  <div className="text-textMuted text-xs font-bold uppercase tracking-wider mb-3">
                    商业短剧功能定位
                  </div>
                  <div className="text-white text-sm leading-relaxed space-y-2">
                    {selectedCharacter.commercialFunctionDetail ? (
                      <>
                        <div>
                          <span className="text-textMuted/70">剧情功能：</span>
                          {selectedCharacter.commercialFunctionDetail.storyFunction}
                        </div>
                        <div>
                          <span className="text-textMuted/70">爽点类型：</span>
                          {selectedCharacter.commercialFunctionDetail.pleasureType.join('、')}
                        </div>
                      </>
                    ) : (
                      <div>{selectedCharacter.plotFunction}</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 仇恨链展示 */}
          {conflictEdges.length > 0 && (
            <div className="glass-card rounded-2xl p-6">
              <div className="flex items-center gap-2 text-textMuted text-xs font-bold uppercase tracking-wider mb-4">
                <Link2 size={14} />
                <span>仇恨链 / 冲突关系</span>
              </div>

              <div className="space-y-4">
                {conflictEdges.map((edge, index) => (
                  <div key={index} className="flex items-center gap-4 p-4 rounded-xl bg-surfaceHighlight/50">
                    <div className="flex-1 text-center">
                      <div className="text-white font-bold text-base">{edge.from}</div>
                      <div className="text-textMuted text-xs">主角</div>
                    </div>

                    <div className="flex items-center gap-2 px-3">
                      <div className="w-12 h-0.5 bg-gradient-to-r from-primary to-danger"></div>
                      <div className="px-3 py-1.5 rounded-lg bg-danger/20 text-danger text-xs text-center">
                        {edge.relationship}
                      </div>
                      <div className="w-12 h-0.5 bg-gradient-to-r from-danger to-primary"></div>
                    </div>

                    <div className="flex-1 text-center">
                      <div className="text-white font-bold text-base">{edge.to}</div>
                      <div className="text-textMuted text-xs">反派</div>
                    </div>
                  </div>
                ))}

                {conflictChain && conflictChain.stages && conflictChain.stages.length > 0 && (
                  <div className="mt-6 p-4 rounded-xl bg-surfaceHighlight/30">
                    <div className="text-textMuted text-xs font-bold uppercase tracking-wider mb-3">
                      冲突阶段
                    </div>
                    <div className="space-y-2">
                      {conflictChain.stages.map((stage, index) => (
                        <div key={index} className="flex items-start gap-3 text-sm">
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">
                            {stage.stageIndex}
                          </div>
                          <div className="flex-1">
                            <div className="text-white">
                              {stage.mainAntagonist} - {stage.conflictSource}
                            </div>
                            <div className="text-textMuted/70 text-xs mt-1">
                              {stage.pressureMethod} → {stage.resolutionType}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CharactersView;
