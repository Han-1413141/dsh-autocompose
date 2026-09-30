import type { Context } from '@deepseek-ai/cordis';
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client';
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import type {} from '@deepseek-ai/dsh-api-remotes/client';
import type {} from '@deepseek-ai/dsh-client-locale/client';
import type { RemoteResult, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol';
import { Component, useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { IconPluginPinwheelOutlineRegular, IconCheckCircleFillRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './style.css';

export type Call = <T>(args: object) => Promise<T>;
export interface PanelProps { call: Call }
class PanelBoundary extends Component<{ children: ReactNode }, { error: string }> {
  state = { error: '' };
  static getDerivedStateFromError(error: unknown) { return { error: String(error) }; }
  render() {
    return this.state.error ? <div className="dsh-kit"><main className="kit-content"><h1>插件界面暂时不可用</h1><p role="alert" className="kit-break">{this.state.error}</p><p>可继续使用 DSH 的其他页面。检查插件版本后重新打开此页面。</p><button onClick={() => this.setState({ error: '' })}>重试加载</button></main></div> : this.props.children;
  }
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'dsh-autocompose': 'panel'; 'dsh-compat-guardian': 'panel' }
}

export async function mountPanel(ctx: Context, options: {
  id: 'dsh-autocompose' | 'dsh-compat-guardian'; title: string; english: string; service: string; contribution: TypertRemoteContribution; component: ComponentType<PanelProps>; guardian?: boolean;
}): Promise<void> {
  let mountFailure = '';
  try {
    const unmount = await ctx.remote.$mount(options.contribution);
    ctx.effect(() => unmount, `${options.id}: remote contract`);
  } catch (cause) { mountFailure = `界面接口不兼容：${String(cause)}`; }
  ctx.effect(() => {
    const style = document.createElement('style'); style.dataset.plugin = options.id; style.textContent = css;
    document.head.append(style); return () => style.remove();
  }, `${options.id}: theme`);
  ctx.effect(() => ctx.locale.register(options.id, { zh: { panel: options.title }, en: { panel: options.english } }), `${options.id}: locale`);
  const t = ctx.locale.bind(options.id);
  const register = (ready: Context) => {
    const call: Call = async args => {
      if (mountFailure) throw new Error(mountFailure);
      const remote = ready.remote as unknown as Record<string, { request(payload: string): Promise<RemoteResult<string>> }>;
      const result = await remote[options.service].request(JSON.stringify(args));
      if (!result.ok) throw new Error(result.error.message);
      return JSON.parse(result.value);
    };
    const Panel = options.component;
    ready.slots.inject('main', () => ready.slots.register({ name: 'main', key: options.id as MainPanelId }, () => <PanelBoundary><Panel call={call} /></PanelBoundary>));
    ready.slots.inject('sidebar.panellist', () => ready.slots.register({
      name: 'sidebar.panellist', id: options.id, order: 2, label: () => t('panel'),
    }, ({ size }) => options.guardian ? <IconCheckCircleFillRegular size={size} /> : <IconPluginPinwheelOutlineRegular size={size} />));
  };
  if (mountFailure) register(ctx); else ctx.inject([`remote.${options.service}`], register);
}

export function useOverview<T>(call: Call, request: object, poll: (value: T) => boolean = () => false) {
  const [value, setValue] = useState<T>();
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const requestKey = JSON.stringify(request);
  useEffect(() => {
    let alive = true, timer: ReturnType<typeof setTimeout>;
    setError('');
    const load = async () => {
      try {
        const result = await call<T>(JSON.parse(requestKey));
        if (!alive) return;
        setValue(result); setError('');
        if (poll(result)) timer = setTimeout(() => { void load(); }, 1500);
      } catch (cause) { if (alive) setError(String(cause)); }
    };
    void load(); return () => { alive = false; clearTimeout(timer); };
  }, [call, requestKey, version]);
  return { value, error, setError, refresh: () => setVersion(x => x + 1) };
}

export const date = (value: string) => new Date(value).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
export const capabilityNames: Record<string, string> = { code: '代码分析', git: 'Git', web: '联网检索', shell: '终端', pdf: 'PDF', vision: '图像识别', browser: '浏览器', memory: '长期记忆' };
export const permissionNames: Record<string, string> = { 'workspace-read': '读取工作目录', 'workspace-write': '修改工作目录', network: '网络访问', process: '执行命令' };
