import { predictMatch, rankedScorelines } from './src/model.js';
import { buildAccuracyReport } from './src/accuracy.js';

const FLAGS = {
  ARG: '🇦🇷', AUS: '🇦🇺', AUT: '🇦🇹', BEL: '🇧🇪', BIH: '🇧🇦', BRA: '🇧🇷',
  CAN: '🇨🇦', CIV: '🇨🇮', COD: '🇨🇩', COL: '🇨🇴', CPV: '🇨🇻', CRO: '🇭🇷',
  CUW: '🇨🇼', CZE: '🇨🇿', ECU: '🇪🇨', EGY: '🇪🇬', ENG: '🏴', ESP: '🇪🇸',
  FRA: '🇫🇷', GER: '🇩🇪', GHA: '🇬🇭', HAI: '🇭🇹', IRN: '🇮🇷', IRQ: '🇮🇶',
  JOR: '🇯🇴', JPN: '🇯🇵', KOR: '🇰🇷', KSA: '🇸🇦', MAR: '🇲🇦', MEX: '🇲🇽',
  NED: '🇳🇱', NOR: '🇳🇴', NZL: '🇳🇿', PAN: '🇵🇦', PAR: '🇵🇾', POR: '🇵🇹',
  QAT: '🇶🇦', RSA: '🇿🇦', SCO: '🏴', SEN: '🇸🇳', SUI: '🇨🇭', SWE: '🇸🇪',
  TUN: '🇹🇳', TUR: '🇹🇷', URU: '🇺🇾', USA: '🇺🇸', UZB: '🇺🇿'
};

const compliance = {
  disclaimer:
    'This website is for statistical analysis and entertainment only. It is not betting advice, gambling guidance, financial advice, or a guarantee of match results.',
  banned:
    'No bookmaker links, stake sizing, odds-shopping, affiliate betting content, or instructions to gamble are provided.'
};

const state = {
  teams: [],
  originalTeams: [],
  groups: [],
  matches: [],
  backtests: [],
  modelConfig: null,
  accuracy: null,
  homeId: 'france',
  awayId: 'canada',
  prediction: null,
  goalsChart: null,
  lang: 'zh'
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const percent = (value) => `${Math.round(value * 100)}%`;

async function readJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Cannot load ${path}`);
  return response.json();
}

function groupsFromTeams(teams) {
  const groups = new Map();
  for (const team of teams) {
    if (!groups.has(team.group)) groups.set(team.group, []);
    groups.get(team.group).push(team);
  }
  return [...groups.entries()].map(([id, groupTeams]) => ({ id, teams: groupTeams }));
}

function teamById(id) {
  return state.teams.find((team) => team.id === id);
}

function flag(team) {
  return FLAGS[team.code] || '⚽';
}

function renderTeamOptions(side) {
  const input = $(`#${side}Search`);
  const host = $(`#${side}Options`);
  const selectedId = side === 'home' ? state.homeId : state.awayId;
  const query = input.value.trim().toLowerCase();
  const teams = state.teams
    .filter((team) => {
      const haystack = `${team.name} ${team.code} ${team.group} ${team.confederation}`.toLowerCase();
      return haystack.includes(query);
    })
    .slice(0, 48);

  host.innerHTML = teams
    .map((team) => {
      const selected = team.id === selectedId;
      return `
        <button class="team-card rounded-2xl border border-white/10 bg-white/[.04] p-3 text-left transition hover:-translate-y-0.5 hover:border-gold-500/50"
          type="button" data-side="${side}" data-team-id="${team.id}" aria-selected="${selected}">
          <span class="flex items-center gap-3">
            <span class="text-2xl">${flag(team)}</span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-black text-white">${team.name}</span>
              <span class="block text-xs font-bold text-white/48">${team.code} · Group ${team.group} · FIFA #${team.rank}</span>
            </span>
            <span class="rounded-full bg-gold-500/10 px-2 py-1 text-xs font-black text-gold-300">${Math.round(team.rating)}</span>
          </span>
        </button>
      `;
    })
    .join('');
}

