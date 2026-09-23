import { describe, expect, it } from 'vitest';
import { shouldTriggerNavigation } from './navigation-progress';

describe('shouldTriggerNavigation', () => {
  const currentUrl = {
    origin: 'http://localhost:3000',
    pathname: '/dashboard',
    search: '',
  };

  it('kích hoạt với link nội bộ chuyển sang trang khác', () => {
    expect(shouldTriggerNavigation('/students', currentUrl)).toBe(true);
    expect(shouldTriggerNavigation('/alerts?level=FATAL', currentUrl)).toBe(true);
    expect(shouldTriggerNavigation('http://localhost:3000/admin/users', currentUrl)).toBe(true);
  });

  it('kích hoạt khi cùng pathname nhưng đổi query parameters', () => {
    expect(shouldTriggerNavigation('/dashboard?term=SP26', currentUrl)).toBe(true);
  });

  it('không kích hoạt khi trùng chính xác pathname và search hiện tại', () => {
    expect(shouldTriggerNavigation('/dashboard', currentUrl)).toBe(false);
    expect(shouldTriggerNavigation('http://localhost:3000/dashboard', currentUrl)).toBe(false);
  });

  it('không kích hoạt khi href rỗng hoặc link neo hash', () => {
    expect(shouldTriggerNavigation('', currentUrl)).toBe(false);
    expect(shouldTriggerNavigation(null, currentUrl)).toBe(false);
    expect(shouldTriggerNavigation('#top', currentUrl)).toBe(false);
    expect(shouldTriggerNavigation('/dashboard#section', currentUrl)).toBe(false);
  });

  it('không kích hoạt với link protocol đặc biệt (mailto, tel, javascript)', () => {
    expect(shouldTriggerNavigation('mailto:admin@fpt.edu.vn', currentUrl)).toBe(false);
    expect(shouldTriggerNavigation('tel:0123456789', currentUrl)).toBe(false);
    expect(shouldTriggerNavigation('javascript:void(0)', currentUrl)).toBe(false);
  });

  it('không kích hoạt với link ngoại bộ khác origin', () => {
    expect(shouldTriggerNavigation('https://google.com', currentUrl)).toBe(false);
    expect(shouldTriggerNavigation('https://fpt.edu.vn/students', currentUrl)).toBe(false);
  });

  it('không kích hoạt khi mở tab mới hoặc dùng phím bổ trợ (Ctrl, Cmd, Shift, Alt)', () => {
    expect(shouldTriggerNavigation('/students', currentUrl, { target: '_blank' })).toBe(false);
    expect(shouldTriggerNavigation('/students', currentUrl, { metaKey: true })).toBe(false);
    expect(shouldTriggerNavigation('/students', currentUrl, { ctrlKey: true })).toBe(false);
    expect(shouldTriggerNavigation('/students', currentUrl, { shiftKey: true })).toBe(false);
    expect(shouldTriggerNavigation('/students', currentUrl, { altKey: true })).toBe(false);
    expect(shouldTriggerNavigation('/students', currentUrl, { button: 1 })).toBe(false); // click chuột giữa
  });

  it('không kích hoạt khi sự kiện click đã bị defaultPrevented', () => {
    expect(shouldTriggerNavigation('/students', currentUrl, { defaultPrevented: true })).toBe(false);
  });
});
