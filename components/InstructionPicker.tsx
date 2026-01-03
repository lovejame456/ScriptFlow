import React, { useState } from 'react';
import { Zap, Lock, TrendingUp, Wand2 } from 'lucide-react';

interface PresetInstruction {
  id: string;
  label: string;
  description: string;
}

interface InstructionPickerProps {
  onApply: (instructionId: string) => Promise<void>;
  disabled?: boolean;
}

const InstructionPicker: React.FC<InstructionPickerProps> = ({ onApply, disabled = false }) => {
  const [loading, setLoading] = useState<string | null>(null);

  const instructions: PresetInstruction[] = [
    {
      id: 'strengthen-antagonist',
      label: '强化反派',
      description: '增加反派出场频率，提升压迫感'
    },
    {
      id: 'reveal-early',
      label: '提前揭示真相',
      description: '将关键真相提前到本集或下集揭示'
    },
    {
      id: 'increase-cost',
      label: '加重代价',
      description: '提升主角面临的代价和风险'
    }
  ];

  const handleApply = async (instructionId: string) => {
    if (disabled || loading) return;
    
    setLoading(instructionId);
    try {
      await onApply(instructionId);
    } catch (error: any) {
      console.error('[InstructionPicker] Failed to apply instruction:', error);
      alert(`应用指令失败: ${error.message}`);
    } finally {
      setLoading(null);
    }
  };

  const getIcon = (id: string) => {
    switch (id) {
      case 'strengthen-antagonist':
        return <Zap size={14} className="text-rose-400" />;
      case 'reveal-early':
        return <Lock size={14} className="text-amber-400" />;
      case 'increase-cost':
        return <TrendingUp size={14} className="text-emerald-400" />;
      default:
        return <Wand2 size={14} className="text-primary" />;
    }
  };

  return (
    <div className="space-y-3">
      <div className="text-xs font-bold text-textMuted uppercase tracking-wider mb-3">
        微调指令
      </div>
      <div className="grid grid-cols-1 gap-2">
        {instructions.map((instruction) => (
          <button
            key={instruction.id}
            onClick={() => handleApply(instruction.id)}
            disabled={disabled || loading !== null}
            className={`
              flex items-center gap-3 p-3 rounded-xl border transition-all text-left
              ${disabled || loading !== null
                ? 'bg-white/5 border-white/5 text-textMuted cursor-not-allowed opacity-50'
                : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20 hover:text-white cursor-pointer'
              }
            `}
          >
            <div className="shrink-0">
              {loading === instruction.id ? (
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              ) : (
                getIcon(instruction.id)
              )}
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium text-white mb-0.5">
                {instruction.label}
              </div>
              <div className="text-xs text-textMuted">
                {instruction.description}
              </div>
            </div>
          </button>
        ))}
      </div>
      {loading && (
        <div className="text-xs text-primary animate-pulse">
          正在应用指令，AI 正在重新生成...
        </div>
      )}
    </div>
  );
};

export default InstructionPicker;

