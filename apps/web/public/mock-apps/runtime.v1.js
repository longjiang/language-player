/**
 * Mock app runtime (SPEC-095, ADR-0045) — protocol v1.
 *
 * Every mock app includes this with a plain `<script src>` tag, so an app only
 * writes what makes it unique: its own HTML/CSS, a dataset, and its goals. This
 * file owns everything cross-cutting — the bridge, help mode, token rendering,
 * hinting, and completion reporting — which is what stops each app from
 * re-implementing them and drifting.
 *
 * Plain ES5-compatible JS on purpose: it runs inside a sandboxed document with no
 * build step, and a mock app may be authored by hand or generated.
 *
 * Usage:
 *   MockApp.define({
 *     id: 'railway-12306',
 *     data: { ... },
 *     goals: [{ id, prompt, accept: (el, data) => boolean }],
 *     mount(root, data) { ... },
 *   });
 *
 * A goal is satisfied by a tap on an element it accepts. Add `all: true` for a goal
 * that asks the student to select a *set* — "选择所有复兴号车次": the goal then
 * completes only once every element its `candidates` names has been tapped, and it
 * reports those picks joined by `join` (default `、`, the separator a `multiple`
 * blank stores its picks with — see PICK_SEPARATOR in `@langplayer/textbooks`).
 */
