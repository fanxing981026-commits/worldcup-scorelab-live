const MAX_GOALS = 7;

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value)));
}

export function poissonProbability(goals, lambda) {
  const safeLambda = clamp(lambda, 0.05, 6);
  let factorial = 1;
  for (let i = 2; i <= goals; i += 1) factorial *= i;
  return (Math.exp(-safeLambda) * safeLambda ** goals) / factorial;
}

const DEFAULT_WEIGHTS = {
  rating: 1,
  attackDefense: 1,
  condition: 1,
  homeAdvantage: 1
};

function strength(team) {
  const rating = Number(team.rating || 1500);
  const attack = clamp(team.attack ?? 70, 35, 99);
  const defense = clamp(team.defense ?? 70, 35, 99);
  const form = clamp(team.form ?? 0.5, 0, 1);
  const injuries = clamp(team.injuries ?? 0, 0, 0.8);
  const restDays = clamp(team.restDays ?? 5, 0, 14);
  const travelKm = clamp(team.travelKm ?? 900, 0, 9000);
  const restEffect = (restDays - 5) * 0.012;
  const travelEffect = -(travelKm / 1000) * 0.012;
  const hostEffect = team.host ? 0.08 : 0;

  return {
    rating,
    attack,
    defense,
    form,
    injuries,
    restEffect,
    travelEffect,
    hostEffect
  };
}

function expectedGoals(home, away, options = {}) {
  const weights = { ...DEFAULT_WEIGHTS, ...(options.weights || {}) };
  const h = strength(home);
  const a = strength(away);
  const ratingGap = ((h.rating - a.rating) / 420) * weights.rating;
  const homeField = options.neutral ? 0 : 0.11;
  const homeAdvantage = (homeField + h.hostEffect - a.hostEffect) * weights.homeAdvantage;
  const awayAdvantage = (-homeField + a.hostEffect - h.hostEffect) * weights.homeAdvantage;
  const homeEdge = ratingGap + homeAdvantage;
  const awayEdge = -ratingGap + awayAdvantage;

  const homeAttack = ((h.attack - a.defense) / 95) * weights.attackDefense;
  const awayAttack = ((a.attack - h.defense) / 95) * weights.attackDefense;
  const homeCondition = ((h.form - 0.5) * 0.38 - h.injuries * 0.48 + h.restEffect + h.travelEffect) * weights.condition;
  const awayCondition = ((a.form - 0.5) * 0.38 - a.injuries * 0.48 + a.restEffect + a.travelEffect) * weights.condition;

  return {
    home: clamp(1.24 + homeEdge + homeAttack + homeCondition, 0.22, 4.2),
    away: clamp(1.05 + awayEdge + awayAttack + awayCondition, 0.18, 4.0),
    ratingGap,
    audit: {
      weights,
      factors: [
        { key: 'rating', label: 'FIFA/Elo-style rating gap', home: Number(ratingGap.toFixed(3)), away: Number((-ratingGap).toFixed(3)) },
        { key: 'attackDefense', label: 'Attack vs opponent defense', home: Number(homeAttack.toFixed(3)), away: Number(awayAttack.toFixed(3)) },
        { key: 'condition', label: 'Form, injuries, rest and travel', home: Number(homeCondition.toFixed(3)), away: Number(awayCondition.toFixed(3)) },
        { key: 'homeAdvantage', label: 'Venue and host advantage', home: Number(homeAdvantage.toFixed(3)), away: Number(awayAdvantage.toFixed(3)) }
      ]
    }
  };
}

export function rankedScorelines(scorelines, limit = 8) {
  return [...scorelines]
    .sort((a, b) => b.probability - a.probability)
    .slice(0, limit)
    .map((line) => ({
      score: `${line.homeGoals}-${line.awayGoals}`,
      homeGoals: line.homeGoals,
      awayGoals: line.awayGoals,
      probability: line.probability
    }));
}

export function predictMatch(home, away, options = {}) {
  const expected = expectedGoals(home, away, options);
  const scorelines = [];
  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;
  let totalMass = 0;
  let over25 = 0;
  let bothScore = 0;
  let homeCleanSheet = 0;
  let awayCleanSheet = 0;

  for (let h = 0; h <= MAX_GOALS; h += 1) {
    for (let a = 0; a <= MAX_GOALS; a += 1) {
      const probability = poissonProbability(h, expected.home) * poissonProbability(a, expected.away);
      totalMass += probability;
      if (h > a) homeWin += probability;
      if (h === a) draw += probability;
      if (h < a) awayWin += probability;
      if (h + a > 2.5) over25 += probability;
      if (h > 0 && a > 0) bothScore += probability;
      if (a === 0) homeCleanSheet += probability;
      if (h === 0) awayCleanSheet += probability;
      scorelines.push({ homeGoals: h, awayGoals: a, probability });
    }
  }

  const normalize = (value) => value / totalMass;
  const ratingGapText = `${home.name} rating ${Math.round(home.rating)} vs ${away.name} ${Math.round(away.rating)}`;
  const conditionText = `Form, injuries, rest, travel and host context adjust expected goals after the rating baseline.`;

  return {
    teams: { home: home.name, away: away.name },
    expected: {
      home: Number(expected.home.toFixed(2)),
      away: Number(expected.away.toFixed(2))
    },
    outcome: {
      homeWin: normalize(homeWin),
      draw: normalize(draw),
      awayWin: normalize(awayWin)
    },
    markets: {
      over25: normalize(over25),
      bothTeamsToScore: normalize(bothScore),
      homeCleanSheet: normalize(homeCleanSheet),
      awayCleanSheet: normalize(awayCleanSheet)
    },
    scorelines: scorelines.map((line) => ({
      ...line,
      probability: normalize(line.probability)
    })),
    explain: [
      `Rating baseline: ${ratingGapText}.`,
      conditionText,
      'Poisson score matrix converts expected goals into exact-score probability mass.'
    ],
    inputAudit: {
      weights: expected.audit.weights,
      factors: expected.audit.factors,
      sourceNotes: [
        'FIFA ranking points anchor the rating baseline.',
        'Manual inputs cover attack, defense, form, injuries, rest, travel and host context.',
        'Refresh ranking and lineup inputs before any serious pre-match use.'
      ]
    },
    confidence: confidenceFor(home, away)
  };
}

export function confidenceFor(home, away) {
  const missing = [home, away].reduce((count, team) => {
    return count + ['rating', 'attack', 'defense', 'form'].filter((key) => team[key] === undefined).length;
  }, 0);
  const injuryRisk = (Number(home.injuries || 0) + Number(away.injuries || 0)) / 2;
  if (missing > 1 || injuryRisk > 0.28) return 'medium';
  const verifiedInputs = [home, away].every((team) => team.dataQuality === 'verified');
  return verifiedInputs ? 'high' : 'medium';
}
