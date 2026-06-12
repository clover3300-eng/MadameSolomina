// ===== VANGUARD INVESTOR PROFILE TEST (v2) =====

const VG_Q = [
  { t: "Через какое время вы начнёте выводить деньги из портфеля?", o: [["Менее года", 0], ["1–2 года", 1], ["3–5 лет", 4], ["6–10 лет", 7], ["11–15 лет", 12], ["Более 15 лет", 17]] },
  { t: "Когда начнёте вывод, как долго планируете тратить средства?", o: [["2 года и менее", 0], ["3–5 лет", 1], ["6–10 лет", 3], ["11–15 лет", 5], ["Более 15 лет", 8]] },
  { t: "Как вы определяете для себя «долгосрочные инвестиции»?", o: [["1–2 года", 0], ["3–4 года", 1], ["5–6 лет", 3], ["7–8 лет", 5], ["Более 8 лет", 7]] },
  { t: "Ваш портфель упал на 31% за три месяца. Ваши действия?", o: [["Продам все остатки", 1], ["Продам часть активов", 3], ["Ничего не буду делать", 5], ["Докуплю подешевевшие", 6]] },
  { t: "Я предпочитаю стабильность и согласен на меньшую доходность ради спокойствия.", o: [["Категорически не согласен", 6], ["Не согласен", 5], ["Частично согласен", 3], ["Согласен", 1], ["Полностью согласен", 0]] },
  { t: "При падении рынка я перехожу в защитные активы (золото, депозиты).", o: [["Категорически не согласен", 5], ["Не согласен", 4], ["Частично согласен", 3], ["Согласен", 2], ["Полностью согласен", 1]] },
  { t: "Если друг посоветует «верную» инвестицию, вложусь после короткого разговора.", o: [["Категорически не согласен", 5], ["Не согласен", 4], ["Частично согласен", 3], ["Согласен", 2], ["Полностью согласен", 1]] },
  { t: "Надёжные облигации упали на 4% за два месяца. Что вы сделаете?", o: [["Продам всё", 1], ["Продам часть", 3], ["Оставлю как есть", 5], ["Докуплю", 6]] },
  { t: "У вас есть $10 000. Какой из трёх портфелей выберете?", o: [["Портфель А — низкий риск / низкий доход", 1], ["Портфель B — средний риск / средний доход", 3], ["Портфель C — высокий риск / высокий доход", 5]] },
  { t: "Насколько стабильны ваши доходы (зарплата, бизнес, пенсия)?", o: [["Очень нестабильны", 1], ["Нестабильны", 2], ["Есть колебания", 3], ["Стабильны", 4], ["Очень стабильны", 5]] },
  { t: "Как вы оцениваете свои знания в области инвестиций?", o: [["Новичок", 1], ["Начинающий", 2], ["Есть опыт", 3], ["Опытный", 4], ["Эксперт", 5]] }
];

