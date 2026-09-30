import type { ReactNode } from 'react';
import { IconInfoOutlineRegular, IconCheckCircleFillRegular, IconWarningOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'error' | 'warning' | 'success' }) {
  const Icon = tone === 'error' || tone === 'warning' ? IconWarningOutlineRegular : tone === 'success' ? IconCheckCircleFillRegular : IconInfoOutlineRegular;
  return <div className="kit-notice" data-tone={tone} role={tone === 'error' ? 'alert' : 'status'}><Icon size={16} /><div>{children}</div></div>;
}
export function Empty({ title, children }: { title: string; children: ReactNode }) {
  return <div className="kit-empty"><IconInfoOutlineRegular size={24} /><h3>{title}</h3><p>{children}</p></div>;
}
