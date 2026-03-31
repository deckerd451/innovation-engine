import SwiftUI
import AVFoundation

// MARK: - Scan State Machine

private enum ScanPhase: Equatable {
    case scanning
    case detected(label: String)
    case joining(eventName: String)
    case success(eventName: String)
    case failure(message: String)
    case loadingProfile
}

struct ScanView: View {
    @Binding var selectedTab: AppTab
    @Environment(\.dismiss) private var dismiss
    @State private var phase: ScanPhase = .scanning
    @State private var scannedProfile: User?
    @State private var showingProfile = false
    @State private var cameraAccessDenied = false
    @State private var scannerKey = UUID()
    @State private var lastHandledEventId: String?
    @State private var isTransitioningAfterSuccess = false
    @State private var activeCameraView: QRCameraView?

    var body: some View {
        ZStack {
            if cameraAccessDenied {
                cameraAccessDeniedView
            } else {
                ZStack {
                    CameraPreview(
                        onCodeScanned: { code in handleScan(code) },
                        onPermissionDenied: { cameraAccessDenied = true },
                        onCameraViewCreated: { view in activeCameraView = view }
                    )
                    .id(scannerKey)
                    .edgesIgnoringSafeArea(.all)

                    scanGuideOverlay
                }
            }

            statusOverlay
        }
        .sheet(isPresented: $showingProfile, onDismiss: resetScanner) {
            if let profile = scannedProfile {
                ProfileView(profile: profile)
            }
        }
    }

    // MARK: - Status Overlay

    @ViewBuilder
    private var statusOverlay: some View {
        VStack {
            Spacer()

            switch phase {
            case .scanning:
                statusPill(
                    icon: "qrcode.viewfinder",
                    text: "Scanning for QR code…",
                    color: .white.opacity(0.8)
                )

            case .detected(let label):
                statusPill(
                    icon: "checkmark.circle.fill",
                    text: "QR detected — \(label)",
                    color: .green
                )

            case .joining(let eventName):
                HStack(spacing: 10) {
                    ProgressView().tint(.white)
                    Text("Joining \(eventName)…")
                        .font(.subheadline)
                        .fontWeight(.medium)
                        .foregroundColor(.white)
                }
                .padding(.horizontal, 24)
                .padding(.vertical, 14)
                .background(Color.black.opacity(0.75))
                .cornerRadius(12)

            case .success(let eventName):
                statusPill(
                    icon: "checkmark.circle.fill",
                    text: "Joined \(eventName) — opening Network",
                    color: .green
                )

            case .failure(let message):
                VStack(spacing: 12) {
                    statusPill(
                        icon: "xmark.circle.fill",
                        text: message,
                        color: .red
                    )

                    Button {
                        #if DEBUG
                        print("[ScanUI] 🔄 Retry tapped")
                        #endif
                        resetScanner()
                    } label: {
                        Text("Tap to retry")
                            .font(.subheadline)
                            .fontWeight(.medium)
                            .foregroundColor(.white)
                            .padding(.horizontal, 20)
                            .padding(.vertical, 10)
                            .background(Color.white.opacity(0.25))
                            .cornerRadius(8)
                    }
                }

            case .loadingProfile:
                HStack(spacing: 10) {
                    ProgressView().tint(.white)
                    Text("Loading profile…")
                        .font(.subheadline)
                        .fontWeight(.medium)
                        .foregroundColor(.white)
                }
                .padding(.horizontal, 24)
                .padding(.vertical, 14)
                .background(Color.black.opacity(0.75))
                .cornerRadius(12)
            }

            Spacer().frame(height: 100)
        }
        .animation(.easeInOut(duration: 0.25), value: phase)
    }

    private func statusPill(icon: String, text: String, color: Color) -> some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .foregroundColor(color)