const VG_PROFILES = [
  { name: "Агрессивный",     sub: "Максимальный риск",    desc: "Максимальный риск ради максимальной прибыли. Волатильность вас не пугает.",          stocks: 80, bonds: 20, color: "#a855f7", horizon: "5+ лет",   drawdown: "до 50%", rebalance: "По ситуации",      grad: "linear-gradient(135deg,#a855f7,#6366f1)", min: 61, max: 999 },
  { name: "Агресс. рост",    sub: "Высокая доходность",   desc: "Высокая доходность для вас важнее стабильности портфеля.",                            stocks: 70, bonds: 30, color: "#f43f5e", horizon: "5–10 лет", drawdown: "до 40%", rebalance: "1–2 раза в год",   grad: "linear-gradient(135deg,#f43f5e,#e11d48)", min: 55, max: 60 },
  { name: "Рост",            sub: "Приумножение капитала", desc: "Фокус на приумножении капитала. Вы готовы к просадкам рынка.",                       stocks: 60, bonds: 40, color: "#f97316", horizon: "5–10 лет", drawdown: "до 35%", rebalance: "1–2 раза в год",   grad: "linear-gradient(135deg,#f97316,#dc2626)", min: 49, max: 54 },
  { name: "Сбалансированный",sub: "Рост через колебания",  desc: "Вы спокойно переносите колебания рынка ради долгосрочного роста.",                   stocks: 50, bonds: 50, color: "#f59e0b", horizon: "5–10 лет", drawdown: "до 25%", rebalance: "1 раз в год",      grad: "linear-gradient(135deg,#f59e0b,#f97316)", min: 42, max: 48 },
  { name: "Умеренный",       sub: "Золотая середина",     desc: "Классическая «Золотая середина». Разумный баланс риска и возможностей.",               stocks: 40, bonds: 60, color: "#10b981", horizon: "3–7 лет",  drawdown: "до 20%", rebalance: "1 раз в год",      grad: "linear-gradient(135deg,#10b981,#059669)", min: 36, max: 41 },
  { name: "Консерв. рост",   sub: "Осторожный баланс",    desc: "Осторожный подход. Безопасность важнее прибыли.",                                       stocks: 30, bonds: 70, color: "#06b6d4", horizon: "3–5 лет",  drawdown: "до 15%", rebalance: "1 раз в год",      grad: "linear-gradient(135deg,#06b6d4,#0891b2)", min: 29, max: 35 },
  { name: "Консервативный",  sub: "Защита от инфляции",   desc: "Главное — сохранить капитал. Допускается минимальный риск ради защиты от инфляции.",  stocks: 20, bonds: 80, color: "#6366f1", horizon: "1–3 года", drawdown: "до 10%", rebalance: "По необходимости", grad: "linear-gradient(135deg,#6366f1,#4f46e5)", min: 23, max: 28 },
  { name: "Доходный",        sub: "Максимальная защита",  desc: "Ваш приоритет — абсолютная защита капитала. Риск для вас неприемлем.",                 stocks:  0, bonds:100, color: "#38bdf8", horizon: "1–2 года", drawdown: "до 5%",  rebalance: "По необходимости", grad: "linear-gradient(135deg,#38bdf8,#3b82f6)", min:  0, max: 22 }
];

const VG_STRAT_MAP = {
  "Агрессивный":      { bonds: 20,  t: "Индивидуальная" },
  "Агресс. рост":     { bonds: 30,  t: "Агрессивная"    },
  "Рост":             { bonds: 40,  t: "Умеренная"      },
  "Сбалансированный": { bonds: 50,  t: "Гармония"       },
  "Умеренный":        { bonds: 60,  t: "Баланс"         },
  "Консерв. рост":    { bonds: 70,  t: "Депозит"        },
  "Консервативный":   { bonds: 80,  t: "Индивидуальная" },
  "Доходный":         { bonds: 100, t: "Индивидуальная" }
};

let _vgCur = 0, _vgScore = 0, _vgAnswers = [];

function showView(id) {
    const current = document.querySelector('#screen-vanguard .view.active');
    const next = document.getElementById(id);
    const bw = document.getElementById('bottom-welcome');
    const bq = document.getElementById('bottom-quiz');
    if (bw) bw.style.display = id === 'v-welcome' ? 'block' : 'none';
    if (bq) bq.style.display = id === 'v-quiz' ? 'block' : 'none';
    if (current && current !== next) {
        current.classList.add('leaving');
        setTimeout(() => {
            current.classList.remove('active', 'leaving');
            next.classList.add('active', 'entering');
            setTimeout(() => next.classList.remove('entering'), 300);
        }, 180);
    } else {
        document.querySelectorAll('#screen-vanguard .view').forEach(v => v.classList.remove('active', 'entering', 'leaving'));
        next.classList.add('active', 'entering');
        setTimeout(() => next.classList.remove('entering'), 300);
    }
    const sc = document.querySelector('#screen-vanguard .scroll');
    if (sc) sc.scrollTop = 0;
}

function openVanguardTest() {
    _vgCur = 0; _vgScore = 0; _vgAnswers = [];
    document.querySelectorAll('#screen-vanguard .view').forEach(v => v.classList.remove('active', 'entering', 'leaving'));
    document.getElementById('v-welcome').classList.add('active');
    const bw = document.getElementById('bottom-welcome');
    const bq = document.getElementById('bottom-quiz');
    if (bw) bw.style.display = 'block';
    if (bq) bq.style.display = 'none';
    showScreen('screen-vanguard');
}

function vgGoBack() {
    vgCloseOverlay();
    if (typeof switchTab === 'function') switchTab('calc');
}

function vgCancel() {
    _vgCur = 0; _vgScore = 0; _vgAnswers = [];
    showView('v-welcome');
}

function vgStart() {
    _vgCur = 0; _vgScore = 0; _vgAnswers = [];
    showView('v-quiz');
    vgRenderQ();
}

