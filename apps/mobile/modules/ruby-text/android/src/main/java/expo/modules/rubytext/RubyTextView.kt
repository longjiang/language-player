package expo.modules.rubytext

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.util.Log
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import kotlin.math.max

class RubySegmentRecord(
  @Field var text: String = "",
  @Field var reading: String? = null
) : Record

/**
 * Native ruby text renderer (furigana/pinyin/jyutping) for Android.
 *
 * The view draws directly in its own `draw(canvas)` instead of a child
 * TextView: under Fabric/Yoga a child added in init is never laid out or
 * drawn (stays 0x0, spans never render), so the text is painted by the
 * ExpoView itself. JS measures the View fallback and passes the exact box,
 * so this view never needs to measure itself.
 */
class RubyTextView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {

  var segments: List<RubySegmentRecord> = emptyList()
    set(value) {
      field = value
      rebuild()
    }

  var reserveReadingSlot: Boolean = false
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

  var rubyPull: Float = 0f
    set(value) {
      field = value
      rebuild()
    }

  var color: Int = Color.WHITE
    set(value) {
      field = value
      rebuild()
    }

  var readingColor: Int = Color.WHITE
    set(value) {
      field = value
      rebuild()
    }

  var fontWeight: String = "normal"
    set(value) {
      field = value
      rebuild()
    }

  var underline: Boolean = false
    set(value) {
      field = value
      rebuild()
    }

  var fontFamily: String? = null
    set(value) {
      field = value
      rebuild()
    }

  private val onTap by EventDispatcher<Unit>()

  private val basePaint = Paint(Paint.ANTI_ALIAS_FLAG)
  private val readingPaint = Paint(Paint.ANTI_ALIAS_FLAG)
  // RN passes sizes in dp; Canvas measures in px.
  private val density: Float = resources.displayMetrics.density

  private fun dp(value: Float): Float = value * density

  init {
    // Same Fabric safeguard as the paragraph view: without this a ViewGroup
    // with no background may never draw.
    setWillNotDraw(false)
    setOnClickListener { onTap(Unit) }
    Log.i("LP Mobile", "[RubyText] Android RubyTextView created (canvas renderer)")
  }

  override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
    super.onSizeChanged(w, h, oldw, oldh)
    Log.i("LP Mobile", "[RubyText] size ${w}x$h color=0x${Integer.toHexString(color)}")
  }

  private fun rebuild() {
    basePaint.textSize = dp(fontSize)
    basePaint.color = color
    basePaint.typeface = makeTypeface()
    basePaint.isUnderlineText = underline
    readingPaint.textSize = dp(readingSize)
    readingPaint.color = readingColor
    invalidate()
    Log.i(
      "LP Mobile",
      "[RubyText] rebuild segments=${segments.size} color=0x${Integer.toHexString(color)} readingColor=0x${Integer.toHexString(readingColor)}"
    )
  }

  override fun draw(canvas: Canvas) {
    super.draw(canvas)
    if (segments.isEmpty() || width <= 0 || height <= 0) return

    // Base text sits at the bottom of the measured box (mirrors the View
    // fallback: reading slot on top, base line at the bottom).
    val baseBaseline = height - basePaint.fontMetrics.descent
    // Reading sits ~2dp above the base text's ink top. The old formula
    // anchored the reading to the bottom of the reserved slot (the
    // readingSize band), leaving a wide visual gap above the base glyphs
    // (~20-40% of a CJK character height). fontMetrics.ascent is negative
    // (Android top-down coordinates), so baseBaseline + ascent is the base
    // glyphs' top edge; the reading baseline is that edge minus the gap minus
    // the reading's own descent.
    val readingBaseline =
      baseBaseline + basePaint.fontMetrics.ascent - dp(2f) - readingPaint.fontMetrics.descent

    var x = 0f
    for (segment in segments) {
      val baseWidth = basePaint.measureText(segment.text)
      val reading = segment.reading
      val readingWidth = if (!reading.isNullOrEmpty()) {
        readingPaint.measureText(reading)
      } else {
        0f
      }
      if (!reading.isNullOrEmpty()) {
        canvas.drawText(
          reading,
          x + (baseWidth - readingWidth) / 2f,
          readingBaseline,
          readingPaint
        )
      }
      canvas.drawText(segment.text, x, baseBaseline, basePaint)
      x += max(baseWidth, readingWidth)
    }
  }

  private fun makeTypeface(): Typeface {
    val style = if (fontWeight == "bold") Typeface.BOLD else Typeface.NORMAL
    val family = fontFamily
    return if (family != null) {
      Typeface.create(family, style)
    } else {
      Typeface.create(Typeface.DEFAULT, style)
    }
  }
}

fun parseColorSafely(hex: String): Int {
  return try {
    Color.parseColor(hex)
  } catch (_: IllegalArgumentException) {
    Color.WHITE
  }
}
