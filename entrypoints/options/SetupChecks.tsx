import { useEffect, useState } from 'react';
import type { SetupCheck, SetupHost } from '../../platform';
import { ToggleSwitch } from '../../components/Icons';

type Tone = 'ok' | 'warn' | 'err';

function statusOf(check: SetupCheck): { label: string; tone: Tone } {
  if (check.state === 'ok') return { label: '已完成', tone: 'ok' };
  if (check.state === 'manual') return check.confirmed ? { label: '已确认', tone: 'ok' } : { label: '需手动确认', tone: 'warn' };
  return check.required ? { label: '未完成', tone: 'err' } : { label: '建议开启', tone: 'warn' };
}

/** 未完成的项数（缺失，或需手动确认但尚未确认） */
export function pendingSetupCount(checks: SetupCheck[]): number {
  return checks.filter((c) => c.state === 'missing' || (c.state === 'manual' && !c.confirmed)).length;
}

/** 订阅宿主权限检查结果：用户从系统设置返回时刷新 */
export function useSetupChecks(setup: SetupHost | undefined): SetupCheck[] {
  const [checks, setChecks] = useState<SetupCheck[]>(() => setup?.list() ?? []);
  useEffect(() => {
    if (!setup) return;
    setChecks(setup.list());
    return setup.onChanged(() => setChecks(setup.list()));
  }, [setup]);
  return checks;
}

export function SetupChecksPage({
  setup,
  checks,
  configReady,
  onOpenModel,
  onOpenProfiles,
}: {
  setup: SetupHost;
  checks: SetupCheck[];
  /** 模型与当前档案是否就绪（设置页自身的数据） */
  configReady: { model: boolean; profile: boolean };
  onOpenModel: () => void;
  onOpenProfiles: () => void;
}) {
  const configMissing = [!configReady.model && '模型连接', !configReady.profile && '简历档案'].filter(Boolean);

  return (
    <div className="stack-lg">
      <div className="opt-page-header">
        <div className="stack-sm">
          <h1>权限与运行</h1>
          <span className="muted">
            JobLens 需要以下权限才能在 BOSS 直聘里识别职位并显示悬浮按钮。标为“需手动确认”的项目系统无法检测，设置好后请打开开关。
          </span>
        </div>
      </div>

      <section className="panel-card stack-sm">
        <div className="row between">
          <h3>模型与简历档案（必需）</h3>
          <span className={`badge ${configMissing.length ? 'err' : 'ok'}`}>{configMissing.length ? '未完成' : '已完成'}</span>
        </div>
        <span className="muted">
          {configMissing.length ? `还缺少：${configMissing.join('、')}。` : '已连接模型并选择了当前档案。'}
        </span>
        {configMissing.length > 0 && (
          <div className="row wrap">
            {!configReady.model && (
              <button type="button" className="small" onClick={onOpenModel}>
                去连接模型
              </button>
            )}
            {!configReady.profile && (
              <button type="button" className="small" onClick={onOpenProfiles}>
                去建档案
              </button>
            )}
          </div>
        )}
      </section>

      {checks.map((check) => {
        const status = statusOf(check);
        return (
          <section key={check.id} className="panel-card stack-sm" aria-label={`${check.title}，${status.label}`}>
            <div className="row between">
              <h3>
                {check.title}
                {check.required ? '（必需）' : ''}
              </h3>
              <span className={`badge ${status.tone}`}>{status.label}</span>
            </div>
            <span className="muted pre">{check.description}</span>
            {check.state !== 'ok' && check.actions.length > 0 && (
              <div className="row wrap">
                {check.actions.map((label, index) => (
                  <button key={label} type="button" className="small" onClick={() => setup.runAction(check.id, index)}>
                    {label}
                  </button>
                ))}
              </div>
            )}
            {check.state === 'manual' && (
              <ToggleSwitch
                checked={check.confirmed}
                onChange={(confirmed) => setup.setConfirmed(check.id, confirmed)}
                label="我已设置"
              />
            )}
          </section>
        );
      })}
    </div>
  );
}