            Text(text)
                .font(.subheadline)
                .fontWeight(.medium)
                .foregroundColor(.white)
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 14)
        .background(Color.black.opacity(0.75))
        .cornerRadius(12)
    }

    // MARK: - Camera Access Denied

    private var cameraAccessDeniedView: some View {
        VStack(spacing: 16) {
            Image(systemName: "camera.fill")
                .font(.system(size: 48))
                .foregroundColor(.gray)

            Text("Camera Access Needed")
                .font(.title3)
                .fontWeight(.semibold)

            Text("Enable camera access in Settings to scan QR codes.")
                .multilineTextAlignment(.center)
                .foregroundColor(.secondary)
                .padding(.horizontal)

            Button("Open Settings") {
                guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
                UIApplication.shared.open(url)
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
            .background(Color.blue)
            .foregroundColor(.white)
            .cornerRadius(12)
        }
        .padding()
    }

    // MARK: - Scan Guide Overlay

    private var scanGuideOverlay: some View {
        VStack {
            Spacer()

            ZStack {
                RoundedRectangle(cornerRadius: 20)
                    .stroke(Color.white, lineWidth: 3)
                    .frame(width: 250, height: 250)

                VStack {
                    HStack {
                        cornerBracket
                        Spacer()
                        cornerBracket.rotation3DEffect(.degrees(90), axis: (x: 0, y: 0, z: 1))
                    }
                    Spacer()
                    HStack {
                        cornerBracket.rotation3DEffect(.degrees(-90), axis: (x: 0, y: 0, z: 1))
                        Spacer()
                        cornerBracket.rotation3DEffect(.degrees(180), axis: (x: 0, y: 0, z: 1))
                    }
                }
                .frame(width: 250, height: 250)
            }

            Spacer()
        }
    }

    private var cornerBracket: some View {
        Path { path in
            path.move(to: CGPoint(x: 40, y: 0))
            path.addLine(to: CGPoint(x: 0, y: 0))
            path.addLine(to: CGPoint(x: 0, y: 40))
        }
        .stroke(Color.green, lineWidth: 4)
        .frame(width: 40, height: 40)
    }

    // MARK: - Scanner Reset

    private func resetScanner() {
        guard !isTransitioningAfterSuccess else {
            #if DEBUG
            print("[ScanUI] ⛔ Reset blocked — success transition in progress")
            #endif
            return
        }

        phase = .scanning
        scannedProfile = nil
        lastHandledEventId = nil
        isTransitioningAfterSuccess = false
        scannerKey = UUID()

        #if DEBUG
        print("[ScanUI] 🔄 Scanner reset — ready for new scan")
        #endif
    }

    // MARK: - Scan Handling

    private var isLocked: Bool {
        if isTransitioningAfterSuccess { return true }

        switch phase {
        case .scanning:
            return false
        default:
            return true
        }
    }

    private func handleScan(_ code: String) {
        guard !isLocked else { return }

        #if DEBUG
        print("[ScanUI] 📷 QR scanned: \(code)")
        #endif

        guard let payload = QRService.parse(from: code) else {
            #if DEBUG
            print("[ScanUI] ❌ Invalid QR format")
            #endif
            phase = .failure(message: "Invalid QR code format")
            return
        }

        switch payload {
        case .event(let eventId):
            if let last = lastHandledEventId, last == eventId {
                return
            }

            if EventJoinService.shared.isEventJoined,
               EventJoinService.shared.currentEventID == eventId {
                let joinedName = EventJoinService.shared.currentEventName ?? eventId
                #if DEBUG
                print("[ScanUI] ✅ Already joined \(joinedName)")
                #endif
                phase = .success(eventName: joinedName)
                beginSuccessTransition()
                return
            }

            lastHandledEventId = eventId
            handleEventScan(eventId: eventId)

        case .profile(let communityId):
            handleProfileScan(communityId: communityId)
        }
    }

    private func handleEventScan(eventId: String) {
        let preJoinLabel = shortEventLabel(from: eventId)

        phase = .detected(label: "joining \(preJoinLabel)…")

        #if DEBUG
        print("[ScanUI] 🎫 Event QR: \(eventId) (\(preJoinLabel))")
        #endif

        Task {
            try? await Task.sleep(nanoseconds: 400_000_000)

            await MainActor.run {
                phase = .joining(eventName: preJoinLabel)
            }

            await EventJoinService.shared.joinEvent(eventID: eventId)

            await MainActor.run {
                guard !isTransitioningAfterSuccess else { return }

                if EventJoinService.shared.isEventJoined {
                    let finalName = EventJoinService.shared.currentEventName ?? preJoinLabel
                    #if DEBUG
                    print("[ScanUI] ✅ Join succeeded: \(eventId)")
                    #endif
                    phase = .success(eventName: finalName)
                    beginSuccessTransition()
                } else if lastHandledEventId == eventId {
                    let msg = EventJoinService.shared.joinError ?? "Failed to join event"
                    #if DEBUG
                    print("[ScanUI] ❌ Join failed: \(msg)")
                    #endif
                    phase = .failure(message: msg)
                    lastHandledEventId = nil
                }
            }
        }
    }

    private func handleProfileScan(communityId: String) {
        phase = .loadingProfile

        #if DEBUG
        print("[ScanUI] 🔍 Profile QR: \(communityId)")
        #endif

        Task {
            do {
                try await Task.sleep(nanoseconds: 300_000_000)
                let profile = try await CommunityIdentityService.shared.loadProfile(
                    communityId: UUID(uuidString: communityId)!
                )

                await MainActor.run {
                    scannedProfile = profile
                    showingProfile = true
                    phase = .scanning
                }
            } catch {
                await MainActor.run {
                    phase = .failure(message: "Profile not found")
                }
            }
        }
    }

    private func shortEventLabel(from eventId: String) -> String {
        if let currentName = EventJoinService.shared.currentEventName,
           EventJoinService.shared.currentEventID == eventId {
            return currentName
        }

        return String(eventId.prefix(8))
    }

    // MARK: - Success Transition

    private func beginSuccessTransition() {
        guard !isTransitioningAfterSuccess else {
            #if DEBUG
            print("[ScanUI] ⛔ Transition already in progress — blocked")
            #endif
            return
        }

        isTransitioningAfterSuccess = true

        #if DEBUG
        print("[ScanUI] 🔒 Success transition started — all further callbacks blocked")
        #endif

        shutdownCameraForDismiss()

        Task {
            try? await Task.sleep(nanoseconds: 800_000_000)

            await MainActor.run {
                #if DEBUG
                print("[ScanUI] 🧭 Frame 1: selectedTab → .network")
                #endif
                selectedTab = .network
            }

            try? await Task.sleep(nanoseconds: 50_000_000)

            await MainActor.run {
                #if DEBUG
                print("[ScanUI] 🧭 Frame 2: dismiss()")
                #endif
                dismiss()
            }

            #if DEBUG
            print("[ScanUI] ✅ Success transition complete")
            #endif
        }
    }

    private func shutdownCameraForDismiss() {
        guard let camera = activeCameraView else {
            #if DEBUG
            print("[ScanUI] 📷 No camera reference — nothing to shut down")
            #endif
            return
        }

        #if DEBUG
        print("[ScanUI] 📷 Camera shutdown started")
        #endif

        camera.shutdownForDismiss()
        activeCameraView = nil

        #if DEBUG
        print("[ScanUI] 📷 Camera shutdown complete")
        #endif
    }
}

