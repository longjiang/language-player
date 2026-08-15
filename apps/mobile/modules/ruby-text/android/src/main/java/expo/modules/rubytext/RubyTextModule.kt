package expo.modules.rubytext

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class RubyTextModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("RubyText")

    View(RubyTextView::class) {
      Events("onTap")

      Prop("segments") { view: RubyTextView, segments: List<RubySegmentRecord> ->
        view.segments = segments
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