function selectTeam(side, id) {
  if (side === 'home') state.homeId = id;
  if (side === 'away') state.awayId = id;
  const team = teamById(id);
  $(`#${side}Search`).value = `${flag(team)} ${team.name} (${team.code})`;
  renderTeamOptions('home');
  renderTeamOptions('away');
  animateTeamSelection();
  updateUrlState();
  runPrediction();
}

function animateTeamSelection() {
  if (!window.gsap) return;
  gsap.fromTo('.team-card[aria-selected="true"]', { scale: 0.985 }, { scale: 1, duration: 0.26, ease: 'back.out(2)' });
}

function renderAccuracy() {
  const accuracy = state.accuracy;
  $('#heroModelStatus').textContent = `${state.groups.length} groups · ${state.matches.length} fixtures`;
  $('#heroTeams').textContent = state.teams.length;
  $('#heroGroups').textContent = state.groups.length;
  $('#heroMatches').textContent = state.matches.length;
  $('#modelVersionBadge').textContent = accuracy.modelVersion;
  $('#heroFreshness').textContent = `数据检查：${accuracy.predictionFreshness.checkedAt} · 下一次 FIFA 排名：${accuracy.sourceStatus.ranking.nextOfficialUpdate}`;
  $('#rankingFreshness').textContent = accuracy.sourceStatus.ranking.lastOfficialUpdate;
  $('#rankingNext').textContent = `下一次官方更新：${accuracy.sourceStatus.ranking.nextOfficialUpdate}`;
  $('#brierScore').textContent = accuracy.calibration.brierScore;
  $('#backtestSamples').textContent = `${accuracy.calibration.samples} 个历史校准样本`;
  $('#topPickAccuracy').textContent = percent(accuracy.calibration.topPickAccuracy);
  $('#dataCompleteness').textContent = `${accuracy.dataCompleteness.teamsWithRankingPoints}/${accuracy.dataCompleteness.teams}`;
  $('#recommendations').innerHTML = accuracy.recommendations.map((item) => `<p class="mb-2">${item}</p>`).join('');
  $('#freshnessNotes').innerHTML = accuracy.predictionFreshness.notes.map((item) => `<p class="mb-2">${item}</p>`).join('');
  $('#disclaimer').textContent = compliance.disclaimer;
  $('#banned').textContent = compliance.banned;
}

function renderGroups() {
  $('#groupTabs').innerHTML = state.groups
    .map((group) => `<a href="#group-${group.id}" class="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-black text-white/70 hover:border-gold-500/40">Group ${group.id}</a>`)
    .join('');

  $('#groupGrid').innerHTML = state.groups
    .map((group) => {
      const avgRating = Math.round(group.teams.reduce((sum, team) => sum + team.rating, 0) / group.teams.length);
      return `
        <article id="group-${group.id}" class="group-card glass rounded-3xl p-5 transition hover:-translate-y-1 hover:border-gold-500/40">
          <div class="mb-4 flex items-center justify-between">
            <h3 class="text-2xl font-black">Group ${group.id}</h3>
            <span class="rounded-full bg-white/5 px-3 py-1 text-xs font-black text-white/50">Avg ${avgRating}</span>
          </div>
          <div class="grid gap-3">
            ${group.teams
              .map((team) => {
                const strength = Math.min(100, Math.max(20, ((team.rating - 1200) / 700) * 100));
                const avgXg = (0.72 + team.attack / 85).toFixed(2);
                return `
                  <div class="rounded-2xl border border-white/10 bg-black/18 p-3">
                    <div class="flex items-center gap-3">
                      <span class="text-2xl">${flag(team)}</span>
                      <div class="min-w-0 flex-1">
                        <div class="flex items-center justify-between gap-3">
                          <strong class="truncate">${team.name}</strong>
                          <span class="text-xs font-black text-gold-300">#${team.rank}</span>
                        </div>
                        <div class="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                          <i class="block h-full rounded-full bg-gradient-to-r from-evergreen-600 via-gold-500 to-cyan-400" style="width:${strength}%"></i>
                        </div>
                      </div>
                      <span class="rounded-xl bg-cyan-400/10 px-2 py-1 text-xs font-black text-cyan-400">xG ${avgXg}</span>
                    </div>
                  </div>
                `;
              })
              .join('')}
          </div>
        </article>
      `;
    })
    .join('');
}

