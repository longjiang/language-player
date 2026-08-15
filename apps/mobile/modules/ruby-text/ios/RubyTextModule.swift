import ExpoModulesCore

public final class RubyTextModule: Module {
  public func definition() -> ModuleDefinition {
    Name("RubyText")

    View(RubyTextView.self) {
      Prop("segments") { (view: RubyTextView, segments: [RubySegmentRecord]) in
        view.segments = segments
      }

      Prop("reserveReadingSlot") { (view: RubyTextView, reserve: Bool) in
        view.reserveReadingSlot = reserve
      }

      Prop("fontSize") { (view: RubyTextView, size: Double) in
        view.fontSize = size
      }

      Prop("lineHeight") { (view: RubyTextView, height: Double) in
        view.lineHeight = height
      }

      Prop("readingSize") { (view: RubyTextView, size: Double) in
        view.readingSize = size
      }

      Prop("rubyPull") { (view: RubyTextView, pull: Double) in
        view.rubyPull = pull
      }

      Prop("color") { (view: RubyTextView, color: UIColor?) in
        view.color = color ?? .label
      }

      Prop("fontWeight") { (view: RubyTextView, weight: String) in
        view.fontWeight = weight
      }

      Prop("underline") { (view: RubyTextView, underline: Bool) in
        view.underline = underline
      }

      Prop("fontFamily") { (view: RubyTextView, family: String?) in
        view.fontFamily = family
      }
    }
  }
}
