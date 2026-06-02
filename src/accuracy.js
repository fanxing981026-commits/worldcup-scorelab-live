function brierForSample(sample) {
  const actual = {
    home: sample.actual === 'home' ? 1 : 0,
    draw: sample.actual === 'draw' ? 1 : 0,
    away: sample.actual === 'away' ? 1 : 0
  };
  return (
    (sample.homeWin - actual.home) ** 2 +
    (sample.draw - actual.draw) ** 2 +
    (sample.awayWin - actual.away) ** 2
  ) / 3;
}

function predictedLabel(sample) {
  const entries = [
    ['home', sample.homeWin],
    ['draw', sample.draw],
    ['away', sample.awayWin]
  ];
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}

export function summarizeCalibration(samples) {
  const brierScore = samples.reduce((sum, sample) => sum + brierForSample(sample), 0) / samples.length;
  const correct = samples.filter((sample) => predictedLabel(sample) === sample.actual).length;

  return {
    samples: samples.length,
    brierScore: Number(brierScore.toFixed(3)),
    topPickAccuracy: Number((correct / samples.length).toFixed(3)),
    note: 'Small historical sanity check; expand with more international matches before treating accuracy as production-grade.'
  };
}

export function buildAccuracyReport({ config, backtests, teams }) {
  const manualCount = teams.filter((team) => team.updatedAt || team.form !== undefined || team.injuries !== undefined).length;
  return {
    modelVersion: config.version,
    weights: config.weights,
    sourceStatus: config.sourceStatus,
    predictionFreshness: config.predictionFreshness,
    calibration: summarizeCalibration(backtests),
    dataCompleteness: {
      teams: teams.length,
      teamsWithRankingPoints: teams.filter((team) => Number(team.rating) > 0).length,
      teamsWithManualInputs: manualCount
    },
    recommendations: [
      `Refresh FIFA ranking points after the ${config.sourceStatus.ranking.nextOfficialUpdate} official update.`,
      'Update injuries, suspensions and expected lineups within 24 hours of each match.',
      'Backtest model weights against at least 300 recent senior international matches before public accuracy claims.'
    ]
  };
}
