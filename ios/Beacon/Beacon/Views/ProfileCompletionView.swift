import SwiftUI

struct ProfileCompletionView: View {
    let profile: User
    let onComplete: () -> Void
    
    @State private var name: String
    @State private var bio: String
    @State private var skillsText: String
    @State private var interestsText: String
    
    @State private var isSaving = false
    @State private var showError = false
    @State private var errorMessage = ""
    
    init(profile: User, onComplete: @escaping () -> Void) {
        self.profile = profile
        self.onComplete = onComplete
        
        // Initialize with existing values
        _name = State(initialValue: profile.name)
        _bio = State(initialValue: profile.bio ?? "")
        _skillsText = State(initialValue: profile.skills?.joined(separator: ", ") ?? "")
        _interestsText = State(initialValue: profile.interests?.joined(separator: ", ") ?? "")
    }
    
    var body: some View {
        NavigationView {
            Form {
                Section(header: Text("About You")) {
                    TextField("Name", text: $name)
                        .textContentType(.name)
                    
                    TextField("Bio", text: $bio, axis: .vertical)
                        .lineLimit(3...6)
                }
                
                Section(header: Text("Skills")) {
                    TextField("e.g., Swift, Design, Marketing", text: $skillsText)
                    
                    Text("Separate multiple skills with commas")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                
                Section(header: Text("Interests")) {
                    TextField("e.g., AI, Music, Hiking", text: $interestsText)
                    
                    Text("Separate multiple interests with commas")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                
                Section {
                    Button(action: saveProfile) {
                        HStack {
                            if isSaving {
                                ProgressView()
                                    .progressViewStyle(.circular)
                            }
                            Text(isSaving ? "Saving..." : "Complete Profile")
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .disabled(isSaving || !isValid)
                }
            }
            .navigationTitle("Complete Your Profile")
            .navigationBarTitleDisplayMode(.inline)
            .alert("Error", isPresented: $showError) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(errorMessage)
            }
        }
    }
    
    private var isValid: Bool {
        !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
    
    private func saveProfile() {
        guard !isSaving else { return }
        guard isValid else { return }
        
        isSaving = true
        
        Task {
            do {
                let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
                let trimmedBio = bio.trimmingCharacters(in: .whitespacesAndNewlines)
                let skills = parseCommaSeparated(skillsText)
                let interests = parseCommaSeparated(interestsText)
                
                try await ProfileService.shared.updateProfile(
                    profileId: profile.id,
                    name: trimmedName,
                    bio: trimmedBio.isEmpty ? nil : trimmedBio,
                    skills: skills.isEmpty ? nil : skills,
                    interests: interests.isEmpty ? nil : interests
                )
                
                await MainActor.run {
                    isSaving = false
                    onComplete()
                }
                
                print("[ProfileCompletion] ✅ Profile saved successfully")
                
            } catch {
                await MainActor.run {
                    isSaving = false
                    errorMessage = "Failed to save profile: \(error.localizedDescription)"
                    showError = true
                }
                
                print("[ProfileCompletion] ❌ Save failed: \(error)")
            }
        }
    }
    
    private func parseCommaSeparated(_ text: String) -> [String] {
        text.split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
    }
}
