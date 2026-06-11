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
      `每日检查官方数据；当前已核验数据快照日期：${config.predictionFreshness.checkedAt}。`,
      '伤停、停赛与预计阵容仍属于低权重人工输入，未逐队验证时不应视为事实。',
      '公开宣称准确率前，应使用至少 300 场近期成年国家队比赛完成独立回测与校准。'
    ]
  };
}