function scorelineGrid(prediction) {
  return prediction.scorelines
    .filter((line) => line.homeGoals <= 4 && line.awayGoals <= 4)
    .sort((a, b) => a.homeGoals - b.homeGoals || a.awayGoals - b.awayGoals);
}

function renderHeatmap(prediction) {
  const max = Math.max(...prediction.scorelines.map((line) => line.probability));
  $('#heatmap').innerHTML = scorelineGrid(prediction)
    .map((line) => {
      const intensity = line.probability / max;
      const bg = `rgba(212, 175, 55, ${0.08 + intensity * 0.42})`;
      return `
        <div class="heat-cell rounded-2xl border border-white/10 p-3 text-center" style="background:${bg}">
          <strong class="block text-lg">${line.homeGoals}-${line.awayGoals}</strong>
          <span class="text-xs font-bold text-white/58">${percent(line.probability)}</span>
        </div>
      `;
    })
    .join('');
}

function poissonDistribution(lambda, max = 6) {
  const values = [];
  let sum = 0;
  for (let goals = 0; goals <= max; goals += 1) {
    let factorial = 1;
    for (let i = 2; i <= goals; i += 1) factorial *= i;
    const probability = (Math.exp(-lambda) * lambda ** goals) / factorial;
    values.push(probability);
    sum += probability;
  }
  return values.map((value) => value / sum);
}

function renderGoalsChart(prediction) {
  const ctx = $('#goalsChart');
  if (!window.Chart) {
    ctx.replaceWith(Object.assign(document.createElement('p'), {
      id: 'goalsChart',
      className: 'rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/60',
      textContent: `图表库暂未加载。xG ${prediction.teams.home} ${prediction.expected.home} : ${prediction.expected.away} ${prediction.teams.away}`
    }));
    return;
  }
  const labels = ['0', '1', '2', '3', '4', '5', '6+'];
  const homeDist = poissonDistribution(prediction.expected.home);
  const awayDist = poissonDistribution(prediction.expected.away);
  if (state.goalsChart) state.goalsChart.destroy();
  state.goalsChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: prediction.teams.home,
          data: homeDist.map((value) => Math.round(value * 100)),
          borderColor: '#D4AF37',
          backgroundColor: 'rgba(212,175,55,.12)',
          tension: 0.38,
          fill: true
        },
        {
          label: prediction.teams.away,
          data: awayDist.map((value) => Math.round(value * 100)),
          borderColor: '#22D3EE',
          backgroundColor: 'rgba(34,211,238,.10)',
          tension: 0.38,
          fill: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: 'rgba(255,255,255,.7)' } } },
      scales: {
        x: { ticks: { color: 'rgba(255,255,255,.55)' }, grid: { color: 'rgba(255,255,255,.06)' } },
        y: { ticks: { color: 'rgba(255,255,255,.55)', callback: (value) => `${value}%` }, grid: { color: 'rgba(255,255,255,.06)' } }
      }
    }
  });
}

function simulate(prediction, runs = 10000) {
  const cumulative = [];
  let sum = 0;
  for (const line of prediction.scorelines) {
    sum += line.probability;
    cumulative.push({ ...line, cumulative: sum });
  }
  const outcomes = { home: 0, draw: 0, away: 0 };
  for (let i = 0; i < runs; i += 1) {
    const pick = Math.random();
    const line = cumulative.find((item) => pick <= item.cumulative) || cumulative[cumulative.length - 1];
    if (line.homeGoals > line.awayGoals) outcomes.home += 1;
    else if (line.homeGoals === line.awayGoals) outcomes.draw += 1;
    else outcomes.away += 1;
  }
  return {
    home: outcomes.home / runs,
    draw: outcomes.draw / runs,
    away: outcomes.away / runs
  };
}

