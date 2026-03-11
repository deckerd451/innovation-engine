import SwiftUI
import Supabase

struct MyQRView: View {
    let currentUser: User
    @State private var qrImage: UIImage?
    @State private var showingSignOutConfirmation = false
    @State private var authUserId: String?
    @State private var authProvider: String?
    
    @ObservedObject private var presence = EventPresenceService.shared
    @ObservedObject private var bleService = BLEService.shared

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 24) {
                    // QR Code Section
                    qrCodeSection
                    
                    Divider()
                    
                    // User Identity Section
                    identitySection
                    
                    Divider()
                    
                    // Event Status Section
                    eventStatusSection
                }
                .padding()
            }
            .navigationTitle("Profile")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Sign Out") {
                        showingSignOutConfirmation = true
                    }
                }
            }
            .confirmationDialog("Sign Out", isPresented: $showingSignOutConfirmation) {
                Button("Sign Out", role: .destructive) {
                    Task {
                        try? await AuthService.shared.signOut()
                    }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("Are you sure you want to sign out?")
            }
            .task {
                qrImage = QRService.generateQRCode(for: currentUser.id.uuidString)
                await loadAuthDetails()
            }
        }
    }
    
    // MARK: - QR Code Section
    
    private var qrCodeSection: some View {
        VStack(spacing: 16) {
            Text("My QR Code")
                .font(.headline)
                .foregroundColor(.secondary)
            
            if let qrImage {
                Image(uiImage: qrImage)
                    .interpolation(.none)
                    .resizable()
                    .frame(width: 200, height: 200)
                    .background(Color.white)
                    .cornerRadius(12)
                    .shadow(radius: 2)
            }
            
            Text(currentUser.name)
                .font(.title3)
                .fontWeight(.semibold)
        }
    }
    
    // MARK: - Identity Section
    
    private var identitySection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Identity")
                .font(.headline)
                .foregroundColor(.secondary)
            
            VStack(spacing: 8) {
                InfoRow(label: "Display Name", value: currentUser.name)
                
                if let email = currentUser.email {
                    InfoRow(label: "Email", value: email)
                }
                
                InfoRow(label: "Community ID", value: currentUser.id.uuidString, monospace: true)
                
                if let authId = authUserId {
                    InfoRow(label: "Auth User ID", value: authId, monospace: true)
                }
                
                if let provider = authProvider {
                    InfoRow(label: "OAuth Provider", value: provider.capitalized)
                }
            }
            .padding()
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color(.systemGray6))
            )
        }
    }
    
    // MARK: - Event Status Section
    
    private var eventStatusSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Event Mode Status")
                .font(.headline)
                .foregroundColor(.secondary)
            
            VStack(spacing: 8) {
                InfoRow(
                    label: "Event Mode",
                    value: bleService.isScanning ? "Active" : "Inactive",
                    valueColor: bleService.isScanning ? .green : .secondary
                )
                
                if let eventName = presence.currentEvent {
                    InfoRow(label: "Current Event", value: eventName)
                } else if bleService.isScanning {
                    InfoRow(label: "Current Event", value: "Searching for beacon...", valueColor: .orange)
                } else {
                    InfoRow(label: "Current Event", value: "None", valueColor: .secondary)
                }
                
                if presence.isWritingPresence {
                    HStack {
                        Image(systemName: "antenna.radiowaves.left.and.right")
                            .foregroundColor(.green)
                            .font(.caption)
                        Text("Broadcasting presence")
                            .font(.caption)
                            .foregroundColor(.green)
                    }
                    .padding(.top, 4)
                }
            }
            .padding()
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color(.systemGray6))
            )
        }
    }
    
    // MARK: - Helpers
    
    private func loadAuthDetails() async {
        do {
            let supabase = AppEnvironment.shared.supabaseClient
            let session = try await supabase.auth.session
            
            await MainActor.run {
                authUserId = session.user.id.uuidString
                
                if let provider = session.user.appMetadata["provider"]?.stringValue {
                    authProvider = provider
                } else if case let .array(values)? = session.user.appMetadata["providers"] {
                    let providers = values.compactMap { $0.stringValue }
                    if let first = providers.first {
                        authProvider = first
                    }
                }
            }
        } catch {
            print("Failed to load auth details: \(error)")
        }
    }
}

// MARK: - Info Row Component

struct InfoRow: View {
    let label: String
    let value: String
    var monospace: Bool = false
    var valueColor: Color = .primary
    
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.caption)
                .foregroundColor(.secondary)
            
            Text(value)
                .font(monospace ? .system(.caption, design: .monospaced) : .caption)
                .foregroundColor(valueColor)
                .textSelection(.enabled)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
