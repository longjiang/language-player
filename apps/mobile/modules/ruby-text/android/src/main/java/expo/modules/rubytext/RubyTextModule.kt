package expo.modules.rubytext

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import android.util.Log

class RubyTextModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("RubyText")

    View(RubyTextView::class) {
      Events("onTap")

      // Parse as raw dictionaries (same as iOS): the Record converter falls
      // back to reflection when Introspectable metadata is missing, and the
      // reflection path can drop segments whose optional `reading` key is
      // absent — blanking every ruby-bearing token.
      Prop("segments") { view: RubyTextView, segments: List<Map<String, Any?>> ->
        view.segments = segments.mapNotNull { dict ->
          val text = dict["text"] as? String ?: return@mapNotNull null
          RubySegmentRecord(text = text, reading = dict["reading"] as? String)
        }
        Log.i("LP Mobile", "[RubyText] segments prop -> ${view.segments.size} runs (first=${view.segments.firstOrNull()?.text})")
      }

      Prop("reserveReadingSlot") { view: RubyTextView, reserve: Boolean ->
        view.reserveReadingSlot = reserve
      }

      Prop("fontSize") { view: RubyTextView, size: Float ->
        view.fontSize = size
      }

      Prop("lineHeight") { view: RubyTextView, height: Float ->
        view.lineHeight = height
      }

      Prop("readingSize") { view: RubyTextView, size: Float ->
        view.readingSize = size
      }

      Prop("rubyPull") { view: RubyTextView, pull: Float ->
        view.rubyPull = pull
      }

      Prop("color") { view: RubyTextView, color: String ->
        view.color = parseColorSafely(color)
      }

      Prop("readingColor") { view: RubyTextView, color: String ->
        view.readingColor = parseColorSafely(color)
      }

      Prop("fontWeight") { view: RubyTextView, weight: String ->
        view.fontWeight = weight
      }

      Prop("underline") { view: RubyTextView, underline: Boolean ->
        view.underline = underline
      }

      Prop("fontFamily") { view: RubyTextView, family: String? ->
        view.fontFamily = family
      }
    }
  }
}
