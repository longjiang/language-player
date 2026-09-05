package expo.modules.rubytext

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.text.Layout
import android.text.Spannable
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.Selection
import android.text.style.AbsoluteSizeSpan
import android.text.style.BackgroundColorSpan
import android.text.style.ForegroundColorSpan
import android.text.style.LineHeightSpan
import android.text.style.ReplacementSpan
import android.text.style.StyleSpan
import android.text.style.UnderlineSpan
import android.util.Log
import android.util.TypedValue
import android.view.ActionMode
import android.view.Menu
import android.view.MenuItem
import android.view.MotionEvent
import android.view.ViewConfiguration
import androidx.appcompat.widget.AppCompatTextView
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import java.util.Locale
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.roundToInt

/** One tappable text run inside a paragraph-level ruby renderer. */
class RubyParagraphRun(
  val tokenId: Int,
  val text: String,
  val reading: String?,
  val fontSize: Float?,
  val tappable: Boolean,
  val color: Int,
  val readingColor: Int,
  val bold: Boolean,
  val underline: Boolean,
  val italic: Boolean,
  val background: Int?,
  val backgroundAlpha: Float,
  val opacity: Float
)

/**
 * Paragraph-level ruby renderer for Android (SPEC-084 Task 2 rewrite).
 *
 * Replaces the previous Canvas-painted ExpoView with a real AppCompatTextView
 * so Android's native text selection (long-press handles, selection highlight,
 * onSelectionChanged) works on ruby text. [RubyReplacementSpan]s paint the
 * reading above the base text — the same advance/line-height math as the old
 * canvas renderer, so the ruby visuals are unchanged. The spanned
 * CharSequence is BASE TEXT ONLY (readings live in the span's draw()), so
 * selection.toString() matches the source text like web's select-none
 * annotations.
 *
 * Spans are attached ONLY to ruby-bearing word runs (2026-09-03). A
 * ReplacementSpan is an atomic object to Android's line breaker: when every
 * run was spanned, each token rendered as one unbreakable "word" (ragged CJK
 * lines starting with punctuation) and the pre-tokenization whole-block run
 * did not wrap at all (clipped at the right edge). Span-free runs paint
 * through TextView's own path and break character by character.
 *
 * Fabric/Yoga does not lay out children of custom ExpoViews, so JS measures an
 * invisible RN Text and passes the exact box via `style` — this view is the
 * TextView itself (no child to lay out) and sizes from that style.
 *
 * expo-modules-kotlin registers any android.view.View subclass
 * (ViewDefinitionBuilder<T : View>); ExpoView is a convenience base, not a
 * requirement, so extending AppCompatTextView is supported. The constructor
 * (Context, AppContext) matches the module's view factory.
 */
class RubyTextParagraphView(context: Context, appContext: AppContext) : AppCompatTextView(context) {

  var runs: List<RubyParagraphRun> = emptyList()
    set(value) {
      field = value
      rebuild()
    }

  var fontSize: Float = 16f
    set(value) {
      field = value
      rebuild()
    }

  var lineHeight: Float = 26f
    set(value) {
      field = value
      rebuild()
    }

  var readingSize: Float = 9f
    set(value) {
      field = value
      rebuild()
    }

  var isRtl: Boolean = false
    set(value) {
      field = value
      rebuild()
    }

  var fontFamily: String? = null
    set(value) {
      field = value
      rebuild()
    }

  /** BCP-47 language of the base text (e.g. "ja", "zh-Hans"). Set as the
   *  TextView's locale so Android's font fallback picks the correct CJK
   *  script font + glyph variants for the SPAN-FREE runs (plain text paints
   *  through TextView's own path — the replacement spans choose their own
   *  typefaces). Mirrors iOS's kCTLanguageAttributeName (SPEC-088). */
  var language: String? = null
    set(value) {
      field = value
      applyTextLocale()
    }

