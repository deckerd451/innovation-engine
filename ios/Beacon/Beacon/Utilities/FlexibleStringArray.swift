import Foundation

/// Decodes a value that may be a proper JSON string array, a bracketed plain-text string,
/// or a bare comma-separated string from the database.
///
/// Handles all of these forms:
///   1. `["A","B","C"]`              — proper JSON array (decoded natively)
///   2. `A, B, C`                    — plain comma-separated text
///   3. `[A, B, C]`                  — bracketed plain text (not valid JSON)
///   4. `["A", "B", "C"]`           — bracketed with inner quotes
struct FlexibleStringArray: Codable {
    let values: [String]

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()

        // Try native JSON array first — this is the happy path
        if let array = try? container.decode([String].self) {
            self.values = array
            return
        }

        // Fall back to string parsing
        if let raw = try? container.decode(String.self) {
            self.values = Self.parse(raw)
        } else {
            self.values = []
        }
    }

    // Also allow direct construction for testing / reuse
    init(values: [String]) {
        self.values = values
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(values)
    }

    // MARK: - Shared parser

    /// Parses a raw string into an array of clean items.
    /// Strips outer brackets, splits on commas, trims whitespace and wrapping quotes.
    static func parse(_ raw: String) -> [String] {
        var s = raw.trimmingCharacters(in: .whitespacesAndNewlines)

        // Strip outer square brackets if present
        if s.hasPrefix("[") && s.hasSuffix("]") {
            s = String(s.dropFirst().dropLast())
        }

        guard !s.isEmpty else { return [] }

        return s
            .components(separatedBy: ",")
            .map { item in
                var trimmed = item.trimmingCharacters(in: .whitespacesAndNewlines)
                // Strip wrapping double-quotes
                if trimmed.hasPrefix("\"") && trimmed.hasSuffix("\"") && trimmed.count >= 2 {
                    trimmed = String(trimmed.dropFirst().dropLast())
                }
                return trimmed
            }
            .filter { !$0.isEmpty }
    }
}