function renderFactorBreakdown(prediction) {
  $('#factorBreakdown').innerHTML = prediction.inputAudit.factors
    .map((factor) => {
      const homeWidth = Math.min(100, Math.abs(factor.home) * 180);
      const awayWidth = Math.min(100, Math.abs(factor.away) * 180);
      return `
        <div class="rounded-2xl border border-white/10 bg-white/[.035] p-3">
          <div class="flex items-center justify-between gap-3 text-sm">
            <span class="font-bold text-white/68">${factor.label}</span>
            <strong class="text-gold-300">${factor.home > 0 ? '+' : ''}${factor.home} / ${factor.away > 0 ? '+' : ''}${factor.away}</strong>
          </div>
          <div class="mt-2 grid grid-cols-2 gap-2">
            <i class="block h-2 rounded-full bg-gold-500" style="width:${homeWidth}%"></i>
            <i class="block h-2 rounded-full bg-cyan-400" style="width:${awayWidth}%"></i>
          </div>
        </div>
      `;
    })
    .join('');
}

function renderPrediction(prediction) {
  state.prediction = prediction;
  $('#resultPanel').classList.remove('opacity-0');
  $('#matchTitle').textContent = `${prediction.teams.home} vs ${prediction.teams.away}`;
  $('#confidencePill').textContent = `置信度 ${prediction.confidence}`;
  $('#homeWin').textContent = percent(prediction.outcome.homeWin);
  $('#draw').textContent = percent(prediction.outcome.draw);
  $('#awayWin').textContent = percent(prediction.outcome.awayWin);
  $('#homeWinBar').style.width = percent(prediction.outcome.homeWin);
  $('#drawBar').style.width = percent(prediction.outcome.draw);
  $('#awayWinBar').style.width = percent(prediction.outcome.awayWin);
  $('#xgSummary').textContent = `xG ${prediction.teams.home} ${prediction.expected.home} : ${prediction.expected.away} ${prediction.teams.away}`;
  $('#goalTrend').textContent = `大 2.5 球 ${percent(prediction.markets.over25)} · 双方进球 ${percent(prediction.markets.bothTeamsToScore)}`;
  $('#topScores').innerHTML = rankedScorelines(prediction.scorelines, 6)
    .map((line) => `<div class="rounded-2xl border border-white/10 bg-white/[.035] p-3"><strong class="block text-xl">${line.score}</strong><span class="text-xs font-bold text-white/55">${percent(line.probability)}</span></div>`)
    .join('');
  renderHeatmap(prediction);
  renderGoalsChart(prediction);
  renderFactorBreakdown(prediction);
  const sim = simulate(prediction);
  $('#simulationSummary').textContent = `10,000 sims · ${percent(sim.home)} / ${percent(sim.draw)} / ${percent(sim.away)}`;

  if (window.gsap) {
    gsap.fromTo('#resultPanel', { y: 20, opacity: 0, filter: 'blur(8px)' }, { y: 0, opacity: 1, filter: 'blur(0px)', duration: 0.6, ease: 'back.out(1.25)' });
    gsap.fromTo('.prob-number', { textContent: 0 }, { duration: 0.65, ease: 'power2.out' });
  }
}

function runPrediction() {
  const home = teamById(state.homeId);
  const away = teamById(state.awayId);
  if (!home || !away || home.id === away.id) return;
  const prediction = predictMatch(home, away, {
    neutral: $('#neutral').checked,
    weights: state.modelConfig.weights
  });
  renderPrediction(prediction);
}

function hydrateParameterControls() {
  const team = teamById($('#adminTeam').value);
  if (!team) return;
  for (const key of ['attack', 'defense', 'form', 'injuries', 'restDays', 'travelKm']) {
    $(`#${key}`).value = team[key];
  }
}

