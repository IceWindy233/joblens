import { useState } from 'react';
import type {
  EffectiveGreetingConfig,
  GreetingPreferences,
  GreetingPresetId,
  RulePreferenceConflict,
} from '../../shared/types';
import {
  GREETING_PRESETS,
  exportGreetingRulesConfig,
  extractRuleTextDirectives,
  importGreetingRulesConfig,
} from '../../profile/manager';
import {
  IconAlert,
  IconChevronDown,
  IconCopy,
  IconDownload,
  IconRefresh,
  IconSliders,
  IconUpload,
  ToggleSwitch,
} from '../../components/Icons';

interface Props {
  title: string;
  description?: string;
  selectionRules?: string;
  onSelectionRulesChange?: (rules: string) => void;
  rules: string;
  preferences: GreetingPreferences;
  onRulesChange: (rules: string) => void;
  onPreferencesChange: (prefs: GreetingPreferences) => void;
  defaultRulesText: string;
  defaultPreferences: GreetingPreferences;
  effectivePreview?: EffectiveGreetingConfig;
  conflicts?: RulePreferenceConflict[];
  textareaAriaLabel?: string;
  placeholder?: string;
}

const PRESET_ORDER: readonly GreetingPresetId[] = ['concise', 'technical', 'achievement', 'custom'];

export function formatPreferencesSummary(prefs: GreetingPreferences): string {
  const parts = [
    `最多 ${prefs.maxPoints} 条素材`,
    prefs.singleParagraph ? '单段' : '允许分段',
    prefs.allowLists ? '允许列表' : '无列表',
    prefs.maxChars === null
      ? '不限字数'
      : `上限 ${prefs.maxChars} 字${prefs.targetLengthHint ? `（建议 ${prefs.targetLengthHint}）` : ''}`,
    prefs.allowGapExplanation ? '可解释差距' : '聚焦优势',
    prefs.useExamples ? '参考样例' : '不参考样例',
  ];
  return parts.join(' · ');
}

