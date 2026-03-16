import SwiftUI

/// Lightweight person detail screen shown when tapping an attendee
struct PersonDetailView: View {
    let attendee: EventAttendee
    
    @State private var showingFindSheet = false
    
    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                // Avatar
                AvatarView(
                    imageUrl: attendee.avatarUrl,
                    name: attendee.name,
                    size: 100
                )
                .padding(.top, 24)
                
                // Bio
                if let bio = attendee.bio, !bio.isEmpty {
                    Text(bio)
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 32)
                }
                
                // Skills
                if let skills = attendee.skills, !skills.isEmpty {
                    tagSection(title: "Skills", tags: skills, color: .blue)
                }
                
                // Interests
                if let interests = attendee.interests, !interests.isEmpty {
                    tagSection(title: "Interests", tags: interests, color: .green)
                }
                
                // Status
                HStack(spacing: 8) {
                    Circle()
                        .fill(attendee.isActiveNow ? Color.green : Color.gray)
                        .frame(width: 8, height: 8)
                    Text(attendee.lastSeenText)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                .padding(.top, 8)
                
                // Find Person button
                Button(action: { showingFindSheet = true }) {
                    Label("Find Person", systemImage: "location.circle.fill")
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.blue)
                        .foregroundColor(.white)
                        .cornerRadius(12)
                }
                .padding(.horizontal, 32)
                .padding(.top, 8)
                
                Spacer(minLength: 40)
            }
        }
        .navigationTitle(attendee.name)
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showingFindSheet) {
            FindAttendeeView(attendee: attendee)
        }
    }
    
    // MARK: - Tag Section
    
    private func tagSection(title: String, tags: [String], color: Color) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.caption)
                .foregroundColor(.secondary)
                .textCase(.uppercase)
            
            FlowLayout(spacing: 8) {
                ForEach(tags, id: \.self) { tag in
                    Text(tag)
                        .font(.caption)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(
                            RoundedRectangle(cornerRadius: 12)
                                .fill(color.opacity(0.1))
                        )
                        .foregroundColor(color)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 32)
    }
}
