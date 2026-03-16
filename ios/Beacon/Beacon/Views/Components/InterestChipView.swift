import SwiftUI

/// Single interest/skill chip with constrained width and truncation
struct InterestChipView: View {
    let text: String
    var color: Color = .blue
    
    var body: some View {
        Text(text)
            .font(.caption2)
            .lineLimit(1)
            .truncationMode(.tail)
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .frame(maxWidth: 160)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(color.opacity(0.2))
            )
            .foregroundColor(color)
    }
}

/// Wrapping chip layout that respects screen bounds
struct WrappingChipsView: View {
    let tags: [String]
    var color: Color = .blue
    var maxVisible: Int = 6
    
    var body: some View {
        let visible = Array(tags.prefix(maxVisible))
        
        FlowLayout(spacing: 6) {
            ForEach(visible, id: \.self) { tag in
                InterestChipView(text: tag, color: color)
            }
            if tags.count > maxVisible {
                Text("+\(tags.count - maxVisible)")
                    .font(.caption2)
                    .foregroundColor(.gray)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
            }
        }
    }
}
