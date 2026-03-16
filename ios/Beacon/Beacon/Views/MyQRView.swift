import SwiftUI
import Supabase
import PhotosUI

struct MyQRView: View {
    let currentUser: User
    @State private var qrImage: UIImage?
    @State private var showingSignOutConfirmation = false
    @State private var showingEditProfile = false
    @State private var showingPhotoOptions = false
    @State private var showingPhotoPicker = false
    @State private var selectedPhotoItem: PhotosPickerItem?
    @State private var isUploadingPhoto = false
    @State private var uploadError: String?
    @State private var authUserId: String?
    @State private var authProvider: String?
    
    @ObservedObject private var presence = EventPresenceService.shared
    @ObservedObject private var bleService = BLEService.shared
    @ObservedObject private var authService = AuthService.shared

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 24) {
                    // Profile Section
                    profileSection
                    
                    // Edit Profile Button
                    Button(action: { showingEditProfile = true }) {
                        Label("Edit Profile", systemImage: "pencil")
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(Color.blue)
                            .foregroundColor(.white)
                            .cornerRadius(12)
                    }
                    
                    Divider()
                    
                    // QR Code Section
                    qrCodeSection
                    
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
            .photosPicker(
                isPresented: $showingPhotoPicker,
                selection: $selectedPhotoItem,
                matching: .images
            )
            .onChange(of: selectedPhotoItem) { oldValue, newValue in
                print("[EditProfilePhoto] 🔄 selectedPhotoItem onChange triggered")
                print("[EditProfilePhoto]    Old: \(oldValue != nil ? "exists" : "nil")")
                print("[EditProfilePhoto]    New: \(newValue != nil ? "exists" : "nil")")
                if let newValue {
                    print("[EditProfilePhoto] ✅ Starting upload task")
                    Task {
                        await uploadPhoto(newValue)
                    }
                } else {
                    print("[EditProfilePhoto] ⚠️ New value is nil, skipping upload")
                }
            }
            .sheet(isPresented: $showingEditProfile) {
                EditProfileView(currentUser: displayUser)
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
                let payload = currentUser.id.uuidString
                print("[QR] 🔑 Generating QR with community.id: \(payload)")
                print("[QR]    Full payload: beacon://profile/\(payload)")
                qrImage = QRService.generateQRCode(for: payload)
                await loadAuthDetails()
            }
        }
    }
    
    // MARK: - Profile Section
    
    private var profileSection: some View {
        VStack(spacing: 16) {
            // Avatar with tap gesture
            Button(action: {
                print("[EditProfilePhoto] 🎯 Avatar tapped")
                print("[EditProfilePhoto]    Current imageUrl: \(displayUser.imageUrl ?? "nil")")
                showingPhotoOptions = true
            }) {
                ZStack(alignment: .bottomTrailing) {
                    avatarView
                        .frame(width: 100, height: 100)
                    
                    // Camera badge
                    Image(systemName: displayUser.imageUrl != nil ? "pencil.circle.fill" : "camera.circle.fill")
                        .font(.title2)
                        .foregroundColor(.blue)
                        .background(Circle().fill(Color.white))
                }
            }
            .disabled(isUploadingPhoto)
            .confirmationDialog("Profile Photo", isPresented: $showingPhotoOptions) {
                Button(displayUser.imageUrl != nil ? "Change Photo" : "Add Photo") {
                    print("[EditProfilePhoto] 📸 \(displayUser.imageUrl != nil ? "Change" : "Add") Photo selected")
                    print("[EditProfilePhoto] 🔄 Setting showingPhotoPicker = true")
                    showingPhotoPicker = true
                }
                
                if displayUser.imageUrl != nil {
                    Button("Remove Photo", role: .destructive) {
                        print("[EditProfilePhoto] 🗑️ Remove Photo tapped")
                        Task {
                            await removePhoto()
                        }
                    }
                }
                
                Button("Cancel", role: .cancel) {
                    print("[EditProfilePhoto] ❌ Cancel tapped")
                }
            }
            
            // Upload progress or error
            if isUploadingPhoto {
                ProgressView("Uploading...")
                    .font(.caption)
            } else if let error = uploadError {
                Text(error)
                    .font(.caption)
                    .foregroundColor(.red)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            }
            
            // Name
            Text(displayUser.name)
                .font(.title2)
                .fontWeight(.bold)
            
            // Bio
            if let bio = displayUser.bio, !bio.isEmpty {
                Text(bio)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
            }
            
            // Skills
            if let skills = displayUser.skills, !skills.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Skills")
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .textCase(.uppercase)
                    
                    FlowLayout(spacing: 8) {
                        ForEach(skills, id: \.self) { skill in
                            Text(skill)
                                .font(.caption)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 5)
                                .background(
                                    RoundedRectangle(cornerRadius: 12)
                                        .fill(Color.blue.opacity(0.1))
                                )
                                .foregroundColor(.blue)
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal)
            }
            
            // Interests
            if let interests = displayUser.interests, !interests.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Interests")
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .textCase(.uppercase)
                    
                    FlowLayout(spacing: 8) {
                        ForEach(interests, id: \.self) { interest in
                            Text(interest)
                                .font(.caption)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 5)
                                .background(
                                    RoundedRectangle(cornerRadius: 12)
                                        .fill(Color.green.opacity(0.1))
                                )
                                .foregroundColor(.green)
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal)
            }
        }
    }
    
    private var avatarView: some View {
        Group {
            if let imageUrl = displayUser.imageUrl, let url = URL(string: imageUrl) {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .empty:
                        ProgressView()
                            .frame(width: 100, height: 100)
                    case .success(let image):
                        image
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                            .frame(width: 100, height: 100)
                            .clipShape(Circle())
                    case .failure:
                        initialsPlaceholder
                    @unknown default:
                        initialsPlaceholder
                    }
                }
            } else {
                initialsPlaceholder
            }
        }
    }
    
    private var initialsPlaceholder: some View {
        Circle()
            .fill(Color.blue.opacity(0.2))
            .overlay(
                Text(initials)
                    .font(.largeTitle)
                    .fontWeight(.bold)
                    .foregroundColor(.blue)
            )
    }
    
    private var initials: String {
        let components = displayUser.name.components(separatedBy: " ")
        if components.count >= 2 {
            let first = components[0].prefix(1)
            let last = components[1].prefix(1)
            return "\(first)\(last)".uppercased()
        } else {
            return String(displayUser.name.prefix(2)).uppercased()
        }
    }
    
    /// Use the latest user from AuthService if available, otherwise use passed-in user
    private var displayUser: User {
        authService.currentUser ?? currentUser
    }
    
    // MARK: - Photo Management
    
    private func uploadPhoto(_ item: PhotosPickerItem) async {
        print("[EditProfilePhoto] 📤 uploadPhoto() called")
        print("[EditProfilePhoto]    User ID: \(displayUser.id)")
        
        isUploadingPhoto = true
        uploadError = nil
        
        do {
            print("[EditProfilePhoto] 📥 Loading raw image data from picker...")
            
            // Load raw image data from picker
            guard let rawData = try await item.loadTransferable(type: Data.self) else {
                print("[EditProfilePhoto] ❌ Failed to load transferable data")
                throw ProfileImageError.failedToLoadImage
            }
            
            print("[EditProfilePhoto] ✅ Raw data loaded: \(rawData.count) bytes")
            print("[EditProfilePhoto] 🔄 Processing image...")
            
            // Process image (resize and compress)
            let processedData = try ProfileImageService.shared.processImageData(rawData)
            
            print("[EditProfilePhoto] ✅ Image processed: \(processedData.count) bytes")
            print("[EditProfilePhoto] ⬆️ Uploading to storage...")
            
            // Upload to storage
            let result = try await ProfileImageService.shared.uploadProfileImage(
                processedData,
                for: displayUser.id
            )
            
            print("[EditProfilePhoto] ✅ Upload successful!")
            print("[EditProfilePhoto]    Image URL: \(result.imageUrl)")
            print("[EditProfilePhoto]    Image Path: \(result.imagePath)")
            print("[EditProfilePhoto] 🔄 Refreshing profile...")
            
            // Refresh profile
            await authService.refreshProfile()
            
            print("[EditProfilePhoto] ✅ Profile refresh complete")
            
            await MainActor.run {
                isUploadingPhoto = false
                selectedPhotoItem = nil
                print("[EditProfilePhoto] ✅ Upload flow complete - UI updated")
            }
            
        } catch {
            print("[EditProfilePhoto] ❌ Upload error: \(error)")
            print("[EditProfilePhoto]    Error type: \(type(of: error))")
            print("[EditProfilePhoto]    Error description: \(error.localizedDescription)")
            
            await MainActor.run {
                isUploadingPhoto = false
                uploadError = "Failed to upload: \(error.localizedDescription)"
                selectedPhotoItem = nil
            }
        }
    }
    
    private func removePhoto() async {
        print("[EditProfilePhoto] 🗑️ removePhoto() called")
        print("[EditProfilePhoto]    User ID: \(displayUser.id)")
        print("[EditProfilePhoto]    Current imagePath: \(displayUser.imagePath ?? "nil")")
        
        isUploadingPhoto = true
        uploadError = nil
        
        do {
            print("[EditProfilePhoto] 🔄 Calling removeProfileImage service...")
            
            try await ProfileImageService.shared.removeProfileImage(
                for: displayUser.id,
                currentImagePath: displayUser.imagePath
            )
            
            print("[EditProfilePhoto] ✅ Remove successful!")
            print("[EditProfilePhoto] 🔄 Refreshing profile...")
            
            // Refresh profile
            await authService.refreshProfile()
            
            print("[EditProfilePhoto] ✅ Profile refresh complete")
            
            await MainActor.run {
                isUploadingPhoto = false
                print("[EditProfilePhoto] ✅ Remove flow complete - UI updated")
            }
            
        } catch {
            print("[EditProfilePhoto] ❌ Remove error: \(error)")
            print("[EditProfilePhoto]    Error type: \(type(of: error))")
            print("[EditProfilePhoto]    Error description: \(error.localizedDescription)")
            
            await MainActor.run {
                isUploadingPhoto = false
                uploadError = "Failed to remove: \(error.localizedDescription)"
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
            
            Text("Share this code to connect")
                .font(.caption)
                .foregroundColor(.secondary)
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
                    InfoRow(label: "Current Event", value: "Scanning for event…", valueColor: .orange)
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