function vgGoBackQ() {
    if (_vgCur === 0) { vgCancel(); return; }
    _vgScore -= _vgAnswers[_vgCur - 1];
    _vgAnswers.splice(_vgCur - 1, 1);
    _vgCur--;
    vgRenderQ();
}

function vgRenderQ() {
    const q = VG_Q[_vgCur];
    const pct = Math.round((_vgCur / VG_Q.length) * 100);
    const fill = document.getElementById('q-fill');
    const counter = document.getElementById('q-counter');
    if (fill) fill.style.width = (pct + 9) + '%';
    if (counter) counter.textContent = (_vgCur + 1) + ' из ' + VG_Q.length;

    const body = document.getElementById('q-body');
    if (!body) return;
    const optsHtml = q.o.map((o, i) => `
      <button class="opt" onclick="vgPick(${o[1]},${i})">
        <span class="opt-text">${o[0]}</span>
        <div class="opt-check">
          <div class="opt-check-inner">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
        </div>
      </button>`).join('');
    body.innerHTML = `
      <div class="q-num">Вопрос ${_vgCur + 1}</div>
      <p class="q-text">${q.t}</p>
      <div class="opts-wrap">
        <div class="opts animating">${optsHtml}</div>
      </div>`;
    const sc = document.querySelector('#screen-vanguard .scroll');
    if (sc) sc.scrollTop = 0;
    setTimeout(() => {
        const o = body.querySelector('.opts');
        if (o) o.classList.remove('animating');
    }, 250);
}

function vgPick(s, idx) {
    document.querySelectorAll('#screen-vanguard .opt').forEach((b, j) => {
        b.classList.toggle('selected', j === idx);
        b.disabled = true;
    });
    _vgAnswers[_vgCur] = s;
    _vgScore += s;
    if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
    }
    setTimeout(() => {
        if (_vgCur < VG_Q.length - 1) { _vgCur++; vgRenderQ(); }
        else { vgShowResult(); }
    }, 340);
}

function vgGetProfile() {
    return VG_PROFILES.find(p => _vgScore >= p.min && _vgScore <= p.max) || VG_PROFILES[VG_PROFILES.length - 1];
}

