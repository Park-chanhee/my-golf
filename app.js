/* 내 골프 — 개인용 골프 기록 웹앱 (데이터는 이 브라우저에만 저장) */
(function () {
  'use strict';

  // ---------- 저장소 ----------
  const KEY = 'mygolf.v1';
  const emptyState = () => ({ profile: { name: '', homeCourse: '' }, rounds: [] });
  let state = emptyState();
  try { const raw = localStorage.getItem(KEY); if (raw) state = Object.assign(emptyState(), JSON.parse(raw)); } catch (e) {}
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { toast('저장 공간이 부족해요. 내정보에서 백업 후 정리해 주세요.'); }
  }

  // 사진은 용량이 커서 IndexedDB에 따로 저장
  const photos = new Map(); // id -> {id, roundId, data, at}
  let db = null;
  function openDB() {
    return new Promise((res) => {
      try {
        const req = indexedDB.open('mygolf-photos', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('photos', { keyPath: 'id' });
        req.onsuccess = () => { db = req.result; res(); };
        req.onerror = () => res();
      } catch (e) { res(); }
    });
  }
  function loadPhotos() {
    return new Promise((res) => {
      if (!db) return res();
      const tx = db.transaction('photos', 'readonly');
      const r = tx.objectStore('photos').getAll();
      r.onsuccess = () => { (r.result || []).forEach(p => photos.set(p.id, p)); res(); };
      r.onerror = () => res();
    });
  }
  function putPhoto(p) {
    photos.set(p.id, p);
    if (!db) return;
    try { db.transaction('photos', 'readwrite').objectStore('photos').put(p); } catch (e) {}
  }
  function delPhoto(id) {
    photos.delete(id);
    if (!db) return;
    try { db.transaction('photos', 'readwrite').objectStore('photos').delete(id); } catch (e) {}
  }

  // ---------- 유틸 ----------
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const won = n => n ? '₩' + Number(n).toLocaleString('ko-KR') : '';
  const todayStr = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
  function fmtDate(s, withYear) {
    if (!s) return '';
    const d = new Date(s + 'T00:00:00');
    return (withYear ? d.getFullYear() + '년 ' : '') + (d.getMonth() + 1) + '월 ' + d.getDate() + '일 ' + DAYS[d.getDay()];
  }
  function dday(s) {
    const a = new Date(todayStr() + 'T00:00:00'), b = new Date(s + 'T00:00:00');
    const n = Math.round((b - a) / 86400000);
    return n === 0 ? 'D-DAY' : n > 0 ? 'D-' + n : 'D+' + (-n);
  }
  let toastT;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2200);
  }

  // ---------- 라운드 계산 ----------
  const sum = a => a.reduce((x, y) => x + (Number(y) || 0), 0);
  function holesOf(r) { return r.holes || 18; }
  function filled(r) { return (r.strokes || []).slice(0, holesOf(r)).filter(v => v > 0).length; }
  function isDone(r) { return filled(r) === holesOf(r); }
  function total(r) { return sum((r.strokes || []).slice(0, holesOf(r))); }
  function parTotal(r) { return sum((r.par || []).slice(0, holesOf(r))); }
  function toPar(r) { return total(r) - parTotal(r); }
  function signed(n) { return n > 0 ? '+' + n : n === 0 ? 'E' : String(n); }
  function coverPhoto(r) {
    if (r.cover && photos.has(r.cover)) return photos.get(r.cover).data;
    for (const p of photos.values()) if (p.roundId === r.id) return p.data;
    return null;
  }
  function roundPhotos(r) { return [...photos.values()].filter(p => p.roundId === r.id).sort((a, b) => a.at - b.at); }
  const sorted = () => [...state.rounds].sort((a, b) => b.date.localeCompare(a.date) || (b.tee || '').localeCompare(a.tee || ''));
  const doneRounds = () => sorted().filter(isDone);
  function upcoming() {
    const t = todayStr();
    return [...state.rounds].filter(r => !isDone(r) && r.date >= t).sort((a, b) => a.date.localeCompare(b.date) || (a.tee || '').localeCompare(b.tee || ''));
  }
  function hcpEstimate(rs) {
    // 18홀 완료 라운드 최근 20개 중 좋은 8개의 (타수-파) 평균 × 0.96 (간이 추정치)
    const d = rs.filter(r => holesOf(r) === 18).slice(0, 20).map(toPar).sort((a, b) => a - b);
    if (d.length < 3) return null;
    const best = d.slice(0, Math.min(8, Math.ceil(d.length * 0.4)));
    return Math.round(sum(best) / best.length * 0.96 * 10) / 10;
  }
  function avg(a) { return a.length ? sum(a) / a.length : null; }
  const AVC = ['#1F5F3F', '#6B8F71', '#A3B18A', '#4E6E58', '#7A9E7E', '#2E6B45'];

  // ---------- 렌더 공통 ----------
  const view = $('#view');
  function photoBox(r, cls, inner = '') {
    const src = coverPhoto(r);
    return `<div class="${cls} ${src ? '' : 'ph'}">${src ? `<img src="${src}" alt="">` : '<span class="flag"></span>'}${inner}</div>`;
  }
  function roundCard(r) {
    const done = isDone(r);
    const badge = done ? `<span class="pill white">${fmtDate(r.date)}</span>` : `<span class="pill white">${dday(r.date)} · ${fmtDate(r.date)}</span>`;
    const score = done ? `<span class="scorebadge num">${total(r)}</span>` : '';
    const people = (r.players || []).length;
    return `<a class="pcard" href="#round/${r.id}">
      ${photoBox(r, 'pimg', badge + score)}
      <div class="pmeta">
        <div class="n"><span>${esc(r.course)}</span>${done ? `<span class="num" style="color:var(--g)">${signed(toPar(r))}</span>` : ''}</div>
        <div class="s">${[esc(r.region), holesOf(r) + '홀', people ? '동반자 ' + people + '명' : ''].filter(Boolean).join(' · ')}</div>
        ${!done ? `<div class="p">${r.tee ? `<b>${esc(r.tee)} 티오프</b>` : '티오프 미정'}${r.fee ? ' · 그린피 ' + won(r.fee) : ''}</div>` : ''}
      </div></a>`;
  }
  function roundRow(r) {
    return `<a class="row" href="#round/${r.id}">
      <div class="thumb">${coverPhoto(r) ? `<img src="${coverPhoto(r)}" alt="">` : ''}</div>
      <div class="mid"><b>${esc(r.course)}</b><span>${fmtDate(r.date, true)}</span></div>
      <div class="sc num">${isDone(r) ? total(r) : `<span class="pill soft">${dday(r.date)}</span>`}</div></a>`;
  }

  // ---------- 화면: 홈 ----------
  function vHome() {
    const name = state.profile.name;
    const up = upcoming()[0];
    const done = doneRounds();
    const hcp = hcpEstimate(done);
    const last5 = done.slice(0, 5).filter(r => holesOf(r) === 18).map(total);
    const prev5 = done.slice(5, 10).filter(r => holesOf(r) === 18).map(total);
    const a5 = avg(last5), p5 = avg(prev5);
    let trend = '';
    if (a5 != null && p5 != null) {
      const diff = Math.round((a5 - p5) * 10) / 10;
      trend = diff < 0 ? `▼ ${-diff} 좋아지는 중` : diff > 0 ? `▲ ${diff} 다시 힘내요` : '변화 없음';
    }
    return `
      <div class="top"><div><div class="hi">${name ? esc(name) + '님, ' : ''}안녕하세요</div><h1>다음 라운딩은 어디로?</h1></div>
        ${hcp != null ? `<span class="pill soft num">HCP ${hcp}</span>` : ''}</div>
      <form class="search" id="homeSearch" role="search">🔍<input id="q" placeholder="골프장, 지역, 동반자 검색" autocomplete="off"></form>
      ${up ? `<div class="sec-h" style="padding-top:6px"><h2>다가오는 라운딩</h2><a href="#rounds">전체</a></div>${roundCard(up)}`
           : `<div class="empty"><b>예정된 라운딩이 없어요</b>다음 라운딩을 등록하면 D-day와 함께 여기에 보여요.<br><br><a class="btn" href="#new">+ 라운딩 등록</a></div>`}
      ${a5 != null ? `<a class="summary" href="#stats"><div><div class="l">최근 5라운드 평균 타수</div><div class="v num">${a5.toFixed(1)}</div></div><div class="d">${trend || '통계 보기 →'}</div></a>` : ''}
      ${done.length ? `<div class="sec"><div class="sec-h"><h2>최근 기록</h2><a href="#rounds">더보기</a></div>${done.slice(0, 3).map(roundRow).join('')}</div>` : ''}
      ${!state.rounds.length ? `<div class="empty"><b>처음 오셨네요</b>예시 라운딩으로 먼저 둘러볼 수도 있어요. 예시는 내정보에서 언제든 지울 수 있어요.<br><br><button class="btn ghost" id="seed">예시 데이터 넣기</button></div>` : ''}
      <a class="btn fab" href="#new">+ 라운딩</a>`;
  }
  function bindHome() {
    const f = $('#homeSearch');
    f && f.addEventListener('submit', e => { e.preventDefault(); roundsFilter.q = $('#q').value.trim(); location.hash = '#rounds'; });
    const s = $('#seed'); s && s.addEventListener('click', seed);
  }

  // ---------- 화면: 라운딩 목록 ----------
  const roundsFilter = { tab: 'all', q: '' };
  function vRounds() {
    const q = roundsFilter.q.toLowerCase();
    let list = sorted();
    if (roundsFilter.tab === 'up') list = upcoming();
    if (roundsFilter.tab === 'done') list = list.filter(isDone);
    if (q) list = list.filter(r => [r.course, r.region, r.memo, ...(r.players || [])].join(' ').toLowerCase().includes(q));
    const chip = (k, l) => `<button class="chip ${roundsFilter.tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`;
    return `
      <div class="top"><h1>라운딩</h1><span class="muted num">${state.rounds.length}개</span></div>
      <form class="search" id="rSearch" role="search">🔍<input id="rq" value="${esc(roundsFilter.q)}" placeholder="골프장, 지역, 동반자 검색" autocomplete="off"></form>
      <div class="chips">${chip('all', '전체')}${chip('up', '예정')}${chip('done', '완료')}</div>
      ${list.length ? list.map(roundCard).join('') : `<div class="empty"><b>${q ? '검색 결과가 없어요' : '아직 라운딩이 없어요'}</b>${q ? '다른 단어로 찾아보세요.' : '오른쪽 아래 버튼으로 첫 라운딩을 등록해 보세요.'}</div>`}
      <a class="btn fab" href="#new">+ 라운딩</a>`;
  }
  function bindRounds() {
    view.querySelectorAll('.chip').forEach(b => b.addEventListener('click', () => { roundsFilter.tab = b.dataset.tab; render(); }));
    const inp = $('#rq');
    inp.addEventListener('input', () => { roundsFilter.q = inp.value; const pos = inp.selectionStart; render(); const n = $('#rq'); n.focus(); n.setSelectionRange(pos, pos); });
    $('#rSearch').addEventListener('submit', e => e.preventDefault());
  }

  // ---------- 화면: 라운딩 상세 ----------
  function scoreCell(s, p) {
    if (!s) return '<span class="muted">·</span>';
    const d = s - p;
    const cls = d <= -2 ? 'ea' : d === -1 ? 'bi' : d === 1 ? 'bo' : d >= 2 ? 'db' : '';
    return cls ? `<span class="bd ${cls}">${s}</span>` : s;
  }
  function scoreTable(r, from, to, label) {
    const idx = []; for (let i = from; i < to; i++) idx.push(i);
    const sub = a => sum(idx.map(i => a[i]));
    return `<table>
      <tr><th>홀</th>${idx.map(i => `<th>${i + 1}</th>`).join('')}<th>${label}</th></tr>
      <tr><th>파</th>${idx.map(i => `<td>${r.par[i]}</td>`).join('')}<td><b>${sub(r.par)}</b></td></tr>
      <tr><th>타수</th>${idx.map(i => `<td>${scoreCell(r.strokes[i], r.par[i])}</td>`).join('')}<td><b>${sub(r.strokes) || '-'}</b></td></tr>
      <tr><th>퍼팅</th>${idx.map(i => `<td class="muted">${r.putts[i] || '·'}</td>`).join('')}<td>${sub(r.putts) || '-'}</td></tr>
    </table>`;
  }
  function vRound(id) {
    const r = state.rounds.find(x => x.id === id);
    if (!r) return `<div class="empty"><b>라운딩을 찾을 수 없어요</b><a href="#rounds">목록으로</a></div>`;
    const done = isDone(r), n = holesOf(r);
    const putts = sum(r.putts.slice(0, n));
    const birdies = r.strokes.slice(0, n).filter((s, i) => s && s - r.par[i] <= -1).length;
    const gir = r.strokes.slice(0, n).filter((s, i) => s && r.putts[i] != null && s - r.putts[i] <= r.par[i] - 2).length;
    const ph = roundPhotos(r);
    return `
      <div class="hero">${coverPhoto(r) ? `<img src="${coverPhoto(r)}" alt="">` : ''}
        <button class="back" id="back">← 뒤로</button><button class="edit" id="edit">수정</button>
        <div class="ov"><div class="n">${esc(r.course)}</div><div class="s">${fmtDate(r.date, true)}${r.tee ? ' · ' + esc(r.tee) : ''}${r.weather ? ' · ' + esc(r.weather) : ''}</div></div></div>
      ${done ? `<div class="scorecard"><div class="v num">${total(r)}<small>${signed(toPar(r))}</small></div>
          <div class="sub"><span><b>${putts || '-'}</b>퍼팅</span><span><b>${birdies}</b>버디</span><span><b>${gir}</b>파 온</span></div></div>`
        : `<div class="scorecard"><div><div class="muted" style="font-size:12px">${filled(r) ? `${filled(r)}/${n}홀 입력됨` : '예정된 라운딩'}</div><div class="v num" style="font-size:30px">${dday(r.date)}</div></div>
          <a class="btn" href="#score/${r.id}">스코어 입력</a></div>`}
      ${(r.players || []).length ? `<div class="people">${r.players.map((p, i) => `<span class="av" style="background:${AVC[i % AVC.length]}">${esc(p.slice(0, 1))}</span>`).join('')}<span>${r.players.map(esc).join(', ')}</span></div>` : ''}
      ${r.region || r.fee ? `<div class="people">${[esc(r.region), r.fee ? '그린피 ' + won(r.fee) : ''].filter(Boolean).join(' · ')}</div>` : ''}
      ${filled(r) ? `<div class="sec"><div class="sec-h"><h2>스코어카드</h2><a href="#score/${r.id}">편집</a></div>
          <div class="tbl">${scoreTable(r, 0, Math.min(9, n), n === 9 ? '합' : 'OUT')}</div>
          ${n === 18 ? `<div class="tbl" style="margin-top:8px">${scoreTable(r, 9, 18, 'IN')}</div>` : ''}</div>` : ''}
      ${r.memo ? `<div class="sec"><div class="sec-h"><h2>메모</h2></div><div class="memo">${esc(r.memo)}</div></div>` : ''}
      <div class="sec"><div class="sec-h"><h2>사진</h2><span class="muted num">${ph.length}장</span></div>
        <div class="album">${ph.map(p => `<button class="ph" data-ph="${p.id}"><img src="${p.data}" alt=""></button>`).join('')}
          <label class="ph add" title="사진 추가">+<input type="file" accept="image/*" multiple hidden id="addPh"></label></div></div>`;
  }
  function bindRound(id) {
    $('#back').addEventListener('click', () => history.length > 1 ? history.back() : (location.hash = '#rounds'));
    $('#edit').addEventListener('click', () => { location.hash = '#edit/' + id; });
    $('#addPh').addEventListener('change', e => addPhotos(e.target.files, id));
    view.querySelectorAll('[data-ph]').forEach(b => b.addEventListener('click', () => lightbox(b.dataset.ph)));
  }

  // ---------- 사진 ----------
  function resize(file) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => {
        const img = new Image();
        img.onload = () => {
          const max = 1200, k = Math.min(1, max / Math.max(img.width, img.height));
          const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          res(c.toDataURL('image/jpeg', 0.78));
        };
        img.onerror = rej; img.src = fr.result;
      };
      fr.onerror = rej; fr.readAsDataURL(file);
    });
  }
  async function addPhotos(files, roundId) {
    let n = 0;
    for (const f of files) {
      try { putPhoto({ id: uid(), roundId, data: await resize(f), at: Date.now() + n }); n++; } catch (e) {}
    }
    const r = state.rounds.find(x => x.id === roundId);
    if (r && !r.cover) { const first = roundPhotos(r)[0]; if (first) { r.cover = first.id; save(); } }
    toast(n ? `사진 ${n}장을 추가했어요` : '사진을 읽지 못했어요. 다른 파일로 시도해 주세요.');
    render();
  }
  function lightbox(pid) {
    const p = photos.get(pid); if (!p) return;
    const r = state.rounds.find(x => x.id === p.roundId);
    const box = document.createElement('div'); box.className = 'lightbox';
    box.innerHTML = `<img src="${p.data}" alt=""><div class="cap">${r ? esc(r.course) + ' · ' + fmtDate(r.date, true) : ''}</div>
      <div class="acts">${r ? `<button class="btn ghost" data-a="cover">대표 사진으로</button>` : ''}<button class="btn danger" data-a="del">삭제</button><button class="btn" data-a="close">닫기</button></div>`;
    let armed = false;
    box.addEventListener('click', e => {
      const a = e.target.dataset.a;
      if (e.target === box || a === 'close') box.remove();
      if (a === 'cover' && r) { r.cover = pid; save(); toast('대표 사진으로 정했어요'); box.remove(); render(); }
      if (a === 'del') {
        if (!armed) { armed = true; e.target.textContent = '한 번 더 누르면 삭제'; return; }
        delPhoto(pid); if (r && r.cover === pid) { r.cover = null; save(); }
        box.remove(); toast('사진을 삭제했어요'); render();
      }
    });
    document.body.appendChild(box);
  }

  // ---------- 화면: 라운딩 등록/수정 ----------
  function blankRound() {
    return { id: uid(), date: todayStr(), tee: '', course: '', region: '', holes: 18, players: [], fee: '', weather: '', memo: '',
      par: [4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5], strokes: Array(18).fill(null), putts: Array(18).fill(null), fir: Array(18).fill(null), cover: null };
  }
  function vEdit(id) {
    const r = id ? state.rounds.find(x => x.id === id) : null;
    const d = r || blankRound();
    const courses = [...new Set(state.rounds.map(x => x.course).filter(Boolean))];
    return `
      <div class="top"><div><button class="back" id="back">← 뒤로</button><h1>${r ? '라운딩 수정' : '라운딩 등록'}</h1></div></div>
      <form class="form" id="f">
        <details class="import" ${r ? '' : 'open'}><summary>예약 메시지로 자동 채우기</summary>
          <div class="field" style="margin-top:10px"><label for="bookmsg">카카오톡·문자로 받은 예약 확정 메시지를 붙여넣어 주세요</label>
            <textarea id="bookmsg" placeholder="[카카오골프예약] 예약이 확정되었습니다.&#10;골프장: 남서울CC&#10;일시: 2026.11.22(토) 07:12&#10;그린피: 210,000원"></textarea></div>
          <button class="btn ghost block" type="button" id="parseBook" style="margin-top:8px">메시지에서 정보 가져오기</button>
          <p class="hint" id="bookHint"></p>
        </details>
        <div class="field"><label for="course">골프장</label><input id="course" required list="courses" value="${esc(d.course)}" placeholder="예: 남서울CC">
          <datalist id="courses">${courses.map(c => `<option value="${esc(c)}">`).join('')}</datalist></div>
        <div class="two"><div class="field"><label for="date">날짜</label><input id="date" type="date" required value="${d.date}"></div>
          <div class="field"><label for="tee">티오프</label><input id="tee" type="time" value="${esc(d.tee)}"></div></div>
        <div class="two"><div class="field"><label for="region">지역</label><input id="region" value="${esc(d.region)}" placeholder="예: 경기 성남"></div>
          <div class="field"><label for="holes">홀 수</label><select id="holes"><option value="18" ${d.holes === 18 ? 'selected' : ''}>18홀</option><option value="9" ${d.holes === 9 ? 'selected' : ''}>9홀</option></select></div></div>
        <div class="field"><label for="players">동반자 (쉼표로 구분)</label><input id="players" value="${esc((d.players || []).join(', '))}" placeholder="예: 아빠, 엄마, 형"></div>
        <div class="two"><div class="field"><label for="fee">그린피 (원)</label><input id="fee" type="number" inputmode="numeric" min="0" step="1000" value="${esc(d.fee)}"></div>
          <div class="field"><label for="weather">날씨</label><input id="weather" value="${esc(d.weather)}" placeholder="예: 맑음 12°C"></div></div>
        <div class="field"><label for="memo">메모</label><textarea id="memo" placeholder="코스 느낌, 잘된 샷, 다음에 고칠 점">${esc(d.memo)}</textarea></div>
        <button class="btn block" type="submit">${r ? '저장' : '등록하고 계속'}</button>
        ${r ? `<button class="btn danger block" type="button" id="del">이 라운딩 삭제</button>` : ''}
      </form>`;
  }
  function bindEdit(id) {
    $('#back').addEventListener('click', () => history.back());
    $('#parseBook').addEventListener('click', () => {
      const info = parseBooking($('#bookmsg').value);
      const got = [];
      const set = (sel, v, label) => { if (v != null && v !== '') { $(sel).value = v; got.push(label); } };
      set('#course', info.course, '골프장'); set('#date', info.date, '날짜'); set('#tee', info.tee, '티오프');
      set('#region', info.region, '지역'); set('#fee', info.fee, '그린피');
      if (info.holes) { $('#holes').value = String(info.holes); got.push('홀 수'); }
      if (info.players && !$('#players').value) set('#players', info.players, '동반자');
      const missing = ['골프장', '날짜', '티오프'].filter(x => !got.includes(x));
      $('#bookHint').textContent = got.length
        ? `채운 항목: ${got.join(', ')}.${missing.length ? ' 못 찾은 항목(' + missing.join(', ') + ')은 직접 입력해 주세요.' : ' 확인 후 등록을 눌러 주세요.'}`
        : '메시지에서 예약 정보를 찾지 못했어요. 골프장 이름과 날짜가 들어 있는지 확인해 주세요.';
    });
    $('#f').addEventListener('submit', e => {
      e.preventDefault();
      let r = id ? state.rounds.find(x => x.id === id) : null;
      const isNew = !r; if (!r) r = blankRound();
      r.course = $('#course').value.trim(); r.date = $('#date').value; r.tee = $('#tee').value;
      r.region = $('#region').value.trim(); r.holes = Number($('#holes').value);
      r.players = $('#players').value.split(',').map(s => s.trim()).filter(Boolean);
      r.fee = $('#fee').value ? Number($('#fee').value) : ''; r.weather = $('#weather').value.trim(); r.memo = $('#memo').value;
      if (isNew) state.rounds.push(r);
      // 이전에 같은 골프장을 쳤다면 파 정보를 가져옴
      if (isNew) { const prev = sorted().find(x => x.id !== r.id && x.course === r.course); if (prev) r.par = prev.par.slice(); }
      save(); toast(isNew ? '라운딩을 등록했어요' : '저장했어요');
      location.replace('#round/' + r.id);
    });
    const del = $('#del'); let armed = false;
    del && del.addEventListener('click', () => {
      if (!armed) { armed = true; del.textContent = '한 번 더 누르면 삭제돼요 (사진 포함)'; return; }
      state.rounds = state.rounds.filter(x => x.id !== id);
      [...photos.values()].filter(p => p.roundId === id).forEach(p => delPhoto(p.id));
      save(); toast('라운딩을 삭제했어요'); location.replace('#rounds');
    });
  }

  // ---------- 예약 메시지 해석 ----------
  function parseBooking(text) {
    const t = String(text || '').replace(/\r/g, '');
    const out = {};
    const lines = t.split('\n').map(s => s.trim()).filter(Boolean);
    const label = re => { for (const l of lines) { const m = l.match(re); if (m && m[1].trim()) return m[1].trim(); } return null; };
    // 골프장
    let course = label(/^(?:[^\s가-힣A-Za-z0-9]+\s*)?(?:골프장|골프장명|구장|코스명|장소|예약\s*골프장)\s*[:：]\s*(.+)$/);
    if (!course) {
      const m = t.match(/([가-힣A-Za-z0-9&()\s]{2,30}?(?:컨트리\s*클럽|컨트리클럽|골프\s*클럽|골프클럽|골프앤리조트|골프\s*&\s*리조트|골프리조트|C\.C|CC|GC|G\.C|CLUB|골프장))/);
      if (m) course = m[1].replace(/^.*[\]】:：]\s*/, '').trim();
    }
    if (course) out.course = course.replace(/\s*\((?:[^)]*코스[^)]*)\)\s*$/, '').replace(/\s{2,}/g, ' ').slice(0, 40);
    // 날짜
    const now = new Date(); let y, mo, d;
    let m = t.match(/(20\d{2})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/);
    if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else if ((m = t.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/)) || (m = t.match(/(?:^|[^\d:])(\d{1,2})[./](\d{1,2})\s*\(?[월화수목금토일]/))) {
      mo = +m[1]; d = +m[2]; y = now.getFullYear();
      const cand = new Date(y, mo - 1, d);
      if (cand < new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30)) y++;
    }
    if (y && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) out.date = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    // 티오프 시간
    m = t.match(/(?:티\s*오프|티업|시간|일시)[^\n\d]*(?:20\d{2}[^\n]*?)?(\d{1,2})\s*[:시]\s*(\d{2})/) || t.match(/(?:^|[^\d])(\d{1,2}):(\d{2})(?!\d)/);
    if (m) {
      let h = +m[1]; const mi = +m[2];
      if (/오후\s*$/.test(t.slice(0, m.index + m[0].indexOf(m[1])).slice(-6)) && h < 12) h += 12;
      if (h <= 23 && mi <= 59) out.tee = `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
    }
    // 그린피
    m = t.match(/(?:그린피|그린\s*피|요금|이용\s*요금|결제\s*금액|금액|1인)[^\d\n]*([\d,]{4,})\s*원?/);
    if (!m) m = t.match(/([\d,]{5,})\s*원/);
    if (m) { const v = Number(m[1].replace(/,/g, '')); if (v >= 10000 && v <= 2000000) out.fee = v; }
    // 홀 수
    m = t.match(/(9|18|27|36)\s*홀/); if (m) out.holes = +m[1] === 9 ? 9 : 18;
    // 지역 (주소 줄)
    const addr = label(/^(?:[^\s가-힣A-Za-z0-9]+\s*)?(?:주소|위치)\s*[:：]\s*(.+)$/);
    if (addr) out.region = addr.split(/\s+/).slice(0, 2).join(' ').replace(/(특별시|광역시|특별자치도|특별자치시)$/, '');
    // 동반자 (예약자/동반자 이름 줄)
    const ppl = label(/^(?:[^\s가-힣A-Za-z0-9]+\s*)?(?:동반자|동반인|플레이어)\s*[:：]\s*(.+)$/);
    if (ppl) out.players = ppl.replace(/\s*[\/·]\s*/g, ', ');
    return out;
  }

  // ---------- 스코어카드 사진 인식 ----------
  let tessLoading = null;
  function loadTesseract() {
    if (window.Tesseract) return Promise.resolve();
    if (!tessLoading) tessLoading = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
      s.onload = res; s.onerror = () => { tessLoading = null; rej(new Error('load')); };
      document.head.appendChild(s);
    });
    return tessLoading;
  }
  function prepImage(file) {
    // 글자 인식이 잘 되도록 키우고 흑백 대비를 올림
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const k = Math.min(3, Math.max(1, 2000 / img.width));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        const g = c.getContext('2d'); g.drawImage(img, 0, 0, c.width, c.height);
        const px = g.getImageData(0, 0, c.width, c.height), a = px.data;
        let sumL = 0; for (let i = 0; i < a.length; i += 4) sumL += a[i] * .3 + a[i + 1] * .59 + a[i + 2] * .11;
        const mean = sumL / (a.length / 4), dark = mean < 110; // 다크 화면 캡처면 반전
        for (let i = 0; i < a.length; i += 4) {
          let l = a[i] * .3 + a[i + 1] * .59 + a[i + 2] * .11; if (dark) l = 255 - l;
          l = l < 150 ? 0 : 255; a[i] = a[i + 1] = a[i + 2] = l;
        }
        g.putImageData(px, 0, 0); URL.revokeObjectURL(url); res(c);
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('img')); };
      img.src = url;
    });
  }
  function numsOf(line) {
    return (line.match(/[+-]?\d+/g) || []).map(Number);
  }
  // OCR 글자에서 파/타수/퍼팅 줄을 찾아 홀별 값으로 정리
  function parseScorecard(text, holes) {
    const isHoleNo = n => n.slice(0, 9).every((v, i) => v === n[0] + i) && (n[0] === 1 || n[0] === 10);
    const rows = String(text).split('\n').map(s => ({ raw: s, n: numsOf(s) })).filter(r => r.n.length >= 9 && !isHoleNo(r.n));
    const isPar = r => r.n.slice(0, 9).every(v => v >= 3 && v <= 5) && !/[+-]/.test(r.raw.replace(/^\D+/, '').slice(0, 30));
    const isRel = r => r.n.slice(0, 9).some(v => v < 0) || (r.n.slice(0, 9).filter(v => v === 0).length >= 2 && r.n.slice(0, 9).every(v => v >= -3 && v <= 6));
    const blocks = []; let cur = null;
    rows.forEach(r => {
      if (isPar(r) && (!cur || cur.rows.length)) { cur = { par: r, rows: [] }; blocks.push(cur); }
      else if (cur) cur.rows.push(r);
      else { cur = { par: null, rows: [r] }; blocks.push(cur); }
    });
    const res = { par: Array(18).fill(null), strokes: Array(18).fill(null), putts: Array(18).fill(null) };
    let offset = 0;
    blocks.forEach(b => {
      // 한 줄에 18홀이 다 있으면 18개, 아니면 9개씩
      const width = (b.par && b.par.n.length >= 18 && b.par.n.slice(9, 18).every(v => v >= 3 && v <= 5)) ? 18 : 9;
      if (offset >= holes) return;
      const par = b.par ? b.par.n.slice(0, width) : null;
      const sc = b.rows.find(r => r.n.slice(0, width).every(v => v >= -3 && v <= 12));
      const pt = b.rows.find(r => r !== sc && r.n.slice(0, width).every(v => v >= 0 && v <= 4));
      for (let i = 0; i < width && offset + i < 18; i++) {
        if (par) res.par[offset + i] = par[i];
        if (sc && sc.n[i] != null) {
          const p = par ? par[i] : null;
          res.strokes[offset + i] = isRel(sc) && p ? p + sc.n[i] : sc.n[i];
        }
        if (pt && pt.n[i] != null) res.putts[offset + i] = pt.n[i];
      }
      offset += width;
    });
    return res;
  }
  async function ocrScorecard(file, id) {
    const r = state.rounds.find(x => x.id === id); if (!r) return;
    const box = $('#ocrBox');
    box.hidden = false; box.innerHTML = '<p class="hint">사진을 읽는 중이에요… 처음에는 인식 도구를 내려받느라 10~20초 걸릴 수 있어요.</p>';
    try {
      await loadTesseract();
      const canvas = await prepImage(file);
      const worker = await Tesseract.createWorker('eng');
      await worker.setParameters({ tessedit_char_whitelist: '0123456789+-. ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' });
      const { data } = await worker.recognize(canvas);
      await worker.terminate();
      const got = parseScorecard(data.text, holesOf(r));
      const n = holesOf(r);
      const found = got.strokes.slice(0, n).filter(v => v != null).length;
      pendingOcr = { id, got };
      box.innerHTML = reviewGrid(r, got) + `<p class="hint">${found ? `${found}/${n}홀의 타수를 읽었어요. 틀린 칸은 눌러서 고친 뒤 저장해 주세요.` : '타수를 찾지 못했어요. 스코어카드 표가 화면에 꽉 차게 캡처한 사진으로 다시 시도하거나, 아래 표에 직접 입력해 주세요.'}</p>
        <div class="two"><button class="btn ghost" type="button" id="ocrCancel">취소</button><button class="btn" type="button" id="ocrSave">이대로 저장</button></div>
        <details class="raw"><summary>인식된 글자 보기</summary><pre>${esc(data.text)}</pre></details>`;
      $('#ocrCancel').addEventListener('click', () => { pendingOcr = null; box.hidden = true; });
      $('#ocrSave').addEventListener('click', () => saveOcr(r));
    } catch (e) {
      box.innerHTML = '<p class="hint">사진 인식을 시작하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.</p>';
    }
  }
  let pendingOcr = null;
  function reviewGrid(r, got) {
    const n = holesOf(r);
    const block = (from, to) => {
      const idx = []; for (let i = from; i < to; i++) idx.push(i);
      const cell = (k, i) => `<td><input class="oc" inputmode="numeric" data-k="${k}" data-i="${i}" value="${got[k][i] ?? (k === 'par' ? r.par[i] : '')}"></td>`;
      return `<div class="tbl" style="margin:8px 0 0"><table>
        <tr><th>홀</th>${idx.map(i => `<th>${i + 1}</th>`).join('')}</tr>
        <tr><th>파</th>${idx.map(i => cell('par', i)).join('')}</tr>
        <tr><th>타수</th>${idx.map(i => cell('strokes', i)).join('')}</tr>
        <tr><th>퍼팅</th>${idx.map(i => cell('putts', i)).join('')}</tr></table></div>`;
    };
    return `<h2 style="margin-top:4px">사진에서 읽은 스코어</h2>${block(0, Math.min(9, n))}${n === 18 ? block(9, 18) : ''}`;
  }
  function saveOcr(r) {
    const n = holesOf(r);
    view.querySelectorAll('input.oc').forEach(inp => {
      const k = inp.dataset.k, i = Number(inp.dataset.i); if (i >= n) return;
      const v = inp.value.trim() === '' ? null : Number(inp.value);
      if (k === 'par') { if (v >= 3 && v <= 6) r.par[i] = v; }
      else r[k][i] = v != null && !isNaN(v) && v >= (k === 'strokes' ? 1 : 0) && v <= 15 ? v : null;
    });
    pendingOcr = null; save(); toast('스코어를 저장했어요');
    render();
  }

  // ---------- 화면: 스코어 입력 ----------
  function vScore(id) {
    const r = state.rounds.find(x => x.id === id);
    if (!r) return `<div class="empty"><b>라운딩을 찾을 수 없어요</b></div>`;
    const n = holesOf(r);
    const rows = [];
    for (let i = 0; i < n; i++) {
      rows.push(`<div class="hole" data-i="${i}">
        <div class="hn">${i + 1}<small>파${r.par[i]}</small></div>
        <div class="ctrls">
          <div class="parsel">${[3, 4, 5].map(p => `<button type="button" data-par="${p}" class="${r.par[i] === p ? 'on' : ''}">파${p}</button>`).join('')}</div>
          <div class="step"><label>타수</label><button type="button" data-k="strokes" data-d="-1">−</button><output>${r.strokes[i] ?? '–'}</output><button type="button" data-k="strokes" data-d="1">+</button></div>
          <div class="step"><label>퍼팅</label><button type="button" data-k="putts" data-d="-1">−</button><output>${r.putts[i] ?? '–'}</output><button type="button" data-k="putts" data-d="1">+</button></div>
          ${r.par[i] > 3 ? `<button type="button" class="fw ${r.fir[i] ? 'on' : ''}" data-fw>${r.fir[i] ? '페어웨이 ✓' : '페어웨이'}</button>` : ''}
        </div></div>`);
    }
    return `
      <div class="top"><div><button class="back" id="back">← ${esc(r.course)}</button><h1>스코어 입력</h1></div></div>
      <div class="totalbar"><div><div class="muted" style="font-size:11.5px">${filled(r)}/${n}홀 · 파 ${parTotal(r)}</div><div class="v num">${total(r) || 0} <small style="font-size:14px;color:var(--g)">${filled(r) ? signed(sum(r.strokes.slice(0, n).map((s, i) => s ? s - r.par[i] : 0))) : ''}</small></div></div>
        <a class="btn" href="#round/${r.id}">완료</a></div>
      <div class="form" style="padding-bottom:0">
        <label class="btn ghost block">📷 스코어카드 캡처로 입력<input type="file" accept="image/*" hidden id="ocrFile"></label>
        <div id="ocrBox" class="ocrbox" hidden></div>
      </div>
      <div class="holes">${rows.join('')}</div>
      <p class="muted pad" style="font-size:12px;line-height:1.6">타수의 + 버튼을 처음 누르면 그 홀의 파 값부터 시작해요. 입력하는 즉시 저장돼요.</p>`;
  }
  function bindScore(id) {
    const r = state.rounds.find(x => x.id === id); if (!r) return;
    $('#back').addEventListener('click', () => { location.hash = '#round/' + id; });
    $('#ocrFile').addEventListener('change', e => { const f = e.target.files[0]; if (f) ocrScorecard(f, id); e.target.value = ''; });
    view.querySelector('.holes').addEventListener('click', e => {
      const hole = e.target.closest('.hole'); if (!hole) return;
      const i = Number(hole.dataset.i), b = e.target.closest('button'); if (!b) return;
      if (b.dataset.par) r.par[i] = Number(b.dataset.par);
      if (b.dataset.k) {
        const k = b.dataset.k, d = Number(b.dataset.d);
        let v = r[k][i];
        if (v == null) v = d > 0 ? (k === 'strokes' ? r.par[i] : 2) : null;
        else v = v + d;
        if (v != null && v < (k === 'strokes' ? 1 : 0)) v = null;
        r[k][i] = v;
      }
      if (b.hasAttribute('data-fw')) r.fir[i] = !r.fir[i];
      save();
      const y = window.scrollY; render(); window.scrollTo(0, y);
    });
  }

  // ---------- 화면: 통계 ----------
  function lineChart(vals) {
    const W = 300, H = 110, P = 22;
    const lo = Math.min(...vals) - 2, hi = Math.max(...vals) + 2;
    const x = i => P + (vals.length === 1 ? (W - 2 * P) / 2 : i * (W - 2 * P) / (vals.length - 1));
    const y = v => 10 + (v - lo) / (hi - lo) * (H - 30); // 낮은 타수가 위
    const pts = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const ticks = [lo + 2, Math.round((lo + hi) / 2), hi - 2];
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="최근 라운드 타수 추이">
      ${ticks.map(t => `<line x1="${P}" x2="${W - 4}" y1="${y(t)}" y2="${y(t)}" stroke="#E2E2E2"/><text x="0" y="${y(t) + 4}" font-size="10" fill="#717171" font-family="Space Grotesk">${t}</text>`).join('')}
      <polygon points="${x(0)},${H - 14} ${pts} ${x(vals.length - 1)},${H - 14}" fill="#1F5F3F" fill-opacity=".1"/>
      <polyline points="${pts}" fill="none" stroke="#1F5F3F" stroke-width="2.5" stroke-linejoin="round"/>
      ${vals.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="${i === vals.length - 1 ? 4.5 : 2.5}" fill="#1F5F3F"/>`).join('')}
      <text x="${x(vals.length - 1)}" y="${y(vals[vals.length - 1]) - 9}" font-size="11" font-weight="700" text-anchor="end" fill="#1F5F3F" font-family="Space Grotesk">${vals[vals.length - 1]}</text>
    </svg>`;
  }
  function vStats() {
    const year = new Date().getFullYear();
    const all = doneRounds();
    const r18 = all.filter(r => holesOf(r) === 18);
    if (!all.length) return `<div class="top"><h1>통계</h1></div><div class="empty"><b>아직 완료된 라운딩이 없어요</b>스코어를 모두 입력한 라운딩이 생기면 평균, 베스트, 추이를 보여드려요.</div>`;
    const totals = r18.map(total);
    const avgAll = avg(totals.slice(0, 10));
    const best = r18.length ? r18.reduce((a, b) => total(a) <= total(b) ? a : b) : null;
    const thisYear = all.filter(r => r.date.startsWith(String(year))).length;
    const hcp = hcpEstimate(all);
    const last10 = r18.slice(0, 10).reverse().map(total);
    // 홀 단위 지표
    let fwHit = 0, fwN = 0, gir = 0, holes = 0, puttSum = 0, puttRounds = 0;
    const dist = { eagle: 0, birdie: 0, par: 0, bogey: 0, double: 0 };
    all.slice(0, 20).forEach(r => {
      const n = holesOf(r); let rp = 0, hasP = true;
      for (let i = 0; i < n; i++) {
        const s = r.strokes[i], p = r.par[i], pt = r.putts[i];
        holes++;
        if (p > 3) { fwN++; if (r.fir[i]) fwHit++; }
        if (pt != null) { rp += pt; if (s - pt <= p - 2) gir++; } else hasP = false;
        const d = s - p; dist[d <= -2 ? 'eagle' : d === -1 ? 'birdie' : d === 0 ? 'par' : d === 1 ? 'bogey' : 'double']++;
      }
      if (hasP && n === 18) { puttSum += rp; puttRounds++; }
    });
    const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
    const DC = { eagle: ['이글 이하', '#123B27'], birdie: ['버디', '#1F5F3F'], par: ['파', '#7FBF6E'], bogey: ['보기', '#C9DDB8'], double: ['더블 이상', '#E2E2E2'] };
    const avgPutt = puttRounds ? (puttSum / puttRounds).toFixed(1) : '-';
    // 골프장별
    const byCourse = {};
    r18.forEach(r => { (byCourse[r.course] = byCourse[r.course] || []).push(total(r)); });
    const courses = Object.entries(byCourse).map(([c, a]) => ({ c, n: a.length, avg: avg(a), best: Math.min(...a) })).sort((a, b) => b.n - a.n).slice(0, 5);
    return `
      <div class="top"><h1>내 기록</h1>${hcp != null ? `<span class="pill soft num">추정 HCP ${hcp}</span>` : ''}</div>
      <div class="kpis">
        <div class="k"><div class="l">평균 (최근10)</div><div class="v num">${avgAll != null ? avgAll.toFixed(1) : '-'}</div><div class="d">18홀 기준</div></div>
        <div class="k"><div class="l">베스트</div><div class="v num">${best ? total(best) : '-'}</div><div class="d">${best ? esc(best.course).slice(0, 8) : ''}</div></div>
        <div class="k"><div class="l">${year} 라운드</div><div class="v num">${thisYear}</div><div class="d">전체 ${all.length}</div></div>
      </div>
      ${last10.length >= 2 ? `<div class="panel"><div class="l"><span>최근 ${last10.length}라운드 타수</span><span>위로 갈수록 좋음</span></div>${lineChart(last10)}</div>` : ''}
      <div class="panel"><div class="l" style="margin-bottom:12px"><span>샷 지표 (최근 20라운드)</span></div><div class="bars">
        <div class="bar">페어웨이<div class="t"><i style="width:${pct(fwHit, fwN)}%"></i></div><b>${pct(fwHit, fwN)}%</b></div>
        <div class="bar">파 온<div class="t"><i style="width:${pct(gir, holes)}%"></i></div><b>${pct(gir, holes)}%</b></div>
        <div class="bar">평균 퍼팅<div class="t"><i style="width:${puttRounds ? Math.min(100, (puttSum / puttRounds) / 45 * 100) : 0}%"></i></div><b>${avgPutt}</b></div>
      </div></div>
      <div class="panel"><div class="l"><span>홀 결과 분포</span><span class="num">${holes}홀</span></div>
        <div class="dist">${Object.keys(DC).map(k => dist[k] ? `<span style="width:${pct(dist[k], holes)}%;background:${DC[k][1]}" title="${DC[k][0]}"></span>` : '').join('')}</div>
        <div class="legend">${Object.keys(DC).map(k => `<span><i style="background:${DC[k][1]}"></i>${DC[k][0]} ${pct(dist[k], holes)}%</span>`).join('')}</div></div>
      ${courses.length ? `<div class="sec"><div class="sec-h"><h2>골프장별</h2></div>
        <div class="tbl"><table><tr><th style="text-align:left">골프장</th><th>횟수</th><th>평균</th><th>베스트</th></tr>
        ${courses.map(c => `<tr><td style="text-align:left;font-family:var(--sans)">${esc(c.c)}</td><td>${c.n}</td><td>${c.avg.toFixed(1)}</td><td><b>${c.best}</b></td></tr>`).join('')}</table></div></div>` : ''}`;
  }

  // ---------- 화면: 앨범 ----------
  function vAlbum() {
    const list = [...photos.values()].sort((a, b) => {
      const ra = state.rounds.find(r => r.id === a.roundId), rb = state.rounds.find(r => r.id === b.roundId);
      return (rb ? rb.date : '').localeCompare(ra ? ra.date : '') || a.at - b.at;
    });
    const groups = [];
    list.forEach(p => {
      const r = state.rounds.find(x => x.id === p.roundId);
      const key = r ? r.id : 'none';
      let g = groups.find(x => x.key === key); if (!g) groups.push(g = { key, r, items: [] });
      g.items.push(p);
    });
    return `<div class="top"><h1>앨범</h1><span class="muted num">${list.length}장</span></div>
      ${groups.length ? groups.map(g => `<div class="sec"><div class="sec-h"><h2>${g.r ? esc(g.r.course) : '라운딩 없음'}</h2>${g.r ? `<a href="#round/${g.r.id}">${fmtDate(g.r.date, true)}</a>` : ''}</div>
          <div class="album">${g.items.map(p => `<button class="ph" data-ph="${p.id}"><img src="${p.data}" alt="" loading="lazy"></button>`).join('')}</div></div>`).join('')
        : `<div class="empty"><b>아직 사진이 없어요</b>라운딩 상세 화면에서 사진을 추가하면 골프장별로 모여요.</div>`}`;
  }
  function bindAlbum() { view.querySelectorAll('[data-ph]').forEach(b => b.addEventListener('click', () => lightbox(b.dataset.ph))); }

  // ---------- 화면: 내정보 ----------
  function vMe() {
    const nPh = photos.size;
    return `<div class="top"><h1>내정보</h1></div>
      <form class="form" id="pf">
        <div class="field"><label for="pname">이름</label><input id="pname" value="${esc(state.profile.name)}" placeholder="홈 화면 인사에 쓰여요"></div>
        <div class="field"><label for="phome">자주 가는 골프장</label><input id="phome" value="${esc(state.profile.homeCourse)}"></div>
        <button class="btn block" type="submit">저장</button>
      </form>
      <div class="sec"><div class="sec-h"><h2>데이터</h2></div>
        <div class="form" style="padding-top:0">
          <p class="muted" style="margin:0;line-height:1.6;font-size:12.5px">기록은 이 브라우저에만 저장돼요. 라운딩 ${state.rounds.length}개, 사진 ${nPh}장. 기기를 바꾸거나 브라우저 데이터를 지우기 전에 백업해 주세요.</p>
          <button class="btn ghost block" id="exp" type="button">백업 파일 저장 (.json)</button>
          <label class="btn ghost block">백업 파일 불러오기<input type="file" accept="application/json,.json" hidden id="imp"></label>
          ${state.rounds.some(r => r.sample) ? `<button class="btn ghost block" id="unseed" type="button">예시 데이터 지우기</button>` : ''}
          <button class="btn danger block" id="reset" type="button">모든 기록 지우기</button>
        </div></div>`;
  }
  function bindMe() {
    $('#pf').addEventListener('submit', e => { e.preventDefault(); state.profile.name = $('#pname').value.trim(); state.profile.homeCourse = $('#phome').value.trim(); save(); toast('저장했어요'); });
    $('#exp').addEventListener('click', () => {
      const data = JSON.stringify({ app: 'mygolf', v: 1, state, photos: [...photos.values()] });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
      a.download = `my-golf-backup-${todayStr()}.json`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    $('#imp').addEventListener('change', e => {
      const f = e.target.files[0]; if (!f) return;
      const fr = new FileReader();
      fr.onload = () => {
        try {
          const d = JSON.parse(fr.result); if (d.app !== 'mygolf') throw 0;
          state = Object.assign(emptyState(), d.state); save();
          [...photos.keys()].forEach(delPhoto); (d.photos || []).forEach(putPhoto);
          toast('백업을 불러왔어요'); render();
        } catch (err) { toast('내 골프 백업 파일이 아니에요'); }
      };
      fr.readAsText(f);
    });
    const un = $('#unseed');
    un && un.addEventListener('click', () => { state.rounds = state.rounds.filter(r => !r.sample); save(); toast('예시 데이터를 지웠어요'); render(); });
    const rs = $('#reset'); let armed = false;
    rs.addEventListener('click', () => {
      if (!armed) { armed = true; rs.textContent = '한 번 더 누르면 모두 지워져요'; return; }
      state = emptyState(); save(); [...photos.keys()].forEach(delPhoto); toast('모든 기록을 지웠어요'); location.hash = '#home';
    });
  }

  // ---------- 예시 데이터 ----------
  function seed() {
    const base = new Date(); const ds = off => { const d = new Date(base); d.setDate(d.getDate() + off); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
    const par = [4, 5, 3, 4, 4, 3, 5, 4, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4];
    const mk = (off, course, region, scores, players, weather) => {
      const r = blankRound();
      Object.assign(r, { id: uid(), sample: true, date: ds(off), course, region, players, weather, par: par.slice() });
      if (scores) {
        let seedN = scores; const rnd = () => (seedN = (seedN * 9301 + 49297) % 233280) / 233280;
        let target = scores;
        r.strokes = par.map(p => p + 1); // 보기 플레이 기준
        let cur = sum(r.strokes);
        while (cur !== target) { const i = Math.floor(rnd() * 18); const d = cur > target ? -1 : 1; const nv = r.strokes[i] + d; if (nv >= par[i] - 1 && nv <= par[i] + 3) { r.strokes[i] = nv; cur += d; } }
        r.putts = r.strokes.map(() => (rnd() < .2 ? 1 : rnd() < .8 ? 2 : 3));
        r.putts = r.putts.map((p, i) => Math.min(p, r.strokes[i] - 1));
        r.fir = par.map(p => p > 3 && rnd() < .55);
      }
      return r;
    };
    state.rounds.push(
      mk(5, '남서울CC', '경기 성남', null, ['아빠', '엄마', '형'], ''),
      mk(-2, '레이크사이드CC', '경기 용인', 87, ['아빠', '엄마', '형'], '맑음 12°C'),
      mk(-15, '남서울CC', '경기 성남', 89, ['형'], '흐림 15°C'),
      mk(-30, '스카이72', '인천 중구', 91, ['회사 동기'], '바람 강함'),
      mk(-44, '레이크사이드CC', '경기 용인', 86, ['아빠'], '맑음'),
      mk(-60, '베어크리크', '경기 포천', 93, ['아빠', '형'], '비 조금'),
      mk(-75, '레이크사이드CC', '경기 용인', 82, ['엄마'], '맑음 24°C'),
      mk(-90, '스카이72', '인천 중구', 90, ['형'], ''),
    );
    state.rounds[state.rounds.length - 8].tee = '07:12';
    state.rounds[state.rounds.length - 8].fee = 210000;
    save(); toast('예시 라운딩 8개를 넣었어요'); render();
  }

  // ---------- 라우터 ----------
  const routes = {
    home: [vHome, bindHome, 'home'], rounds: [vRounds, bindRounds, 'rounds'], round: [vRound, bindRound, 'rounds'],
    new: [() => vEdit(null), () => bindEdit(null), 'rounds'], edit: [vEdit, bindEdit, 'rounds'], score: [vScore, bindScore, 'rounds'],
    stats: [vStats, null, 'stats'], album: [vAlbum, bindAlbum, 'album'], me: [vMe, bindMe, 'me'],
  };
  function render() {
    const [name, arg] = (location.hash.slice(1) || 'home').split('/');
    const rt = routes[name] || routes.home;
    view.innerHTML = rt[0](arg);
    rt[1] && rt[1](arg);
    document.querySelectorAll('#tabbar a').forEach(a => a.classList.toggle('on', a.dataset.tab === rt[2]));
  }
  let lastRoute = '';
  window.addEventListener('hashchange', () => { render(); if (location.hash.split('/')[0] !== lastRoute) window.scrollTo(0, 0); lastRoute = location.hash.split('/')[0]; });

  openDB().then(loadPhotos).then(render);
})();