  /** Bump to collapse the native selection (dictionary popup dismiss) —
   *  SPEC-084 Task 1.3 / Task 2. */
  var clearSelection: Int = 0
    set(value) {
      if (value != field) {
        field = value
        collapseSelection()
      }
    }

  private val onTokenTap by EventDispatcher<Map<String, Any>>()
  private val onSelection by EventDispatcher<Map<String, Any>>()
  private val onLineGrid by EventDispatcher<Map<String, Any>>()

  /** Offset index of the built string: one (start, end, run) entry per run,
   *  in string order. Tap lookup walks this instead of querying spans —
   *  reading-less word runs ("hard words only" filter) carry no
   *  ReplacementSpan (they paint through TextView's own path), but must stay
   *  tappable like every other word run. Mirrors iOS's
   *  run(atUtf16Offset:) offset arithmetic. */
  private var runRanges: List<Triple<Int, Int, RubyParagraphRun>> = emptyList()

  // RN passes sizes in dp; Canvas/TextView draw in px.
  private val density: Float = resources.displayMetrics.density
  private var downX = 0f
  private var downY = 0f

  private fun dp(value: Float): Float = value * density

  /** Apply the language tag to the TextView (locale-sensitive font fallback
   *  and line breaking). Safe to call before the view is attached. */
  private fun applyTextLocale() {
    val tag = language
    if (tag.isNullOrEmpty()) return
    try {
      textLocale = Locale.forLanguageTag(tag)
    } catch (e: Exception) {
      Log.w("LP Mobile", "[RubyText] textLocale rejected \"$tag\": ${e.message}")
    }
  }

  init {
    Log.i("LP Mobile", "[RubyText] Android RubyTextParagraphView created (TextView + spans)")
    // Native selection: long-press handles, highlight, onSelectionChanged.
    setTextIsSelectable(true)
    // Hide the Copy / Select All context menu — the dictionary popup is the
    // only consumer of a selection. Selection handles remain.
    setCustomSelectionActionModeCallback(object : ActionMode.Callback {
      override fun onCreateActionMode(mode: ActionMode, menu: Menu): Boolean = false
      override fun onPrepareActionMode(mode: ActionMode, menu: Menu): Boolean = false
      override fun onActionItemClicked(mode: ActionMode, item: MenuItem): Boolean = false
      override fun onDestroyActionMode(mode: ActionMode) {}
    })
    setIncludeFontPadding(false)
  }

  /** Collapse the current selection (web clear() parity — SPEC-084). */
  private fun collapseSelection() {
    val start = selectionStart
    val end = selectionEnd
    if (start >= 0 && end >= 0 && start != end) {
      // TextView.setSelection is not exposed on this compile stub; the
      // static Selection helper is the equivalent buffer-level operation
      // (TextView.setSelection(int) delegates to it internally).
      Selection.setSelection(text as Spannable, max(start, end))
    }
  }

  override fun onSelectionChanged(selStart: Int, selEnd: Int) {
    super.onSelectionChanged(selStart, selEnd)
    // Report non-collapsed selections as { start, end } (offsets into the base
    // text — readings are drawn by the spans, not part of the CharSequence).
    // Fires continuously while handles are dragged — JS applies a settle timer.
    if (selStart >= 0 && selEnd >= 0 && selStart != selEnd) {
      onSelection(mapOf("start" to selStart, "end" to selEnd))
    }
  }