function vgDonut(stocks, size, sw) {
    const r = (size / 2) - sw, circ = r * 2 * Math.PI, off = circ - (stocks / 100) * circ;
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="transform:rotate(-90deg)">
      <circle r="${r}" cx="${size/2}" cy="${size/2}" fill="none" stroke="rgba(255,255,255,.2)" stroke-width="${sw}"/>
      <circle r="${r}" cx="${size/2}" cy="${size/2}" fill="none" stroke="white" stroke-width="${sw}"
        stroke-dasharray="${circ.toFixed(1)} ${circ.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" stroke-linecap="round"/>
    </svg>`;
}

function vgBuildPCard(p, isYours) {
    const c = p.color;
    return `<div class="p-card${isYours ? ' active-profile' : ''}" style="${isYours ? `border-color:${c}44;background:${c}09` : ''}">
      <div class="p-card-top">
        <div class="p-card-name${isYours ? ' active-name' : ''}" style="${isYours ? `color:${c}` : ''}">${p.name}</div>
        ${isYours ? `<span class="p-card-yours" style="background:${c}20;color:${c}">ВАШ</span>` : ''}
      </div>
      <div class="p-card-range">${p.min === 0 ? '0' : p.min}–${p.max > 100 ? '61+' : p.max} б.</div>
      <div class="p-card-bar">
        <div class="p-card-bar-s" style="width:${p.stocks || 1}%;background:${c};border-radius:3px 0 0 3px"></div>
        <div class="p-card-bar-b" style="border-radius:0 3px 3px 0"></div>
      </div>
      <div class="p-card-splits">
        <span style="color:${c}">${p.stocks}%<br><span style="color:var(--muted);font-weight:400">акции</span></span>
        <span style="color:#94A3B8;text-align:right">${p.bonds}%<br><span style="color:var(--muted);font-weight:400">облигации</span></span>
      </div>
    </div>`;
}

function vgShowResult() {
    const p = vgGetProfile();
    const strat = VG_STRAT_MAP[p.name] || { bonds: 50, t: "Гармония" };
    const profileCards = VG_PROFILES.map(pr => vgBuildPCard(pr, pr.name === p.name)).join('');

    document.getElementById('r-wrap').innerHTML = `
      <div class="res-topbar">
        <h1 class="res-title">Результат</h1>
        <button class="res-restart-btn" onclick="vgStart()">
          <svg viewBox="0 0 24 24"><path d="M21.5 2v6h-6"/><path d="M21.34 15.57a10 10 0 1 1-.57-8.38"/></svg>
        </button>
      </div>

      <div class="profile-block" id="profile-block">
        <div class="profile-card" style="background:${p.grad}">
          <div class="pc-top">
            <div class="pc-label-row">
              <div class="pc-icon">
                <svg viewBox="0 0 24 24"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg>
              </div>
              <span class="pc-type">Инвестпрофиль</span>
            </div>
            <span class="pc-score-pill">${_vgScore} баллов</span>
          </div>
          <div class="pc-bottom">
            <div class="pc-text"><div class="pc-name${p.name.length > 15 ? ' pc-name-xlong' : (p.name.length > 12 ? ' pc-name-long' : '')}">${p.name}</div><div class="pc-sub">${p.sub}</div></div>
            <div class="donut-wrap">
              ${vgDonut(p.stocks, 90, 8)}
              <div class="donut-text">
                <span class="donut-pct">${p.stocks}%</span>
                <span class="donut-lbl">Акции</span>
              </div>
            </div>
          </div>
        </div>
        <div class="res-desc-box" style="--desc-grad-color:${p.color}18">
          <div class="res-desc-text">${p.desc}</div>
          <div class="res-desc-alloc">
            <div class="res-desc-alloc-bar">
              <div class="res-desc-alloc-s" style="width:${p.stocks || 1}%;background:${p.color}"></div>
              <div class="res-desc-alloc-b"></div>
            </div>
            <div class="res-desc-alloc-labels">
              <div class="res-desc-alloc-item">
                <div class="res-desc-alloc-dot" style="background:${p.color}"></div>
                <span style="color:${p.color}">${p.stocks}%</span>&nbsp;<span style="color:var(--muted);font-weight:400;font-size:10px">акции</span>
              </div>
              <div class="res-desc-alloc-item">
                <div class="res-desc-alloc-dot" style="background:#CBD5E1"></div>
                <span>${p.bonds}%</span>&nbsp;<span style="color:var(--muted);font-weight:400;font-size:10px">облигации</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="res-params">
        <div class="res-param">
          <div class="res-param-icon"><svg viewBox="0 0 24 24" stroke="${p.color}"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>
          <div class="res-param-body">
            <div class="res-param-label">Горизонт</div>
            <div class="res-param-val">${p.horizon}</div>
          </div>
        </div>
        <div class="res-param">
          <div class="res-param-icon"><svg viewBox="0 0 24 24" stroke="${p.color}"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div>
          <div class="res-param-body">
            <div class="res-param-label">Просадка</div>
            <div class="res-param-val">${p.drawdown}</div>
          </div>
        </div>
        <div class="res-param">
          <div class="res-param-icon"><svg viewBox="0 0 24 24" stroke="${p.color}"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></div>
          <div class="res-param-body">
            <div class="res-param-label">Стратегия</div>
            <div class="res-param-val">${strat.t}</div>
          </div>
        </div>
        <div class="res-param">
          <div class="res-param-icon"><svg viewBox="0 0 24 24" stroke="${p.color}"><path d="M21.5 2v6h-6"/><path d="M2.5 12a10 10 0 0 1 17.5-6.5L21.5 8"/><path d="M2.5 22v-6h6"/><path d="M21.5 12a10 10 0 0 1-17.5 6.5L2.5 16"/></svg></div>
          <div class="res-param-body">
            <div class="res-param-label">Ребалансировка</div>
            <div class="res-param-val">${p.rebalance}</div>
          </div>
        </div>
      </div>

      <div class="res-actions">
        <button class="btn-apply" onclick="vgApplyStrategy()">
          <div class="btn-apply-label">
            <span class="btn-apply-title">Применить стратегию</span>
            <span class="btn-apply-sub">${strat.t} · ${100 - strat.bonds}/${strat.bonds} акции/облигации</span>
          </div>
          <div class="btn-apply-arrow">
            <svg viewBox="0 0 24 24"><path d="M5 12h14"/><path d="M12 5l7 7-7 7"/></svg>
          </div>
        </button>
        <button class="btn-retest" onclick="vgStart()">Пройти заново</button>
      </div>

      <div class="res-profiles-section" id="res-profiles-section">
        <div class="res-profiles-card">
          <div class="res-profiles-hdr" onclick="vgToggleProfiles()" role="button" aria-expanded="false">
            <div class="res-profiles-hdr-left">
              <div class="res-profiles-icon">
                <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>
              </div>
              <div class="res-profiles-title-wrap">
                <span class="res-profiles-title">Все профили</span>
                <span class="res-profiles-hint">от консервативного до агрессивного</span>
              </div>
            </div>
            <div class="res-profiles-hdr-right">
              <span class="res-profiles-count">${VG_PROFILES.length}</span>
              <div class="res-profiles-chevron">
                <svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
              </div>
            </div>
          </div>
          <div class="res-profiles-content">
            <div class="profiles-scroll" id="profiles-scroll">${profileCards}</div>
            <div class="profiles-nav">
              <span class="profiles-nav-hint">← листайте чтобы сравнить</span>
              <div class="profiles-nav-arrows">
                <button class="pnav-btn" onclick="vgScrollProfiles(-1)"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button>
                <button class="pnav-btn" onclick="vgScrollProfiles(1)"><svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg></button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    showView('v-result');
    if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
    }
}

