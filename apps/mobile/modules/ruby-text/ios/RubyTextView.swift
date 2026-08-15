import CoreText
import ExpoModulesCore
import UIKit

/**
 * Renders ruby-annotated text (furigana, pinyin, jyutping) with the platform
 * text engine instead of View columns.
 *
 * The view never measures itself: JS (apps/mobile/components/RubyText.tsx)
 * measures the View-based fallback once and passes the exact box via `style`,
 * so switching between fallback and native rendering is layout-neutral.
 *
 * The base text is drawn by a UILabel offset below the reserved reading slot;
 * Core Text draws the reading above the base line via
 * kCTRubyAnnotationAttributeName / CTRubyAnnotation. Note: CTRubyAnnotation
 * renders the reading in the base run's color, so a separate muted reading
 * color is not possible on iOS (Android's RubySpan has the same limitation).
 */
internal final class RubyTextView: ExpoView {
  private let label = UILabel()
  let onTap = EventDispatcher()

  var segments: [RubySegmentRecord] = [] { didSet { rebuild() } }
  var reserveReadingSlot = false { didSet { rebuild() } }
  var fontSize: Double = 16 { didSet { rebuild() } }
  var lineHeight: Double = 26 { didSet { rebuild() } }
  var readingSize: Double = 9 { didSet { rebuild() } }
  var rubyPull: Double = 0 { didSet { rebuild() } }
  var color: UIColor = .label { didSet { rebuild() } }
  var readingColor: UIColor = .secondaryLabel { didSet { rebuild() } }
  var fontWeight = "normal" { didSet { rebuild() } }
  var underline = false { didSet { rebuild() } }
  var fontFamily: String? { didSet { rebuild() } }

  private var attributedString: NSAttributedString?

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)

    isOpaque = false
    clipsToBounds = false

    label.backgroundColor = .clear
    label.numberOfLines = 1
    label.lineBreakMode = .byClipping
    label.isOpaque = false
    addSubview(label)

    let tap = UITapGestureRecognizer(target: self, action: #selector(handleTap))
    addGestureRecognizer(tap)
  }

  @objc
  private func handleTap() {
    onTap()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    label.frame = CGRect(
      x: 0,
      y: readingSlotHeight(),
      width: bounds.width,
      height: max(0, bounds.height - readingSlotHeight())
    )
  }

  private func rebuild() {
    attributedString = makeAttributedString()
    label.attributedText = attributedString
    setNeedsLayout()
  }

  private func readingSlotHeight() -> CGFloat {
    let hasReading = segments.contains { $0.reading != nil && !$0.reading!.isEmpty }
    return (hasReading || reserveReadingSlot) ? CGFloat(readingSize - rubyPull) : 0
  }

  private func makeAttributedString() -> NSAttributedString? {
    guard !segments.isEmpty else { return nil }

    let baseFont = makeBaseFont()
    let paragraph = NSMutableParagraphStyle()
    paragraph.minimumLineHeight = CGFloat(lineHeight)
    paragraph.maximumLineHeight = CGFloat(lineHeight)
    // Center the base text in the box. The box is sized to the widest of the
    // reading or the base (measured from the View fallback), so centering
    // reproduces the fallback's column look: a wide reading stays centered
    // over its base instead of being left-aligned with the first glyph.
    paragraph.alignment = .center

    var baseAttributes: [NSAttributedString.Key: Any] = [
      .font: baseFont,
      .foregroundColor: color,
      .paragraphStyle: paragraph,
    ]
    if underline {
      baseAttributes[.underlineStyle] = NSUnderlineStyle.single.rawValue
    }

    let result = NSMutableAttributedString()
    for segment in segments {
      let range = NSRange(location: result.length, length: (segment.text as NSString).length)
      result.append(NSAttributedString(string: segment.text, attributes: baseAttributes))

      if let reading = segment.reading, !reading.isEmpty {
        let annotation = makeRubyAnnotation(reading: reading, baseFontSize: baseFont.pointSize)
        result.addAttribute(
          NSAttributedString.Key(kCTRubyAnnotationAttributeName as String),
          value: annotation,
          range: range
        )
      }
    }
    return result
  }

  private func makeBaseFont() -> UIFont {
    let weight: UIFont.Weight = fontWeight == "bold" ? .bold : .regular
    if let family = fontFamily, !family.isEmpty {
      if fontWeight == "bold", let boldFont = UIFont(name: "\(family)-Bold", size: CGFloat(fontSize)) {
        return boldFont
      }
      if let font = UIFont(name: family, size: CGFloat(fontSize)) {
        return font
      }
    }
    return UIFont.systemFont(ofSize: CGFloat(fontSize), weight: weight)
  }

  private func makeRubyAnnotation(reading: String, baseFontSize: CGFloat) -> CTRubyAnnotation {
    // CreateWithAttributes (rather than the legacy Create) is required for
    // UILabel/TextKit to draw ruby on modern iOS, and lets the reading carry
    // its own font size and muted color.
    let readingFont = UIFont.systemFont(ofSize: CGFloat(readingSize), weight: .regular)
    let attributes: [String: Any] = [
      kCTFontAttributeName as String: readingFont,
      kCTForegroundColorAttributeName as String: readingColor,
    ]
    // Swift imports the C function as CTRubyAnnotationCreateWithAttributes(_:_:_:_:_:) —
    // no argument labels.
    return CTRubyAnnotationCreateWithAttributes(
      .center,
      .auto,
      .before,
      reading as CFString,
      attributes as CFDictionary
    )
  }
}
