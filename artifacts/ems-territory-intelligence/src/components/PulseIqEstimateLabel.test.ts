import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  describePulseIqScoreSummary,
  summarizePulseIqScores,
} from './PulseIqEstimateLabel';

describe('PulseIQ cluster summaries', () => {
  it('averages finite scores and counts missing values without treating zero as missing', () => {
    const summary = summarizePulseIqScores([0, 80, null, undefined, Number.NaN, Number.POSITIVE_INFINITY]);

    assert.deepEqual(summary, {
      availableCount: 2,
      missingCount: 4,
      averageScore: 40,
    });
    assert.equal(
      describePulseIqScoreSummary(summary),
      '2 estimates available; average PulseIQ estimate 40/100; 4 estimates not reported'
    );
  });

  it('labels clusters with no available scores without creating an average', () => {
    const summary = summarizePulseIqScores([null, undefined]);

    assert.deepEqual(summary, {
      availableCount: 0,
      missingCount: 2,
      averageScore: null,
    });
    assert.equal(
      describePulseIqScoreSummary(summary),
      '0 estimates available; no available estimates; 2 estimates not reported'
    );
  });

  it('omits the missing-value note when every agency has an estimate', () => {
    const summary = summarizePulseIqScores([20, 40]);

    assert.equal(
      describePulseIqScoreSummary(summary),
      '2 estimates available; average PulseIQ estimate 30/100'
    );
  });
});
