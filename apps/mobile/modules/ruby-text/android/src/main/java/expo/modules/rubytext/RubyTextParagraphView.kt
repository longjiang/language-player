package expo.modules.rubytext

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.text.Spannable
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.Selection
import android.text.style.ReplacementSpan
import android.util.Log
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

  /** Tappable span per [RubyParagraphRun.tokenId]; parallel to the last
   *  [runs] list. Plain (non-tappable) runs never get a span, so Android's
   *  line breaker sees them as ordinary characters. */
  private var tapSpans: List<RubyReplacementSpan> = emptyList()

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
            // getOffsetForPosition is a TextView method (not on Layout on
            // this compile stub); Layout exposes getOffsetForHorizontal.
            val offset = getOffsetForPosition(event.x, event.y)
            val span = (text as? Spanned)?.getSpans(offset, offset, RubyReplacementSpan::class.java)
              ?.firstOrNull()
            val run = span?.run
            if (run?.tappable == true) {
              onTokenTap(mapOf("tokenId" to run.tokenId))
            }
          }
        }
      }
    }
    return super.onTouchEvent(event)
  }

  private fun rebuild() {
    if (runs.isEmpty()) {
      tapSpans = emptyList()
      setText("")
      return
    }
    val basePaint = makeBasePaint()
    basePaint.textSize = dp(fontSize)
    // Force every line box to exactly dp(lineHeight): base line (font metrics
    // with includeFontPadding=false) plus the reserved reading slot.
    val fm = basePaint.fontMetricsInt
    val baseLineHeight = (fm.descent - fm.ascent).toFloat()
    setLineSpacing(dp(lineHeight) - baseLineHeight, 1f)
    setTextDirection(if (isRtl) TEXT_DIRECTION_RTL else TEXT_DIRECTION_LTR)

    val builder = SpannableStringBuilder()
    val spans = ArrayList<RubyReplacementSpan>(runs.size)
    for (run in runs) {
      if (run.text.isEmpty()) continue
      val start = builder.length
      builder.append(run.text)
      // Plain runs (whitespace, punctuation, the pre-tokenization whole-block
      // run, glosses) must stay SPAN-FREE: a ReplacementSpan is an atomic
      // object to Android's line breaker, so a spanned run can never break
      // across lines — token runs rendered one unbreakable "word" each and the
      // pre-tokenization whole-block run didn't wrap at all (clipping at the
      // right edge). Only ruby-bearing word runs get the span; the span draws
      // the base glyphs itself (see RubyReplacementSpan.draw), so an unspanned
      // run paints through TextView's own path and breaks character by
      // character. Tap lookup consults [tapSpans], not the buffer.
      if (!run.tappable) continue
      val span = RubyReplacementSpan(run, density, fontSize, readingSize, fontFamily, language)
      spans.add(span)
      if (!run.reading.isNullOrEmpty()) {
        builder.setSpan(span, start, start + run.text.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
      }
    }
    tapSpans = spans
    setText(builder)
    Log.i(
      "LP Mobile",
      "[RubyText] paragraph rebuild runs=${runs.size} spans=${spans.size} chars=${builder.length} lineHeight=$lineHeight"
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
    // fm intentionally untouched: the TextView's setLineSpacing owns the line
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

    // Line box: reading sits at the top, base text at the bottom (mirrors the
    // canvas renderer: baseBaseline = lineBottom - baseDescent).
    val baseBaseline = bottom.toFloat() - baseMetrics.descent
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
