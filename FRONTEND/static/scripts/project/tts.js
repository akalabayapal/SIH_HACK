/* =========================================================================
   Kab Tak – scripts/project/tts.js
   "Listen" support for the AI Project Analysis modal (project.html).

   Uses the browser's built-in Web Speech API (no API key, no server call).

   Languages: English, Hindi, Bengali, Urdu (the site's translation languages).

   How the language is chosen
   - The user's choice comes from translate.js: the "lang" cookie / the
     #languageSelector dropdown (en | hi | bn | ur).
   - The voice always follows the language of the text that is actually on
     screen (detected from its script), so speech can never mismatch the text.
   - If the analysis is not translated yet, Listen asks the user to wait a
     moment (translate.js re-translates the page every second).
   - Fallback to English: if the device has no voice for the chosen language,
     the script reads the English original that translate.js keeps in
     data-english, with an English voice, and shows a short notice.

   Other behaviour
   - Listen / Pause / Resume, Stop, and a speed control.
   - Long text is spoken in sentence-sized chunks (Chrome silently stops a
     single long utterance after ~15 seconds).
   - Stops automatically when the modal closes or the page is left.

   Expected markup (already in project.html):
     #tts-controls, #tts-toggle, #tts-stop, #tts-rate, #tts-status
   ========================================================================= */
