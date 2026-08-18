package expo.modules.rubytext

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.text.SpannableStringBuilder
import android.text.Spanned
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
 * onSelectionChanged) works on ruby text. One [RubyReplacementSpan] per token
 * paints the reading above the base text inside the span's box — the same
 * advance/line-height math as the old canvas renderer, so the ruby visuals are
 * unchanged. The span's CharSequence is BASE TEXT ONLY (readings live in the
 * span's draw()), so selection.toString() matches the source text like web's
 * select-none annotations.
 *
 * Atomic spans are acceptable: the old canvas renderer already never split a
 * run across lines (buildLines() wrapped whole tokens), so span atomicity is
 * behavior parity, not a regression.
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

  // RN passes sizes in dp; Canvas/TextView draw in px.
  private val density: Float = resources.displayMetrics.density
  private var downX = 0f
  private var downY = 0f

  private fun dp(value: Float): Float = value * density

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
      setSelection(max(start, end))
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
            val offset = layout.getOffsetForPosition(event.x, event.y)
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
    for (run in runs) {
      if (run.text.isEmpty()) continue
      val start = builder.length
      builder.append(run.text)
      builder.setSpan(
        RubyReplacementSpan(run, density, fontSize, readingSize, fontFamily),
        start,
        start + run.text.length,
        Spanned.SPAN_EXCLUSIVE_EXCLUSIVE
      )
    }
    setText(builder)
    Log.i(
      "LP Mobile",
      "[RubyText] paragraph rebuild runs=${runs.size} chars=${builder.length} lineHeight=$lineHeight"
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
 * One token's ruby cell: draws the reading above the base text inside the
 * span's box (centered per token, advance = wider of base/reading) — exactly
 * the old canvas renderer's per-run math, now inside a selectable TextView.
 */
private class RubyReplacementSpan(
  val run: RubyParagraphRun,
  private val density: Float,
  private val fontSize: Float,
  private val readingSize: Float,
  private val fontFamily: String?
) : ReplacementSpan() {

  private fun dp(value: Float): Float = value * density

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

    // Background highlight (saved word / search hit) over the whole box.
    if (run.background != null) {
      val bgPaint = Paint().apply {
        color = applyAlpha(run.background, run.backgroundAlpha)
      }
      canvas.drawRect(x, top.toFloat(), x + advance, bottom.toFloat(), bgPaint)
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

  /** Base glyph paint: per-run size/typeface/color/opacity + decorations. */
  private fun basePaint(paint: Paint): Paint {
    val p = Paint(paint)
    p.textSize = dp(run.fontSize ?: fontSize)
    p.color = applyAlpha(run.color, run.opacity)
    p.typeface = makeTypeface(run)
    p.isUnderlineText = run.underline
    return p
  }

  private fun readingPaint(paint: Paint): Paint {
    val p = Paint(paint)
    p.textSize = dp(readingSize)
    p.color = applyAlpha(run.readingColor, run.opacity)
    return p
  }

  private fun makeTypeface(run: RubyParagraphRun): Typeface {
    val style = when {
      run.bold && run.italic -> Typeface.BOLD_ITALIC
      run.bold -> Typeface.BOLD
      run.italic -> Typeface.ITALIC
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
