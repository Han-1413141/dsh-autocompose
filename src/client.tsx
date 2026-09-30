import type { Context } from '@deepseek-ai/cordis';
import { useEffect, useRef, useState } from 'react';
import { Button, Input, Modal, Tag, IconRefreshOutlineRegular, IconPluginPinwheelOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { mountPanel, useOverview, capabilityNames, permissionNames, date, type PanelProps } from '../shared/ui/panel.tsx';
import { Empty, Notice } from '../shared/ui/components.tsx';
import type { ComposeOverview, ComposeJob } from './controller.ts';
import type { ComposePlan } from './planner.ts';
import type { RunEvidence } from './runner.ts';
import { TYPERT_REMOTE } from './typert.ts';

export const inject = ['slots', 'locale', 'remote', 'layout'];
export const apply = (ctx: Context) => mountPanel(ctx, { id: 'dsh-autocompose', title: '自组装', english: 'Autocompose', service: 'autocomposeUI', contribution: TYPERT_REMOTE, component: AutocomposePanel });
const running = (job: ComposeJob) => ['running', 'cancelling'].includes(job.status);
const statusLabels = { running: '运行中', completed: '已完成', failed: '失败', cancelled: '已取消', interrupted: '已中断' };
const stages = ['preparing', 'installing', 'checking', 'executing', 'cleaning', 'finished'] as const;
const stageLabels = ['准备环境', '安装插件', '检查组合', '执行任务', '清理环境', '处理完成'];
const cleanLabels = { pending: '等待清理', removed: '临时环境已清理', kept: '临时环境已保留', failed: '清理未完成' };

function RunResult({ run }: { run: RunEvidence }) {
  return <div className="kit-small-stack">
    <div className="kit-actions"><Tag tone={run.status === 'completed' ? 'success' : run.status === 'failed' ? 'danger' : 'neutral'}>{statusLabels[run.status]}</Tag><span className="kit-caption">{cleanLabels[run.cleanup]}</span></div>
    {run.error && <Notice tone={run.status === 'cancelled' ? 'info' : 'error'}>{run.error}</Notice>}
    {run.finalResponse && <div className="kit-result">{run.finalResponse}</div>}
    {run.cleanup !== 'removed' && <details><summary>临时环境位置</summary><p className="kit-break">{run.directory}</p></details>}
  </div>;
}

export function AutocomposePanel({ call }: PanelProps) {
  const { value, error, refresh } = useOverview<ComposeOverview>(call, { action: 'overview' }, x => x.jobs.some(running));
  const [operationError, setOperationError] = useState('');
  const [task, setTask] = useState(''), [cwd, setCwd] = useState('');
  const [plan, setPlan] = useState<ComposePlan>();
  const [busy, setBusy] = useState(false), [confirm, setConfirm] = useState(false);
  const [mode, setMode] = useState<'read-only' | 'workspace-write'>('read-only'), [keep, setKeep] = useState(false);
  const [preset, setPreset] = useState(''), [saveOpen, setSaveOpen] = useState(false), [notice, setNotice] = useState('');
  const [tab, setTab] = useState<'task' | 'history'>('task');
  const initialized = useRef(false), seenJob = useRef('');
  const active = value?.jobs.find(running), latest = value?.jobs[0];
  const locked = busy || !!active;
  useEffect(() => {
    if (!value) return;
    if (!initialized.current) { initialized.current = true; setCwd(value.cwd); }
    const planned = value.jobs.find(x => x.kind === 'plan' && x.status === 'completed' && x.plan);
    if (planned && planned.id !== seenJob.current) {
      seenJob.current = planned.id; setPlan(planned.plan); setTask(planned.plan!.task); setCwd(planned.plan!.cwd);
    }
  }, [value]);
  const action = async (work: () => Promise<void>) => {
    setBusy(true); setOperationError(''); setNotice('');
    try { await work(); refresh(); } catch (cause) { setOperationError(String(cause)); setConfirm(false); setSaveOpen(false); } finally { setBusy(false); }
  };
  const selectPlan = (next: ComposePlan) => { setPlan(next); setTask(next.task); setCwd(next.cwd); setTab('task'); };
  const canRun = !!plan && !plan.missing.length && !plan.report.findings.some(x => x.severity === 'error');
  const stage = active?.run?.stage ?? 'preparing';
  return <div className="dsh-kit"><main className="kit-content" aria-label="自组装工作台">
    <header className="kit-header"><div><h1>自组装</h1><p className="kit-muted">为任务选择合适的插件，在独立环境中完成工作。</p></div>
      <div className="kit-actions"><Tag tone="neutral">DSH {value?.runtimeVersion ?? '…'}</Tag><Button variant="toolbar" aria-label="刷新自组装" title="刷新" icon={<IconRefreshOutlineRegular size={16} />} onClick={refresh} /></div></header>
    <nav className="kit-tabs" aria-label="自组装视图" role="tablist">{(['task', 'history'] as const).map(x => <button key={x} role="tab" aria-selected={tab === x} onClick={() => setTab(x)}>{x === 'task' ? '新任务' : `运行记录${value?.history.length ? ` · ${value.history.length}` : ''}`}</button>)}</nav>
    {error && <Notice tone="error">{error} <Button size="sm" onClick={refresh}>重试连接</Button></Notice>}
    {operationError && <Notice tone="error">{operationError}</Notice>}
    {notice && <Notice tone="success">{notice}</Notice>}
    {value?.notices.map(x => <Notice key={x} tone="warning">{x}</Notice>)}
    {!value && !error && <Notice>正在读取任务和运行记录…</Notice>}
    {active && <section className="kit-card kit-stack" aria-live="polite"><div className="kit-row"><div><h2>{active.status === 'cancelling' ? '正在取消并清理环境' : active.kind === 'plan' ? '正在查找能力并检查兼容性' : stageLabels[stages.indexOf(stage)]}</h2><p className="kit-muted">{active.run?.currentPackage ?? (active.kind === 'plan' ? '插件来自已配置目录和 npm 搜索结果。' : '切换页面后任务会继续，结果保存在运行记录中。')}</p></div><Button variant="outline" disabled={active.status === 'cancelling' || busy} onClick={() => void action(async () => { await call({ action: 'cancel', jobId: active.id }); })}>取消任务</Button></div><div className="kit-progress" />
      {active.kind === 'run' && <ol className="kit-steps">{stageLabels.slice(0, 5).map((x, i) => <li key={x} data-active={i <= stages.indexOf(stage)}>{x}</li>)}</ol>}</section>}
    {!active && latest?.error && <Notice tone={latest.status === 'cancelled' ? 'info' : 'error'}>{latest.status === 'cancelled' ? '任务已取消，可以调整后重试。' : latest.error}</Notice>}
    {tab === 'task' ? <>
      <section className="kit-card kit-stack"><div className="kit-row"><h2>描述你要完成的任务</h2><span className="kit-caption">1 / 选择能力</span></div>
        <label className="kit-field"><span className="kit-caption">任务</span><textarea value={task} disabled={locked} maxLength={30000} placeholder="例如：检查这个项目的代码，整理需要改进的地方，并生成一份报告。" onChange={e => { setTask(e.target.value); setPlan(undefined); }} /></label>
        <div className="kit-chips">{['检查代码和 Git 变更', '联网查找项目的官方文档', '读取 PDF 并提取关键内容'].map(x => <button className="kit-example" disabled={locked} key={x} onClick={() => { setTask(x); setPlan(undefined); }}>{x}</button>)}</div>
        <div className="kit-grid"><label className="kit-field"><span>工作目录</span><Input value={cwd} disabled={locked} placeholder="任务文件所在文件夹的完整路径" onChange={e => { setCwd(e.target.value); setPlan(undefined); }} /></label>
          <label className="kit-field"><span>复用插件预设</span><select aria-label="选择预设" disabled={locked} value="" onChange={e => { const name = e.target.value; if (name) void action(async () => selectPlan(await call<ComposePlan>({ action: 'loadPreset', name }))); }}><option value="">{value?.presets.length ? '选择已保存的预设' : '暂无预设，生成方案后可保存'}</option>{value?.presets.map(x => <option key={x.name} value={x.name}>{x.name}</option>)}</select></label></div>
        <div className="kit-row"><span className="kit-caption">先查看插件和权限，再决定是否运行。</span><Button variant="primary" disabled={locked || !task.trim() || !cwd.trim() || !value} icon={<IconPluginPinwheelOutlineRegular size={16} />} onClick={() => void action(async () => { setPlan(undefined); await call({ action: 'plan', task, cwd }); })}>生成方案</Button></div>
      </section>
      {plan ? <section className="kit-card kit-stack" aria-label="插件方案"><div className="kit-row"><h2>插件方案</h2><Tag tone={canRun ? 'success' : 'warning'}>{canRun ? '可以运行' : '需要调整'}</Tag></div>
        <div className="kit-chips">{plan.capabilities.map(x => <Tag key={x} tone="info">{capabilityNames[x] ?? x}</Tag>)}</div>
        <ul className="kit-list">{plan.selected.map(x => <li key={x.name}><div className="kit-row"><span className="kit-package">{x.name}<span className="kit-version">{x.version}</span></span><Tag tone={x.source === 'builtin' ? 'neutral' : 'outline'}>{x.source === 'builtin' ? '官方基础能力' : x.capabilitySource === 'search' ? '搜索候选' : '第三方插件'}</Tag></div><p className="kit-muted">{x.capabilities.map(c => capabilityNames[c] ?? c).join(' · ') || '提供前置依赖'}</p></li>)}</ul>
        {!!plan.missing.length && <Notice tone="warning">尚未找到可用的{plan.missing.map(x => capabilityNames[x] ?? x).join('、')}插件。可修改任务，或在插件配置中添加候选目录后重新生成。</Notice>}
        {plan.report.findings.map((x, i) => <Notice key={i} tone={x.severity === 'error' ? 'error' : 'warning'}>{x.message}</Notice>)}
        {plan.selected.some(x => x.capabilitySource === 'search') && <Notice tone="warning">搜索候选的能力来自包说明，实际效果需要运行验证。请确认你信任这些插件。</Notice>}
        <details><summary>选择依据与权限声明</summary><div className="kit-small-stack">{plan.explanation.map((x, i) => <p className="kit-muted" key={i}>{x}</p>)}<div className="kit-chips">{plan.permissions.map(x => <Tag key={x}>{permissionNames[x] ?? x}</Tag>)}</div></div></details>
        <div className="kit-grid"><label className="kit-field"><span>任务目录权限</span><select value={mode} disabled={locked} onChange={e => setMode(e.target.value as typeof mode)}><option value="read-only">只读 · 用于检查和分析</option><option value="workspace-write">允许修改 · 用于开发和修复</option></select></label><label className="kit-actions"><input type="checkbox" checked={keep} disabled={locked} onChange={e => setKeep(e.target.checked)} />保留临时环境</label></div>
        <div className="kit-row"><Button variant="outline" disabled={locked || !canRun} onClick={() => setSaveOpen(true)}>保存为预设</Button><Button variant="primary" disabled={locked || !canRun} onClick={() => setConfirm(true)}>检查并运行</Button></div>
      </section> : <Empty title="让插件适应你的任务">生成方案后，这里会显示所需插件、能力覆盖和兼容检查结果。</Empty>}
      {!active && latest?.run && <section className="kit-card kit-stack"><h2>最近一次结果</h2><RunResult run={latest.run} /></section>}
      {!!value?.plans.length && <details><summary>最近生成的方案</summary><ul className="kit-list">{value.plans.slice(0, 5).map(x => <li className="kit-row" key={x.id}><span className="kit-break">{x.task}<span className="kit-version">{date(x.createdAt)}</span></span><Button size="sm" variant="outline" disabled={locked} onClick={() => void action(async () => selectPlan(await call<ComposePlan>({ action: 'getPlan', planId: x.id })))}>打开</Button></li>)}</ul></details>}
    </> : <section className="kit-card kit-stack"><h2>运行记录</h2>{value?.history.length ? <ul className="kit-list">{value.history.map(x => <li key={x.id}><details><summary>{x.task ?? '自组装任务'} <span className="kit-version">{date(x.startedAt)} · {statusLabels[x.status]}</span></summary><RunResult run={x} /></details></li>)}</ul> : <Empty title="还没有运行记录">任务结束后，结果和临时环境的清理状态会保存在这里。</Empty>}</section>}
    <Modal open={confirm} onClose={() => { if (!busy) setConfirm(false); }} title="运行这个方案" closeLabel="关闭" className="dsh-kit-dialog" description="将创建独立的 DSH 环境，安装选定插件并执行任务。" footer={<><Button disabled={busy} onClick={() => setConfirm(false)}>返回检查</Button><Button variant="primary" disabled={busy} onClick={() => void action(async () => { await call({ action: 'start', planId: plan!.id, fingerprint: plan!.fingerprint, mode, keep }); setConfirm(false); })}>{busy ? '正在启动…' : '确认运行'}</Button></>}>
      <div className="kit-break"><strong>{plan?.task}</strong><p>{plan?.cwd}</p><ul>{plan?.selected.map(x => <li key={x.name}>{x.name}@{x.version}</li>)}</ul><p>目录权限：{mode === 'read-only' ? '只读' : '允许修改'}；结束后{keep ? '保留' : '清理'}临时环境。</p><p className="kit-muted">模型调用使用已配置的凭据并产生相应用量。第三方插件代码拥有宿主权限，目录权限控制不替代操作系统沙箱。</p></div>
    </Modal>
    <Modal open={saveOpen} onClose={() => { if (!busy) setSaveOpen(false); }} title="保存插件预设" closeLabel="关闭" className="dsh-kit-dialog" footer={<><Button disabled={busy} onClick={() => setSaveOpen(false)}>取消</Button><Button variant="primary" disabled={busy || !/^[a-zA-Z0-9_-]{1,60}$/.test(preset)} onClick={() => void action(async () => { await call({ action: 'savePreset', name: preset, planId: plan!.id }); setSaveOpen(false); setNotice(`预设 ${preset} 已保存。`); })}>保存</Button></>}><label className="kit-field">预设名称<Input data-modal-autofocus value={preset} maxLength={60} placeholder="例如 code-review" onChange={e => setPreset(e.target.value)} /></label><p className="kit-muted">使用字母、数字、短横线或下划线。同名预设会更新为当前方案。</p></Modal>
  </main></div>;
}
