const state = {
  teams: [],
  groups: [],
  matches: [],
  compliance: null,
  accuracy: null
};

const $ = (selector) => document.querySelector(selector);
const percent = (value) => `${Math.round(value * 100)}%`;

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || 'Request failed');
  return json;
}

function teamName(id) {
  return state.teams.find((team) => team.id === id)?.name || id;
}

function fillTeamSelect(select, selectedId) {
  select.innerHTML = state.teams
    .map((team) => `<option value="${team.id}" ${team.id === selectedId ? 'selected' : ''}>${team.name} (${team.code})</option>`)
    .join('');
}

function renderGroups() {
  $('#teamCount').textContent = `${state.teams.length} teams`;
  $('#groupGrid').innerHTML = state.groups
    .map((group) => `
      <article class="group-card">
        <h3>Group ${group.id}</h3>
        ${group.teams
          .map((team) => `
            <div class="team-row">
              <span class="code">${team.code}</span>
              <span>${team.name}</span>
              <span class="rank">#${team.rank}</span>
            </div>
          `)
          .join('')}
      </article>
    `)
    .join('');
}

function renderPrediction(prediction) {
  $('#matchup').textContent = `${prediction.teams.home} vs ${prediction.teams.away}`;
  $('#confidence').textContent = `置信度 ${prediction.confidence}`;
  $('#homeWin').textContent = percent(prediction.outcome.homeWin);
  $('#draw').textContent = percent(prediction.outcome.draw);
  $('#awayWin').textContent = percent(prediction.outcome.awayWin);
  $('#homeWinBar').style.width = percent(prediction.outcome.homeWin);
  $('#drawBar').style.width = percent(prediction.outcome.draw);
  $('#awayWinBar').style.width = percent(prediction.outcome.awayWin);
  $('#expectedGoals').textContent = `xG ${prediction.expected.home} : ${prediction.expected.away}`;
  $('#goalMarkets').textContent = `大 2.5 球 ${percent(prediction.markets.over25)} · 双方进球 ${percent(prediction.markets.bothTeamsToScore)}`;
  $('#scorelines').innerHTML = prediction.topScorelines
    .map((line) => `
      <div class="scoreline">
        <strong>${line.score}</strong>
        <span>${percent(line.probability)}</span>
      </div>
    `)
    .join('');
  $('#explain').innerHTML = prediction.explain.map((item) => `<li>${item}</li>`).join('');
  $('#factorAudit').innerHTML = `
    <h3>输入因子审计</h3>
    ${prediction.inputAudit.factors
      .map((factor) => `
        <div class="factor-row">
          <span>${factor.label}</span>
          <strong>${factor.home > 0 ? '+' : ''}${factor.home} / ${factor.away > 0 ? '+' : ''}${factor.away}</strong>
        </div>
      `)
      .join('')}
    <p>${prediction.inputAudit.sourceNotes.join(' ')}</p>
  `;
}

function renderAccuracy(accuracy) {
  $('#modelVersion').textContent = accuracy.modelVersion;
  $('#rankingFreshness').textContent = accuracy.sourceStatus.ranking.lastOfficialUpdate;
  $('#rankingNext').textContent = `下一次官方更新：${accuracy.sourceStatus.ranking.nextOfficialUpdate}`;
  $('#brierScore').textContent = accuracy.calibration.brierScore;
  $('#backtestSamples').textContent = `${accuracy.calibration.samples} 个历史校准样本`;
  $('#topPickAccuracy').textContent = percent(accuracy.calibration.topPickAccuracy);
  $('#dataCompleteness').textContent = `${accuracy.dataCompleteness.teamsWithRankingPoints}/${accuracy.dataCompleteness.teams}`;
  $('#recommendations').innerHTML = accuracy.recommendations.map((item) => `<p>${item}</p>`).join('');
  $('#freshnessNotes').innerHTML = accuracy.predictionFreshness.notes.map((item) => `<p>${item}</p>`).join('');
  $('#weightRating').value = accuracy.weights.rating;
  $('#weightAttackDefense').value = accuracy.weights.attackDefense;
  $('#weightCondition').value = accuracy.weights.condition;
  $('#weightHomeAdvantage').value = accuracy.weights.homeAdvantage;
}

function setupRevealMotion() {
  const items = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) {
    items.forEach((item) => item.classList.add('is-visible'));
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 }
  );
  items.forEach((item) => observer.observe(item));
}

