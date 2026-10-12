// Does the agent's team beat simply picking an average player? Pure maths, no database, so it is tested.
//
// For each match:
//   picked = real points of the 11 players the agent picked
//   field  = real points of every player in the two playing XIs
//   pairs  = (predicted, real) for every player, to see how well the predictions RANK players
// edge = average of (mean picked - mean field) over matches. Positive means the agent beats an average player.
// se is the standard error of that average over matches, so a result inside about two se is not proof of anything.

export interface MatchEdge {
  date?: string;
  picked: number[];
  field: number[];
  pairs: { predicted: number; actual: number }[];
}

export interface EdgeSummary {
  matches: number;
  pickedAvg: number;
  fieldAvg: number;
  edge: number; // picked minus field, in points per player
  se: number; // standard error of the edge over matches
  wins: number; // matches where picked beat the field
  spearman: number; // rank correlation of predicted vs real across all players, averaged over matches
  mae: number;
  bias: number; // mean (predicted - real); positive = over-prediction
}

const mean = (xs: number[]) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);

function ranks(xs: number[]): number[] {
  const order = xs.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const r = new Array<number>(xs.length);
  for (let k = 0; k < order.length; ) {
    let j = k;
    while (j + 1 < order.length && order[j + 1].v === order[k].v) j++;
    const avg = (k + j) / 2 + 1; // ties share the average rank
    for (let t = k; t <= j; t++) r[order[t].i] = avg;
    k = j + 1;
  }
  return r;
}

// Rank correlation: 1 = same order, 0 = unrelated, -1 = opposite.
export function spearman(a: number[], b: number[]): number {
  if (a.length < 3 || a.length !== b.length) return 0;
  const ra = ranks(a), rb = ranks(b);
  const ma = mean(ra), mb = mean(rb);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < ra.length; i++) { num += (ra[i] - ma) * (rb[i] - mb); da += (ra[i] - ma) ** 2; db += (rb[i] - mb) ** 2; }
  return da === 0 || db === 0 ? 0 : num / Math.sqrt(da * db);
}

export function summariseEdge(matches: MatchEdge[]): EdgeSummary {
  const usable = matches.filter((m) => m.picked.length > 0 && m.field.length > 0);
  const diffs = usable.map((m) => mean(m.picked) - mean(m.field));
  const n = usable.length;
  const edge = mean(diffs);
  const sd = n > 1 ? Math.sqrt(diffs.reduce((a, d) => a + (d - edge) ** 2, 0) / (n - 1)) : 0;
  const pairs = usable.flatMap((m) => m.pairs);
  return {
    matches: n,
    pickedAvg: mean(usable.map((m) => mean(m.picked))),
    fieldAvg: mean(usable.map((m) => mean(m.field))),
    edge,
    se: n > 1 ? sd / Math.sqrt(n) : 0,
    wins: diffs.filter((d) => d > 0).length,
    spearman: mean(usable.map((m) => spearman(m.pairs.map((p) => p.predicted), m.pairs.map((p) => p.actual)))),
    mae: mean(pairs.map((p) => Math.abs(p.predicted - p.actual))),
    bias: mean(pairs.map((p) => p.predicted - p.actual)),
  };
}