function vgToggleProfiles() {
    const section = document.getElementById('res-profiles-section');
    if (!section) return;
    const willExpand = !section.classList.contains('expanded');
    section.classList.toggle('expanded');
    const hdr = section.querySelector('.res-profiles-hdr');
    if (hdr) hdr.setAttribute('aria-expanded', String(willExpand));
    if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
    }
    if (willExpand) {
        setTimeout(() => {
            const sc = document.getElementById('profiles-scroll');
            const active = sc && sc.querySelector('.active-profile');
            if (active) {
                const left = active.offsetLeft - sc.offsetWidth / 2 + active.offsetWidth / 2;
                sc.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
            }
        }, 280);
    }
}

function vgScrollProfiles(dir) {
    const sc = document.getElementById('profiles-scroll');
    if (sc) sc.scrollBy({ left: dir * 190, behavior: 'smooth' });
}

function vgApplyStrategy() {
    const p = vgGetProfile();
    const s = VG_STRAT_MAP[p.name] || { bonds: 50, t: "Гармония" };

    // All strategy selection happens on hidden DOM (user is still on vanguard screen)
    const block   = document.getElementById('ndStratBlock');
    const cardVal = document.getElementById('ndStratCardVal');

    if (block) block.style.display = 'block';
    // Открываем родительскую карточку стратегии
    const stratCardOuter = document.getElementById('ndStratCard');
    if (stratCardOuter) stratCardOuter.classList.add('open');
    const stratChev = document.getElementById('ndStratChev');
    if (stratChev) stratChev.style.transform = 'rotate(180deg)';

    if (s.t === 'Индивидуальная') {
        // Custom split: drive the custom slider and save silently
        const customSlider = document.getElementById('customRatioSlider');
        if (customSlider) customSlider.value = s.bonds;
        if (typeof updateCustomSliderDisplay === 'function') updateCustomSliderDisplay(s.bonds);
        if (typeof ndSaveCustom === 'function') ndSaveCustom();
    } else {
        // Standard strategy: build waterfall (with target card present), click it
        const prevTitle = cardVal ? cardVal.textContent : '';
        if (cardVal) cardVal.textContent = '';
        if (typeof ndBuildWF === 'function') ndBuildWF();
        if (cardVal) cardVal.textContent = prevTitle;

        const inner = document.getElementById('ndWfInner');
        if (inner) {
            const target = Array.from(inner.querySelectorAll('.nd-wfc')).find(c => {
                const name = c.querySelector('.nd-wfn');
                return name && name.textContent.trim() === s.t;
            });
            if (target) target.click();
        }
    }

    // Keep block visible so user sees the chosen strategy when screen-app opens
    if (block) block.style.display = 'block';

    if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
    }
    // Закрываем оверлей теста и возвращаемся на «Расчёт»
    vgCloseOverlay();
    if (typeof switchTab === 'function') switchTab('calc');
}

function vgCloseOverlay() {
    document.body.classList.remove('quiz-mode');
    const vg = document.getElementById('screen-vanguard');
    if (vg) vg.classList.remove('active');
}