export function GreetingRulesConfig({
  title,
  description,
  selectionRules,
  onSelectionRulesChange,
  rules,
  preferences,
  onRulesChange,
  onPreferencesChange,
  defaultRulesText,
  defaultPreferences,
  effectivePreview,
  conflicts = [],
  textareaAriaLabel = '打招呼语规则',
  placeholder,
}: Props) {
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const applyPreset = (id: GreetingPresetId) => {
    const preset = GREETING_PRESETS[id];
    const hasCustomText = rules.trim() && rules.trim() !== defaultRulesText.trim();
    const isAnotherPreset = Object.values(GREETING_PRESETS).some((p) => p.rules.trim() === rules.trim());
    if (hasCustomText && !isAnotherPreset && id !== 'custom') {
      if (!window.confirm(`套用“${preset.label}”模板将替换当前规则文本，参数也可继续微调。是否继续？`)) {
        return;
      }
    }
    if (id !== 'custom') onRulesChange(preset.rules);
    onPreferencesChange({ ...preset.preferences });
    setNotice({ kind: 'ok', text: `已套用“${preset.label}”模板，可继续自由编辑` });
  };

  const onCopyRules = async () => {
    try {
      await navigator.clipboard.writeText(rules);
      setNotice({ kind: 'ok', text: '已复制规则文本' });
    } catch {
      setNotice({ kind: 'err', text: '复制失败，请手动选中复制' });
    }
  };

  const onExport = async () => {
    const json = exportGreetingRulesConfig(rules, preferences);
    try {
      await navigator.clipboard.writeText(json);
      setNotice({ kind: 'ok', text: '已复制配置 JSON 到剪贴板' });
    } catch {
      setImportText(json);
      setShowImport(true);
      setNotice({ kind: 'ok', text: '已在下方展示导出的 JSON，可手动复制保存' });
    }
  };

  const onImportConfirm = () => {
    const parsed = importGreetingRulesConfig(importText);
    if (!parsed) {
      setNotice({ kind: 'err', text: 'JSON 格式无效，请检查导入内容' });
      return;
    }
    onRulesChange(parsed.rules);
    onPreferencesChange({ ...preferences, ...parsed.preferences, preset: parsed.preferences.preset ?? 'custom' });
    setShowImport(false);
    setImportText('');
    setNotice({ kind: 'ok', text: '已导入规则与偏好配置' });
  };

  const onReset = () => {
    if (rules.trim() && rules.trim() !== defaultRulesText.trim()) {
      if (!window.confirm('用默认规则与默认参数替换当前内容？')) return;
    }
    onRulesChange(defaultRulesText);
    onPreferencesChange({ ...defaultPreferences });
    setNotice({ kind: 'ok', text: '已恢复默认规则' });
  };

  const updatePref = <K extends keyof GreetingPreferences>(key: K, value: GreetingPreferences[K]) => {
    onPreferencesChange({ ...preferences, preset: 'custom', [key]: value });
  };

  return (
    <div className="panel-card stack">
      <div className="row between wrap">
        <div className="stack-sm">
          <h3>{title}</h3>
          {description && <span className="muted">{description}</span>}
        </div>
        <div className="row-sm wrap">
          <button type="button" className="ghost small" onClick={() => void onCopyRules()}>
            <IconCopy size={13} />
            复制
          </button>
          <button type="button" className="ghost small" onClick={() => void onExport()}>
            <IconDownload size={13} />
            导出
          </button>
          <button type="button" className="ghost small" onClick={() => setShowImport((v) => !v)}>
            <IconUpload size={13} />
            {showImport ? '收起' : '导入'}
          </button>
          <button type="button" className="link small" onClick={onReset}>
            <IconRefresh size={12} />
            恢复默认
          </button>
        </div>
      </div>

      {/* 4 个可编辑预设模板 */}
      <div className="stack-sm">
        <span className="muted">选择风格起点（仅作可编辑模板，随时修改）：</span>
        <div className="grid-4">
          {PRESET_ORDER.map((id) => {
            const preset = GREETING_PRESETS[id];
            const active = preferences.preset === id;
            return (
              <button
                key={id}
                type="button"
                className={`preset-card ${active ? 'active' : ''}`}
                onClick={() => applyPreset(id)}
              >
                <span className="preset-title">{preset.label}</span>
                <span className="preset-desc">{preset.description}</span>
              </button>
            );
          })}
        </div>
      </div>

      {onSelectionRulesChange && (
        <label className="field">
          <span>选材与岗位重点规则（阶段 A 生效，决定挑哪几段经历；仅改下方写作风格不会重跑阶段 A）</span>
          <textarea
            aria-label="选材与岗位重点规则"
            rows={2}
            value={selectionRules ?? ''}
            placeholder="例：Agent 岗位优先突出 LangGraph 编排与工具校验；工程化岗位优先突出自动化测试平台。"
            onChange={(e) => onSelectionRulesChange(e.target.value)}
          />
        </label>
      )}

      <label className="field">
        <span>写作表达与格式规则（阶段 B 生效，控制语气、篇幅、段落与固定结尾）</span>
        <textarea
          aria-label={textareaAriaLabel}
          rows={5}
          value={rules}
          placeholder={placeholder}
          onChange={(e) => onRulesChange(e.target.value)}
        />
      </label>

      {conflicts.length > 0 && (
        <div className="notice warn stack-sm">
          <div className="row between wrap">
            <span className="row-sm" style={{ fontWeight: 600 }}>
              <IconAlert size={14} />
              检测到文字规则与校验参数存在差异
            </span>
            <div className="row-sm">
              <button
                type="button"
                className="small"
                onClick={() => {
                  const directives = extractRuleTextDirectives(rules);
                  onPreferencesChange({
                    ...preferences,
                    ...directives,
                    conflictResolution: 'text',
                  });
                  setNotice({ kind: 'ok', text: '已将文字规则中的显式要求同步到参数面板' });
                }}
              >
                以文字同步参数
              </button>
              <button
                type="button"
                className="small"
                onClick={() => {
                  onPreferencesChange({ ...preferences, conflictResolution: 'structured' });
                  setNotice({ kind: 'ok', text: '已切换为优先采用下方结构化校验参数' });
                }}
              >
                改以参数为准
              </button>
            </div>
          </div>
          {conflicts.map((c, idx) => (
            <div key={`${c.layer}-${c.field}-${idx}`} className="small">
              · <strong>{c.label}</strong>：文字写了“{c.textValue}”，参数设为“{c.structuredValue}” → 当前生效：<strong>{c.resolvedValue}</strong>
            </div>
          ))}
        </div>
      )}

      {/* 校验与生成参数折叠区 */}
      <details className="drawer">
        <summary>
          <span className="row-sm">
            <IconSliders size={13} />
            <span>生成与校验参数（{formatPreferencesSummary(preferences)}）</span>
          </span>
          <IconChevronDown size={14} className="chevron" />
        </summary>
        <div className="panel-card subtle stack" style={{ marginTop: 8 }}>
          <div className="row between wrap">
            <span className="small" style={{ fontWeight: 500 }}>当文字规则与参数设置冲突时：</span>
            <div className="segmented">
              <button
                type="button"
                className={`seg-tab ${(preferences.conflictResolution ?? 'text') === 'text' ? 'active' : ''}`}
                onClick={() => onPreferencesChange({ ...preferences, conflictResolution: 'text' })}
              >
                以文字规则为准
              </button>
              <button
                type="button"
                className={`seg-tab ${preferences.conflictResolution === 'structured' ? 'active' : ''}`}
                onClick={() => onPreferencesChange({ ...preferences, conflictResolution: 'structured' })}
              >
                以参数为准
              </button>
            </div>
          </div>
          <div className="grid-2">
            <label className="field">
              <span>匹配素材上限（1–8 条）</span>
              <select
                value={preferences.maxPoints}
                onChange={(e) => updatePref('maxPoints', Number(e.target.value))}
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <option key={n} value={n}>
                    最多 {n} 条
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>最大字数上限</span>
              <div className="row">
                <input
                  type="text"
                  inputMode="numeric"
                  disabled={preferences.maxChars === null}
                  value={preferences.maxChars ?? ''}
                  placeholder="不限"
                  onChange={(e) => {
                    const num = Number(e.target.value.replace(/[^\d]/g, ''));
                    if (Number.isFinite(num) && num > 0) {
                      updatePref('maxChars', Math.min(2000, num));
                    } else if (e.target.value === '') {
                      updatePref('maxChars', 20);
                    }
                  }}
                />
                <ToggleSwitch
                  checked={preferences.maxChars === null}
                  onChange={(unlimited) => {
                    if (unlimited) {
                      onPreferencesChange({
                        ...preferences,
                        preset: 'custom',
                        maxChars: null,
                        targetLengthHint: undefined,
                      });
                    } else {
                      updatePref('maxChars', 160);
                    }
                  }}
                  label="不限"
                />
              </div>
            </label>
          </div>

          <div className="grid-2">
            <ToggleSwitch
              checked={!preferences.singleParagraph}
              onChange={(allow) => updatePref('singleParagraph', !allow)}
              label="允许分段换行"
            />
            <ToggleSwitch
              checked={preferences.allowLists}
              onChange={(allowLists) => {
                onPreferencesChange({
                  ...preferences,
                  preset: 'custom',
                  allowLists,
                  ...(allowLists ? { singleParagraph: false } : {}),
                });
              }}
              label="允许分点 / 列表"
            />
            <ToggleSwitch
              checked={preferences.allowGapExplanation}
              onChange={(v) => updatePref('allowGapExplanation', v)}
              label="允许主动解释能力差距"
            />
            <ToggleSwitch
              checked={preferences.useExamples}
              onChange={(v) => updatePref('useExamples', v)}
              label="参考历史打招呼语样例"
            />
          </div>
          <span className="muted">
            规则文本中的显式要求（如“分段”“分点列表”“不超过 250 字”“提及短板”）会自动覆盖低优先级限制。
          </span>
        </div>
      </details>

      {showImport && (
        <div className="panel-card subtle stack-sm">
          <span className="small" style={{ fontWeight: 500 }}>粘贴规则配置 JSON：</span>
          <textarea
            rows={4}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder='{"version": 1, "rules": "...", "preferences": {...}}'
          />
          <div className="row">
            <button type="button" className="primary small" onClick={onImportConfirm}>
              确认导入
            </button>
            <button type="button" className="small" onClick={() => setShowImport(false)}>
              取消
            </button>
          </div>
        </div>
      )}

      {effectivePreview && (
        <details className="drawer">
          <summary>
            <span className="row-sm">
              <span>查看实际生效规则（全局 + 档案合并后）</span>
            </span>
            <IconChevronDown size={14} className="chevron" />
          </summary>
          <div className="panel-card subtle stack-sm" style={{ marginTop: 8 }}>
            <div className="priority-strip">
              <span className="badge ok">内置事实约束</span>
              <span className="priority-arrow">&gt;</span>
              <span className="badge info">单次补充</span>
              <span className="priority-arrow">&gt;</span>
              <span className="badge primary">档案规则</span>
              <span className="priority-arrow">&gt;</span>
              <span className="badge">全局规则</span>
            </div>
            <div className="small">
              <strong>生效参数：</strong>
              {formatPreferencesSummary(effectivePreview.preferences)}
            </div>
            <div className="stack-sm">
              <span className="muted">阶段 A · 生效选材规则</span>
              <div className="pre jd-preview">
                {effectivePreview.effectiveSelectionRules || '（未设置特定选材规则，由模型按 JD 核心职责自动挑选）'}
              </div>
            </div>
            <div className="stack-sm">
              <span className="muted">阶段 B · 生效写作规则</span>
              <div className="pre jd-preview">
                {effectivePreview.effectiveWritingRules || '（未设置自定义写作规则，将按默认自然风格与事实约束生成）'}
              </div>
            </div>
          </div>
        </details>
      )}

      {notice && <div className={`notice ${notice.kind}`}>{notice.text}</div>}
    </div>
  );
}
