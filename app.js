/* 尋道 — a series of bite-size theology courses. Plain JS, no build step. */
(function () {
  'use strict';

  // ---------- storage ----------
  var KEY = 'xundao.v1';
  var DEFAULTS = { script: 'hant', fs: 17, done: {}, cards: {}, enrolled: null, notify: {} };
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY) || 'null');
      return Object.assign({}, DEFAULTS, s || {});
    } catch (e) { return Object.assign({}, DEFAULTS); }
  }
  var S = load();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* private mode: keep in memory */ } }

  // ---------- data ----------
  // D.catalogue: every course (published + planned), display order
  // D.courses[id]: outline of a published course; D.lessonCourse[lessonId] = courseId
  var D = { ui: null, catalogue: [], courses: {}, lessonCourse: {}, glossary: null, gById: {}, lessons: {} };
  function getJSON(url) {
    return fetch(url).then(function (r) { if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); });
  }
  function loadScript(script) {
    var base = 'data/' + script + '/';
    D.lessons = {}; D.courses = {}; D.lessonCourse = {};
    return Promise.all([getJSON(base + 'ui.json'), getJSON(base + 'catalogue.json'), getJSON(base + 'glossary.json')])
      .then(function (r) {
        D.ui = r[0]; D.catalogue = r[1]; D.glossary = r[2]; D.gById = {};
        D.glossary.forEach(function (g) { D.gById[g.id] = g; });
        document.documentElement.lang = script === 'hans' ? 'zh-Hans' : 'zh-Hant';
        document.title = D.ui.appName;
        var pub = D.catalogue.filter(function (c) { return c.status === 'published'; });
        return Promise.all(pub.map(function (c) { return getJSON(base + 'courses/' + c.id + '/course.json'); }));
      })
      .then(function (list) {
        list.forEach(function (course) {
          D.courses[course.id] = course;
          course.units.forEach(function (u) { u.lessons.forEach(function (l) { D.lessonCourse[l.id] = course.id; }); });
        });
        initEnrolled();
      });
  }
  function initEnrolled() {
    if (Array.isArray(S.enrolled)) {
      S.enrolled = S.enrolled.filter(function (id) { return D.courses[id]; });
      return;
    }
    // first run (or data from the single-course version): enrol courses already started, else the first course
    var started = Object.keys(D.courses).filter(function (cid) {
      return Object.keys(S.done).some(function (lid) { return D.lessonCourse[lid] === cid; });
    });
    var first = D.catalogue.filter(function (c) { return c.status === 'published'; })[0];
    S.enrolled = started.length ? started : (first ? [first.id] : []);
    save();
  }
  function getLesson(id) {
    if (D.lessons[id]) return Promise.resolve(D.lessons[id]);
    var cid = D.lessonCourse[id];
    if (!cid) return Promise.reject(new Error('unknown lesson ' + id));
    return getJSON('data/' + S.script + '/courses/' + cid + '/lessons/' + id + '.json').then(function (L) { D.lessons[id] = L; return L; });
  }

  // ---------- helpers ----------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function t(key, vars) {
    var s = D.ui[key] || key;
    if (vars) Object.keys(vars).forEach(function (k) { s = s.split('{' + k + '}').join(vars[k]); });
    return s;
  }
  function today() { return ymd(new Date()); }
  function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function addDays(n) { var d = new Date(); d.setDate(d.getDate() + n); return ymd(d); }
  function meta(cid) { return D.catalogue.filter(function (c) { return c.id === cid; })[0]; }
  function allLessons(cid) {
    var out = [], ids = cid ? [cid] : Object.keys(D.courses);
    ids.forEach(function (id) {
      D.courses[id].units.forEach(function (u) { u.lessons.forEach(function (l) { out.push(Object.assign({ unit: u, course: id }, l)); }); });
    });
    return out;
  }
  function available(cid) { return allLessons(cid).filter(function (l) { return l.available; }); }
  function doneCount(cid) { return available(cid).filter(function (l) { return S.done[l.id]; }).length; }
  function nextLesson(cid) {
    var avail = available(cid);
    for (var i = 0; i < avail.length; i++) if (!S.done[avail[i].id]) return avail[i];
    return null;
  }
  function unitOf(id) {
    var cid = D.lessonCourse[id], u = null;
    if (!cid) return null;
    D.courses[cid].units.forEach(function (x) { x.lessons.forEach(function (l) { if (l.id === id) u = x; }); });
    return u;
  }
  function isEnrolled(cid) { return S.enrolled.indexOf(cid) >= 0; }
  function enrol(cid) { if (!isEnrolled(cid)) { S.enrolled.push(cid); save(); } }
  function dueCards() { var d = today(); return Object.keys(S.cards).filter(function (id) { return D.gById[id] && S.cards[id].due <= d; }); }
  function unitName(u) { return u.num === '導論' || u.num === '导论' ? u.num + '　' + u.title : (S.script === 'hans' ? '第' + u.num + '单元　' : '第' + u.num + '單元　') + u.title; }
  function seal(c, cls) { return '<span class="seal ' + (cls || '') + '" aria-hidden="true">' + esc(c.seal || '道') + '</span>'; }

  var ICON = {
    today: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    course: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/></svg>',
    review: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="6" width="14" height="14" rx="2"/><path d="M7 2h12a2 2 0 0 1 2 2v12"/></svg>',
    glossary: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
    gear: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    back: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
    x: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    chev: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
    bell: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>'
  };

  // ---------- shell ----------
  var view = document.getElementById('view');
  var tabs = document.getElementById('tabs');
  function renderTabs(active) {
    if (!active) { tabs.classList.add('hidden'); view.classList.add('no-tabs'); return; }
    tabs.classList.remove('hidden'); view.classList.remove('no-tabs');
    var due = dueCards().length;
    var items = [['today', '#/today', t('tabToday')], ['course', '#/course', t('tabCourse')], ['review', '#/review', t('tabReview')], ['glossary', '#/glossary', t('tabGlossary')]];
    tabs.innerHTML = '<div class="tabs-inner">' + items.map(function (it) {
      var cur = it[0] === active ? ' aria-current="page"' : '';
      var count = it[0] === 'review' && due ? '<span class="count">' + due + '</span>' : '';
      return '<a href="' + it[1] + '"' + cur + '>' + ICON[it[0]] + esc(it[2]) + count + '</a>';
    }).join('') + '</div>';
  }
  function setView(html, active) { view.innerHTML = html; renderTabs(active); window.scrollTo(0, 0); }
  function toast(msg) {
    var el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); el.textContent = msg;
    document.body.appendChild(el); setTimeout(function () { el.remove(); }, 2200);
  }
  function applyFont() { document.documentElement.style.setProperty('--fs', S.fs + 'px'); }

  // ---------- today ----------
  function screenToday() {
    var d = new Date();
    var due = dueCards().length;
    var html = '<div class="stack gap-20">' +
      '<header class="top"><div class="brand"><div class="seal" aria-hidden="true">道</div><span class="brand-name">' + esc(t('appName')) + '</span></div>' +
      '<a class="icon-btn" href="#/settings" aria-label="' + esc(t('settings')) + '">' + ICON.gear + '</a></header>' +
      '<div class="stack gap-4"><span class="small muted">' + esc(t('dateFmt', { m: d.getMonth() + 1, d: d.getDate(), w: D.ui.weekdays[d.getDay()] })) + '</span>' +
      '<h1 class="serif" style="font-weight:600;font-size:26px">' + esc(t('greeting')) + '</h1></div>';
    var active = D.catalogue.filter(function (c) { return D.courses[c.id] && isEnrolled(c.id); });
    if (!active.length) {
      html += '<section class="card stack gap-12"><h2 class="serif" style="font-size:20px">' + esc(t('noActive')) + '</h2><p class="lede">' + esc(t('noActiveSub')) + '</p>' +
        '<a class="btn" href="#/course">' + esc(t('browse')) + '</a></section>';
    }
    active.forEach(function (c) {
      var L = nextLesson(c.id);
      var head = '<a class="course-head" href="#/course/' + c.id + '">' + seal(c, 'sm') + '<span class="course-name">' + esc(c.title) + '</span><span class="muted">' + ICON.chev + '</span></a>';
      if (L) {
        var u = L.unit, doneN = u.lessons.filter(function (l) { return S.done[l.id]; }).length;
        html += '<section class="card stack gap-12" aria-label="' + esc(c.title) + '">' + head +
          '<span class="small muted">' + esc(unitName(u)) + ' · ' + esc(t('lessonN', { n: L.n })) + '</span>' +
          '<h2 class="lesson-title">' + esc(L.title) + '</h2>' +
          '<p class="lede" data-key="' + L.id + '"></p>' +
          '<div class="row gap-12 small muted"><span>' + esc(t('minutes', { m: L.minutes })) + '</span><span aria-hidden="true">·</span><span>' + esc(t('quizN', { n: 3 })) + '</span></div>' +
          '<a class="btn" href="#/lesson/' + L.id + '">' + esc(t('startReading')) + '</a>' +
          '<div class="stack gap-8" style="margin-top:4px"><div class="row between"><span class="small" style="font-weight:500">' + esc(unitName(u)) + '</span><span class="small muted">' + doneN + ' / ' + u.lessons.length + '</span></div>' +
          '<div class="dots" style="grid-template-columns:repeat(' + u.lessons.length + ',minmax(0,1fr))" role="img" aria-label="' + doneN + ' / ' + u.lessons.length + '">' +
          u.lessons.map(function (l) { return '<span class="' + (S.done[l.id] ? 'on' : (l.id === L.id ? 'cur' : '')) + '"></span>'; }).join('') + '</div></div></section>';
      } else {
        html += '<section class="card stack gap-8">' + head + '<h2 class="serif" style="font-size:18px">' + esc(t('courseDone')) + '</h2><p class="lede">' + esc(t('courseDoneSub')) + '</p></section>';
      }
    });
    html += courseStrip();
    html += '<a class="card card-link" href="#/review"><div class="stack gap-4"><span style="font-size:15px;font-weight:500">' + esc(t('reviewCards')) + '</span>' +
      '<span class="small muted">' + esc(due ? t('cardsDue', { n: due }) : t('noCardsDue')) + '</span></div><span class="muted">' + ICON.chev + '</span></a></div>';
    setView(html, 'today');
    view.querySelectorAll('[data-key]').forEach(function (el) {
      getLesson(el.dataset.key).then(function (x) { el.textContent = x.keypoint; }).catch(function () {});
    });
  }
  // every course, so a new user sees at once what is offered
  function courseStrip() {
    var rows = D.catalogue.map(function (c) {
      var pub = c.status === 'published';
      var status = !pub ? t('plannedCourses') : isEnrolled(c.id) ? t('enrolled') + ' · ' + t('progressOf', { d: doneCount(c.id), a: c.available || 0 }) : t('lessonsReady', { a: c.available || 0, t: c.est });
      return '<a class="mini-course' + (pub ? '' : ' planned') + '" href="#/course' + (pub ? '/' + c.id : '') + '">' + seal(c, pub ? 'sm' : 'sm muted') +
        '<span class="stack" style="flex:1;min-width:0"><span class="mc-title">' + esc(c.title) + '</span><span class="small muted">' + esc(status) + '</span></span>' +
        '<span class="muted">' + ICON.chev + '</span></a>';
    }).join('');
    return '<section class="stack gap-8"><div class="row between"><span style="font-size:15px;font-weight:500">' + esc(t('allCourses')) + '</span>' +
      '<a class="small" href="#/course" style="text-decoration:none">' + esc(t('seeAll')) + '</a></div><div class="card mini-list">' + rows + '</div></section>';
  }
  // ---------- catalogue ----------
  function courseCard(c) {
    var body = '<div class="stack gap-4" style="flex:1;min-width:0"><span class="course-name">' + esc(c.title) + '</span>' +
      '<span class="desc">' + esc(c.desc) + '</span>';
    if (c.status === 'published') {
      var a = c.available || 0, dn = doneCount(c.id);
      body += '<span class="small muted">' + esc(isEnrolled(c.id) && dn ? t('progressOf', { d: dn, a: a }) : t('lessonsReady', { a: a, t: c.est })) + '</span>';
      if (isEnrolled(c.id) && a) body += '<div class="meter" role="img" aria-label="' + dn + ' / ' + a + '"><div style="width:' + Math.round(dn / a * 100) + '%"></div></div>';
      body += '</div>';
      return '<a class="card course-card" href="#/course/' + c.id + '">' + seal(c) + body + '<span class="muted">' + ICON.chev + '</span></a>';
    }
    var on = !!S.notify[c.id];
    body += '<span class="small muted">' + esc(c.launch ? t('launchOn', { d: c.launch }) : t('launchTBD')) + '</span>' +
      '<button class="notify' + (on ? ' on' : '') + '" data-notify="' + c.id + '" aria-pressed="' + on + '">' + ICON.bell + esc(on ? t('notifyOn') : t('notifyMe')) + '</button></div>';
    return '<div class="card course-card planned">' + seal(c, 'muted') + body + '</div>';
  }
  function screenCatalogue() {
    var mine = D.catalogue.filter(function (c) { return c.status === 'published' && isEnrolled(c.id); });
    var other = D.catalogue.filter(function (c) { return c.status === 'published' && !isEnrolled(c.id); });
    var planned = D.catalogue.filter(function (c) { return c.status !== 'published'; });
    var html = '<div class="stack gap-16"><div class="stack gap-4"><h1 class="page-title">' + esc(t('tabCourse')) + '</h1>' +
      '<span class="small muted" style="font-size:14px">' + esc(t('catalogueSub')) + '</span></div>';
    [[mine, 'myCourses'], [other, 'otherCourses'], [planned, 'plannedCourses']].forEach(function (g) {
      if (!g[0].length) return;
      html += '<section class="stack gap-8"><span class="label">' + esc(t(g[1])) + '</span>' + g[0].map(courseCard).join('') + '</section>';
    });
    html += '</div>';
    setView(html, 'course');
    view.querySelectorAll('[data-notify]').forEach(function (b) {
      b.onclick = function () {
        var id = b.dataset.notify;
        if (S.notify[id]) delete S.notify[id]; else { S.notify[id] = today(); toast(t('notifyToast')); }
        save(); screenCatalogue();
      };
    });
  }

  // ---------- course map ----------
  var openUnit = {};
  function screenCourse(cid) {
    var course = D.courses[cid], c = meta(cid);
    if (!course) return screenCatalogue();
    var L = nextLesson(cid);
    var units = course.units;
    if (!openUnit[cid]) {
      var withLessons = units.filter(function (u) { return u.lessons.some(function (l) { return l.available; }); });
      openUnit[cid] = (L ? unitOf(L.id) : (withLessons[0] || units[0])).id;
    }
    var total = units.reduce(function (a, u) { return a + u.est; }, 0);
    var html = '<div class="bar"><div class="bar-inner" style="justify-content:flex-start"><a class="icon-btn" style="color:var(--ink)" href="#/course" aria-label="' + esc(t('back')) + '">' + ICON.back + '</a>' +
      '<span class="bar-title">' + esc(t('tabCourse')) + '</span></div></div>' +
      '<div class="stack gap-16" style="padding-top:20px"><div class="row" style="gap:14px;align-items:flex-start">' + seal(c, 'lg') +
      '<div class="stack gap-4"><h1 class="page-title">' + esc(course.title) + '</h1>' +
      '<span class="small muted" style="font-size:14px">' + esc(t('courseSub', { units: units.length, lessons: total })) + '</span></div></div>' +
      '<p class="lede">' + esc(c.desc) + '</p>';
    if (isEnrolled(cid)) {
      html += '<div class="row between"><span class="small" style="color:var(--ok);font-weight:500">✓ ' + esc(t('enrolled')) + '</span><button class="linkbtn small" id="pause" style="font-size:13px">' + esc(t('pause')) + '</button></div>';
    } else {
      html += '<button class="btn" id="enrol">' + esc(t('enrol')) + '</button>';
    }
    units.forEach(function (u) {
      if (u.id === openUnit[cid] && u.lessons.length) {
        var doneN = u.lessons.filter(function (l) { return S.done[l.id]; }).length;
        html += '<section class="card unit-open stack gap-4"><div class="row between" style="padding:0 8px 8px"><h2 class="serif" style="font-size:18px">' + esc(unitName(u)) + '</h2>' +
          '<span class="small muted">' + doneN + ' / ' + u.lessons.length + '</span></div>';
        u.lessons.forEach(function (l) {
          var done = !!S.done[l.id], cur = L && L.id === l.id;
          var badge = '<span class="badge' + (done ? ' done' : cur ? ' cur' : '') + '" aria-hidden="true">' + (done ? '✓' : l.n) + '</span>';
          if (l.available) {
            html += '<a class="lesson-row' + (cur ? ' cur' : '') + '" href="#/lesson/' + l.id + '">' + badge + '<span class="t">' + esc(l.title) + '</span></a>';
          } else {
            html += '<div class="lesson-row off" aria-disabled="true">' + badge + '<span class="t">' + esc(l.title) + '</span><span class="tag">' + esc(t('inPreparation')) + '</span></div>';
          }
        });
        html += '</section>';
      } else {
        var ready = u.lessons.some(function (l) { return l.available; });
        html += '<button class="unit-row" data-unit="' + u.id + '" aria-expanded="false"><span class="n">' + esc(unitName(u)) + '</span>' +
          '<span class="small muted">' + esc(u.lessons.length ? t('lessonsCount', { n: u.lessons.length }) + (ready ? '' : ' · ' + t('inPreparation')) : t('inPreparation')) + '</span></button>';
      }
    });
    html += '</div>';
    setView(html, 'course');
    var en = document.getElementById('enrol');
    if (en) en.onclick = function () { enrol(cid); screenCourse(cid); };
    var pa = document.getElementById('pause');
    if (pa) pa.onclick = function () { S.enrolled = S.enrolled.filter(function (x) { return x !== cid; }); save(); toast(t('paused')); screenCourse(cid); };
    view.querySelectorAll('[data-unit]').forEach(function (b) {
      b.addEventListener('click', function () {
        var u = units.filter(function (x) { return x.id === b.dataset.unit; })[0];
        if (u && u.lessons.length) { openUnit[cid] = u.id; screenCourse(cid); }
        else toast(t('inPreparation'));
      });
    });
  }

  // ---------- lesson ----------
  function lessonBar(L, extra) {
    var u = unitOf(L.id), c = meta(L.course);
    return '<div class="bar"><div class="bar-inner"><a class="icon-btn" style="color:var(--ink)" href="#/course/' + L.course + '" aria-label="' + esc(t('back')) + '">' + ICON.back + '</a>' +
      '<span class="bar-title">' + esc(c.title) + ' · ' + esc(unitName(u).split('　')[0]) + ' · ' + L.n + ' / ' + u.lessons.length + '</span>' + (extra || '<span style="width:44px"></span>') + '</div>' +
      '<div class="progress"><div id="readProg" style="width:0%"></div></div></div>';
  }
  function screenLesson(id) {
    getLesson(id).then(function (L) {
      var tools = '<div class="row" style="gap:2px"><button class="a-btn" id="smaller" aria-label="' + esc(t('smaller')) + '" style="font-size:14px">A−</button>' +
        '<button class="a-btn" id="larger" aria-label="' + esc(t('larger')) + '" style="font-size:18px">A+</button>' +
        '<button class="pill" id="script" aria-label="' + esc(t('switchScript')) + '">' + (S.script === 'hans' ? '简｜繁' : '繁｜简') + '</button></div>';
      var body = L.body.map(function (b) {
        if (b.t === 'h') return '<h2 class="h">' + esc(b.text) + '</h2>';
        if (b.t === 'p') return '<p>' + b.html + '</p>';
        var tag = b.t === 'ol' ? 'ol' : 'ul';
        return '<' + tag + '>' + b.items.map(function (i) { return '<li>' + i + '</li>'; }).join('') + '</' + tag + '>';
      }).join('');
      var teach = L.teaching.map(function (x) {
        return '<div class="stack gap-4">' + (x.src ? '<span class="src">' + esc(x.src) + '</span>' : '') + '<p>' + esc(x.text) + '</p></div>';
      }).join('');
      var chips = L.terms.map(function (name, i) { return '<a class="chip" href="#/glossary/' + L.termIds[i] + '">' + esc(name) + '</a>'; }).join('');
      var reflect = (L.reflect && L.reflect.length) ?
        '<section class="reflect stack gap-8"><div class="row between" style="font-family:var(--sans)"><span class="label">' + esc(t('selfCheck')) + '</span><span class="small muted">' + esc(t('selfCheckNote')) + '</span></div>' +
        '<ol>' + L.reflect.map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('') + '</ol></section>' : '';
      var html = lessonBar(L, tools) +
        '<article class="article stack gap-20">' +
        '<div class="stack gap-8"><span class="eyebrow" style="font-family:var(--sans)">' + esc(t('lessonN', { n: L.n })) + ' · ' + esc(t('minutes', { m: L.minutes })) + '</span>' +
        '<h1 style="font-weight:700;font-size:28px;line-height:1.35">' + esc(L.title) + '</h1>' +
        (L.scripture ? '<span class="small muted" style="font-family:var(--sans)">' + esc(L.scripture) + '</span>' : '') + '</div>' +
        '<aside class="keypoint stack gap-4"><span class="label" style="font-family:var(--sans)">' + esc(t('keyPoint')) + '</span><p style="font-size:var(--fs)">' + esc(L.keypoint) + '</p></aside>' +
        body +
        '<section class="teaching stack gap-12"><span class="eyebrow" style="font-family:var(--sans)">' + esc(t('teaching')) + '</span>' + teach + '</section>' +
        '<section class="stack gap-8"><span class="label" style="font-family:var(--sans)">' + esc(t('keyTerms')) + '</span><div class="chips">' + chips + '</div></section>' +
        '<section class="meditate stack gap-4"><span class="label" style="font-family:var(--sans)">' + esc(t('meditation')) + '</span><p style="font-size:var(--fs)">' + esc(L.meditation) + '</p></section>' +
        reflect +
        '<a class="btn" href="#/quiz/' + L.id + '" style="font-family:var(--sans)">' + esc(t('toQuiz')) + '</a></article>';
      setView(html, null);
      document.getElementById('smaller').onclick = function () { S.fs = Math.max(15, S.fs - 2); save(); applyFont(); };
      document.getElementById('larger').onclick = function () { S.fs = Math.min(25, S.fs + 2); save(); applyFont(); };
      document.getElementById('script').onclick = function () { switchScript(S.script === 'hans' ? 'hant' : 'hans'); };
      trackReading();
    }).catch(notFound);
  }
  function trackReading() {
    var bar = document.getElementById('readProg');
    function upd() {
      if (!document.body.contains(bar)) { window.removeEventListener('scroll', upd); return; }
      var h = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.width = (h > 0 ? Math.min(100, Math.round(window.scrollY / h * 100)) : 100) + '%';
    }
    window.addEventListener('scroll', upd, { passive: true }); upd();
  }

  // ---------- quiz ----------
  function shuffle(n, seed) {
    var a = []; for (var i = 0; i < n; i++) a.push(i);
    for (var j = n - 1; j > 0; j--) { seed = (seed * 9301 + 49297) % 233280; var k = Math.floor(seed / 233280 * (j + 1)); var tmp = a[j]; a[j] = a[k]; a[k] = tmp; }
    return a;
  }
  function screenQuiz(id) {
    getLesson(id).then(function (L) {
      var st = { qi: 0, picked: null, score: 0, done: false, seed: Date.now() % 233280 };
      function draw() {
        var Q = L.quiz, n = Q.length;
        var head = '<div class="bar"><div class="bar-inner"><a class="icon-btn" style="color:var(--ink)" href="#/lesson/' + L.id + '" aria-label="' + esc(t('close')) + '">' + ICON.x + '</a>' +
          '<span class="bar-title" style="font-size:14px">' + esc(t('quiz')) + (st.done ? '' : ' · ' + (st.qi + 1) + ' / ' + n) + '</span><span style="width:44px"></span></div>' +
          '<div class="qbars" style="grid-template-columns:repeat(' + n + ',minmax(0,1fr));padding:0 12px 10px">' +
          Q.map(function (_, i) { return '<span class="' + (st.done || i < st.qi || (i === st.qi && st.picked !== null) ? 'on' : '') + '"></span>'; }).join('') + '</div></div>';
        if (st.done) {
          setView(head + '<div class="stack gap-16" style="align-items:center;text-align:center;padding:40px 8px 0">' +
            '<div class="done-seal" aria-hidden="true">' + esc(meta(L.course).seal || '道') + '</div><h1 class="serif" style="font-size:24px">' + esc(t('lessonDone', { n: L.n })) + '</h1>' +
            '<p style="font-size:16px;color:var(--ink-2)">' + esc(t('score', { s: st.score, t: n })) + '</p>' +
            '<p class="quote" style="margin-top:8px">' + esc(t('closingQuote')) + '<br><span class="small muted" style="font-family:var(--sans)">' + esc(t('closingSrc')) + '</span></p>' +
            '<a class="btn" href="#/today" style="margin-top:24px">' + esc(t('backToday')) + '</a><button class="btn ghost" id="retry">' + esc(t('retry')) + '</button></div>', null);
          document.getElementById('retry').onclick = function () { st = { qi: 0, picked: null, score: 0, done: false, seed: (st.seed + 7) % 233280 }; draw(); };
          return;
        }
        var q = Q[st.qi], order = shuffle(q.options.length, st.seed + st.qi), answered = st.picked !== null;
        var opts = order.map(function (oi, pos) {
          var cls = answered && oi === q.answer ? ' right' : (answered && oi === st.picked ? ' wrong' : '');
          return '<button class="opt' + cls + '" data-oi="' + oi + '"' + (answered ? ' disabled' : '') + '><span class="letter" aria-hidden="true">' + 'ABCD'[pos] + '</span><span>' + esc(q.options[oi]) + '</span></button>';
        }).join('');
        var fb = '';
        if (answered) {
          var ok = st.picked === q.answer;
          fb = '<div class="feedback ' + (ok ? 'right' : 'wrong') + '" role="status"><strong>' + esc(ok ? t('correct') : t('incorrect')) + '</strong><p>' + esc(q.explain) + '</p></div>' +
            '<button class="btn" id="next" style="margin-top:8px">' + esc(st.qi < n - 1 ? t('next') : t('finish')) + '</button>';
        }
        setView(head + '<div class="stack gap-12" style="padding-top:24px"><h1 class="prompt" style="margin-bottom:8px">' + esc(q.prompt) + '</h1>' + opts + fb + '</div>', null);
        view.querySelectorAll('.opt').forEach(function (b) {
          b.onclick = function () { var oi = +b.dataset.oi; st.picked = oi; if (oi === q.answer) st.score++; draw(); };
        });
        var nx = document.getElementById('next');
        if (nx) { nx.focus(); nx.onclick = function () { if (st.qi < n - 1) { st.qi++; st.picked = null; } else { finishLesson(L, st.score); st.done = true; } draw(); }; }
      }
      draw();
    }).catch(notFound);
  }
  function finishLesson(L, score) {
    var first = !S.done[L.id];
    S.done[L.id] = { score: score, of: L.quiz.length, date: today() };
    enrol(L.course);
    if (first) L.termIds.forEach(function (gid) { if (!S.cards[gid]) S.cards[gid] = { due: today(), ivl: 0 }; });
    save();
  }

  // ---------- review ----------
  function screenReview() {
    var queue = dueCards();
    var st = { i: 0, back: false, total: queue.length };
    function draw() {
      if (st.i >= queue.length) {
        setView('<div class="stack gap-16"><h1 class="page-title">' + esc(t('review')) + '</h1><div class="empty stack gap-8"><h2 class="serif" style="font-size:20px">' + esc(t('reviewEmpty')) + '</h2><p class="lede">' + esc(t('reviewEmptySub')) + '</p></div></div>', 'review');
        return;
      }
      var g = D.gById[queue[st.i]], c = S.cards[g.id];
      var ivAgain = 1, ivHard = Math.max(3, Math.round((c.ivl || 1) * 1.2)), ivGood = Math.max(7, Math.round((c.ivl || 2) * 2.5));
      function lab(n) { return n === 1 ? t('tomorrow') : t('inDays', { n: n }); }
      var html = '<div class="stack gap-16"><div class="row between"><h1 class="page-title">' + esc(t('review')) + '</h1><span class="muted" style="font-size:14px">' + (st.i + 1) + ' / ' + st.total + '</span></div>' +
        '<button class="flash" id="flip" aria-label="' + esc(t('tapToFlip')) + '"><span class="label">' + esc(st.back ? t('explanation') : t('term')) + '</span>' +
        '<span class="term">' + esc(g.term) + '</span><span class="latin">' + esc(g.latin) + '</span>' +
        (st.back ? '<span class="rule" aria-hidden="true"></span><span class="def">' + esc(g.def) + '</span><span class="small muted">' + esc(g.ref) + '</span>' :
          '<span style="margin-top:20px;font-size:14px;color:var(--accent)">' + esc(t('tapToFlip')) + '</span>') + '</button>';
      if (st.back) {
        html += '<div class="rates"><button class="rate" data-iv="' + ivAgain + '">' + esc(t('again')) + '<small>' + esc(lab(ivAgain)) + '</small></button>' +
          '<button class="rate" data-iv="' + ivHard + '">' + esc(t('hard')) + '<small>' + esc(lab(ivHard)) + '</small></button>' +
          '<button class="rate good" data-iv="' + ivGood + '">' + esc(t('good')) + '<small>' + esc(lab(ivGood)) + '</small></button></div>';
      }
      html += '</div>';
      setView(html, 'review');
      document.getElementById('flip').onclick = function () { st.back = !st.back; draw(); };
      view.querySelectorAll('.rate').forEach(function (b) {
        b.onclick = function () { var iv = +b.dataset.iv; S.cards[g.id] = { due: addDays(iv), ivl: iv }; save(); st.i++; st.back = false; draw(); };
      });
    }
    draw();
  }

  // ---------- glossary ----------
  function screenGlossary(focusId) {
    var html = '<div class="stack gap-12"><h1 class="page-title">' + esc(t('glossary')) + '</h1>' +
      '<label class="search"><span class="muted" aria-hidden="true">' + ICON.glossary + '</span><input id="q" type="search" placeholder="' + esc(t('searchPlaceholder')) + '" aria-label="' + esc(t('searchPlaceholder')) + '" autocomplete="off"></label>' +
      '<span class="small muted" id="gcount"></span><div id="glist"></div></div>';
    setView(html, 'glossary');
    var lessonTitle = {}; allLessons().forEach(function (l) { lessonTitle[l.id] = l; });
    function list(q) {
      q = (q || '').trim().toLowerCase();
      var items = D.glossary.filter(function (g) {
        return !q || g.term.indexOf(q) >= 0 || g.latin.toLowerCase().indexOf(q) >= 0 || (g.aliases || []).some(function (a) { return a.indexOf(q) >= 0; });
      });
      document.getElementById('gcount').textContent = t('termsCount', { n: items.length });
      document.getElementById('glist').innerHTML = items.length ? items.map(function (g) {
        var l = lessonTitle[g.lesson], from = '';
        if (l) {
          var label = meta(l.course).title + '　' + t('lessonN', { n: l.n }) + (l.available ? '　' + l.title : '');
          from = l.available ? '<a class="ref" href="#/lesson/' + l.id + '">' + esc(t('fromLesson', { t: label })) + '</a>' : '<span class="ref">' + esc(t('fromLesson', { t: label })) + '</span>';
        }
        return '<div class="gitem stack gap-4' + (g.id === focusId ? ' hl' : '') + '" id="g-' + g.id + '"><div class="row" style="gap:10px;align-items:baseline;flex-wrap:wrap"><span class="term">' + esc(g.term) + '</span><span class="latin">' + esc(g.latin) + '</span></div>' +
          '<p class="def">' + esc(g.def) + '</p><div class="row" style="gap:12px;flex-wrap:wrap"><span class="small muted">' + esc(g.ref) + '</span>' + from + '</div></div>';
      }).join('') : '<p class="muted" style="padding:24px 0">' + esc(t('noResults')) + '</p>';
    }
    list('');
    document.getElementById('q').addEventListener('input', function (e) { list(e.target.value); });
    if (focusId) { var el = document.getElementById('g-' + focusId); if (el) el.scrollIntoView({ block: 'center' }); }
  }

  // ---------- settings ----------
  function screenSettings() {
    var html = '<div class="bar"><div class="bar-inner" style="justify-content:flex-start"><a class="icon-btn" style="color:var(--ink)" href="#/today" aria-label="' + esc(t('back')) + '">' + ICON.back + '</a>' +
      '<h1 class="serif" style="font-size:20px;font-weight:700">' + esc(t('settings')) + '</h1></div></div>' +
      '<div class="stack gap-20" style="padding-top:20px">' +
      '<section class="stack gap-8"><span class="small muted">' + esc(t('text')) + '</span><div class="group">' +
      '<div class="setrow"><span style="font-size:16px">' + esc(t('script')) + '</span><div class="seg" role="group" aria-label="' + esc(t('script')) + '">' +
      '<button data-script="hant" aria-pressed="' + (S.script === 'hant') + '">繁體</button><button data-script="hans" aria-pressed="' + (S.script === 'hans') + '">简体</button></div></div>' +
      '<div class="setrow"><span style="font-size:16px">' + esc(t('fontSize')) + '</span><div class="row" style="gap:4px"><button class="a-btn" id="smaller" aria-label="' + esc(t('smaller')) + '" style="font-size:14px">A</button>' +
      '<span id="fsv" class="muted" style="min-width:36px;text-align:center">' + S.fs + '</span><button class="a-btn" id="larger" aria-label="' + esc(t('larger')) + '" style="font-size:22px">A</button></div></div>' +
      '<div class="setrow" style="padding:12px 0"><p class="serif" style="font-size:var(--fs);line-height:1.8">' + esc(t('closingQuote')) + '</p></div></div></section>' +
      '<section class="stack gap-8"><span class="small muted">' + esc(t('study')) + '</span><div class="group">' +
      '<div class="setrow"><span style="font-size:16px">' + esc(t('pace')) + '</span><span class="muted">' + esc(t('paceDaily')) + '</span></div>' +
      '<div class="setrow"><button class="linkbtn" id="reset">' + esc(t('resetProgress')) + '</button></div></div></section>' +
      '<section class="stack gap-8"><span class="small muted">' + esc(t('about')) + '</span><div class="card stack gap-8" style="padding:16px">' +
      '<span class="serif" style="font-weight:700;font-size:17px">' + esc(t('aboutTitle')) + '</span><p class="serif" style="font-size:15px;line-height:1.75;color:var(--ink-2)">' + esc(t('aboutText')) + '</p>' +
      '<span class="small muted">' + esc(t('aboutNote')) + '</span></div></section></div>';
    setView(html, null);
    view.querySelectorAll('[data-script]').forEach(function (b) { b.onclick = function () { switchScript(b.dataset.script); }; });
    document.getElementById('smaller').onclick = function () { S.fs = Math.max(15, S.fs - 2); save(); applyFont(); document.getElementById('fsv').textContent = S.fs; };
    document.getElementById('larger').onclick = function () { S.fs = Math.min(25, S.fs + 2); save(); applyFont(); document.getElementById('fsv').textContent = S.fs; };
    document.getElementById('reset').onclick = function () {
      if (window.confirm(t('resetConfirm'))) { S.done = {}; S.cards = {}; S.enrolled = null; save(); initEnrolled(); location.hash = '#/today'; }
    };
  }

  function notFound() { location.hash = '#/today'; }

  function switchScript(sc) {
    if (sc === S.script) return;
    S.script = sc; save();
    loadScript(sc).then(route);
  }

  // ---------- router ----------
  function route() {
    var h = (location.hash || '#/today').slice(2).split('/');
    switch (h[0]) {
      case 'course': return h[1] ? screenCourse(h[1]) : screenCatalogue();
      case 'lesson': return screenLesson(h[1]);
      case 'quiz': return screenQuiz(h[1]);
      case 'review': return screenReview();
      case 'glossary': return screenGlossary(h[1]);
      case 'settings': return screenSettings();
      default: return screenToday();
    }
  }
  window.addEventListener('hashchange', route);

  applyFont();
  loadScript(S.script).then(route).catch(function (e) {
    view.innerHTML = '<p style="padding:40px 0">無法載入內容 / 无法载入内容。<br><small>' + esc(e.message) + '</small></p>';
  });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', function () {
      try { navigator.serviceWorker.register('sw.js').catch(function () {}); } catch (e) { /* unsupported context */ }
    });
  }
})();
