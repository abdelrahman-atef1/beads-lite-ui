import { describe, expect, test } from 'vitest';
import { matchWorkspace, resolveIssueWorkspace } from './issue-workspace.js';

const av = [
  { path: 'C:/Users/x/company' },
  { path: 'E:/Projects/abduu-tasks' },
  { path: 'E:' + String.fromCharCode(92) + 'Projects' + String.fromCharCode(92) + 'rayeh' }
];

describe('issue id -> workspace', () => {
  test('matches by prefix', () => {
    expect(matchWorkspace('abduu-tasks-q79.43', av)?.path).toBe(av[1].path);
    expect(matchWorkspace('company-1bo5.1', av)?.path).toBe(av[0].path);
    expect(matchWorkspace('rayeh-9', av)?.path).toBe(av[2].path);
  });
  test('switches when current differs', () => {
    expect(resolveIssueWorkspace('abduu-tasks-q79.43', av[0], av)).toEqual({
      action: 'switch',
      path: av[1].path
    });
  });
  test('stays when current matches', () => {
    expect(resolveIssueWorkspace('company-1', av[0], av).action).toBe('stay');
  });
  test('none when no project matches', () => {
    expect(resolveIssueWorkspace('zzz-1', av[0], av).action).toBe('none');
  });
});
