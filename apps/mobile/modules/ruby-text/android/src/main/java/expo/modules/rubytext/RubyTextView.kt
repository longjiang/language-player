package expo.modules.rubytext

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Paint.FontMetricsInt
import android.graphics.Typeface
import android.os.Build
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.ReplacementSpan
import android.text.style.RubySpan
import android.text.style.UnderlineSpan
import android.util.TypedValue
import android.view.Gravity
import android.widget.TextView
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import kotlin.math.ceil
import kotlin.math.max

class RubySegmentRecord(
  @Field var text: String = "",
  @Field var reading: String? = null
) : Record

/**
 * Native ruby text renderer (furigana/pinyin/jyutping) backed by the platform
 * text engine: framework RubySpan on Android 12+, a custom ReplacementSpan on
 * older devices. JS measures the View fallback and passes the exact box, so
 * this view never needs to measure itself (Fabric/Yoga does not measure
 * custom host views).
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

  private val textView = TextView(context).apply {
    includeFontPadding = false
    gravity = Gravity.TOP or Gravity.START
  }

  init {
    addView(textView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    setOnClickListener { onTap() }
  }

  private fun readingSlotHeight(): Int {
    val hasReading = segments.any { !it.reading.isNullOrEmpty() }
    return if (hasReading || reserveReadingSlot) {
      (readingSize - rubyPull).toInt().coerceAtLeast(0)
    } else {
      0
    }
  }

  private fun rebuild() {
    textView.setText(buildSpannable())
    textView.setTextSize(TypedValue.COMPLEX_UNIT_PX, fontSize)
    textView.setTextColor(color)
    textView.setTypeface(makeTypeface())
    textView.setPadding(0, readingSlotHeight(), 0, 0)
  }

  private fun buildSpannable(): SpannableStringBuilder {
    val builder = SpannableStringBuilder()
    for (segment in segments) {
      val start = builder.length
      builder.append(segment.text)
      val end = builder.length
      val reading = segment.reading
      if (!reading.isNullOrEmpty()) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
          builder.setSpan(
            RubySpan(reading, RubySpan.RUBY_POSITION_OVER),
            start,
            end,
            Spanned.SPAN_EXCLUSIVE_EXCLUSIVE
          )
        } else {
          builder.setSpan(
            FallbackRubySpan(reading, readingSize, rubyPull, color),
            start,
            end,
            Spanned.SPAN_EXCLUSIVE_EXCLUSIVE
          )
        }
      }
      if (underline) {
        builder.setSpan(UnderlineSpan(), start, end, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
      }
    }
    return builder
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

/** Pre-Android-12 fallback: draws the reading above the base text, centered. */
private class FallbackRubySpan(
  private val ruby: String,
  private val readingSize: Float,
  private val rubyPull: Float,
  private val readingColor: Int
) : ReplacementSpan() {

  override fun getSize(paint: Paint, text: CharSequence?, start: Int, end: Int, fm: FontMetricsInt?): Int {
    val baseWidth = paint.measureText(text, start, end)
    val rubyPaint = Paint(paint).apply { textSize = readingSize }
    val rubyWidth = rubyPaint.measureText(ruby)
    return ceil(max(baseWidth, rubyWidth)).toInt()
  }

  override fun draw(
    canvas: Canvas,
    text: CharSequence?,
    start: Int,
    end: Int,
    x: Float,
    top: Int,
    y: Int,
    bottom: Int,
    paint: Paint
  ) {
    val rubyPaint = Paint(paint).apply {
      textSize = readingSize
      color = readingColor
    }
    val baseWidth = paint.measureText(text, start, end)
    val rubyWidth = rubyPaint.measureText(ruby)
    val rubyX = x + (baseWidth - rubyWidth) / 2f
    canvas.drawText(ruby, 0, ruby.length, rubyX, y - (readingSize - rubyPull), rubyPaint)
    canvas.drawText(text, start, end, x, y, paint)
  }
}
