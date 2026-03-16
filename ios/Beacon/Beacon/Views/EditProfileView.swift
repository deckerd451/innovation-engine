import SwiftUI

struct EditProfileView: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var authService = AuthService.shared
    
    let currentUser: User
    
    @State private var name: String
    @State private var bio: String
    @State private var skillsText: String
    @State private var interestsText: String
    
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var showingSuccess = false
    
    init(currentUser: User) {
        self.currentUser = currentUser
        _name = State(initialValue: currentUser.name)
        _bio = State(initialValue: currentUser.bio ?? "")
        _skillsText = State(initialValue: currentUser.skills?.joined(separator: ", ") ?? "")
        _interestsText = State(initialValue: currentUser.interests?.joined(separator: ", ") ?? "")
    }
    
    var body: some View {
        NavigationView {
            Form {
                Section(header: Text("Basic Info")) {
                    TextField("Name", text: $name)
                        .textContentType(.name)
                    
                    TextField("Bio", text: $bio, axis: .vertical)
                        .lineLimit(3...6)
                }
                
                Section(header: Text("Skills"), footer: Text("Separate with commas")) {
                    TextField("e.g. Swift, React, Design", text: $skillsText, axis: .vertical)
                        .lineLimit(2...4)
                }
                
                Section(header: Text("Interests"), footer: Text("Separate with commas")) {
                    TextField("e.g. Music, Art, Technology", text: $interestsText, axis: .vertical)
                        .lineLimit(2...4)
                }
                
                if let error = errorMessage {
                    Section {
                        Text(error)
                            .foregroundColor(.red)
                            .font(.caption)
                    }
                }
            }
            .navigationTitle("Edit Profile")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
                
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Save") {
                        Task {
                            await saveProfile()
                        }
                    }
                    .disabled(isSaving || name.isEmpty)
                }
            }
            .disabled(isSaving)
            .overlay {
                if isSaving {
                    ProgressView("Saving...")
                        .padding()
                        .background(
                            RoundedRectangle(cornerRadius: 12)
                                .fill(Color(.systemBackground))
                                .shadow(radius: 8)
                        )
                }
            }
            .alert("Profile Updated", isPresented: $showingSuccess) {
                Button("OK") {
                    dismiss()
                }
            } message: {
                Text("Your profile has been updated successfully.")
            }
        }
    }
    
    // MARK: - Save Profile
    
    private func saveProfile() async {
        guard !name.isEmpty else {
            errorMessage = "Name is required"
            return
        }
        
        isSaving = true
        errorMessage = nil
        
        do {
            // Parse skills and interests
            let skills = parseCommaSeparated(skillsText)
            let interests = parseCommaSeparated(interestsText)
            
            // Update profile
            try await ProfileService.shared.updateProfile(
                profileId: currentUser.id,
                name: name.trimmingCharacters(in: .whitespacesAndNewlines),
                bio: bio.isEmpty ? nil : bio.trimmingCharacters(in: .whitespacesAndNewlines),
                skills: skills.isEmpty ? nil : skills,
                interests: interests.isEmpty ? nil : interests
            )
            
            // Refresh auth service to reload profile
            await authService.refreshProfile()
            
            await MainActor.run {
                isSaving = false
                showingSuccess = true
            }
            
        } catch {
            await MainActor.run {
                isSaving = false
                errorMessage = "Failed to save: \(error.localizedDescription)"
            }
        }
    }
    
    // MARK: - Helpers
    
    private func parseCommaSeparated(_ text: String) -> [String] {
        text
            .components(separatedBy: ",")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
    }
}

#Preview {
    EditProfileView(currentUser: User(
        id: UUID(),
        userId: UUID(),
        name: "Doug Hamilton",
        email: "doug@example.com",
        bio: "Human centered design • AI • Founder",
        skills: ["Swift", "Product Design", "AI"],
        interests: ["Technology", "Design", "Innovation"],
        imageUrl: nil,
        imagePath: nil,
        profileCompleted: true,
        connectionCount: 5,
        createdAt: Date(),
        updatedAt: Date()
    ))
}
