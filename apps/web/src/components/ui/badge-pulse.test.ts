import { describe, expect, it } from 'vitest';
import { Badge } from '@fcare/ui-kit';

describe('Badge Component - Danger Pulse Effect', () => {
  it('renders standard badge without pulse by default', () => {
    const element = Badge({ tone: 'info', children: 'Thông tin' });
    expect(element.props.className).toContain('bg-fpt-blue/10');
    expect(element.props.className).not.toContain('animate-pulse');
    expect(element.props.className).not.toContain('ring-2');
  });

  it('renders pulsing badge with animate-pulse, ring, and ping dot when pulse is true', () => {
    const element = Badge({
      tone: 'danger',
      pulse: true,
      children: 'Mức 4 — Khẩn cấp',
    });
    expect(element.props.className).toContain('animate-pulse');
    expect(element.props.className).toContain('ring-2');
    expect(element.props.className).toContain('bg-danger/10');

    // Children includes ping dot and text
    const children = element.props.children;
    expect(Array.isArray(children)).toBe(true);
    // First child is the ping dot container
    const pingDot = children[0];
    expect(pingDot).toBeDefined();
    expect(pingDot.props.className).toContain('relative');
    expect(pingDot.props.children[0].props.className).toContain('animate-ping');
  });

  it('renders custom className when provided', () => {
    const element = Badge({
      tone: 'warning',
      className: 'custom-class',
      children: 'Cảnh báo',
    });
    expect(element.props.className).toContain('custom-class');
  });
});
