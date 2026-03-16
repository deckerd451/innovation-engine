import SwiftUI
import AVFoundation

/// Connection handshake screen: direct connect (primary) + QR fallback.
struct ConnectAttendeeView: View {
    let attendee: EventAttendee
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var authService = AuthService.shared

    @State private var connectionState: ConnectionState = .ready
    @State private var scannerKey = UUID()
    @State private var cameraAccessDenied = false
    @State private var showQRFallback = false

    enum ConnectionState: Equatable {
        case ready
        case connecting
        case success(alreadyExisted: Bool)
        case error(String)
    }

    private var myQRImage: UIImage? {
        guard let user = authService.currentUser else { return nil }
        return QRService.generateQRCode(for: user.id.uuidString)
    }

    var body: some View {
        NavigationView {
            ZStack {
                Color.black.ignoresSafeArea()

                if case .success(let existed) = connectionState {
                    successView(alreadyExisted: existed)
                } else {
                    handshakeView
                }
            }
            .navigationTitle("Connect")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    // MARK: - Handshake View

    private var handshakeView: some View {
        ScrollView {
            VStack(spacing: 20) {
                identityHeader
                directConnectButton

                if case .error(let msg) = connectionState {
                    Text(msg)
                        .font(.caption)
                        .foregroundColor(.red)
                        .padding(.horizontal, 24)
                }

                if showQRFallback {
                    qrFallbackSection
                } else {
                    Button(action: { withAnimation { showQRFallback = true } }) {
                        Label("Use QR code instead", systemImage: "qrcode")
                            .font(.caption)
                            .foregroundColor(.gray)
                    }
                    .padding(.top, 4)
                }
            }
            .padding(.top, 12)
            .padding(.bottom, 24)
        }
    }

    private var identityHeader: some View {
        VStack(spacing: 6) {
            AvatarView(
                imageUrl: attendee.avatarUrl,
                name: attendee.name,
                size: 56
            )

            Text(attendee.name)
                .font(.headline)
                .foregroundColor(.white)

            Text("Verified attendee · Very close")
                .font(.caption)
                .foregroundColor(.green)
        }
    }

    // MARK: - Direct Connect

    private var directConnectButton: some View {
        Button(action: { handleDirectConnect() }) {
            HStack(spacing: 10) {
                if case .connecting = connectionState {
                    ProgressView().tint(.black)
                } else {
                    Image(systemName: "person.crop.circle.badge.plus")
                }
                Text("Connect with \(attendee.name)")
                    .fontWeight(.semibold)
            }
            .font(.headline)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(connectionState == .connecting ? Color.green.opacity(0.5) : Color.green)
            .foregroundColor(.black)
            .cornerRadius(14)
        }
        .disabled(connectionState == .connecting)
        .padding(.horizontal, 24)
    }

    // MARK: - QR Fallback

    private var qrFallbackSection: some View {
        VStack(spacing: 16) {
            HStack {
                Rectangle().fill(Color.white.opacity(0.15)).frame(height: 1)
                Text("OR USE QR")
                    .font(.caption2)
                    .fontWeight(.semibold)
                    .foregroundColor(.gray)
                    .padding(.horizontal, 8)
                Rectangle().fill(Color.white.opacity(0.15)).frame(height: 1)
            }
            .padding(.horizontal, 32)

            // Your QR
            VStack(spacing: 8) {
                Text("Let them scan your code")
                    .font(.caption)
                    .foregroundColor(.gray)
                    .textCase(.uppercase)

                if let qr = myQRImage {
                    Image(uiImage: qr)
                        .interpolation(.none)
                        .resizable()
                        .frame(width: 160, height: 160)
                        .background(Color.white)
                        .cornerRadius(12)
                } else {
                    RoundedRectangle(cornerRadius: 12)
                        .fill(Color.white.opacity(0.1))
                        .frame(width: 160, height: 160)
                        .overlay(ProgressView().tint(.white))
                }
            }

            HStack {
                Rectangle().fill(Color.white.opacity(0.15)).frame(height: 1)
                Text("OR")
                    .font(.caption2)
                    .fontWeight(.semibold)
                    .foregroundColor(.gray)
                    .padding(.horizontal, 8)
                Rectangle().fill(Color.white.opacity(0.15)).frame(height: 1)
            }
            .padding(.horizontal, 32)

            // Scanner
            VStack(spacing: 8) {
                Text("Scan their QR code")
                    .font(.caption)
                    .foregroundColor(.gray)
                    .textCase(.uppercase)

                if cameraAccessDenied {
                    cameraAccessView
                } else {
                    ZStack {
                        CameraPreview(
                            onCodeScanned: { code in handleScan(code) },
                            onPermissionDenied: { cameraAccessDenied = true }
                        )
                        .id(scannerKey)
                        .frame(height: 200)
                        .cornerRadius(12)
                        .clipped()

                        if case .connecting = connectionState {
                            Color.black.opacity(0.6).cornerRadius(12)
                            ProgressView().tint(.white).scaleEffect(1.5)
                        }
                    }
                    .frame(height: 200)
                    .padding(.horizontal, 24)
                }
            }
        }
    }

    private var cameraAccessView: some View {
        VStack(spacing: 8) {
            Image(systemName: "camera.fill")
                .font(.title2)
                .foregroundColor(.gray)
            Text("Camera access needed")
                .font(.caption)
                .foregroundColor(.gray)
            Button("Open Settings") {
                guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
                UIApplication.shared.open(url)
            }
            .font(.caption)
        }
        .frame(height: 200)
        .frame(maxWidth: .infinity)
        .background(Color.white.opacity(0.05))
        .cornerRadius(12)
        .padding(.horizontal, 24)
    }

    // MARK: - Success View

    private func successView(alreadyExisted: Bool) -> some View {
        VStack(spacing: 24) {
            Spacer()

            Image(systemName: alreadyExisted ? "checkmark.seal.fill" : "checkmark.circle.fill")
                .font(.system(size: 64))
                .foregroundColor(.green)

            Text(alreadyExisted ? "Already Connected" : "Connected")
                .font(.title2)
                .fontWeight(.bold)
                .foregroundColor(.white)

            Text(alreadyExisted
                 ? "You and \(attendee.name) are already connected"
                 : "You and \(attendee.name) are now connected")
                .font(.subheadline)
                .foregroundColor(.gray)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)

            Spacer()

            Button(action: { dismiss() }) {
                Text("Done")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding()
                    .background(Color.green)
                    .foregroundColor(.black)
                    .cornerRadius(14)
            }
            .padding(.horizontal, 32)
            .padding(.bottom, 32)
        }
    }

    // MARK: - Direct Connect Handler

    private func handleDirectConnect() {
        guard connectionState == .ready || {
            if case .error = connectionState { return true }
            return false
        }() else { return }

        print("[Connect] 🤝 Direct connect tapped for \(attendee.name) (id: \(attendee.id))")
        connectionState = .connecting

        Task {
            do {
                let result = try await ConnectionService.shared.createConnectionIfNeeded(
                    to: attendee.id.uuidString
                )
                await MainActor.run {
                    switch result {
                    case .created:
                        connectionState = .success(alreadyExisted: false)
                        print("[Connect] ✅ Connection created with \(attendee.name)")
                    case .alreadyExists:
                        connectionState = .success(alreadyExisted: true)
                        print("[Connect] ℹ️ Already connected with \(attendee.name)")
                    }
                    AttendeeStateResolver.shared.refreshConnections()
                }
            } catch {
                await MainActor.run {
                    connectionState = .error("Connection failed. Try again.")
                    print("[Connect] ❌ Direct connect error: \(error)")
                }
            }
        }
    }

    // MARK: - QR Scan Handler

    private func handleScan(_ code: String) {
        guard connectionState == .ready || {
            if case .error = connectionState { return true }
            return false
        }() else { return }

        print("[Connect] 📷 QR fallback scanned: \(code)")

        guard let payload = QRService.parse(from: code),
              case .profile(let scannedId) = payload else {
            connectionState = .error("Not a valid profile QR code")
            resetScanner()
            return
        }

        connectionState = .connecting

        Task {
            do {
                let result = try await ConnectionService.shared.createConnectionIfNeeded(to: scannedId)
                await MainActor.run {
                    switch result {
                    case .created:
                        connectionState = .success(alreadyExisted: false)
                        print("[Connect] ✅ QR connection created with \(scannedId)")
                    case .alreadyExists:
                        connectionState = .success(alreadyExisted: true)
                        print("[Connect] ℹ️ QR: already connected with \(scannedId)")
                    }
                    AttendeeStateResolver.shared.refreshConnections()
                }
            } catch {
                await MainActor.run {
                    connectionState = .error("Connection failed. Try again.")
                    resetScanner()
                    print("[Connect] ❌ QR connection error: \(error)")
                }
            }
        }
    }

    private func resetScanner() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
            if case .error = connectionState {
                connectionState = .ready
            }
            scannerKey = UUID()
        }
    }
}
