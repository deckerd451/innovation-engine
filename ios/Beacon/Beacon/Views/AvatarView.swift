import SwiftUI

/// Reusable avatar component that renders a remote image or initials fallback
struct AvatarView: View {
    let imageUrl: String?
    let name: String
    let size: CGFloat
    var placeholderColor: Color = .blue
    
    var body: some View {
        Group {
            if let imageUrl, let url = URL(string: imageUrl) {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .empty:
                        ProgressView()
                            .frame(width: size, height: size)
                    case .success(let image):
                        image
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                            .frame(width: size, height: size)
                            .clipShape(Circle())
                    case .failure:
                        initialsCircle
                    @unknown default:
                        initialsCircle
                    }
                }
            } else {
                initialsCircle
            }
        }
        .frame(width: size, height: size)
    }
    
    private var initialsCircle: some View {
        Circle()
            .fill(placeholderColor.opacity(0.2))
            .overlay(
                Text(initials)
                    .font(fontSize)
                    .fontWeight(.semibold)
                    .foregroundColor(placeholderColor)
            )
    }
    
    private var initials: String {
        let components = name.components(separatedBy: " ")
        if components.count >= 2 {
            let first = components[0].prefix(1)
            let last = components[1].prefix(1)
            return "\(first)\(last)".uppercased()
        }
        return String(name.prefix(2)).uppercased()
    }
    
    private var fontSize: Font {
        if size >= 80 { return .largeTitle }
        if size >= 50 { return .title2 }
        return .headline
    }
}