function applyParameters() {
  const team = teamById($('#adminTeam').value);
  Object.assign(team, {
    attack: Number($('#attack').value),
    defense: Number($('#defense').value),
    form: Number($('#form').value),
    injuries: Number($('#injuries').value),
    restDays: Number($('#restDays').value),
    travelKm: Number($('#travelKm').value)
  });
  state.groups = groupsFromTeams(state.teams);
  state.accuracy = buildAccuracyReport({ config: state.modelConfig, backtests: state.backtests, teams: state.teams });
  $('#adminStatus').textContent = `${team.name} 参数已更新。`;
  renderGroups();
  renderAccuracy();
  runPrediction();
}

function resetParameters() {
  state.teams = structuredClone(state.originalTeams);
  state.groups = groupsFromTeams(state.teams);
  hydrateParameterControls();
  renderGroups();
  runPrediction();
  $('#adminStatus').textContent = '参数已恢复到数据快照。';
}

function updateUrlState() {
  const url = new URL(window.location.href);
  url.searchParams.set('home', state.homeId);
  url.searchParams.set('away', state.awayId);
  history.replaceState(null, '', url);
}

async function shareLink() {
  updateUrlState();
  await navigator.clipboard?.writeText(window.location.href);
  $('#shareLinkBtn').textContent = '已复制链接';
  setTimeout(() => ($('#shareLinkBtn').textContent = '分享链接'), 1600);
}

function shareImage() {
  if (!state.prediction) return;
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 675;
  const ctx = canvas.getContext('2d');
  const p = state.prediction;
  ctx.fillStyle = '#07100D';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, '#0A3D2E');
  gradient.addColorStop(1, '#1F2521');
  ctx.fillStyle = gradient;
  ctx.fillRect(40, 40, 1120, 595);
  ctx.fillStyle = '#E8C670';
  ctx.font = '700 34px Inter, sans-serif';
  ctx.fillText('ScoreLab 2026 Prediction', 82, 112);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '900 62px Inter, sans-serif';
  ctx.fillText(`${p.teams.home} vs ${p.teams.away}`, 82, 205);
  ctx.font = '800 44px Inter, sans-serif';
  ctx.fillText(`xG ${p.expected.home} : ${p.expected.away}`, 82, 282);
  ctx.font = '900 54px Inter, sans-serif';
  ctx.fillText(`Home ${percent(p.outcome.homeWin)}   Draw ${percent(p.outcome.draw)}   Away ${percent(p.outcome.awayWin)}`, 82, 390);
  ctx.fillStyle = '#22D3EE';
  ctx.font = '800 32px Inter, sans-serif';
  ctx.fillText(`Top scores: ${rankedScorelines(p.scorelines, 4).map((line) => `${line.score} ${percent(line.probability)}`).join(' · ')}`, 82, 475);
  ctx.fillStyle = 'rgba(255,255,255,.65)';
  ctx.font = '600 22px Inter, sans-serif';
  ctx.fillText('For statistical analysis only. Not betting advice.', 82, 570);
  const link = document.createElement('a');
  link.download = 'scorelab-prediction.png';
  link.href = canvas.toDataURL('image/png');
  link.click();
}

