import ExpoModulesCore

public final class RubyTextModule: Module {
  public func definition() -> ModuleDefinition {
    Name("RubyText")

    View(RubyTextView.self) {
      Events("onTap")

      // Parse as raw dictionaries: the [RubySegmentRecord] record converter
      // choked on NSNull for a missing reading, silently blanking every token
      // that contained a kana-only segment. `reading` is explicitly optional
      // here so null/missing values map to nil instead of failing the array.
      Prop("segments") { (view: RubyTextView, segments: [[String: Any]]) in
        view.segments = segments.compactMap { dict in
          guard let text = dict["text"] as? String else { return nil }
          return RubySegmentRecord(text: text, reading: dict["reading"] as? String)
        }
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

      Prop("readingColor") { (view: RubyTextView, color: UIColor?) in
        view.readingColor = color ?? .secondaryLabel
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