  /** Emit the base-text line grid once the view's own layout is up to date —
   *  the LIVE geometry (line tops/bottoms/baselines of this TextView; the
   *  readings are painted inside each span's box, so the base baseline is the
   *  span's own baseline). The reader's translation column baseline-aligns to
   *  this (SPEC-082 parity; iOS emits the same shape from its TextKit 1
   *  replica).
   *
   *  Units: Layout reports PIXELS, but RN consumes dp (this view's own props
   *  are dp — see [dp]). Emitting raw px inflated the grid ~2.75x on a Pixel
   *  5a, and the JS side sized the view to that inflated height: the paragraph
   *  rendered at the top with a blank band below it roughly as tall as the
   *  paragraph itself. Convert to dp here so both iOS and Android report dp.
   */
  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    super.onLayout(changed, left, top, right, bottom)
    emitLineGrid()
  }

  private fun emitLineGrid() {
    val layout = layout ?: return
    if (layout.lineCount <= 0) return
    val lines = ArrayList<Map<String, Double>>(layout.lineCount)
    for (i in 0 until layout.lineCount) {
      val lineTop = layout.getLineTop(i).toDouble() / density
      val lineBottom = layout.getLineBottom(i).toDouble() / density
      lines.add(
        mapOf(
          "y" to lineTop,
          "height" to (lineBottom - lineTop),
          "ascender" to (layout.getLineBaseline(i).toDouble() / density - lineTop),
        )
      )
    }
    onLineGrid(mapOf("lines" to lines))
    Log.i(
      "LP Mobile",
      "[RubyText] paragraph line-grid-android lines=${lines.size} y0=${lines[0]["y"]} h0=${lines[0]["height"]} a0=${lines[0]["ascender"]}"
    )
  }

  /** Map a tap to the token whose span contains the tapped offset — only for
   *  real taps (movement within touch slop), so releasing a selection-handle
   *  drag never opens the token popup. */
  override fun onTouchEvent(event: MotionEvent): Boolean {
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        downX = event.x
        downY = event.y
      }
      MotionEvent.ACTION_UP -> {
        val slop = ViewConfiguration.get(context).scaledTouchSlop
        if (abs(event.x - downX) <= slop && abs(event.y - downY) <= slop) {
          val layout = layout
          if (layout != null) {
            val offset = characterOffsetAt(layout, event.x, event.y)
            val run = runAt(offset)
            if (run?.tappable == true) {
              Log.i(
                "LP Mobile",
                "[RubyText] paragraph tap x=${event.x.toInt()} y=${event.y.toInt()} offset=$offset token=${run.tokenId} text=\"${run.text}\""
              )
              onTokenTap(mapOf("tokenId" to run.tokenId))
            }
          }
        }
      }
    }
    return super.onTouchEvent(event)
  }

  /** Code-unit offset of the CHARACTER under (x, y).
   *
   *  `getOffsetForPosition` (→ `Layout.getOffsetForHorizontal`) returns the
   *  closest character BOUNDARY (insertion point), not the character under
   *  the finger: a tap on the right half of a glyph resolved to the boundary
   *  AFTER it, so tapping the last character of a token opened the NEXT
   *  token's popup (e.g. 人 ending a wrapped reader line opened 也 — the next
   *  line's first token; 2026-09-04 report). Two corrections:
   *  1. A tap past a line's end is clamped to the line's LAST character
   *     (the boundary answer is the next line's start offset).
   *  2. Otherwise the tap x is compared against the boundary's caret x
   *     (`getPrimaryHorizontal`) — left of it (right of it on RTL lines)
   *     belongs to the character BEFORE the boundary. Mirrors iOS
   *     `characterOffset(at:)` in RubyTextParagraphView.swift. */
  private fun characterOffsetAt(layout: Layout, x: Float, y: Float): Int {
    val line = layout.getLineForVertical(y.toInt())
    var offset = layout.getOffsetForHorizontal(line, x)
    val lineEnd = layout.getLineEnd(line)
    if (lineEnd <= layout.getLineStart(line)) {
      // Empty line (e.g. after a trailing \n run): no character to enclose.
      return lineEnd
    }
    if (offset >= lineEnd) {
      return lineEnd - 1
    }
    if (offset > layout.getLineStart(line)) {
      val isRtlLine = layout.getParagraphDirection(line) == Layout.DIR_RIGHT_TO_LEFT
      val boundaryX = layout.getPrimaryHorizontal(offset)
      val onPreviousSide = if (isRtlLine) x > boundaryX else x < boundaryX
      if (onPreviousSide) offset -= 1
    }
    return offset
  }

  /** The run containing [offset] in the built base-text string, or null when
   *  the tap landed outside any run (past the end of the last run). */
  private fun runAt(offset: Int): RubyParagraphRun? {
    for ((start, end, run) in runRanges) {
      if (offset in start until end) return run
    }
    return null
  }

  private fun rebuild() {
    if (runs.isEmpty()) {
      runRanges = emptyList()
      setText("")
      return
    }
    val basePaint = makeBasePaint()
    basePaint.textSize = dp(fontSize)
    // Span-free runs (punctuation, whitespace, reading-less words, the
    // pre-tokenization whole-block run) paint with the TextView's OWN paint,
    // so it must carry the requested base font — otherwise they draw at the
    // platform default size and the pin/baseline math (computed here from
    // makeBasePaint) doesn't describe the real glyphs.
    setTextSize(TypedValue.COMPLEX_UNIT_DIP, fontSize)
    typeface = makeTypeface(null)
    // Pin every line box to exactly dp(lineHeight) with a LineHeightSpan (see
    // the class below): the span ABSORBS the extra leading into the TOP of
    // each line, so every run — ruby-bearing or plain — paints on the line's
    // natural baseline. setLineSpacing(…, 1f) was the previous pin and is the
    // punctuation misalignment: it adds the extra height BELOW each line's
    // descent, so TextView's natural baseline sat high in the box while the
    // ruby spans anchored their base glyphs at the box BOTTOM — two baselines
    // per line, punctuation floating up into the reading band.
    val pinnedLineHeight = dp(lineHeight)
    val fm = basePaint.fontMetricsInt
    val baseLineHeight = (fm.descent - fm.ascent).toFloat()
    // Leading added above each line's ascent (negative = compress, matching
    // what setLineSpacing did when the pin was smaller than the font box).
    val leadingAdd = pinnedLineHeight - baseLineHeight
    val baseAscent = -fm.ascent.toFloat()
    val baseDescent = fm.descent.toFloat()
    setTextDirection(if (isRtl) TEXT_DIRECTION_RTL else TEXT_DIRECTION_LTR)

    val builder = SpannableStringBuilder()
    // The pin span is attached once, after the loop, to the WHOLE string —
    // one span, every line of every paragraph.
    val ranges = ArrayList<Triple<Int, Int, RubyParagraphRun>>(runs.size)
    for (run in runs) {
      if (run.text.isEmpty()) continue
      val start = builder.length
      builder.append(run.text)
      ranges.add(Triple(start, builder.length, run))
      // Plain runs (whitespace, punctuation, the pre-tokenization whole-block
      // run, glosses) must stay SPAN-FREE of ReplacementSpans: a
      // ReplacementSpan is an atomic object to Android's line breaker, so a
      // spanned run can never break across lines — token runs rendered one
      // unbreakable "word" each and the pre-tokenization whole-block run
      // didn't wrap at all (clipping at the right edge). Only ruby-bearing
      // word runs get the replacement span; the span draws the base glyphs
      // itself (see RubyReplacementSpan.draw), so an unspanned run paints
      // through TextView's own path and breaks character by character. Tap
      // lookup consults [runRanges], not the buffer.
      //
      // Plain runs still carry their per-run color/size through
      // ForegroundColorSpan / AbsoluteSizeSpan — neither is atomic (they are
      // plain CharacterStyle / non-replacement MetricAffectingSpans), so the
      // line breaker keeps splitting these runs character by character while
      // the runs no longer paint with the TextView's default color/size
      // (glosses were white instead of muted; byeonggi painted full-size).
      if (!run.tappable) {
        builder.setSpan(
          ForegroundColorSpan(applyAlpha(run.color, run.opacity)),
          start, builder.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE,
        )
        run.fontSize?.let { size ->
          builder.setSpan(
            AbsoluteSizeSpan(dp(size).roundToInt(), false),
            start, builder.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE,
          )
        }
        continue
      }
      // Tappable runs without a reading (e.g. the "hard words only" phonetics
      // filter skips easy words) have no RubyReplacementSpan to paint them —
      // they fall through to TextView's own path, which knows nothing about
      // the run's requested color. Without explicit spans they painted with
      // the TextView's default theme color and rendered DIMMER than
      // ruby-bearing neighbors (2026-09-03 Android reader report). Fix: apply
      // the same non-atomic styling spans used by plain runs. None of these
      // is atomic to the line breaker (CharacterStyle / non-replacement
      // MetricAffectingSpans), so the span-free wrapping fix stays intact.
      if (run.reading.isNullOrEmpty()) {
        builder.setSpan(
          ForegroundColorSpan(applyAlpha(run.color, run.opacity)),
          start, builder.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE,
        )
        if (run.bold) {
          builder.setSpan(
            StyleSpan(Typeface.BOLD),
            start, builder.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE,
          )
        }
        if (run.italic) {
          builder.setSpan(
            StyleSpan(Typeface.ITALIC),
            start, builder.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE,
          )
        }
        if (run.underline) {
          builder.setSpan(
            UnderlineSpan(),
            start, builder.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE,
          )
        }
        run.background?.let { bg ->
          builder.setSpan(
            BackgroundColorSpan(applyAlpha(bg, run.backgroundAlpha)),
            start, builder.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE,
          )
        }
        continue
      }
      val span = RubyReplacementSpan(run, density, fontSize, readingSize, fontFamily, language)
      builder.setSpan(span, start, start + run.text.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
    }
    runRanges = ranges
    builder.setSpan(
      PinLineHeightSpan(leadingAdd, baseAscent, baseDescent),
      0,
      builder.length,
      Spanned.SPAN_EXCLUSIVE_EXCLUSIVE,
    )
    setText(builder)
    val rubySpanCount = ranges.count { !it.third.reading.isNullOrEmpty() }
    Log.i(
      "LP Mobile",
      "[RubyText] paragraph rebuild runs=${runs.size} rubySpans=$rubySpanCount chars=${builder.length} lineHeight=$lineHeight pin(add=${leadingAdd} ascent=$baseAscent descent=$baseDescent)"
    )
  }

  /** Shared base paint metrics mirror the old canvas basePaint. */
  private fun makeBasePaint(): Paint =
    Paint(Paint.ANTI_ALIAS_FLAG).apply {
      textSize = dp(fontSize)
      typeface = makeTypeface(null)
    }

  private fun makeTypeface(run: RubyParagraphRun?): Typeface {
    val style = when {
      run?.bold == true && run.italic == true -> Typeface.BOLD_ITALIC
      run?.bold == true -> Typeface.BOLD
      run?.italic == true -> Typeface.ITALIC
      else -> Typeface.NORMAL
    }
    return if (fontFamily != null) {
      Typeface.create(fontFamily, style)
    } else {
      Typeface.create(Typeface.DEFAULT, style)
    }
  }

  private fun applyAlpha(color: Int, alpha: Float): Int {
    val a = ((Color.alpha(color) * alpha).toInt().coerceIn(0, 255))
    return (a shl 24) or (color and 0x00ffffff)
  }
}

