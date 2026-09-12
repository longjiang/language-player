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
 * **Selecting is the interaction.** A tap on an element selects it and another tap
 * unselects it, which is what the host needs to grade a student who changed their mind —
 * so the app reports the *selection*, never a verdict. Every toggle posts `selection`
 * with the picks for the task being asked, and the host grades them against the content.
 *
 * Selection is **per goal**, and the host says which goal is being asked with `focus` —
 * it owns the task list, and it is the one that knows what the student has already
 * answered. Coming back to a task restores the picks that `focus` carries.
 *
 * A goal is still *satisfied* when its selection is exactly what `candidates` names, and
 * that is what `progress` and `complete` report: a goal that names one element is met by
 * selecting it, and a goal declaring `all: true` ("选择所有复兴号车次") by selecting every
 * one of them. `join` (default `、`, the separator a `multiple` blank stores picks with —
 * see PICK_SEPARATOR in `@langplayer/textbooks`) is how those picks are reported.
 */
(function () {
  'use strict';

  var VERSION = 1;
  /** The element the hint is currently outlining, if any. */
  var hintedElement = null;
  var helpMode = false;
  var tokenMap = {}; // text -> tokens, filled by the host
  var spec = null;
  var doneGoals = {};
  /** goalId -> the values selected for that goal. One entry per task, so moving between
   *  tasks neither leaks a selection nor loses one the host hands back. */
  var selected = {};
  /** The goal whose task the student is on, as the host said with `focus`. */
  var focused = null;
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

  function goalById(id) {
    var goals = goalList();
    for (var i = 0; i < goals.length; i++) if (goals[i].id === id) return goals[i];
    return null;
  }

  function goalCandidates(goal) {
    if (!goal) return [];
    try {
      return (goal.candidates ? goal.candidates(spec.data) : []) || [];
    } catch (e) {
      return [];
    }
  }

  function picksFor(goalId) {
    return selected[goalId] || (selected[goalId] = []);
  }

  /** The elements a goal still wants: the candidates it names, minus what is selected. */
  function outstandingPicks(goal) {
    var values = picksFor(goal.id);
    return goalCandidates(goal).filter(function (el) {
      return values.indexOf(valueOf(goal, el)) === -1;
    });
  }

  /**
   * Draw the selection for the focused goal.
   *
   * Only that goal's is drawn: the other selections belong to tasks the student is not on,
   * and showing them together would say every task shares one selection.
   */
  function paintSelection() {
    if (!rootEl) return;
    var goal = focused ? goalById(focused) : null;
    var values = focused ? picksFor(focused) : [];
    var targets = rootEl.querySelectorAll('[data-mock-target]');
    for (var i = 0; i < targets.length; i++) {
      var el = targets[i];
      var value = goal ? valueOf(goal, el) : '';
      if (value && values.indexOf(value) !== -1) el.classList.add('selected');
      else el.classList.remove('selected');
    }
    reportHeight();
  }

  /**
   * Is this goal satisfied by what is selected for it?
   *
   * Exactly its candidates: selecting an element the goal does not name leaves it
   * unsatisfied, which is what lets a wrong selection be graded wrong rather than merely
   * called incomplete.
   */
  function isSatisfied(goal) {
    var values = picksFor(goal.id);
    if (!values.length) return false;
    var candidates = goalCandidates(goal);
    if (!candidates.length) return false;
    var wanted = candidates.map(function (el) { return valueOf(goal, el); });
    if (wanted.length !== values.length) return false;
    for (var i = 0; i < values.length; i++) {
      if (wanted.indexOf(values[i]) === -1) return false;
    }
    return true;
  }

  function answerFor(goal) {
    return picksFor(goal.id).join(goal.join || '、');
  }

  function syncGoal(goal) {
    var satisfied = isSatisfied(goal);
    var wasDone = !!doneGoals[goal.id];
    if (satisfied && !wasDone) {
      doneGoals[goal.id] = true;
      post({ type: 'complete', payload: { goalId: goal.id, answer: answerFor(goal) } });
    } else if (!satisfied && wasDone) {
      // Unselecting can take a goal back out of "done", and the host has to hear that or
      // it would keep the answer the student just withdrew.
      delete doneGoals[goal.id];
    }
    reportProgress();
  }

  /**
   * Toggle `el` in the selection for the focused goal, and tell the host.
   *
   * Nothing here decides whether the answer is right — the content does, when the student
   * submits. What the app decides is only what is selected, and a tap on *anything* the
   * focused goal can name toggles it, including a tap the goal would not accept: that is
   * exactly the selection the host has to be able to mark wrong.
   */
  function toggleSelection(el) {
    var goal = focused ? goalById(focused) : null;
    if (!goal) return false;
    var value = valueOf(goal, el);
    if (!value) return false;
    var values = picksFor(goal.id);
    var at = values.indexOf(value);
    if (at === -1) values.push(value);
    else values.splice(at, 1);

    paintSelection();
    post({ type: 'selection', payload: { goalId: goal.id, picks: values.slice() } });
    syncGoal(goal);
    clearHint();
    return true;
  }

  // ── Hint ───────────────────────────────────────────────────────────────

  function clearHint() {
    if (hintedElement && hintedElement.classList) {
      hintedElement.classList.remove('mock-hint');
    }
    hintedElement = null;
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
    // The task the student is on, when the host has said which that is — hinting the first
    // unmet goal instead would point at a task two screens away. Falls back to that order
    // for an app hosted without `focus`.
    var goal = (focused && goalById(focused)) || unmetGoals()[0];
    if (!goal) return;
    // Several candidates are legitimate ("any train with a sleeper", and a set goal
    // has several by definition), so highlight them all rather than pretending there
    // is one right answer. A set goal only points at what is still missing.
    var candidates = outstandingPicks(goal);
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      if (el && el.classList) el.classList.add('mock-hint');
    }
    hintedElement = candidates[0] || null;
  }

  // ── Help mode ──────────────────────────────────────────────────────────

  var TOKEN_ATTR = 'data-mock-token';
  var SKIP_ATTR = 'data-no-tokenize';
  /** Set on the app's root while lookups are armed; the app styles it. */
  var LOOKUP_CLASS = 'mock-lookup';

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
    // Tell the app's stylesheet that lookups are armed, so it can darken the screen: the
    // student has to be able to tell "tap a word to look it up" from "tap a train to select
    // it" without reading a button's state.
    if (rootEl && rootEl.classList) rootEl.classList.add(LOOKUP_CLASS);
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
    if (rootEl.classList) rootEl.classList.remove(LOOKUP_CLASS);
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
      case 'focus':
        // Which task is being asked, and what is already selected for it. The picks come
        // from the host's store, so a task the student answered shows its answer back.
        focused = (msg.payload && msg.payload.goalId) || null;
        if (focused) selected[focused] = ((msg.payload && msg.payload.picks) || []).slice();
        clearHint();
        paintSelection();
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
        selected = {};
        if (spec && spec.reset) spec.reset(spec.data);
        paintSelection();
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
        toggleSelection(el);
        return;
      }
      // A lookup token is a span inside the row: in normal mode tapping it must not select
      // the row it sits in.
      if (el.getAttribute && el.getAttribute(TOKEN_ATTR) !== null) return;
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

    /** Exposed so an app can report a goal it satisfied without a selection. */
    complete: function (goalId, answer) {
      if (!goalId) return;
      doneGoals[goalId] = true;
      post({ type: 'complete', payload: { goalId: goalId, answer: String(answer || '') } });
      reportProgress();
    },

    /** Exposed so an app can select something itself (a restored attempt, say). */
    select: function (goalId, picks) {
      if (!goalId) return;
      selected[goalId] = (picks || []).slice();
      paintSelection();
      post({ type: 'selection', payload: { goalId: goalId, picks: selected[goalId].slice() } });
      var goal = goalById(goalId);
      if (goal) syncGoal(goal);
    },
  };

  window.MockApp = MockApp;
})();