// MARK: - Camera Infrastructure

struct CameraPreview: UIViewRepresentable {
    let onCodeScanned: (String) -> Void
    let onPermissionDenied: () -> Void
    var onCameraViewCreated: ((QRCameraView) -> Void)?

    func makeUIView(context: Context) -> QRCameraView {
        let view = QRCameraView()
        view.delegate = context.coordinator
        view.permissionDeniedHandler = onPermissionDenied
        view.startCameraIfAuthorized()
        DispatchQueue.main.async {
            onCameraViewCreated?(view)
        }
        return view
    }

    func updateUIView(_ uiView: QRCameraView, context: Context) {}

    static func dismantleUIView(_ uiView: QRCameraView, coordinator: Coordinator) {
        uiView.shutdownForDismiss()
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(onCodeScanned: onCodeScanned)
    }

    final class Coordinator: NSObject, QRCameraDelegate {
        let onCodeScanned: (String) -> Void

        init(onCodeScanned: @escaping (String) -> Void) {
            self.onCodeScanned = onCodeScanned
        }

        func didScanCode(_ code: String) {
            onCodeScanned(code)
        }
    }
}

protocol QRCameraDelegate: AnyObject {
    func didScanCode(_ code: String)
}

final class QRCameraView: UIView, AVCaptureMetadataOutputObjectsDelegate {
    weak var delegate: QRCameraDelegate?
    var permissionDeniedHandler: (() -> Void)?