function setupProbabilityCanvas() {
  const canvas = $('#probabilityCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const points = Array.from({ length: 54 }, (_, index) => ({
    x: Math.random(),
    y: Math.random(),
    speed: 0.00045 + (index % 7) * 0.00008,
    phase: Math.random() * Math.PI * 2
  }));

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.floor(rect.width * ratio));
    canvas.height = Math.max(1, Math.floor(rect.height * ratio));
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function draw(time) {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    ctx.clearRect(0, 0, width, height);
    ctx.lineWidth = 1;

    for (const point of points) {
      point.x += point.speed;
      if (point.x > 1.08) point.x = -0.08;
      const x = point.x * width;
      const y = (point.y + Math.sin(time * 0.001 + point.phase) * 0.018) * height;
      ctx.fillStyle = 'rgba(100, 216, 255, 0.58)';
      ctx.beginPath();
      ctx.arc(x, y, 1.35, 0, Math.PI * 2);
      ctx.fill();
    }

    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 9) {
        const ax = points[i].x * width;
        const ay = points[i].y * height;
        const bx = points[j].x * width;
        const by = points[j].y * height;
        const distance = Math.hypot(ax - bx, ay - by);
        if (distance < 135) {
          ctx.strokeStyle = `rgba(44, 227, 154, ${0.16 * (1 - distance / 135)})`;
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.stroke();
        }
      }
    }

    requestAnimationFrame(draw);
  }

  resize();
  window.addEventListener('resize', resize);
  requestAnimationFrame(draw);
}

async function predict(homeTeamId = $('#homeTeam').value, awayTeamId = $('#awayTeam').value) {
  const prediction = await api('/api/predict', {
    method: 'POST',
    body: JSON.stringify({
      homeTeamId,
      awayTeamId,
      neutral: $('#neutral').checked
    })
  });
  renderPrediction(prediction);
}

function loadAdminFields() {
  const team = state.teams.find((item) => item.id === $('#adminTeam').value);
  if (!team) return;
  $('#attack').value = team.attack;
  $('#defense').value = team.defense;
  $('#form').value = team.form;
  $('#injuries').value = team.injuries;
  $('#restDays').value = team.restDays;
  $('#travelKm').value = team.travelKm;
}

async function updateTeam(event) {
  event.preventDefault();
  const id = $('#adminTeam').value;
  const updated = await api(`/api/teams/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      attack: Number($('#attack').value),
      defense: Number($('#defense').value),
      form: Number($('#form').value),
      injuries: Number($('#injuries').value),
      restDays: Number($('#restDays').value),
      travelKm: Number($('#travelKm').value)
    })
  });
  const index = state.teams.findIndex((team) => team.id === id);
  state.teams[index] = updated.team;
  state.groups = state.groups.map((group) => ({
    ...group,
    teams: group.teams.map((team) => (team.id === id ? updated.team : team))
  }));
  renderGroups();
  $('#adminStatus').textContent = `${updated.team.name} 参数已更新。`;
  await predict();
}

async function updateWeights(event) {
  event.preventDefault();
  const updated = await api('/api/model-config', {
    method: 'PATCH',
    body: JSON.stringify({
      weights: {
        rating: Number($('#weightRating').value),
        attackDefense: Number($('#weightAttackDefense').value),
        condition: Number($('#weightCondition').value),
        homeAdvantage: Number($('#weightHomeAdvantage').value)
      }
    })
  });
  state.accuracy.weights = updated.modelConfig.weights;
  renderAccuracy(state.accuracy);
  $('#weightsStatus').textContent = '模型权重已更新，当前预测已刷新。';
  await predict();
}

function bindEvents() {
  $('#predictForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    await predict();
  });
  $('#useFeatured').addEventListener('click', async () => {
    $('#homeTeam').value = 'mexico';
    $('#awayTeam').value = 'south-africa';
    $('#neutral').checked = false;
    await predict('mexico', 'south-africa');
  });
  $('#adminTeam').addEventListener('change', loadAdminFields);
  $('#adminForm').addEventListener('submit', updateTeam);
  $('#weightsForm').addEventListener('submit', updateWeights);
}

async function init() {
  const boot = await api('/api/bootstrap');
  Object.assign(state, boot);
  fillTeamSelect($('#homeTeam'), 'france');
  fillTeamSelect($('#awayTeam'), 'canada');
  fillTeamSelect($('#adminTeam'), 'canada');
  $('#heroModelStatus').textContent = `${boot.groups.length} groups · ${boot.matches.length} official fixtures`;
  $('#heroFreshness').textContent = `数据检查：${boot.accuracy.predictionFreshness.checkedAt} · 下一次 FIFA 排名：${boot.accuracy.sourceStatus.ranking.nextOfficialUpdate}`;
  $('#disclaimer').textContent = boot.compliance.disclaimer;
  $('#banned').textContent = boot.compliance.banned;
  renderGroups();
  renderAccuracy(boot.accuracy);
  loadAdminFields();
  bindEvents();
  setupRevealMotion();
  setupProbabilityCanvas();
  await predict('france', 'canada');
}

init().catch((error) => {
  $('#heroModelStatus').textContent = '加载失败';
  $('#adminStatus').textContent = error.message;
});
