import UIKit

/** One tappable text run inside the paragraph-level ruby renderer. */
internal struct RubyTextParagraphRun {
  let text: String
  let reading: String?
  let tokenId: Int
  let fontSize: Double?
  let tappable: Bool
  let color: UIColor
  let readingColor: UIColor
  let bold: Bool
  let underline: Bool
  let background: UIColor?
  let backgroundAlpha: Double
  let opacity: Double
}

internal extension UIColor {
  /// Parses "#RRGGBB" or "#RRGGBBAA". Returns nil for anything else.
  convenience init?(lpHex: String?) {
    guard var hex = lpHex, hex.hasPrefix("#") else { return nil }
    hex.removeFirst()
    guard hex.count == 6 || hex.count == 8, let value = UInt64(hex, radix: 16) else {
      return nil
    }

    let r: UInt64
    let g: UInt64
    let b: UInt64
    let a: UInt64
    if hex.count == 8 {
      r = (value >> 24) & 0xff
      g = (value >> 16) & 0xff
      b = (value >> 8) & 0xff
      a = value & 0xff
    } else {
      r = (value >> 16) & 0xff
      g = (value >> 8) & 0xff
      b = value & 0xff
      a = 0xff
    }

    self.init(
      red: CGFloat(r) / 255,
      green: CGFloat(g) / 255,
      blue: CGFloat(b) / 255,
      alpha: CGFloat(a) / 255
    )
  }
}
