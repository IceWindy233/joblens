import { useState } from 'react';
import type { EffectiveGreetingConfig, GreetingPreferences, GreetingPresetId } from '../../shared/types';
import {
  GREETING_PRESETS,
  exportGreetingRulesConfig,
  importGreetingRulesConfig,
} from '../../profile/manager';

interface Props {
  title: string;
  description?: string;
  rules: string;
  preferences: GreetingPreferences;
  onRulesChange: (rules: string) => void;
  onPreferencesChange: (prefs: GreetingPreferences) => void;
  defaultRulesText: string;
  defaultPreferences: GreetingPreferences;
  effectivePreview?: EffectiveGreetingConfig;
  textareaAriaLabel?: string;
  placeholder?: string;
}

const PRESET_ORDER: readonly GreetingPresetId[] = ['concise', 'technical', 'achievement', 'custom'];

export function formatPreferencesSummary(prefs: GreetingPreferences): string {
  const parts = [
    `选材上限 ${prefs.maxPoints} 条`,
    prefs.singleParagraph ? '单段（禁止换行）' : '允许分段',
    prefs.allowLists ? '允许分点/列表' : '不使用分点/列表',
    prefs.maxChars === null
      ? '不限字数'
      : `字数上限 ${prefs.maxChars} 字${prefs.targetLengthHint ? `（建议 ${prefs.targetLengthHint} 字）` : ''}`,
    prefs.allowGapExplanation ? '允许主动解释能力差距' : '不主动提及短板',
    prefs.useExamples ? '启用样例参考' : '关闭样例参考',
  ];
  return parts.join(' · ');
}

export function GreetingRulesConfig({
  title,
  description,
  rules,
  preferences,
  onRulesChange,
  onPreferencesChange,
  defaultRulesText,
  defaultPreferences,
  effectivePreview,
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
    setNotice({ kind: 'ok', text: `已填充“${preset.label}”模板，可继续自由编辑文本与参数` });
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
      setNotice({ kind: 'ok', text: '已将规则与偏好 JSON 复制到剪贴板' });
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
    <div className="stack card soft">
      <div className="row between wrap">
        <div>
          <strong>{title}</strong>
          {description && <div className="muted">{description}</div>}
        </div>
        <div className="row wrap">
          <button type="button" className="small" onClick={() => void onCopyRules()}>
            复制
          </button>
          <button type="button" className="small" onClick={() => void onExport()}>
            导出 JSON
          </button>
          <button type="button" className="small" onClick={() => setShowImport((v) => !v)}>
            {showImport ? '收起导入' : '导入 JSON'}
          </button>
          <button type="button" className="link small" onClick={onReset}>
            恢复默认规则
          </button>
        </div>
      </div>

      <div className="row wrap">
        <span className="muted">预设风格模板（仅作可编辑起点）：</span>
        {PRESET_ORDER.map((id) => {
          const preset = GREETING_PRESETS[id];
          const active = preferences.preset === id;
          return (
            <button
              key={id}
              type="button"
              className={`chip ${active ? 'active' : ''}`}
              title={preset.description}
              onClick={() => applyPreset(id)}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      <textarea
        aria-label={textareaAriaLabel}
        rows={5}
        value={rules}
        placeholder={placeholder}
        onChange={(e) => onRulesChange(e.target.value)}
      />

      <details>
        <summary className="muted">
          格式、长度与选材校验参数（{formatPreferencesSummary(preferences)}）
        </summary>
        <div className="stack" style={{ marginTop: 8 }}>
          <div className="grid-2">
            <label className="field">
              <span>匹配素材数量上限（1–8 条）</span>
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
              <span>最大字数上限（本地风格检查阈值）</span>
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
                <label className="row small" style={{ whiteSpace: 'nowrap' }}>
                  <input
                    type="checkbox"
                    checked={preferences.maxChars === null}
                    onChange={(e) => {
                      if (e.target.checked) {
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
                  />
                  不限字数
                </label>
              </div>
            </label>
          </div>

          <div className="row wrap">
            <label className="row small">
              <input
                type="checkbox"
                checked={!preferences.singleParagraph}
                onChange={(e) => updatePref('singleParagraph', !e.target.checked)}
              />
              允许分段换行
            </label>
            <label className="row small">
              <input
                type="checkbox"
                checked={preferences.allowLists}
                onChange={(e) => {
                  const allowLists = e.target.checked;
                  onPreferencesChange({
                    ...preferences,
                    preset: 'custom',
                    allowLists,
                    ...(allowLists ? { singleParagraph: false } : {}),
                  });
                }}
              />
              允许使用分点 / 列表
            </label>
            <label className="row small">
              <input
                type="checkbox"
                checked={preferences.allowGapExplanation}
                onChange={(e) => updatePref('allowGapExplanation', e.target.checked)}
              />
              允许主动解释能力差距
            </label>
            <label className="row small">
              <input
                type="checkbox"
                checked={preferences.useExamples}
                onChange={(e) => updatePref('useExamples', e.target.checked)}
              />
              参考历史打招呼语样例
            </label>
          </div>
          <div className="muted">
            提示：规则文本中若明确写了“分段”“使用列表”“不超过 250 字”“提及短板”等要求，也会在生效时自动覆盖低优先级限制。
          </div>
        </div>
      </details>

      {showImport && (
        <div className="card stack">
          <span className="small">粘贴规则配置 JSON 后点击导入（可直接覆盖当前编辑区内容）：</span>
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
        <details>
          <summary className="muted">
            查看当前实际生效的规则（优先级：内置事实约束 &gt; 单次补充 &gt; 档案规则 &gt; 全局规则）
          </summary>
          <div className="stack" style={{ marginTop: 8 }}>
            <div className="small">
              <strong>生效参数：</strong>
              {formatPreferencesSummary(effectivePreview.preferences)}
            </div>
            <div className="pre jd-preview">
              {effectivePreview.combinedRulesText || '（未设置全局或档案规则，将按默认自然风格与事实约束生成）'}
            </div>
          </div>
        </details>
      )}

      {notice && <div className={`notice ${notice.kind}`}>{notice.text}</div>}
    </div>
  );
}
