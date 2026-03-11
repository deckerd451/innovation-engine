import SwiftUI
import AVFoundation

struct ScanView: View {
    @State private var scannedProfile: User?
    @State private var showingProfile = false
    @State private var isProcessing = false
    @State private var showError = false
    @State private var errorMessage = ""
    @State private var cameraAccessDenied = false
    @State private var scannerKey = UUID() // For resetting scanner

    var body: some View {
        ZStack {
            if cameraAccessDenied {
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
            } else {
                ZStack {
                    CameraPreview(
                        onCodeScanned: { code in
                            handleScan(code)
                        },
                        onPermissionDenied: {
                            cameraAccessDenied = true
                        }
                    )
                    .id(scannerKey) // Reset scanner when key changes
                    .edgesIgnoringSafeArea(.all)
                    
                    // Scan guide overlay
                    scanGuideOverlay
                }
            }

            if isProcessing {
                ProgressView()
                    .scaleEffect(2)
                    .tint(.white)
            }
        }
        .sheet(isPresented: $showingProfile, onDismiss: resetScanner) {
            if let profile = scannedProfile {
                ProfileView(profile: profile)
            }
        }
        .alert("Error", isPresented: $showError) {
            Button("OK") {
                isProcessing = false
                resetScanner()
            }
        } message: {
            Text(errorMessage)
        }
    }
    
    // MARK: - Scan Guide Overlay
    
    private var scanGuideOverlay: some View {
        VStack {
            Spacer()
            
            // Centered scan frame
            ZStack {
                // Semi-transparent background
                RoundedRectangle(cornerRadius: 20)
                    .stroke(Color.white, lineWidth: 3)
                    .frame(width: 250, height: 250)
                
                // Corner brackets
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
            
            // Instruction text
            Text("Align QR code inside the frame")
                .font(.subheadline)
                .fontWeight(.medium)
                .foregroundColor(.white)
                .padding(.horizontal, 32)
                .padding(.vertical, 12)
                .background(Color.black.opacity(0.6))
                .cornerRadius(8)
                .padding(.bottom, 60)
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
        // Reset state to allow new scans
        scannedProfile = nil
        isProcessing = false
        
        // Regenerate scanner key to reset camera view
        scannerKey = UUID()
        
        print("[Scan] 🔄 Scanner reset, ready for next scan")
    }

    private func handleScan(_ code: String) {
        guard !isProcessing else { return }
        guard let communityId = QRService.parseCommunityId(from: code) else {
            errorMessage = "Invalid QR code format"
            showError = true
            return
        }

        isProcessing = true
        
        print("[Scan] 📷 QR scanned: \(code)")
        print("[Scan] 🔍 Parsed community ID: \(communityId)")

        Task {
            do {
                // Brief delay to debounce duplicate scans
                try await Task.sleep(nanoseconds: 300_000_000) // 0.3 seconds
                
                // Load the profile for the scanned community ID
                let profile = try await CommunityIdentityService.shared.loadProfile(
                    communityId: UUID(uuidString: communityId)!
                )
                
                print("[Scan] ✅ Profile loaded: \(profile.name)")
                
                await MainActor.run {
                    scannedProfile = profile
                    isProcessing = false
                    showingProfile = true
                }
            } catch {
                print("[Scan] ❌ Failed to load profile: \(error)")
                
                await MainActor.run {
                    errorMessage = "Profile not found"
                    showError = true
                    isProcessing = false
                }
            }
        }
    }
}

struct CameraPreview: UIViewRepresentable {
    let onCodeScanned: (String) -> Void
    let onPermissionDenied: () -> Void

    func makeUIView(context: Context) -> QRCameraView {
        let view = QRCameraView()
        view.delegate = context.coordinator
        view.permissionDeniedHandler = onPermissionDenied
        view.startCameraIfAuthorized()
        return view
    }

    func updateUIView(_ uiView: QRCameraView, context: Context) {}

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
    private var hasScannedCode = false
    private var lastScanTime: Date?
    private let scanDebounceInterval: TimeInterval = 2.0 // Prevent duplicate scans for 2 seconds

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
                    guard let self else { return }
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

        guard let device = AVCaptureDevice.default(for: .video) else {
            permissionDeniedHandler?()
            return
        }

        guard let input = try? AVCaptureDeviceInput(device: device) else {
            permissionDeniedHandler?()
            return
        }

        guard captureSession.canAddInput(input) else {
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
        self.previewLayer = layer
        self.layer.addSublayer(layer)

        startRunningSession()
    }

    private func startRunningSession() {
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self else { return }
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
        // Debounce: Don't scan if we scanned recently
        if let lastScan = lastScanTime,
           Date().timeIntervalSince(lastScan) < scanDebounceInterval {
            return
        }
        
        guard !hasScannedCode else { return }

        guard
            let object = metadataObjects.first as? AVMetadataMachineReadableCodeObject,
            let code = object.stringValue
        else {
            return
        }

        hasScannedCode = true
        lastScanTime = Date()
        delegate?.didScanCode(code)
        
        // Reset after a delay to allow new scans
        DispatchQueue.main.asyncAfter(deadline: .now() + scanDebounceInterval) { [weak self] in
            self?.hasScannedCode = false
        }
    }

    deinit {
        if captureSession.isRunning {
            captureSession.stopRunning()
        }
    }
}
