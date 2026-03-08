import SwiftUI

struct SuggestedConnectionsView: View {
    @State private var suggestions: [SuggestedConnection] = []
    @State private var isLoading = false
    @State private var isGenerating = false
    @State private var errorMessage: String?
    @State private var selectedGroupId: UUID?
    @State private var currentCommunityId: UUID?
    
    private let service = SuggestedConnectionsService.shared
    
    var body: some View {
        VStack(spacing: 0) {
            // Generate Button
            generateButton
            
            // Suggestions List
            if isLoading {
                ProgressView("Loading suggestions...")
                    .padding()
            } else if suggestions.isEmpty {
                emptyState
            } else {
                suggestionsList
            }
        }
        .navigationTitle("Suggested Connections")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await resolveCommunityId()
            await loadSuggestions()
        }
        .alert("Error", isPresented: .constant(errorMessage != nil)) {
            Button("OK") {
                errorMessage = nil
            }
        } message: {
            if let error = errorMessage {
                Text(error)
            }
        }
    }
    
    // MARK: - Components
    
    private var generateButton: some View {
        Button {
            Task {
                await generateSuggestions()
            }
        } label: {
            HStack {
                if isGenerating {
                    ProgressView()
                        .tint(.white)
                } else {
                    Image(systemName: "sparkles")
                }
                Text(isGenerating ? "Generating..." : "Generate Suggestions")
            }
            .frame(maxWidth: .infinity)
            .padding()
            .background(Color.blue)
            .foregroundColor(.white)
            .cornerRadius(12)
        }
        .disabled(isGenerating || currentCommunityId == nil)
        .padding()
    }
    
    private var emptyState: some View {
        VStack(spacing: 16) {
            Image(systemName: "person.2.slash")
                .font(.system(size: 60))
                .foregroundColor(.gray)
            
            Text("No Suggestions Yet")
                .font(.title2)
                .fontWeight(.semibold)
            
            Text("Tap 'Generate Suggestions' to find people you were near at the event.")
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)
        }
        .frame(maxHeight: .infinity)
    }
    
    private var suggestionsList: some View {
        List {
            ForEach(suggestions) { suggestion in
                SuggestionRow(suggestion: suggestion) { action in
                    await handleAction(action, for: suggestion)
                }
            }
        }
        .listStyle(.plain)
    }
    
    // MARK: - Actions
    
    private func resolveCommunityId() async {
        do {
            currentCommunityId = try await service.resolveCurrentUserCommunityId()
        } catch {
            errorMessage = "Failed to resolve user ID: \(error.localizedDescription)"
        }
    }
    
    private func loadSuggestions() async {
        guard let communityId = currentCommunityId else { return }
        
        isLoading = true
        errorMessage = nil
        
        do {
            suggestions = try await service.fetchSuggestions(for: communityId)
        } catch {
            errorMessage = "Failed to load suggestions: \(error.localizedDescription)"
        }
        
        isLoading = false
    }
    
    private func generateSuggestions() async {
        isGenerating = true
        errorMessage = nil
        
        do {
            let count = try await service.generateSuggestions(
                groupId: selectedGroupId,
                minOverlapSeconds: 120,
                lookbackMinutes: 240
            )
            
            // Reload suggestions
            await loadSuggestions()
            
            if count == 0 {
                errorMessage = "No new suggestions found. Make sure Event Mode was active."
            }
        } catch {
            errorMessage = "Failed to generate suggestions: \(error.localizedDescription)"
        }
        
        isGenerating = false
    }
    
    private func handleAction(_ action: SuggestionAction, for suggestion: SuggestedConnection) async {
        do {
            switch action {
            case .accept:
                try await service.acceptSuggestion(edgeId: suggestion.edgeId)
            case .ignore:
                try await service.ignoreSuggestion(edgeId: suggestion.edgeId)
            case .block:
                try await service.blockSuggestion(edgeId: suggestion.edgeId)
            }
            
            // Remove from list
            suggestions.removeAll { $0.id == suggestion.id }
        } catch {
            errorMessage = "Action failed: \(error.localizedDescription)"
        }
    }
}

// MARK: - SuggestionRow

struct SuggestionRow: View {
    let suggestion: SuggestedConnection
    let onAction: (SuggestionAction) async -> Void
    
    @State private var isProcessing = false
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // User Info
            HStack {
                Circle()
                    .fill(Color.blue.opacity(0.2))
                    .frame(width: 50, height: 50)
                    .overlay(
                        Text(suggestion.displayName.prefix(2).uppercased())
                            .font(.headline)
                            .foregroundColor(.blue)
                    )
                
                VStack(alignment: .leading, spacing: 4) {
                    Text(suggestion.displayName)
                        .font(.headline)
                    
                    HStack(spacing: 12) {
                        Label("\(suggestion.overlapMinutes) min", systemImage: "clock")
                        Label("\(Int(suggestion.confidence * 100))%", systemImage: "chart.bar.fill")
                    }
                    .font(.caption)
                    .foregroundColor(.secondary)
                }
                
                Spacer()
            }
            
            // Action Buttons
            if !isProcessing {
                HStack(spacing: 12) {
                    actionButton(
                        title: "Accept",
                        icon: "checkmark.circle.fill",
                        color: .green,
                        action: .accept
                    )
                    
                    actionButton(
                        title: "Ignore",
                        icon: "xmark.circle",
                        color: .gray,
                        action: .ignore
                    )
                    
                    actionButton(
                        title: "Block",
                        icon: "hand.raised.fill",
                        color: .red,
                        action: .block
                    )
                }
            } else {
                ProgressView()
                    .frame(maxWidth: .infinity)
            }
        }
        .padding(.vertical, 8)
    }
    
    private func actionButton(title: String, icon: String, color: Color, action: SuggestionAction) -> some View {
        Button {
            Task {
                isProcessing = true
                await onAction(action)
                isProcessing = false
            }
        } label: {
            Label(title, systemImage: icon)
                .font(.caption)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(color.opacity(0.1))
                .foregroundColor(color)
                .cornerRadius(8)
        }
    }
}

// MARK: - SuggestionAction

enum SuggestionAction {
    case accept
    case ignore
    case block
}

struct SuggestedConnectionsView_Previews: PreviewProvider {
    static var previews: some View {
        NavigationView {
            SuggestedConnectionsView()
        }
    }
}
