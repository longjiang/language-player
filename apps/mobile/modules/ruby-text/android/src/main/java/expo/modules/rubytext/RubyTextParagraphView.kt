package expo.modules.rubytext

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.util.Log
import android.view.MotionEvent
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

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
 * Paragraph-level ruby renderer for Android, mirroring the iOS
 * RubyTextParagraphView: ONE ExpoView per block draws the entire line with
 * Canvas — base text plus readings above it — instead of one native view per
 * token. JS measures an invisible RN Text and passes the exact box via style.
 *
 * Fabric/Yoga does not lay out or draw children of custom ExpoViews
 * reliably, so everything is painted in this view's own draw() (and
 * setWillNotDraw(false) guarantees draw() runs).
 */
class RubyTextParagraphView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {

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

  private val onTokenTap by EventDispatcher<Map<String, Any>>()

  private val basePaint = Paint(Paint.ANTI_ALIAS_FLAG)
  private val readingPaint = Paint(Paint.ANTI_ALIAS_FLAG)
  // RN passes sizes in dp; Canvas measures in px. Scale so a 16dp font is a
  // 16dp font on high-density screens.
  private val density: Float = resources.displayMetrics.density

  private fun dp(value: Float): Float = value * density

  private class LineRun(val run: RubyParagraphRun, var x: Float, val width: Float)

  init {
    // Critical: a ViewGroup with no background is "will not draw" by default;
    // without this Fabric skips our draw() entirely.
    setWillNotDraw(false)
    isClickable = true
    Log.i("LP Mobile", "[RubyText] Android RubyTextParagraphView created (canvas renderer)")
  }

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    Log.i("LP Mobile", "[RubyText] paragraph size ${w}x$h runs=${runs.size}")
  }

  private fun rebuild() {
    invalidate()
    Log.i(
      "LP Mobile",
      "[RubyText] paragraph rebuild runs=${runs.size} first=\"${runs.firstOrNull()?.text}\" lineHeight=$lineHeight"
    )
  }

  override fun draw(canvas: Canvas) {
    super.draw(canvas)
    if (runs.isEmpty() || width <= 0 || height <= 0) return

    val lines = buildLines()
    var lineTop = 0f
    for (line in lines) {
      val baseBaseline = lineTop + dp(lineHeight) - basePaint.fontMetrics.descent
      val readingBaseline = lineTop + dp(readingSize) - readingPaint.fontMetrics.descent
      for (lineRun in line) {
        val run = lineRun.run
        val paint = paintFor(run)
        val readingPaintForRun = readingPaintFor(run)
        if (run.background != null) {
          val bgPaint = Paint().apply {
            color = applyAlpha(run.background, run.backgroundAlpha)
          }
          canvas.drawRect(lineRun.x, lineTop, lineRun.x + lineRun.width, lineTop + dp(lineHeight), bgPaint)
        }
        val baseWidth = paint.measureText(run.text)
        if (!run.reading.isNullOrEmpty()) {
          val rubyWidth = readingPaintForRun.measureText(run.reading)
          canvas.drawText(
            run.reading,
            lineRun.x + (baseWidth - rubyWidth) / 2f,
            readingBaseline,
            readingPaintForRun
          )
        }
        canvas.drawText(run.text, lineRun.x, baseBaseline, paint)
      }
      lineTop += dp(lineHeight)
    }
  }

  private fun buildLines(): List<List<LineRun>> {
    val lines = mutableListOf<MutableList<LineRun>>()
    var current = mutableListOf<LineRun>()
    var x = 0f
    for (run in runs) {
      if (run.text == "\n") {
        if (current.isNotEmpty()) {
          lines.add(current)
          current = mutableListOf()
          x = 0f
        }
        continue
      }
      val runWidth = paintFor(run).measureText(run.text)
      if (x > 0f && x + runWidth > width && current.isNotEmpty()) {
        lines.add(current)
        current = mutableListOf()
        x = 0f
      }
      current.add(LineRun(run, x, runWidth))
      x += runWidth
    }
    if (current.isNotEmpty()) lines.add(current)

    // Basic RTL: draw each line from the right edge.
    if (isRtl) {
      for (line in lines) {
        val total = line.sumOf { it.width.toDouble() }.toFloat()
        var offset = width - total
        for (lineRun in line) {
          lineRun.x = offset
          offset += lineRun.width
        }
      }
    }
    return lines
  }

  private fun paintFor(run: RubyParagraphRun): Paint {
    val paint = Paint(basePaint)
    paint.textSize = dp(run.fontSize ?: fontSize)
    paint.color = applyAlpha(run.color, run.opacity)
    paint.typeface = makeTypeface(run)
    paint.isUnderlineText = run.underline
    return paint
  }

  private fun readingPaintFor(run: RubyParagraphRun): Paint {
    val paint = Paint(readingPaint)
    paint.textSize = dp(readingSize)
    paint.color = applyAlpha(run.readingColor, run.opacity)
    return paint
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

  override fun onTouchEvent(event: MotionEvent): Boolean {
    if (event.action == MotionEvent.ACTION_UP) {
      val x = event.x
      val y = event.y
      val lineIndex = (y / dp(lineHeight)).toInt()
      val lines = buildLines()
      if (lineIndex in lines.indices) {
        for (lineRun in lines[lineIndex]) {
          if (x >= lineRun.x && x < lineRun.x + lineRun.width && lineRun.run.tappable) {
            onTokenTap(mapOf("tokenId" to lineRun.run.tokenId))
            break
          }
        }
      }
      return true
    }
    return super.onTouchEvent(event)
  }
}
