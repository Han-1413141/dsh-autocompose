import type { Context } from '@deepseek-ai/cordis';
import { useEffect, useRef, useState } from 'react';
import { Button, Input, Modal, Tag, IconRefreshOutlineRegular, IconPluginPinwheelOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { mountPanel, useOverview, capabilityNames, permissionNames, date, type PanelProps } from '../shared/ui/panel.tsx';
import { Empty, Notice } from '../shared/ui/components.tsx';
import type { ComposeOverview, ComposeJob } from './controller.ts';
import type { ComposePlan } from './planner.ts';
import type { RunEvidence } from './runner.ts';
import { TYPERT_REMOTE } from './typert.ts';
import type { InstallEvidence, InstallPreview } from './host-install.ts';

export const inject = ['slots', 'locale', 'remote', 'layout'];
export const apply = (ctx: Context) => mountPanel(ctx, { id: 'dsh-autocompose', title: '自组装', english: 'Autocompose', service: 'autocomposeUI', contribution: TYPERT_REMOTE, component: AutocomposePanel });
const running = (job: ComposeJob) => ['running', 'cancelling'].includes(job.status);
const statusLabels = { running: '运行中', completed: '已完成', failed: '失败', cancelled: '已取消', interrupted: '已中断' };
const stages = ['preparing', 'installing', 'checking', 'executing', 'cleaning', 'finished'] as const;
const stageLabels = ['准备环境', '安装插件', '检查组合', '执行任务', '清理环境', '处理完成'];
const cleanLabels = { pending: '等待清理', removed: '临时环境已清理', kept: '临时环境已保留', failed: '清理未完成' };
const installActions = { install: '新增', replace: '替换版本', enable: '启用', reuse: '已就绪，直接复用' };
const installStates = { pending: '未处理', installed: '已安装，尚未启用', enabled: '已启用', reused: '已复用' };
const installStatuses = { running: '安装中', completed: '已完成', partial: '部分完成', failed: '失败', cancelled: '已取消', interrupted: '已中断' };

function InstallResult({ result }: { result: InstallEvidence }) {
  return <div className="kit-small-stack">
    <div className="kit-actions"><Tag tone={result.status === 'completed' ? 'success' : 'warning'}>{installStatuses[result.status]}</Tag><span>主环境：{result.target.profile}</span></div>
    {result.error && <Notice tone="error">{result.error}</Notice>}
    {result.restartRequired && <Notice tone="warning">安装状态已保存，请重启 DSH 使变更生效。</Notice>}
    {result.status === 'completed' && !result.restartRequired && <p className="kit-muted">插件已在当前环境中就绪，后续任务可以继续使用。</p>}
    <ul className="kit-list">{result.items.map(x => <li className="kit-row" key={x.name}><span className="kit-package">{x.name}<span className="kit-version">{x.version}</span></span><Tag>{installStates[x.state]}</Tag></li>)}</ul>
    {result.warnings.map((x, i) => <Notice key={i} tone="warning">{x}</Notice>)}
    <details><summary>安装位置与备份</summary><p className="kit-break">{result.target.directory}</p>{result.backupPath && <p className="kit-break">变更前配置备份：{result.backupPath}</p>}<p className="kit-muted">安装不执行任务。已安装的插件会保留，可在 DSH 插件管理中停用或卸载。</p></details>
  </div>;
}

function RunResult({ run }: { run: RunEvidence }) {
  return <div className="kit-small-stack">
    <div className="kit-actions"><Tag tone={run.status === 'completed' ? 'success' : run.status === 'failed' ? 'danger' : 'neutral'}>{statusLabels[run.status]}</Tag><span className="kit-caption">{cleanLabels[run.cleanup]}</span></div>
    {run.error && <Notice tone={run.status === 'cancelled' ? 'info' : 'error'}>{run.error}</Notice>}
    {run.finalResponse && <div className="kit-result">{run.finalResponse}</div>}
    {run.cleanup !== 'removed' && <details><summary>临时环境位置</summary><p className="kit-break">{run.directory}</p></details>}
  </div>;
}

export function AutocomposePanel({ call }: PanelProps) {
  const { value, error, refresh } = useOverview<ComposeOverview>(call, { action: 'overview' }, x => x.jobs.some(running) || x.environments.some(e => ['ready', 'closing'].includes(e.status)));
  const [operationError, setOperationError] = useState('');
  const [task, setTask] = useState(''), [cwd, setCwd] = useState('');
  const [plan, setPlan] = useState<ComposePlan>();
  const [busy, setBusy] = useState(false), [confirm, setConfirm] = useState(false);
  const [installPreview, setInstallPreview] = useState<InstallPreview>();
  const [mode, setMode] = useState<'read-only' | 'workspace-write'>('read-only'), [keep, setKeep] = useState(true);
  const [fallbackUrl, setFallbackUrl] = useState('');
  const pendingWindow = useRef<{ jobId: string; popup: Window | null }>();
  const [preset, setPreset] = useState(''), [saveOpen, setSaveOpen] = useState(false), [notice, setNotice] = useState('');
  const [tab, setTab] = useState<'task' | 'history' | 'installations'>('task');
  const initialized = useRef(false), seenJob = useRef('');
  const active = value?.jobs.find(running), latest = value?.jobs[0];
  const locked = busy || !!active;
  useEffect(() => {
    if (!value) return;
    if (!initialized.current) { initialized.current = true; setCwd(value.cwd); }
    const planned = value.jobs.find(x => ['plan', 'assemble'].includes(x.kind) && !running(x) && x.plan);
    if (planned && planned.id !== seenJob.current) {
      seenJob.current = planned.id; setPlan(planned.plan); setTask(planned.plan!.task); setCwd(planned.plan!.cwd);
    }
  }, [value]);
  const reserveWindow = () => {
    setFallbackUrl('');
    const popup = window.open('about:blank', '_blank', 'popup,width=1240,height=860');
    if (popup) { popup.document.title = '正在准备 DSH 环境'; popup.document.body.textContent = '正在查找插件并启动独立 DSH 环境。此窗口准备好后会自动进入对话界面。'; }
    return popup;
  };
  const navigateWindow = async (id: string, popup: Window | null) => {
    const { url } = await call<{ url: string }>({ action: 'environmentUrl', environmentId: id });
    setFallbackUrl(url);
    if (popup && !popup.closed) { popup.opener = null; popup.location.replace(url); }
    else setNotice('环境已就绪。若浏览器拦截了弹窗，请点击“打开独立 DSH 界面”。');
  };
  useEffect(() => {
    const pending = pendingWindow.current;
    if (!pending || !value) return;
    const job = value.jobs.find(x => x.id === pending.jobId);
    if (!job || running(job)) return;
    pendingWindow.current = undefined;
    if (job.environment?.status === 'ready') void navigateWindow(job.environment.id, pending.popup).catch(cause => { pending.popup?.close(); setOperationError(String(cause)); });
    else pending.popup?.close();
  }, [value]);
  const action = async (work: () => Promise<void>) => {
    setBusy(true); setOperationError(''); setNotice('');
    try { await work(); refresh(); } catch (cause) { setOperationError(String(cause)); setConfirm(false); setSaveOpen(false); setInstallPreview(undefined); } finally { setBusy(false); }
  };
  const selectPlan = (next: ComposePlan) => { setPlan(next); setTask(next.task); setCwd(next.cwd); setTab('task'); };
  const startWindow = (request: object) => {
    const popup = reserveWindow();
    void action(async () => {
      try { const job = await call<ComposeJob>(request); pendingWindow.current = { popup, jobId: job.id }; }
      catch (error) { popup?.close(); throw error; }
    });
  };
  const canRun = !!plan && !plan.missing.length && !plan.report.findings.some(x => x.severity === 'error');
  const stage = active?.run?.stage ?? 'preparing';
  return <div className="dsh-kit"><main className="kit-content" aria-label="自组装工作台">
    <header className="kit-header"><div><h1>自组装</h1><p className="kit-muted">描述任务，自动查找兼容插件。打开独立 DSH 窗口继续对话，或直接安装到当前主环境。</p></div>
      <div className="kit-actions"><Tag tone="neutral">DSH {value?.runtimeVersion ?? '…'}</Tag><Button variant="toolbar" aria-label="刷新自组装" title="刷新" icon={<IconRefreshOutlineRegular size={16} />} onClick={refresh} /></div></header>
    <nav className="kit-tabs" aria-label="自组装视图" role="tablist">{(['task', 'history', 'installations'] as const).map(x => <button key={x} role="tab" aria-selected={tab === x} onClick={() => setTab(x)}>{x === 'task' ? '生成方案' : x === 'history' ? '运行记录' : '安装记录'}</button>)}</nav>
    {error && <Notice tone="error">{error} <Button size="sm" onClick={refresh}>重试连接</Button></Notice>}
    {operationError && <Notice tone="error">{operationError}</Notice>}
    {notice && <Notice tone="success">{notice}</Notice>}
    {fallbackUrl && <Notice><a href={fallbackUrl} target="_blank" rel="noreferrer">打开独立 DSH 界面 ↗</a><span className="kit-caption">新窗口保持运行，可随时回来重新打开。</span></Notice>}
    {value?.notices.map(x => <Notice key={x} tone="warning">{x}</Notice>)}
    {!value && !error && <Notice>正在读取任务和运行记录…</Notice>}
    {active && <section className="kit-card kit-stack" aria-live="polite"><div className="kit-row"><div><h2>{active.status === 'cancelling' ? '正在等待当前操作结束' : active.planning ? active.planning.message : active.environment ? active.environment.stage : active.install || active.kind === 'install' ? '正在安装到主环境' : active.kind === 'plan' || active.kind === 'assemble' ? '正在查找能力并检查兼容性' : stageLabels[stages.indexOf(stage)]}</h2><p className="kit-muted">{active.install?.currentPackage ?? active.environment?.currentPackage ?? active.run?.currentPackage ?? (active.planning ? `已核对 ${active.planning.checked} 个插件的发布元数据` : '切换页面后会继续处理，结果保存在对应记录中。')}</p></div><Button variant="outline" disabled={active.status === 'cancelling' || busy} onClick={() => void action(async () => { await call({ action: 'cancel', jobId: active.id }); })}>{active.install ? '停止安装' : '取消任务'}</Button></div><div className="kit-progress" />
      {active.kind === 'run' && <ol className="kit-steps">{stageLabels.slice(0, 5).map((x, i) => <li key={x} data-active={i <= stages.indexOf(stage)}>{x}</li>)}</ol>}</section>}
    {!active && latest?.error && <Notice tone={latest.status === 'cancelled' ? 'info' : 'error'}>{latest.status === 'cancelled' ? '任务已取消，可以调整后重试。' : latest.error}</Notice>}
    {!!value?.environments.length && <section className="kit-card kit-stack" aria-label="独立 DSH 环境"><h2>独立 DSH 环境</h2><ul className="kit-list">{value.environments.slice(0, 5).map(environment => <li key={environment.id}><div className="kit-row"><div><strong>{environment.task}</strong><p className="kit-caption">{environment.status === 'ready' ? '运行中 · 支持持续对话' : environment.stage}</p></div>{environment.status === 'ready' && <div className="kit-actions"><Button variant="primary" size="sm" onClick={() => { const popup = reserveWindow(); void action(async () => navigateWindow(environment.id, popup)); }}>重新打开</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => void action(async () => { await call({ action: 'closeEnvironment', environmentId: environment.id }); setFallbackUrl(''); })}>关闭环境</Button></div>}</div>{environment.warning && <Notice tone="warning">{environment.warning}</Notice>}{environment.error && <Notice tone="error">{environment.error}</Notice>}<details><summary>插件与保存位置</summary><p className="kit-break">{environment.directory}</p><p className="kit-caption">{environment.packages.map(x => `${x.name}@${x.version}`).join(' · ')}</p><p className="kit-caption">{environment.keep ? '关闭环境后保留文件和会话。' : '关闭环境后清理临时文件和会话。'}</p></details></li>)}</ul><p className="kit-caption">关闭浏览器窗口不会停止环境；点击“关闭环境”才结束进程。退出主 DSH 时会停止独立环境并保留文件。</p></section>}
    {tab === 'task' ? <>
      <section className="kit-card kit-stack"><div className="kit-row"><h2>描述你要完成的任务</h2><span className="kit-caption">1 / 选择能力</span></div>
        <label className="kit-field"><span className="kit-caption">任务</span><textarea value={task} disabled={locked} maxLength={30000} placeholder="例如：检查这个项目的代码，整理需要改进的地方，并生成一份报告。" onChange={e => { setTask(e.target.value); setPlan(undefined); }} /></label>
        <div className="kit-chips">{['我要进行数学研究', '读取 PDF 并提取关键内容', '检查代码和 Git 变更'].map(x => <button className="kit-example" disabled={locked} key={x} onClick={() => { setTask(x); setPlan(undefined); }}>{x}</button>)}</div>
        <div className="kit-grid"><label className="kit-field"><span>工作目录</span><Input value={cwd} disabled={locked} placeholder="任务文件所在文件夹的完整路径" onChange={e => { setCwd(e.target.value); setPlan(undefined); }} /></label>
          <label className="kit-field"><span>复用插件预设</span><select aria-label="选择预设" disabled={locked} value="" onChange={e => { const name = e.target.value; if (name) void action(async () => selectPlan(await call<ComposePlan>({ action: 'loadPreset', name }))); }}><option value="">{value?.presets.length ? '选择已保存的预设' : '暂无预设，生成方案后可保存'}</option>{value?.presets.map(x => <option key={x.name} value={x.name}>{x.name}</option>)}</select></label></div>
        <div className="kit-actions"><Button variant="primary" disabled={locked || !task.trim() || !cwd.trim() || !value} icon={<IconPluginPinwheelOutlineRegular size={16} />} onClick={() => startWindow({ action: 'assemble', task, cwd, destination: 'window', mode, keep })}>自动组装并打开窗口</Button><Button variant="outline" disabled={locked || !task.trim() || !cwd.trim() || !value?.mainEnvironment} onClick={() => void action(async () => { setPlan(undefined); await call({ action: 'assemble', task, cwd, destination: 'main' }); })}>自动查找并安装到主环境</Button><Button disabled={locked || !task.trim() || !cwd.trim() || !value} onClick={() => void action(async () => { setPlan(undefined); await call({ action: 'plan', task, cwd }); })}>仅生成方案</Button></div>
        <p className="kit-caption">自动操作会查找、检查并安装匹配的第三方插件。窗口模式使用独立环境并提交本次任务；主环境模式会新增、启用或替换插件，安装后持续保留。仅生成方案不安装插件。</p>
        <div className="kit-actions"><label>窗口目录权限 <select aria-label="窗口目录权限" value={mode} disabled={locked} onChange={e => setMode(e.target.value as typeof mode)}><option value="read-only">只读</option><option value="workspace-write">允许修改</option></select></label><label><input type="checkbox" checked={keep} disabled={locked} onChange={e => setKeep(e.target.checked)} />关闭窗口环境后保留文件与会话</label></div>
      </section>
      {plan ? <section className="kit-card kit-stack" aria-label="插件方案"><div className="kit-row"><h2>插件方案</h2><Tag tone={canRun ? 'success' : 'warning'}>{canRun ? '可以运行' : '需要调整'}</Tag></div>
        <div className="kit-chips">{plan.capabilities.map(x => <Tag key={x} tone="info">{capabilityNames[x] ?? x}</Tag>)}</div>
        {!!plan.discovery?.length && <div className="kit-small-stack"><h3>搜索记录</h3>{plan.discovery.map(x => <p className="kit-caption" key={x.capability}>{capabilityNames[x.capability] ?? x.capability} · 关键词 {x.query} · 核对 {x.checked} 个候选 · {x.error ? `搜索失败：${x.error}` : `元数据通过 ${x.accepted.length} 个`}</p>)}</div>}
        <ul className="kit-list">{plan.selected.map(x => <li key={x.name}><div className="kit-row"><span className="kit-package">{x.name}<span className="kit-version">{x.version}</span></span><Tag tone={x.source === 'builtin' ? 'neutral' : 'outline'}>{x.source === 'builtin' ? '官方基础能力' : x.capabilitySource === 'search' ? '搜索候选' : '第三方插件'}</Tag></div><p className="kit-muted">{x.capabilities.map(c => capabilityNames[c] ?? c).join(' · ') || '提供前置依赖'}</p></li>)}</ul>
        {!!plan.missing.length && <Notice tone="warning">尚未找到可用的{plan.missing.map(x => capabilityNames[x] ?? x).join('、')}插件。可修改任务，或在插件配置中添加候选目录后重新生成。</Notice>}
        {plan.report.findings.map((x, i) => <Notice key={i} tone={x.severity === 'error' ? 'error' : 'warning'}>{x.message}</Notice>)}
        {plan.selected.some(x => x.capabilitySource === 'search') && <Notice tone="warning">搜索候选的能力来自包说明，实际效果需要运行验证。请确认你信任这些插件。</Notice>}
        <details><summary>选择依据与权限声明</summary><div className="kit-small-stack">{plan.explanation.map((x, i) => <p className="kit-muted" key={i}>{x}</p>)}<div className="kit-chips">{plan.permissions.map(x => <Tag key={x}>{permissionNames[x] ?? x}</Tag>)}</div></div></details>
        <div className="kit-grid kit-choices"><section className="kit-small-stack"><h3>独立 DSH 窗口</h3><p className="kit-muted">安装方案中的插件，在新窗口执行任务并继续对话。目录权限与保留选项使用上方设置。</p><Button variant="primary" disabled={locked || !canRun} onClick={() => startWindow({ action: 'openEnvironment', planId: plan.id, fingerprint: plan.fingerprint, mode, keep })}>打开独立窗口</Button><Button variant="outline" disabled={locked || !canRun} onClick={() => setConfirm(true)}>后台执行一次</Button></section>
          <section className="kit-small-stack"><h3>安装到主环境</h3><p className="kit-muted">将插件保留在当前 {value?.mainEnvironment?.profile ?? 'DSH'} 环境中，供后续任务使用。安装本身不执行任务。</p>{canRun && !plan.selected.some(x => x.source === 'npm') && <p className="kit-caption">方案只使用官方基础能力，无需额外安装。</p>}<Button variant="outline" disabled={locked || !canRun || !value?.mainEnvironment || !plan.selected.some(x => x.source === 'npm')} onClick={() => void action(async () => setInstallPreview(await call<InstallPreview>({ action: 'previewInstall', planId: plan.id, fingerprint: plan.fingerprint })))}>安装到主环境</Button></section></div>
        <div><Button variant="outline" disabled={locked || !canRun} onClick={() => setSaveOpen(true)}>保存为预设</Button></div>
      </section> : <Empty title="让插件适应你的任务">生成方案后，这里会显示所需插件、能力覆盖和兼容检查结果。</Empty>}
      {!active && latest?.run && <section className="kit-card kit-stack"><h2>最近一次结果</h2><RunResult run={latest.run} /></section>}
      {!active && latest?.install && <section className="kit-card kit-stack"><h2>主环境安装结果</h2><InstallResult result={latest.install} /></section>}
      {!!value?.plans.length && <details><summary>最近生成的方案</summary><ul className="kit-list">{value.plans.slice(0, 5).map(x => <li className="kit-row" key={x.id}><span className="kit-break">{x.task}<span className="kit-version">{date(x.createdAt)}</span></span><Button size="sm" variant="outline" disabled={locked} onClick={() => void action(async () => selectPlan(await call<ComposePlan>({ action: 'getPlan', planId: x.id })))}>打开</Button></li>)}</ul></details>}
    </> : tab === 'history' ? <section className="kit-card kit-stack"><h2>运行记录</h2>{value?.history.length ? <ul className="kit-list">{value.history.map(x => <li key={x.id}><details><summary>{x.task ?? '自组装任务'} <span className="kit-version">{date(x.startedAt)} · {statusLabels[x.status]}</span></summary><RunResult run={x} /><Button size="sm" variant="outline" disabled={locked} onClick={() => void action(async () => selectPlan(await call<ComposePlan>({ action: 'getPlan', planId: x.planId })))}>查看方案与安装选项</Button></details></li>)}</ul> : <Empty title="还没有运行记录">任务结束后，结果和临时环境的清理状态会保存在这里。</Empty>}</section> :
      <section className="kit-card kit-stack"><h2>主环境安装记录</h2>{value?.installations.length ? <ul className="kit-list">{value.installations.map(x => <li key={x.id}><details><summary>{x.task}<span className="kit-version">{date(x.startedAt)} · {installStatuses[x.status]}</span></summary><InstallResult result={x} /></details></li>)}</ul> : <Empty title="还没有主环境安装记录">查看方案后选择“安装到主环境”，这里会保存每个插件的处理结果。</Empty>}</section>}
    <Modal open={!!installPreview} onClose={() => { if (!busy) setInstallPreview(undefined); }} title="安装到主环境" closeLabel="关闭" className="dsh-kit-dialog" description="检查目标环境与插件变更，确认后安装并启用。" footer={<><Button disabled={busy} onClick={() => setInstallPreview(undefined)}>返回检查</Button><Button variant="primary" disabled={busy || !installPreview || !!installPreview.blockers.length || !installPreview.items.some(x => x.action !== 'reuse')} onClick={() => void action(async () => { await call({ action: 'install', previewId: installPreview!.id }); setInstallPreview(undefined); })}>{busy ? '正在提交…' : '确认安装并启用'}</Button></>}>
      {installPreview && <div className="kit-small-stack"><p><strong>目标：{installPreview.target.profile}</strong> · DSH {installPreview.target.runtimeVersion}</p><p className="kit-break">{installPreview.target.directory}</p><ul className="kit-list">{installPreview.items.map(x => <li key={x.name}><strong className="kit-break">{x.name}</strong><p>{x.previousVersion ? `${x.previousVersion} → ${x.version}` : x.version} · {installActions[x.action]}</p><p className="kit-muted">权限声明：{x.permissions.map(x => permissionNames[x] ?? x).join('、') || '未声明'}</p></li>)}</ul>
        {installPreview.findings.map((x, i) => <Notice key={i} tone={installPreview.blockers.includes(x.message) ? 'error' : 'warning'}>{x.message}</Notice>)}
        {!installPreview.items.some(x => x.action !== 'reuse') && <Notice tone="success">所选插件已安装并启用，无需重复安装。</Notice>}
        <p className="kit-muted">安装后插件会保留在此环境。替换已有版本或宿主要求时，需要重启 DSH。主环境中的插件使用宿主权限，临时运行的“只读”设置不限制它们。</p>
      </div>}
    </Modal>
    <Modal open={confirm} onClose={() => { if (!busy) setConfirm(false); }} title="运行这个方案" closeLabel="关闭" className="dsh-kit-dialog" description="将创建独立的 DSH 环境，安装选定插件并执行任务。" footer={<><Button disabled={busy} onClick={() => setConfirm(false)}>返回检查</Button><Button variant="primary" disabled={busy} onClick={() => void action(async () => { await call({ action: 'start', planId: plan!.id, fingerprint: plan!.fingerprint, mode, keep }); setConfirm(false); })}>{busy ? '正在启动…' : '确认运行'}</Button></>}>
      <div className="kit-break"><strong>{plan?.task}</strong><p>{plan?.cwd}</p><ul>{plan?.selected.map(x => <li key={x.name}>{x.name}@{x.version}</li>)}</ul><p>目录权限：{mode === 'read-only' ? '只读' : '允许修改'}；结束后{keep ? '保留' : '清理'}临时环境。</p><p className="kit-muted">模型调用使用已配置的凭据并产生相应用量。第三方插件代码拥有宿主权限，目录权限控制不替代操作系统沙箱。</p></div>
    </Modal>
    <Modal open={saveOpen} onClose={() => { if (!busy) setSaveOpen(false); }} title="保存插件预设" closeLabel="关闭" className="dsh-kit-dialog" footer={<><Button disabled={busy} onClick={() => setSaveOpen(false)}>取消</Button><Button variant="primary" disabled={busy || !/^[a-zA-Z0-9_-]{1,60}$/.test(preset)} onClick={() => void action(async () => { await call({ action: 'savePreset', name: preset, planId: plan!.id }); setSaveOpen(false); setNotice(`预设 ${preset} 已保存。`); })}>保存</Button></>}><label className="kit-field">预设名称<Input data-modal-autofocus value={preset} maxLength={60} placeholder="例如 code-review" onChange={e => setPreset(e.target.value)} /></label><p className="kit-muted">使用字母、数字、短横线或下划线。同名预设会更新为当前方案。</p></Modal>
  </main></div>;
}