    private let captureSession = AVCaptureSession()
    private var previewLayer: AVCaptureVideoPreviewLayer?
    private var hasConfiguredSession = false
    private var isShutDown = false
    private var lastScanTime: Date?
    private let scanDebounceInterval: TimeInterval = 2.0

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .black
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func startCameraIfAuthorized() {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            configureAndStartCameraIfNeeded()

        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                DispatchQueue.main.async {
                    guard let self, !self.isShutDown else { return }
                    if granted {
                        self.configureAndStartCameraIfNeeded()
                    } else {
                        self.permissionDeniedHandler?()
                    }
                }
            }

        case .denied, .restricted:
            permissionDeniedHandler?()

        @unknown default:
            permissionDeniedHandler?()
        }
    }

    private func configureAndStartCameraIfNeeded() {
        guard !hasConfiguredSession else {
            startRunningSession()
            return
        }

        hasConfiguredSession = true

        guard let device = AVCaptureDevice.default(for: .video),
              let input = try? AVCaptureDeviceInput(device: device),
              captureSession.canAddInput(input) else {
            permissionDeniedHandler?()
            return
        }

        captureSession.addInput(input)

        let output = AVCaptureMetadataOutput()
        guard captureSession.canAddOutput(output) else {
            permissionDeniedHandler?()
            return
        }

        captureSession.addOutput(output)
        output.setMetadataObjectsDelegate(self, queue: .main)
        output.metadataObjectTypes = [.qr]

        let layer = AVCaptureVideoPreviewLayer(session: captureSession)
        layer.frame = bounds
        layer.videoGravity = .resizeAspectFill
        previewLayer = layer
        self.layer.addSublayer(layer)

        startRunningSession()
    }

    private func startRunningSession() {
        guard !isShutDown else { return }

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self, !self.isShutDown else { return }
            if !self.captureSession.isRunning {
                self.captureSession.startRunning()
            }
        }
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        previewLayer?.frame = bounds
    }

    func metadataOutput(
        _ output: AVCaptureMetadataOutput,
        didOutput metadataObjects: [AVMetadataObject],
        from connection: AVCaptureConnection
    ) {
        guard !isShutDown else { return }

        if let lastScan = lastScanTime,
           Date().timeIntervalSince(lastScan) < scanDebounceInterval {
            return
        }

        guard let object = metadataObjects.first as? AVMetadataMachineReadableCodeObject,
              let code = object.stringValue else { return }

        lastScanTime = Date()
        delegate?.didScanCode(code)
    }

    func shutdownForDismiss() {
        guard !isShutDown else { return }
        isShutDown = true
        delegate = nil

        previewLayer?.removeFromSuperlayer()
        previewLayer = nil

        let session = captureSession
        if session.isRunning {
            DispatchQueue.global(qos: .userInitiated).sync {
                session.stopRunning()
            }
        }
    }

    deinit {
        if captureSession.isRunning {
            captureSession.stopRunning()
        }
    }
}