/**
 * Pins every line box to the requested pitch by ABSORBING the extra leading
 * into the TOP of each line (before the ascent), instead of letting
 * TextView's setLineSpacing add it below the descent.
 *
 * This is the baseline fix for the ruby paragraph: the ruby replacement spans
 * anchor their base glyphs at the line BOTTOM (bottom − descent), and with
 * setLineSpacing the extra height went BELOW the descent, so the natural
 * baseline (used by span-free runs — punctuation, whitespace, reading-less
 * words) sat higher than the ruby spans' baseline. Two baselines per line:
 * punctuation floated up into the reading band (2026-09-03 reader report).
 *
 * The rewrite is CONSTANT, never derived from the incoming fm: StaticLayout
 * carries fm across line breaks that land inside a span (`generate()` keeps
 * `fmAscent = min(…, fm.ascent)` when `endPos < spanEnd`), so a chooseHeight
 * that builds on the incoming ascent compounds — each line grew by exactly
 * leadingAdd over the previous one (build 33: gaps 167→220→275→343px,
 * +53.375 = leadingAdd of the 39dp pin). Writing the same fixed metrics
 * every time makes the carried value a fixed point.
 *
 * Fixed metrics are safe for the CJK fallback font: its ascent (≈1.16em)
 * exceeds Roboto's (≈0.93em), but the glyph top still lands inside the box
 * because the baseline sits leadingAdd below the line top, and its descent
 * bleeds a few px into the NEXT line's empty top slab — never into ink.
 */