(function () {
  'use strict';

  var synth = window.speechSynthesis;
  var controls = document.getElementById('tts-controls');
  var body = document.getElementById('analysis-body');
  var modalEl = document.getElementById('analysis-modal');
  if (!controls || !body) return;

  // Browser has no speech support: leave the controls hidden.
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return;

  var toggleBtn = document.getElementById('tts-toggle');
  var stopBtn = document.getElementById('tts-stop');
  var rateSel = document.getElementById('tts-rate');
  var statusEl = document.getElementById('tts-status');

  var ICON = {
    play: '<i class="bi bi-volume-up-fill me-1" aria-hidden="true"></i>',
    pause: '<i class="bi bi-pause-fill me-1" aria-hidden="true"></i>',
    resume: '<i class="bi bi-play-fill me-1" aria-hidden="true"></i>'
  };

  // Site language code (translate.js) -> speech locale
  var LOCALE = { en: 'en-IN', hi: 'hi-IN', bn: 'bn-IN', ur: 'ur-PK' };
  var NAME = { 'en-IN': 'English', 'hi-IN': 'Hindi', 'bn-IN': 'Bengali', 'ur-PK': 'Urdu' };

  // Same tag list translate.js walks, so "is it translated yet?" matches its logic
  var TRANSLATED_TAGS = 'p, i, h1, h2, h3, h4, h5, h6, li, span, label, button, a, dd, dt';

  var chunks = [];
  var index = 0;
  var session = 0;          // bumped on every start/stop so stale callbacks are ignored
  var state = 'idle';       // idle | speaking | paused
  var voices = [];
  var current = { lang: 'en-IN', voice: null };

  /* ---------- helpers ---------- */

  function loadVoices() { voices = synth.getVoices() || []; }
  loadVoices();
  if (synth.addEventListener) synth.addEventListener('voiceschanged', loadVoices);

  function setStatus(msg) { if (statusEl) statusEl.textContent = msg || ''; }

  function getCookie(name) {
    var value = '; ' + document.cookie;
    var parts = value.split('; ' + name + '=');
    return parts.length === 2 ? parts.pop().split(';').shift() : null;
  }

  // The language the user picked on the website ("en", "hi", "bn", "ur")
  function selectedCode() {
    var sel = document.getElementById('languageSelector');
    return (sel && sel.value) || getCookie('lang') || 'en';
  }

  // True while translate.js has not yet translated the analysis text
  function isTranslating() {
    if (typeof window.changeWebsiteLanguage !== 'function') return false; // translate.js not loaded
    var code = selectedCode();
    if (code === 'en') return false;
    var els = body.querySelectorAll(TRANSLATED_TAGS);
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.closest('[data-no-translate]')) continue;
      if (el.children.length || !el.textContent.trim()) continue;
      if (el.dataset.language !== code) return true;
    }
    return false;
  }

  function isReady() {
    // llm.js shows a spinner (or nothing) while the analysis is loading
    if (body.querySelector('.spinner-border, .spinner-grow')) return false;
    return body.innerText.replace(/\s+/g, ' ').trim().length > 20;
  }

  function refreshVisibility() {
    var ready = isReady();
    controls.hidden = !ready;
    if (!ready && state !== 'idle') stop();
  }

  // The English source text that translate.js stored on each element
  function hasEnglishOriginal() { return !!body.querySelector('[data-english]'); }

  function englishOriginalText() {
    var walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, null);
    var seen = [], parts = [];
    while (walker.nextNode()) {
      var node = walker.currentNode;
      var el = node.parentElement;
      var t = node.nodeValue.replace(/\s+/g, ' ').trim();
      if (!t) continue;
      if (el && el.dataset && el.dataset.english) {
        if (seen.indexOf(el) !== -1) continue;
        seen.push(el);
        t = el.dataset.english;
      }
      parts.push(t);
    }
    return parts.join('\n');
  }

  // Words for symbols that voices don't read well, per language
  var WORDS = {
    'en-IN': { rupees: 'rupees ', percent: ' percent' },
    'hi-IN': { rupees: '\u0930\u0941\u092A\u092F\u0947 ', percent: ' \u092A\u094D\u0930\u0924\u093F\u0936\u0924' },
    'bn-IN': { rupees: '\u099F\u09BE\u0995\u09BE ', percent: ' \u09B6\u09A4\u09BE\u0982\u09B6' },
    'ur-PK': { rupees: '\u0631\u0648\u067E\u06D2 ', percent: ' \u0641\u06CC\u0635\u062F' }
  };

  function cleanText(raw, lang) {
    var w = WORDS[lang] || WORDS['en-IN'];
    return raw
      .replace(/[*_#`>|]+/g, ' ')            // leftover markdown
      .replace(/\u20B9\s?/g, w.rupees)       // rupee sign is not read aloud by most voices
      .replace(/(\d)\s?%/g, '$1' + w.percent)
      .replace(/[\u2022\u25CF\u25AA\u2713\u2714]/g, '. ')  // bullets / ticks
      .replace(/\s*\n+\s*/g, '. ')           // line breaks become pauses
      .replace(/\.\s*\.+/g, '.')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  function count(text, re) { var m = text.match(re); return m ? m.length : 0; }

  // Decide the language by which script dominates the text (analysis text can
  // mix English terms into Hindi/Bengali/Urdu, so one stray word must not decide).
  function detectLang(text) {
    var counts = {
      'hi-IN': count(text, /[\u0900-\u097F]/g),   // Devanagari
      'bn-IN': count(text, /[\u0980-\u09FF]/g),   // Bengali
      'ur-PK': count(text, /[\u0600-\u06FF\u0750-\u077F]/g)  // Arabic script (Urdu)
    };
    var best = 'en-IN', bestN = count(text, /[A-Za-z]/g);
    Object.keys(counts).forEach(function (k) {
      if (counts[k] > bestN) { best = k; bestN = counts[k]; }
    });
    return best;
  }

  // Text is mostly letters from a script we do not support (e.g. a stale
  // Telugu choice from an older dropdown)
  function isUnsupportedScript(text) {
    var letters, latin = count(text, /[A-Za-z]/g);
    try { letters = count(text, /\p{L}/gu); } catch (e) { return false; }
    return letters > 0 && latin < letters * 0.5;
  }

  function pickVoice(lang) {
    var base = lang.split('-')[0].toLowerCase();
    var exact = null, loose = null;
    for (var i = 0; i < voices.length; i++) {
      var v = voices[i], vl = (v.lang || '').replace('_', '-').toLowerCase();
      if (vl === lang.toLowerCase() && !exact) exact = v;
      if (vl.split('-')[0] === base && !loose) loose = v;
    }
    return exact || loose || null;
  }

  // Split into sentence-sized chunks (<= ~200 chars) so no utterance runs long
  function makeChunks(text) {
    var sentences = text.match(/[^.!?\u0964\u0965\u06D4\u061F]+[.!?\u0964\u0965\u06D4\u061F]?/g) || [text];
    var out = [], cur = '';
    sentences.forEach(function (s) {
      s = s.trim();
      if (!s) return;
      if ((cur + ' ' + s).length > 200 && cur) { out.push(cur); cur = s; }
      else { cur = cur ? cur + ' ' + s : s; }
    });
    if (cur) out.push(cur);
    // Hard-split any single sentence that is still very long
    var final = [];
    out.forEach(function (c) {
      while (c.length > 240) {
        var cut = c.lastIndexOf(',', 240);
        if (cut < 80) cut = c.lastIndexOf(' ', 240);
        if (cut < 1) cut = 240;
        final.push(c.slice(0, cut + 1).trim());
        c = c.slice(cut + 1).trim();
      }
      if (c) final.push(c);
    });
    return final;
  }

  /* ---------- UI state ---------- */

  function render() {
    if (state === 'speaking') {
      toggleBtn.innerHTML = ICON.pause + 'Pause';
      toggleBtn.setAttribute('aria-label', 'Pause reading');
    } else if (state === 'paused') {
      toggleBtn.innerHTML = ICON.resume + 'Resume';
      toggleBtn.setAttribute('aria-label', 'Resume reading');
    } else {
      toggleBtn.innerHTML = ICON.play + 'Listen';
      toggleBtn.setAttribute('aria-label', 'Read the analysis aloud');
    }
    toggleBtn.setAttribute('aria-pressed', state === 'speaking' ? 'true' : 'false');
    stopBtn.hidden = state === 'idle';
  }

  /* ---------- playback ---------- */

  function speakFrom(i) {
    var mySession = session;
    if (i >= chunks.length) { finish(); return; }
    index = i;

    var u = new SpeechSynthesisUtterance(chunks[i]);
    u.lang = current.voice ? current.voice.lang : current.lang;
    if (current.voice) u.voice = current.voice;
    u.rate = parseFloat(rateSel.value) || 1;

    u.onend = function () {
      if (mySession !== session) return;
      speakFrom(i + 1);
    };
    u.onerror = function (e) {
      if (mySession !== session) return;
      if (e.error === 'interrupted' || e.error === 'canceled') return;
      setStatus('Sorry, speech playback failed on this device.');
      finish();
    };
    synth.speak(u);
  }

  function start() {
    if (isTranslating()) {
      setStatus('The analysis is still being translated. Try again in a moment.');
      return;
    }

    var raw = body.innerText;
    var chosen = LOCALE[selectedCode()] || 'en-IN';
    var lang = detectLang(raw);              // language of the text on screen
    var text = raw;
    var notice = '';
    var voice = pickVoice(lang);
    var useEnglish = false;

    if (lang !== 'en-IN' && !voice) {
      // Text is Hindi/Bengali/Urdu but the device has no voice for it
      useEnglish = true;
      notice = 'No ' + NAME[lang] + ' voice is installed on this device, so the English version is read instead.';
    } else if (lang === 'en-IN' && isUnsupportedScript(raw)) {
      useEnglish = true;
      notice = 'This language is not supported for speech, so the English version is read instead.';
    } else if (lang === 'en-IN' && chosen !== 'en-IN') {
      notice = 'The analysis is not available in ' + NAME[chosen] + ', so it is read in English.';
    }

    if (useEnglish) {
      lang = 'en-IN';
      voice = pickVoice('en-IN');
      if (hasEnglishOriginal()) {
        text = englishOriginalText();
      } else {
        notice = notice.replace(/, so the English version is read instead\./, '. The default English voice is used and pronunciation may be poor.');
      }
    }

    text = cleanText(text, lang);
    if (!text) return;

    synth.cancel();
    session++;
    chunks = makeChunks(text);
    current = { lang: lang, voice: voice };
    state = 'speaking';
    setStatus(notice);
    render();
    speakFrom(0);
  }

  function finish() {
    state = 'idle';
    index = 0;
    render();
  }

  function stop() {
    session++;              // invalidate pending callbacks
    synth.cancel();
    setStatus('');
    finish();
  }

  function pause() {
    synth.pause();
    state = 'paused';
    render();
  }

  function resume() {
    synth.resume();
    state = 'speaking';
    render();
  }

  /* ---------- events ---------- */

  toggleBtn.addEventListener('click', function () {
    if (state === 'idle') start();
    else if (state === 'speaking') pause();
    else resume();
  });

  stopBtn.addEventListener('click', stop);

  // Changing speed mid-speech restarts the current chunk at the new rate
  rateSel.addEventListener('change', function () {
    if (state === 'idle') return;
    var resumeAt = index;
    session++;
    synth.cancel();
    state = 'speaking';
    render();
    speakFrom(resumeAt);
  });

  // Show the controls only when the analysis has actually loaded
  new MutationObserver(refreshVisibility).observe(body, { childList: true, subtree: true, characterData: true });
  refreshVisibility();

  // Never keep talking after the modal is closed or the page is left
  if (modalEl) modalEl.addEventListener('hide.bs.modal', stop);
  window.addEventListener('pagehide', function () { synth.cancel(); });
  window.addEventListener('beforeunload', function () { synth.cancel(); });

  render();
})();