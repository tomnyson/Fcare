import { createElement, type FormEvent, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MasterDataTabKey } from '../../lib/master-data-tabs';
import { MasterDataView } from './master-data-view';

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  submit: undefined as ((event: FormEvent<HTMLFormElement>) => void) | undefined,
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useQuery: () => ({ data: undefined }),
  useMutation: () => ({ mutate: mocks.mutate, isPending: false }),
}));
vi.mock('../../lib/hooks', () => ({ useMe: () => ({ data: undefined }) }));
vi.mock('../ui/modal', () => ({
  Modal: ({ children }: { children: ReactElement<{ onSubmit?: typeof mocks.submit }> }) => {
    if (children?.props.onSubmit) mocks.submit = children.props.onSubmit;
    return null;
  },
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  mocks.submit = undefined;
});

function submitForm(tab: MasterDataTabKey, fields: Record<string, string>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  vi.stubGlobal(
    'FormData',
    class {
      constructor() {
        return form;
      }
    },
  );
  renderToStaticMarkup(createElement(MasterDataView, { tab }));
  expect(mocks.submit).toBeTypeOf('function');
  mocks.submit!({
    preventDefault: vi.fn(),
    currentTarget: {},
  } as unknown as FormEvent<HTMLFormElement>);
}

describe('master data form submission', () => {
  it.each([
    ['departments', { code: 'IT', name: 'IT' }, { code: 'IT', name: 'IT' }],
    [
      'majors',
      { code: 'SE', name: 'Software', departmentId: 'd1' },
      { code: 'SE', name: 'Software', departmentId: 'd1' },
    ],
    [
      'subjects',
      { code: 'JS', name: 'JavaScript', credits: '3', departmentId: 'd1' },
      { code: 'JS', name: 'JavaScript', credits: 3, departmentId: 'd1' },
    ],
    [
      'class-sections',
      { code: 'C1', subjectId: 's1', lecturerId: 'l1', term: 'FA26' },
      { code: 'C1', subjectId: 's1', lecturerId: 'l1', term: 'FA26' },
    ],
  ] as const)('submits %s without term date fields', (tab, fields, expected) => {
    submitForm(tab, fields);
    expect(mocks.mutate).toHaveBeenCalledExactlyOnceWith(expected);
  });

  it('preserves UTC day boundaries for term dates', () => {
    submitForm('terms', {
      code: 'SP26',
      name: 'Spring 2026',
      startDate: '2026-01-01',
      endDate: '2026-04-30',
    });
    expect(mocks.mutate).toHaveBeenCalledExactlyOnceWith({
      code: 'SP26',
      name: 'Spring 2026',
      season: 'SPRING',
      year: new Date().getFullYear(),
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2026-04-30T23:59:59.999Z',
      isCurrentOverride: false,
    });
  });
});