(function () {
  'use strict';

  var VERSION = 1;
  var selected = null; // currently highlighted hint element
  var helpMode = false;
  var tokenMap = {}; // text -> tokens, filled by the host
  var spec = null;
  var doneGoals = {};
  /** goalId -> the values picked so far, for a goal that selects a set. */
  var picked = {};
  var rootEl = null;

  function post(message) {
    var payload = { v: VERSION, type: message.type, payload: message.payload || {} };
    try {
      // Sandboxed frames have an opaque origin, so target '*' is required; the
      // host still validates every message it receives.
      parent.postMessage(payload, '*');
    } catch (e) {
      /* host gone */
    }
  }

  // ── Goal bookkeeping ───────────────────────────────────────────────────

  function goalList() {
    return (spec && spec.goals) || [];
  }

  function unmetGoals() {
    return goalList().filter(function (g) {
      return !doneGoals[g.id];
    });
  }

  function reportProgress() {
    post({
      type: 'progress',
      payload: { done: Object.keys(doneGoals), total: goalList().length },
    });
  }

  /** What this element contributes to `goal`: the app's own `answer` for it. */
  function valueOf(goal, el) {
    var value = typeof goal.answer === 'function' ? goal.answer(el, spec.data) : (goal.answer || '');
    return String(value === null || value === undefined ? '' : value).trim();
  }

  /** The elements a goal still wants: the candidates it names, minus what is picked. */
  function outstandingPicks(goal) {
    var candidates = [];
    try {
      candidates = (goal.candidates ? goal.candidates(spec.data) : []) || [];
    } catch (e) {
      candidates = [];
    }
    if (!goal.all) return candidates;
    var values = picked[goal.id] || [];
    return candidates.filter(function (el) {
      return values.indexOf(valueOf(goal, el)) === -1;
    });
  }

  function markPicked(el) {
    // The app's own `.done` class, so a pick is visible where it was made.
    if (el && el.classList) el.classList.add('done');
  }

  function completeGoal(goal, answer) {
    doneGoals[goal.id] = true;
    post({ type: 'complete', payload: { goalId: goal.id, answer: String(answer || '').trim() } });
    reportProgress();
    reportHeight();
    clearHint();
  }

  /**
   * Try to satisfy goals from a user interaction with `el`.
   *
   * **Every** goal the element satisfies is credited, not just the first unmet one.
   * A tap can answer more than one question — G49 is the fastest train *and* a 复兴号 —
   * and crediting only the first meant a set goal silently lost that member: the tap
   * went to the single-answer goal, `outstandingPicks` still listed G49, and no amount
   * of tapping the rest could ever complete the set.
   */
  function evaluate(el) {
    var remaining = unmetGoals();
    var credited = false;
    for (var i = 0; i < remaining.length; i++) {
      var goal = remaining[i];
      var ok = false;
      try {
        ok = goal.accept ? !!goal.accept(el, spec.data) : false;
      } catch (e) {
        ok = false;
      }
      if (!ok) continue;
      credited = true;

      var value = valueOf(goal, el);

      if (goal.all) {
        // A set is picked one element at a time, so the goal is not satisfied by the
        // first tap the way a single-answer goal is. Reporting `complete` here would
        // hand the host one train for a question whose answer is four — which is
        // exactly what a `multiple` blank is graded against.
        var values = picked[goal.id] || (picked[goal.id] = []);
        if (value && values.indexOf(value) === -1) values.push(value);
        if (outstandingPicks(goal).length) {
          // Mid-set: the pick is real, the goal is not met yet.
          reportProgress();
          continue;
        }
        completeGoal(goal, values.join(goal.join || '、'));
        continue;
      }

      completeGoal(goal, value);
    }
    if (credited) {
      markPicked(el);
      reportHeight();
    }
    return credited;
  }

  // ── Hint ───────────────────────────────────────────────────────────────

  function clearHint() {
    if (selected && selected.classList) {
      selected.classList.remove('mock-hint');
    }
    selected = null;
  }

  /**
   * Highlight a candidate for the first unmet goal.
   *
   * The hint is not a separate authored artefact: it reads the goal list in
   * order and asks the first unmet goal which elements would satisfy it. That is
   * why each goal must be able to name its own candidates.
   */
  function showHint() {
    clearHint();
    var remaining = unmetGoals();
    if (!remaining.length) return;
    var goal = remaining[0];
    // Several candidates are legitimate ("any train with a sleeper", and a set goal
    // has several by definition), so highlight them all rather than pretending there
    // is one right answer. A set goal only points at what is still missing.
    var candidates = outstandingPicks(goal);
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      if (el && el.classList) el.classList.add('mock-hint');
    }
    selected = candidates[0] || null;
  }

  // ── Help mode ──────────────────────────────────────────────────────────

  var TOKEN_ATTR = 'data-mock-token';
  var SKIP_ATTR = 'data-no-tokenize';

  /** Text nodes eligible for tokenization, in document order. */
  function tokenizableNodes() {
    if (!rootEl) return [];
    var walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        var text = (node.nodeValue || '').trim();
        if (!text) return NodeFilter.FILTER_REJECT;
        // Numbers, prices, times and train numbers are not vocabulary.
        if (!/[\u3400-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/.test(text)) return NodeFilter.FILTER_REJECT;
        var parent = node.parentNode;
        while (parent && parent !== rootEl) {
          if (parent.getAttribute && parent.getAttribute(SKIP_ATTR) !== null) {
            return NodeFilter.FILTER_REJECT;
          }
          if (parent.getAttribute && parent.getAttribute(TOKEN_ATTR) !== null) {
            return NodeFilter.FILTER_REJECT;
          }
          parent = parent.parentNode;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    var out = [];
    var n;
    while ((n = walker.nextNode())) out.push(n);
    return out;
  }

  function enterHelpMode() {
    var nodes = tokenizableNodes();
    var texts = [];
    for (var i = 0; i < nodes.length; i++) {
      var t = (nodes[i].nodeValue || '').trim();
      if (t && texts.indexOf(t) === -1) texts.push(t);
    }
    if (!texts.length) return;
    pendingNodes = nodes;
    // One batch request for the whole app, not one per node.
    post({ type: 'tokenize', payload: { texts: texts } });
  }

  var pendingNodes = [];
  var pendingTexts = [];

  function applyTokens(map) {
    tokenMap = map || {};
    for (var i = 0; i < pendingNodes.length; i++) {
      var node = pendingNodes[i];
      var text = (node.nodeValue || '').trim();
      var tokens = tokenMap[text];
      if (!tokens || !tokens.length) continue;
      node.__mockOriginal = node.nodeValue;
      var frag = document.createDocumentFragment();
      for (var j = 0; j < tokens.length; j++) {
        var tok = tokens[j];
        if (!tok.text) continue;
        if (!tok.lemmas || !tok.lemmas.length) {
          frag.appendChild(document.createTextNode(tok.text));
          continue;
        }
        var span = document.createElement('span');
        span.setAttribute(TOKEN_ATTR, '1');
        span.textContent = tok.text;
        span.style.cursor = 'pointer';
        (function (token) {
          span.addEventListener('click', function (ev) {
            ev.stopPropagation();
            var rect = span.getBoundingClientRect();
            post({
              type: 'lookup',
              payload: {
                text: token.text,
                lemma: token.lemmas[0] && token.lemmas[0].lemma,
                rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
                sentence: text,
              },
            });
          });
        })(tok);
        frag.appendChild(span);
      }
      node.parentNode.replaceChild(frag, node);
    }
    pendingNodes = [];
    pendingTexts = [];
  }

  function exitHelpMode() {
    if (!rootEl) return;
    var spans = rootEl.querySelectorAll('[' + TOKEN_ATTR + ']');
    for (var i = 0; i < spans.length; i++) {
      var span = spans[i];
      var textNode = document.createTextNode(span.textContent);
      span.parentNode.replaceChild(textNode, span);
    }
    rootEl.normalize();
  }

  // ── Height reporting ───────────────────────────────────────────────────

  /**
   * Tell the host how tall the content is, so the frame can size to it.
   *
   * Without this a long list (the 12306 results, say) is clipped inside a fixed
   * frame. ResizeObserver covers dynamic content; the scrollHeight fallback
   * covers documents where it is unavailable.
   */
  function reportHeight() {
    var height = 0;
    if (document.body) height = document.body.scrollHeight;
    if (document.documentElement && document.documentElement.scrollHeight > height) {
      height = document.documentElement.scrollHeight;
    }
    if (height > 0) post({ type: 'resize', payload: { height: height } });
  }

  // ── Wiring ─────────────────────────────────────────────────────────────

  function onMessage(event) {
    var msg = event.data;
    if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return;
    switch (msg.type) {
      case 'init':
        helpMode = !!(msg.payload && msg.payload.helpMode);
        if (helpMode) enterHelpMode();
        break;
      case 'help-mode':
        var on = !!(msg.payload && msg.payload.on);
        if (on === helpMode) break;
        helpMode = on;
        if (on) enterHelpMode();
        else exitHelpMode();
        break;
      case 'tokens':
        if (helpMode) applyTokens(msg.payload && msg.payload.map);
        break;
      case 'hint':
        showHint();
        break;
      case 'reset':
        clearHint();
        doneGoals = {};
        picked = {};
        if (spec && spec.reset) spec.reset(spec.data);
        reportProgress();
        break;
      default:
        break;
    }
  }

  /** Delegate clicks so an app never wires per-element handlers by hand. */
  function onClick(event) {
    if (helpMode) return; // in help mode a tap is a dictionary lookup
    var el = event.target;
    while (el && el !== rootEl) {
      if (el.getAttribute && el.getAttribute('data-mock-target') !== null) {
        evaluate(el);
        return;
      }
      el = el.parentNode;
    }
  }

  var MockApp = {
    version: VERSION,

    define: function (definition) {
      spec = definition || {};
      rootEl = document.getElementById('app') || document.body;
      window.addEventListener('message', onMessage);
      document.addEventListener('click', onClick, true);
      if (spec.mount) spec.mount(rootEl, spec.data);
      post({
        type: 'ready',
        payload: {
          app: spec.id || 'unknown',
          version: String(MockApp.version),
          goals: goalList().map(function (g) {
            return { id: g.id, prompt: g.prompt };
          }),
        },
      });
      reportProgress();
      // Report the size once mounted, then whenever the content changes.
      reportHeight();
      if (typeof ResizeObserver === 'function') {
        try {
          new ResizeObserver(reportHeight).observe(document.body);
        } catch (e) {
          /* fall back to the initial measurement only */
        }
      } else {
        window.addEventListener('load', reportHeight);
      }
    },

    /** Exposed so an app can report a goal it satisfied programmatically. */
    complete: function (goalId, answer) {
      if (!goalId) return;
      doneGoals[goalId] = true;
      post({ type: 'complete', payload: { goalId: goalId, answer: String(answer || '') } });
      reportProgress();
    },
  };

  window.MockApp = MockApp;
})();
