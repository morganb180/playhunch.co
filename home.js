// playhunch.co home page.
// An adapted First Night (onboard.js) plays by itself in the phone; the invite form sits beside it from the first second.
// QA: ?at=1..5 starts at that beat (then plays on), ?still=1 freezes the given beat fully settled with no animation,
//     ?done=1 shows the success state (beat 5, stamped), ?reduced=1 forces reduced motion.
(function () {
  'use strict';
  const q = new URLSearchParams(location.search);
  const ART = '/art/onboard/', AUD = '/audio/', COVER = '/art/sleeper-cover.jpg';
  const reduced = q.has('reduced') || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DONE = q.has('done');
  const STILL = q.has('still') || DONE;
  const AT = Math.max(1, Math.min(5, Math.round(+q.get('at') || (DONE ? 5 : 1))));
  const mobile = matchMedia('(max-width: 899px)');

  // Adds the address to the invite list (Supabase function public.request_invite; source in the app repo,
  // supabase/migrations/20261124000000_invite_requests.sql). The key is the publishable one, public by design.
  // ?mock=1 skips the network call (for testing the page without adding to the list).
  const API = 'https://lorbhcccaputunphfica.supabase.co/rest/v1/rpc/request_invite', KEY = 'sb_publishable_6Nft7j70DYtnXw9FAa0stw_znBOpCLs';
  window.HUNCH_INVITE = function (email) {
    if (q.has('mock')) return new Promise((res) => setTimeout(res, 600));
    return fetch(API, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_email: email, p_source: 'home' }) })
      .then((r) => { if (!r.ok) throw new Error('invite ' + r.status); });
  };

  const $ = (id) => document.getElementById(id);
  const stage = $('stage'), platesEl = $('plates'), ui = $('ui'), prog = $('prog'), replayBtn = $('replay'), sndBtn = $('snd'), ask = $('ask');
  const slot = $('slot'), phone = $('phone'), col = document.querySelector('.col');
  const form = $('invite'), input = $('email'), err = $('err'), ok = $('ok');

  // ---------------------------------------------------------------- layout
  // Desktop: scale the 417 x 876 phone to the window. Mobile: measure the dock so captions and the folder sit above it.
  function layout() {
    if (mobile.matches) {
      phone.style.transform = ''; slot.style.width = slot.style.height = '';
      stage.style.setProperty('--dock', col.offsetHeight + 'px');
    } else {
      const s = Math.min(1, (innerHeight - 56) / 876);
      phone.style.transform = s < 1 ? `scale(${s.toFixed(4)})` : '';
      slot.style.width = (417 * s).toFixed(1) + 'px'; slot.style.height = (876 * s).toFixed(1) + 'px';
      stage.style.setProperty('--dock', '0px');
    }
    plates.forEach(place);
  }
  if (window.ResizeObserver) new ResizeObserver(layout).observe(col);
  addEventListener('resize', layout);

  // ---------------------------------------------------------------- stills
  const imgs = {};
  function load(name) {
    if (imgs[name]) return imgs[name];
    return (imgs[name] = new Promise((res) => {
      const im = new Image(); let done = false;
      const fin = (v) => { if (!done) { done = true; res(v); } };
      im.onload = () => fin(im); im.onerror = () => fin(null);
      setTimeout(() => fin(im.naturalWidth ? im : null), 3000);
      im.src = ART + 'fn_' + name + '.jpg';
    }));
  }
  ['match', 'corridor', 'door', 'knock', 'file'].forEach(load);
  new Image().src = COVER;

  // A ragged brush edge for the ink wipe (onboard.js inkEdge, deterministic).
  function inkEdge() {
    let d = 'M0 0', seed = 1777; const n = 36;
    for (let i = 0; i <= n; i++) { seed = (seed * 9301 + 49297) % 233280; d += ` L${((i / n) * 100).toFixed(2)} ${(10 + (seed / 233280) * 28).toFixed(1)}`; }
    d += ' L100 0 Z';
    const e = document.createElement('div'); e.className = 'edge';
    e.innerHTML = `<svg viewBox="0 0 100 40" preserveAspectRatio="none"><path d="${d}"/></svg>`;
    return e;
  }

  // Door glass, as fractions of fn_door.jpg. HUNCH sits on an arc at the top of the pane; no name yet.
  const GLASS = { x: 0.175, y: 0.235, w: 0.655, h: 0.5 };
  function lettering() {
    const g = document.createElement('div'); g.className = 'glass';
    Object.assign(g.style, { left: GLASS.x * 100 + '%', top: GLASS.y * 100 + '%', width: GLASS.w * 100 + '%', height: GLASS.h * 100 + '%' });
    g.innerHTML = '<svg class="hunch" viewBox="0 0 100 34"><path id="arc" d="M5 27 Q50 20 95 27" fill="none"/><text font-size="25" text-anchor="middle" textLength="88" lengthAdjust="spacingAndGlyphs"><textPath href="#arc" startOffset="50%">HUNCH</textPath></text></svg><i class="rule"></i>';
    return { el: g, show(now) { g.classList.toggle('instant', !!now); void g.offsetWidth; g.classList.add('on'); } };
  }

  // ---------------------------------------------------------------- the stage
  let plates = [], cur = null, gen = 0, beat = 0, resting = false;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function dims(sh) {
    const W = stage.clientWidth, H = stage.clientHeight, im = sh.img;
    const ar = im && im.naturalWidth ? im.naturalWidth / im.naturalHeight : 800 / 1440;
    let pw, ph; if (W / H > ar) { pw = W; ph = W / ar; } else { ph = H; pw = H * ar; }
    return { x: (W - pw) / 2, y: (H - ph) / 2, w: pw, h: ph };
  }
  function place(sh) {
    if (!sh.plate.isConnected) return;
    const d = dims(sh), s = sh.plate.style;
    s.left = d.x.toFixed(2) + 'px'; s.top = d.y.toFixed(2) + 'px'; s.width = d.w.toFixed(2) + 'px'; s.height = d.h.toFixed(2) + 'px';
  }

  // Puts a still on stage. o: { in: 'cut'|'fade'|'wipe', dur, from, to, push, focal, letter, still, hold (ms the beat lasts) }
  async function show(name, o, g) {
    const im = await load(name);
    if (g !== gen) return null;
    const prev = cur;
    const sh = { name, img: im };
    const wrap = document.createElement('div'); wrap.className = 'wrap';
    const clip = document.createElement('div'); clip.className = 'clip';
    const inner = document.createElement('div'); inner.className = 'inner';
    const plate = document.createElement('div'); plate.className = 'plate';
    Object.assign(sh, { wrap, inner, plate });
    if (im) { const i = document.createElement('img'); i.src = im.src; i.alt = ''; i.draggable = false; plate.appendChild(i); }
    if (o.letter) { sh.lett = lettering(); plate.appendChild(sh.lett.el); }
    inner.appendChild(plate); clip.appendChild(inner); wrap.appendChild(clip);
    platesEl.appendChild(wrap); plates.push(sh); place(sh);
    const fo = o.focal || [0.5, 0.5];
    plate.style.transformOrigin = `${fo[0] * 100}% ${fo[1] * 100}%`;
    const from = o.from == null ? 1 : o.from, to = o.to == null ? from : o.to;
    if (o.still || reduced) {
      // Settled: where the push would be when the beat hands over.
      const k = reduced ? 0 : Math.min(1, (o.hold || 0) / (o.push || 8000));
      const s = from + (to - from) * k;
      if (s !== 1) plate.style.transform = `scale(${s.toFixed(4)})`;
    } else if (to !== from) {
      plate.animate([{ transform: `scale(${from})` }, { transform: `scale(${to})` }], { duration: o.push || 8000, easing: 'linear', fill: 'forwards' });
    }
    cur = sh;
    const drop = () => { if (prev && prev !== sh) { prev.wrap.remove(); plates = plates.filter((p) => p !== prev); } };
    let kind = o.in || 'cut';
    const dur = o.dur == null ? 520 : o.dur;
    if (o.still) kind = 'cut';
    else if ((!prev || reduced) && kind === 'wipe') kind = 'fade';
    if (kind === 'cut' || !dur) { drop(); return sh; }
    if (kind === 'fade') {
      const d = reduced ? Math.min(dur, 400) : dur;
      wrap.animate([{ opacity: 0 }, { opacity: 1 }], { duration: d, easing: 'ease-out' });
      await sleep(d); drop(); return sh;
    }
    // Wipe: the new still rides up behind a ragged ink edge; the image itself stays put.
    const H = stage.clientHeight, ease = 'cubic-bezier(.55,.05,.35,1)', edge = inkEdge();
    wrap.appendChild(edge);
    wrap.animate([{ transform: `translate3d(0,${H}px,0)` }, { transform: 'translate3d(0,0,0)' }], { duration: dur, easing: ease });
    inner.animate([{ transform: `translate3d(0,${-H}px,0)` }, { transform: 'translate3d(0,0,0)' }], { duration: dur, easing: ease });
    edge.animate([{ transform: 'translate3d(0,0,0)' }, { transform: 'translate3d(0,-40px,0)' }], { duration: dur, easing: ease, fill: 'forwards' });
    await sleep(dur); edge.remove(); drop(); return sh;
  }

  // Leaves only the current still, snapped to the end of any transition; clears captions and the file.
  function tidy() {
    plates.filter((p) => p !== cur).forEach((p) => p.wrap.remove());
    plates = cur ? [cur] : [];
    if (cur) {
      [cur.wrap, cur.inner].forEach((el) => el.getAnimations().forEach((a) => a.finish()));
      cur.wrap.querySelectorAll('.edge').forEach((e) => e.remove());
    }
    stage.querySelectorAll('.flashl').forEach((e) => e.remove());
    ui.innerHTML = '';
    col.classList.remove('capt');
    ask.classList.remove('on');
    replayBtn.classList.remove('on');
  }

  function caption(lines, still) {
    const h = document.createElement('div'); h.className = 'hold' + (still || reduced ? '' : ' in');
    const say = document.createElement('div'); say.className = 'say';
    lines.forEach((t, i) => { const p = document.createElement('p'); if (!still && !reduced) { p.className = 'rise'; p.style.setProperty('--i', i); } p.textContent = t; say.appendChild(p); });
    h.appendChild(say); ui.appendChild(h);
    col.classList.add('capt');
  }

  // Progress segments: earlier beats full, the current one fills over its length.
  const segs = [...prog.children];
  function progress(n, ms, still) {
    segs.forEach((s, i) => {
      const b = s.firstElementChild; b.getAnimations().forEach((a) => a.cancel());
      s.classList.toggle('full', i < n - 1 || (i === n - 1 && (still || reduced)));
      if (i === n - 1 && !still && !reduced) b.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: ms, easing: 'linear', fill: 'forwards' });
    });
  }

  // ---------------------------------------------------------------- beats
  const LEN = { 1: 1500, 2: 1600, 3: 3900, 4: 3900, 5: 2300 };

  async function beat1(g, still) {
    if (still) { await show('match', { in: 'cut', from: 1, to: 1.07, push: 2600, hold: 1000, focal: [0.5, 0.6], still }, g); return; }
    if (cur) { cur.wrap.remove(); plates = plates.filter((p) => p !== cur); cur = null; }
    if (sound.on) sound.match();
    await sleep(450); if (g !== gen) return;
    const fl = document.createElement('div'); fl.className = 'flashl'; stage.appendChild(fl);
    await show('match', { in: 'cut', from: 1, to: 1.07, push: 2600, focal: [0.5, 0.6] }, g); if (g !== gen) return;
    fl.animate([{ opacity: reduced ? 0.4 : 0.95 }, { opacity: 0 }], { duration: reduced ? 300 : 420, easing: 'ease-out', fill: 'forwards' });
    setTimeout(() => fl.remove(), 460);
    await sleep(LEN[1] - 450);
  }

  async function beat2(g, still) {
    await show('corridor', { in: 'wipe', dur: 520, from: 1, to: 1.24, push: 2600, hold: 1600, focal: [0.5, 0.36], still }, g);
    if (!still) await sleep(LEN[2] - 520);
  }

  const L3 = ['This office is yours.', 'Your name isn’t on the door yet.'];
  async function beat3(g, still) {
    const sh = await show('door', { in: 'wipe', dur: 620, from: 1, to: 1.07, push: 16000, hold: 3900, focal: [0.5, 0.4], letter: true, still }, g);
    if (!sh || g !== gen) return;
    if (still) { sh.lett.show(true); caption(L3, true); return; }
    await sleep(reduced ? 0 : 320); if (g !== gen) return;
    sh.lett.show(reduced);
    await sleep(reduced ? 300 : 900); if (g !== gen) return;
    caption(L3);
    await sleep(LEN[3] - 620 - 320 - 900);
  }

  const L4 = ['A new case comes under your door every morning.'];
  async function beat4(g, still) {
    const sh = await show('knock', { in: 'fade', dur: 700, from: 1.02, to: 1.09, push: 14000, hold: 3900, focal: [0.7, 0.45], still }, g);
    if (!sh || g !== gen) return;
    if (still) { caption(L4, true); return; }
    await sleep(reduced ? 200 : 500); if (g !== gen) return;
    for (let i = 0; i < 3; i++) {
      if (!reduced) sh.wrap.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.016)', offset: 0.25 }, { transform: 'scale(1)' }], { duration: 200, easing: 'ease-out' });
      await sleep(260); if (g !== gen) return;
    }
    await sleep(300); if (g !== gen) return;
    caption(L4);
    await sleep(LEN[4] - 700 - 500 - 780 - 300);
  }

  const SLIP = ['A new case every morning.', 'Question the suspects and follow the leads you trust.', 'You’re on the clock, so you can’t chase them all.', 'When you’re ready, name who did it.'];
  let fileEls = null;
  async function beat5(g, still) {
    const sh = await show('file', { in: 'fade', dur: 600, from: 1, to: 1.05, push: 12000, hold: 6000, focal: [0.5, 0.55], still }, g);
    if (!sh || g !== gen) return;
    const wrap = document.createElement('div'); wrap.className = 'file';
    wrap.innerHTML = `<div class="shade"></div>
      <div class="folder"><div class="tab"><span>No. 001</span></div>
        <div class="fbody">
          <div class="cover"><img src="${COVER}" alt=""></div>
          <svg class="clipsvg" viewBox="0 0 26 70"><path d="M17 6 V50 a7 7 0 0 1 -14 0 V13 a9 9 0 0 1 18 0 V44" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <div class="slip">${SLIP.map((l) => `<p>${l}</p>`).join('')}</div>
        </div>
        <svg class="cord" viewBox="0 0 360 60" preserveAspectRatio="none"><path d="M-4 22 C60 28 120 18 180 24 S300 26 364 20" fill="none" stroke="#a3261b" stroke-width="3.2" stroke-linecap="round"/><path d="M-4 27 C60 33 120 23 180 29 S300 31 364 25" fill="none" stroke="#7d1b13" stroke-width="1.2" stroke-linecap="round" opacity=".6"/><path d="M180 24 C166 8 148 10 156 26 C160 34 176 30 180 24 M180 24 C196 8 214 12 206 28 C202 36 186 30 180 24 M180 26 C176 40 168 50 160 56 M182 26 C188 40 196 50 206 55" fill="none" stroke="#a3261b" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>`;
    ui.appendChild(wrap);
    const folder = wrap.querySelector('.folder'), cov = wrap.querySelector('.cover'), clip = wrap.querySelector('.clipsvg'), slip = wrap.querySelector('.slip');
    fileEls = { slip, body: wrap.querySelector('.fbody') };
    if (!still && !reduced) {
      [cov, clip, slip].forEach((x) => { x.style.opacity = 0; });
      folder.animate([{ transform: 'translate3d(0,70%,0) rotate(2.2deg)', opacity: 0 }, { transform: 'translate3d(0,-1.2%,0) rotate(-.9deg)', opacity: 1, offset: 0.78 }, { transform: 'translate3d(0,0,0) rotate(-.6deg)', opacity: 1 }], { duration: 760, easing: 'cubic-bezier(.2,.75,.25,1)', fill: 'both' });
      await sleep(620); if (g !== gen) return;
      [cov, clip].forEach((x) => { x.style.opacity = ''; x.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 280 }); });
      await sleep(520); if (g !== gen) return;
      slip.style.opacity = '';
      slip.animate([{ transform: 'translate3d(0,-26px,0) rotate(-3.2deg)', opacity: 0 }, { transform: 'translate3d(0,0,0) rotate(-1.5deg)', opacity: 1 }], { duration: 340, easing: 'cubic-bezier(.3,.8,.3,1)', fill: 'both' });
      await sleep(700); if (g !== gen) return;
    } else if (!still) {
      wrap.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, easing: 'ease-out' });
      await sleep(400); if (g !== gen) return;
    }
    if (!invited) ask.classList.add('on');
    await sleep(still || reduced ? 0 : 300);
  }

  const BEATS = [null, beat1, beat2, beat3, beat4, beat5];

  async function play(n, still) {
    const g = ++gen; beat = n; resting = false;
    tidy();
    progress(n, LEN[n], still);
    await BEATS[n](g, still);
    if (g !== gen) return;
    if (n < 5) { if (!still) play(n + 1); return; }
    resting = true;
    replayBtn.classList.add('on');
    if (invited) stamp(!still);
  }

  // Tapping the screen moves on: to the next beat, or (inside beat 5) straight to its settled state.
  stage.addEventListener('click', () => {
    if (resting) return;
    if (beat < 5) play(beat + 1); else play(5, true);
  });
  replayBtn.addEventListener('click', () => { play(1); });

  // ---------------------------------------------------------------- sound (off until asked)
  const sound = (function () {
    let ctx = null, music = null; const bufs = {};
    const get = (name) => bufs[name] || (bufs[name] = fetch(AUD + name + '.mp3').then((r) => (r.ok ? r.arrayBuffer() : Promise.reject())).then((b) => new Promise((res, rej) => ctx.decodeAudioData(b, res, rej))).catch(() => null));
    function play(buf, o) {
      if (!ctx || !buf) return null;
      const src = ctx.createBufferSource(), gn = ctx.createGain(), t = ctx.currentTime, vol = o.gain;
      src.buffer = buf; src.loop = !!o.loop;
      if (o.fadeIn) { gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(vol, t + o.fadeIn / 1000); } else gn.gain.setValueAtTime(vol, t);
      src.connect(gn); gn.connect(ctx.destination); src.start(t);
      return { stop() { try { const n = ctx.currentTime; gn.gain.cancelScheduledValues(n); gn.gain.setValueAtTime(gn.gain.value, n); gn.gain.linearRampToValueAtTime(0.0001, n + 0.4); src.stop(n + 0.45); } catch (e) {} } };
    }
    const S = {
      on: false,
      set(v) {
        S.on = v;
        if (v) {
          if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; ctx = new AC(); }
          if (ctx.state === 'suspended') ctx.resume();
          get('match');
          get('music').then((b) => { if (S.on && !music) music = play(b, { loop: true, gain: 0.2, fadeIn: 1600 }); });
        } else if (music) { music.stop(); music = null; }
      },
      match() { get('match').then((b) => play(b, { gain: 0.38 })); },
    };
    return S;
  })();
  sndBtn.addEventListener('click', () => {
    const v = sndBtn.getAttribute('aria-pressed') !== 'true';
    sndBtn.setAttribute('aria-pressed', String(v));
    sound.set(v);
  });

  // ---------------------------------------------------------------- the invite
  let invited = false;
  const valid = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) && input.checkValidity();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = input.value.trim();
    if (!valid(email)) {
      err.textContent = 'That email doesn’t look right.';
      input.setAttribute('aria-invalid', 'true'); input.focus();
      return;
    }
    err.textContent = ''; input.removeAttribute('aria-invalid');
    const btn = form.querySelector('button'); btn.disabled = true; input.readOnly = true;
    try { await window.HUNCH_INVITE(email); } catch (x) {
      btn.disabled = false; input.readOnly = false;
      err.textContent = 'That didn’t go through. Please try again.';
      return;
    }
    succeed(email, true);
  });
  input.addEventListener('input', () => { if (input.getAttribute('aria-invalid')) { input.removeAttribute('aria-invalid'); err.textContent = ''; } });

  function succeed(email, animate) {
    invited = true;
    $('ok-email').textContent = email;
    form.hidden = true; ok.hidden = false;
    if (animate) ok.querySelector('h2').focus();
    ask.classList.remove('on');
    layout();
    if (beat === 5 && resting) stamp(animate && !reduced);
    else play(5, !animate);
  }
  function stamp(animate) {
    // Struck on the folder just under the slip, clear of the typed lines.
    if (!fileEls || fileEls.body.querySelector('.stamp')) return;
    const s = document.createElement('div'); s.className = 'stamp' + (animate ? ' hit' : ''); s.textContent = 'ON THE LIST';
    s.style.top = (fileEls.slip.offsetTop + fileEls.slip.offsetHeight + 14) + 'px';
    fileEls.body.appendChild(s);
  }

  // The red capsule in the phone points at the form.
  ask.addEventListener('click', (e) => {
    e.stopPropagation();
    input.focus();
    form.classList.remove('flash'); void form.offsetWidth; form.classList.add('flash');
  });

  // ---------------------------------------------------------------- go
  layout();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
  if (DONE) {
    beat = 5;
    succeed('you@example.com', false);
  } else play(AT, STILL);
})();
