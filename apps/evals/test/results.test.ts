import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readRun, writeRun } from '../src/results.ts';
import { runOf } from './fixtures.ts';

const dir = mkdtempSync(join(tmpdir(), 'evals-'));

describe('readRun', () => {
  it('reads back what writeRun wrote', () => {
    const path = join(dir, 'run.json');
    const run = runOf([], { id: 'j', rubricVersion: 2 });
    writeRun(path, run);
    expect(readRun(path)).toEqual(run);
  });

  it('names the file and the field when the shape is wrong', () => {
    const path = join(dir, 'old.json');
    writeFileSync(path, '{"startedAt":"x","promptVersion":1,"judge":"j","results":[]}');
    expect(() => readRun(path)).toThrow(`${path}: `);
    expect(() => readRun(path)).toThrow('judge');
  });
});