private class PinLineHeightSpan(
  private val leadingAdd: Float,
  private val baseAscent: Float,
  private val baseDescent: Float
) : LineHeightSpan {
  override fun chooseHeight(
    text: CharSequence,
    start: Int,
    end: Int,
    spanstartv: Int,
    v: Int,
    fm: android.graphics.Paint.FontMetricsInt
  ) {
    // Box = [ leadingAdd | baseAscent | baseDescent ] == the pin exactly;
    // the baseline sits leadingAdd below the line top, and TextView's
    // span-free glyph path lands on exactly the baseline the ruby spans
    // anchor to (draw uses y). ascent/descent (not top/bottom — those carry
    // font padding the view disabled) mirror the old setLineSpacing
    // baseLineHeight = descent − ascent.
    fm.ascent = (-leadingAdd - baseAscent).toInt()
    fm.top = fm.ascent
    fm.descent = baseDescent.toInt()
    fm.bottom = fm.descent
  }
}

/**
 * One ruby-bearing token's cell: draws the reading above the base text,
 * centered per token (advance = wider of base/reading) — exactly the old
 * canvas renderer's per-run math, now inside a selectable TextView.
 *
 * The span is attached ONLY to ruby-bearing word runs (see [RubyTextParagraphView.rebuild]):
 * a ReplacementSpan is atomic to Android's line breaker, so spans never split
 * across lines and [draw] always receives a full token. Plain runs stay
 * span-free and wrap character by character through TextView's own paint path.
 */