function setupCanvasBackground() {
  const canvas = $('#fieldCanvas');
  const ctx = canvas.getContext('2d');
  const particles = Array.from({ length: 70 }, () => ({
    x: Math.random(),
    y: Math.random(),
    vx: 0.00015 + Math.random() * 0.00035
  }));

  function resize() {
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = innerWidth * ratio;
    canvas.height = innerHeight * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function tick() {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    ctx.strokeStyle = 'rgba(20, 92, 68, .12)';
    ctx.lineWidth = 1;
    for (let y = 0; y < innerHeight; y += 54) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(innerWidth, y + 20);
      ctx.stroke();
    }
    for (const particle of particles) {
      particle.x += particle.vx;
      if (particle.x > 1) particle.x = 0;
      ctx.fillStyle = 'rgba(34, 211, 238, .28)';
      ctx.beginPath();
      ctx.arc(particle.x * innerWidth, particle.y * innerHeight, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
    requestAnimationFrame(tick);
  }

  resize();
  addEventListener('resize', resize);
  tick();
}

function setupEvents() {
  for (const side of ['home', 'away']) {
    $(`#${side}Search`).addEventListener('input', () => renderTeamOptions(side));
    $(`#${side}Options`).addEventListener('click', (event) => {
      const button = event.target.closest('[data-team-id]');
      if (button) selectTeam(button.dataset.side, button.dataset.teamId);
    });
  }
  $('#predictBtn').addEventListener('click', runPrediction);
  $('#neutral').addEventListener('change', runPrediction);
  $('#featuredBtn').addEventListener('click', () => {
    selectTeam('home', 'mexico');
    selectTeam('away', 'south-africa');
  });
  $('#shareLinkBtn').addEventListener('click', shareLink);
  $('#shareImageBtn').addEventListener('click', shareImage);
  $('#openDrawerBtn').addEventListener('click', () => document.body.classList.add('drawer-open'));
  $('#closeDrawerBtn').addEventListener('click', () => document.body.classList.remove('drawer-open'));
  $('#drawerOverlay').addEventListener('click', () => document.body.classList.remove('drawer-open'));
  $('#adminTeam').addEventListener('change', hydrateParameterControls);
  $('#applyParamsBtn').addEventListener('click', applyParameters);
  $('#resetParamsBtn').addEventListener('click', resetParameters);
  $('#themeToggle').addEventListener('click', () => {
    document.documentElement.classList.toggle('dark');
    $('#themeToggle').textContent = document.documentElement.classList.contains('dark') ? 'Dark' : 'Light';
  });
  $('#langToggle').addEventListener('click', () => {
    state.lang = state.lang === 'zh' ? 'en' : 'zh';
    $('#langToggle').textContent = state.lang === 'zh' ? '中 / EN' : 'EN / 中';
  });
}

function setupInitialAnimation() {
  if (!window.gsap) return;
  gsap.from('.hero-copy > *', { y: 24, opacity: 0, duration: 0.75, stagger: 0.08, ease: 'power3.out' });
  gsap.from('.hero-card', { y: 22, opacity: 0, duration: 0.8, delay: 0.15, ease: 'power3.out' });
}

async function init() {
  const [teams, matches, modelConfig, backtests] = await Promise.all([
    readJson('./data/teams.json'),
    readJson('./data/matches.json'),
    readJson('./data/model-config.json'),
    readJson('./data/backtests.json')
  ]);
  state.teams = teams;
  state.originalTeams = structuredClone(teams);
  state.matches = matches;
  state.modelConfig = modelConfig;
  state.backtests = backtests;
  state.groups = groupsFromTeams(teams);
  state.accuracy = buildAccuracyReport({ config: modelConfig, backtests, teams });

  const params = new URLSearchParams(location.search);
  state.homeId = params.get('home') || state.homeId;
  state.awayId = params.get('away') || state.awayId;

  for (const side of ['home', 'away']) {
    const team = teamById(side === 'home' ? state.homeId : state.awayId);
    $(`#${side}Search`).value = `${flag(team)} ${team.name} (${team.code})`;
    renderTeamOptions(side);
  }
  $('#adminTeam').innerHTML = state.teams.map((team) => `<option value="${team.id}">${flag(team)} ${team.name} (${team.code})</option>`).join('');
  $('#adminTeam').value = state.homeId;

  renderAccuracy();
  renderGroups();
  hydrateParameterControls();
  setupEvents();
  setupCanvasBackground();
  setupInitialAnimation();
  runPrediction();
}

init().catch((error) => {
  console.error(error);
  $('#heroModelStatus').textContent = '加载失败';
});
