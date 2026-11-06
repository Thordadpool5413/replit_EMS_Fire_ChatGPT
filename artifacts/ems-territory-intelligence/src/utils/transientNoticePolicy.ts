export type TransientNoticeType =
  | 'success'
  | 'info'
  | 'warn'
  | 'error'
  | 'boundary';

export function shouldShowTransientNotice(type: TransientNoticeType): boolean {
  return type === 'warn' || type === 'error' || type === 'boundary';
}
