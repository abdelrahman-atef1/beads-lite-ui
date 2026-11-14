/**
 * Sample data for the experiment view and the digest card (?timefx=1), same shape as the
 * server answer of flow-digest (beads-lite-1bo5.6.66.7). Used by the fixture mode and the tests.
 */
const MIN = 60_000;
const DAY = 86_400_000;

/**
 * @param {string} slug
 * @param {any} over
 */
function exp(slug, over) {
  return {
    slug,
    verdict: 'EXTEND',
    reason: '',
    final: false,
    evaluated_at: '',
    metric: 'active',
    n_treat: 12,
    n_base: 30,
    n_unknown: 0,
    median_treat: 40 * MIN,
    median_base: 60 * MIN,
    change: -0.33,
    interval80: { lo: -30 * MIN, hi: -5 * MIN },
    guardrails: [
      ['qaFail', 0.1, 0.08],
      ['reopen', 0.03, 0.03],
      ['ownerReject', 0, 0],
      ['rework', 0.12, 0.1]
    ].map(([name, b, t]) => ({
      name,
      known: true,
      base_rate: b,
      treat_rate: t,
      held: true,
      rollback: false
    })),
    control: null,
    market_moved: false,
    confounded: false,
    confounded_by: [],
    exp: {
      hypothesis: 'Shorter briefs cut active time without more fails',
      change: 'briefs under 200 words',
      scope: { role: 'sre', kind: 'task' },
      start: 0,
      target: 0.2,
      min_n: 10,
      max_weeks: 4
    },
    ...over
  };
}

/** @param {number} now */
export function fixtureDigest(now) {
  const at = new Date(now - 2 * 3_600_000).toISOString();
  const start = now - 12 * DAY;
  /** @param {any} o @param {any} [x] */
  const E = (o, x = {}) =>
    exp(o.slug, {
      evaluated_at: at,
      ...o,
      exp: { ...exp('x', {}).exp, start, ...x }
    });
  return {
    digest: {
      week: '2026-W46',
      findings: true,
      built_at: at,
      lines: [
        'Title: Flow 2026-W46: at risk (n=2318 closed in 4 weeks)',
        'Done since last: faster with quality held: sre task (fails 5/110, n=110); experiments: 1 adopted, 1 rolled back',
        'Next: cto - read [Flow review 2026-W46](https://abdelrahman.tail8a4e50.ts.net/#/issues?issue=company-a8il.8.2)',
        'Needs you: nothing',
        'Risks: swe bug: waiting median 41m to 4h09 (+511%), fails 6/238 (faster, quality held); swe task: waiting median 53m to 2h30 (+186%), fails 43/439 (quality worse, speed about the same)'
      ]
    },
    exps: [
      E({
        slug: 'sre-short-briefs',
        verdict: 'EXTEND',
        final: false,
        reason:
          'enough beads but no clear gain yet: target size or interval not met'
      }),
      E(
        {
          slug: 'qa-checklist',
          verdict: 'EXTEND',
          reason:
            'too few to tell: 3 treatment and 75 baseline beads with a known waiting, need 8 each',
          n_treat: 3,
          n_base: 75,
          metric: 'waiting',
          median_treat: null,
          change: null,
          interval80: null
        },
        {
          hypothesis: 'A QA checklist cuts waiting',
          change: 'checklist',
          scope: { role: 'qa', kind: 'task' },
          min_n: 8
        }
      ),
      E(
        {
          slug: 'cto-model-swap',
          verdict: 'EXTEND',
          confounded: true,
          confounded_by: ['model'],
          reason:
            'enough beads but no clear gain yet: target size or interval not met; confounded: model changed during the run'
        },
        { scope: { role: 'cto', kind: 'task' } }
      ),
      E(
        {
          slug: 'swe-bug-template',
          verdict: 'ROLL BACK',
          final: true,
          reason:
            'guardrail worse than baseline beyond the margin: qaFail 0.01 to 0.11 (p=0.09)',
          median_treat: 35 * MIN,
          median_base: 60 * MIN,
          guardrails: [
            ['qaFail', 0.01, 0.11, false],
            ['reopen', 0.02, 0.02, true],
            ['ownerReject', 0, 0, true],
            ['rework', 0.08, 0.09, true]
          ].map(([name, b, t, held]) => ({
            name,
            known: true,
            base_rate: b,
            treat_rate: t,
            held,
            rollback: !held
          }))
        },
        {
          hypothesis: 'A bug template cuts active time',
          scope: { role: 'swe', kind: 'bug' }
        }
      ),
      E(
        {
          slug: 'sre-weekly-batch',
          verdict: 'ADOPT',
          final: true,
          change: -0.84,
          median_treat: 10 * MIN,
          median_base: 62 * MIN,
          n_treat: 27,
          n_base: 113,
          n_unknown: 34,
          interval80: { lo: -61 * MIN, hi: -40 * MIN },
          control: { n_treat: 30, n_base: 40, change: -0.02 },
          reason:
            'active median down 84% (target 20%), interval excludes 0, guardrails held'
        },
        { hypothesis: 'Batching small tasks cuts active time' }
      ),
      E({
        slug: 'cto-old-run',
        verdict: 'INCONCLUSIVE',
        final: true,
        reason:
          'max_weeks (4) reached without an adopt or roll back; default is revert unless cto or owner keeps it'
      })
    ]
  };
}