private class RubyReplacementSpan(
  val run: RubyParagraphRun,
  private val density: Float,
  private val fontSize: Float,
  private val readingSize: Float,
  private val fontFamily: String?,
  private val language: String?
) : ReplacementSpan() {

  private fun dp(value: Float): Float = value * density

  /** Locale for this run's glyph fallback (mirrors the TextView's textLocale —
   *  spans copy the paint, so the locale is set explicitly per paint). */
  private fun applyLocale(p: Paint) {
    val tag = language ?: return
    if (tag.isEmpty()) return
    try {
      p.textLocale = Locale.forLanguageTag(tag)
    } catch (_: Exception) {
      // Invalid tags fall back to the paint's default locale.
    }
  }

  override fun getSize(
    paint: Paint,
    text: CharSequence,
    start: Int,
    end: Int,
    fm: android.graphics.Paint.FontMetricsInt?
  ): Int {
    val base = basePaint(paint)
    val reading = readingPaint(paint)
    val baseWidth = base.measureText(text, start, end)
    val readingWidth = if (!run.reading.isNullOrEmpty()) reading.measureText(run.reading) else 0f
    // fm intentionally untouched: the [PinLineHeightSpan] owns the line
    // height, so the span contributes width only.
    return max(baseWidth, readingWidth).toInt()
  }

  override fun draw(
    canvas: Canvas,
    text: CharSequence,
    start: Int,
    end: Int,
    x: Float,
    top: Int,
    y: Int,
    bottom: Int,
    paint: Paint
  ) {
    val base = basePaint(paint)
    val reading = readingPaint(paint)
    val baseMetrics = base.fontMetrics
    val readingMetrics = reading.fontMetrics
    val baseWidth = base.measureText(text, start, end)
    val readingWidth = if (!run.reading.isNullOrEmpty()) reading.measureText(run.reading) else 0f
    val advance = max(baseWidth, readingWidth)
    val baseX = x + (advance - baseWidth) / 2f
    val rubyX = x + (advance - readingWidth) / 2f

    // Background highlight (saved word / search hit) over the whole box,
    // clamped to the drawable region.
    if (run.background != null) {
      val bgPaint = Paint().apply {
        color = applyAlpha(run.background, run.backgroundAlpha)
      }
      val drawTop = max(top.toFloat(), y + baseMetrics.ascent - readingBandHeight(reading))
      canvas.drawRect(x, drawTop, x + advance, bottom.toFloat(), bgPaint)
    }

    // Anchor the base glyphs ON the line baseline (y): [PinLineHeightSpan]
    // absorbs the pinned leading ABOVE the ascent, so the line's natural
    // baseline is exactly the box-bottom position the old setLineSpacing
    // renderer produced — ruby glyphs stay pixel-identical — while span-free
    // runs (punctuation, whitespace, reading-less words) paint on the SAME
    // baseline through TextView's own path. The old bottom-anchored math
    // (bottom − baseDescent) matched only when every run shared the base
    // font's metrics; with the pin, y is unambiguous.
    val baseBaseline = y.toFloat()
    val readingBaseline = baseBaseline + baseMetrics.ascent - readingMetrics.descent
    if (!run.reading.isNullOrEmpty()) {
      canvas.drawText(run.reading, rubyX, readingBaseline, reading)
    }
    canvas.drawText(text, start, end, baseX, baseBaseline, base)
  }

  /** Vertical extent the reading occupies above the base glyphs: its glyph
   *  body plus the ~2px gap. Clamps the highlight band so a wide (base >
   *  reading) run doesn't paint its background above the line box into the
   *  previous line. */
  private fun readingBandHeight(reading: Paint): Float =
    reading.fontMetrics.descent - reading.fontMetrics.ascent + dp(2f)

  /** Base glyph paint: per-run size/typeface/color/opacity + decorations. */
  private fun basePaint(paint: Paint): Paint {
    val p = Paint(paint)
    p.textSize = dp(run.fontSize ?: fontSize)
    p.color = applyAlpha(run.color, run.opacity)
    p.typeface = makeTypeface(run)
    p.isUnderlineText = run.underline
    applyLocale(p)
    return p
  }

  private fun readingPaint(paint: Paint): Paint {
    val p = Paint(paint)
    p.textSize = dp(readingSize)
    p.color = applyAlpha(run.readingColor, run.opacity)
    // The reading follows the same family (serif/sans-serif setting) as the
    // base text, mirroring iOS's makeReadingFont; missing glyphs (e.g. kana in
    // Georgia) cascade through Android's font fallback.
    p.typeface = makeTypeface(null)
    applyLocale(p)
    return p
  }

  private fun makeTypeface(run: RubyParagraphRun?): Typeface {
    val style = when {
      run?.bold == true && run.italic == true -> Typeface.BOLD_ITALIC
      run?.bold == true -> Typeface.BOLD
      run?.italic == true -> Typeface.ITALIC
      else -> Typeface.NORMAL
    }
    return if (fontFamily != null) {
      Typeface.create(fontFamily, style)
    } else {
      Typeface.create(Typeface.DEFAULT, style)
    }
  }

  private fun applyAlpha(color: Int, alpha: Float): Int {
    val a = ((Color.alpha(color) * alpha).toInt().coerceIn(0, 255))
    return (a shl 24) or (color and 0x00ffffff)
  }
}
