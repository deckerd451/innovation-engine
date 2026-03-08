import SwiftUI
import AVFoundation

struct ScanView: View {
    @State private var scannedCode: String?
    @State private var showingResult = false
    @State private var isProcessing = false
    @State private var resultMessage = "Connection Created"
    @State private var cameraAccessDenied = false

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
                CameraPreview(
                    onCodeScanned: { code in
                        handleScan(code)
                    },
                    onPermissionDenied: {
                        cameraAccessDenied = true
                    }
                )
                .edgesIgnoringSafeArea(.all)
            }

            if isProcessing {
                ProgressView()
                    .scaleEffect(2)
                    .tint(.white)
            }
        }
        .alert(resultMessage, isPresented: $showingResult) {
            Button("OK") {
                isProcessing = false
            }
        }
    }

    private func handleScan(_ code: String) {
        guard !isProcessing else { return }
        guard let communityId = QRService.parseCommunityId(from: code) else { return }

        isProcessing = true
        scannedCode = code

        Task {
            do {
                try await ConnectionService.shared.createConnection(to: communityId)
                await MainActor.run {
                    resultMessage = "Connection Created"
                    showingResult = true
                }
            } catch {
                await MainActor.run {
                    resultMessage = "Failed to create connection"
                    showingResult = true
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
        guard !hasScannedCode else { return }

        guard
            let object = metadataObjects.first as? AVMetadataMachineReadableCodeObject,
            let code = object.stringValue
        else {
            return
        }

        hasScannedCode = true
        delegate?.didScanCode(code)
    }

    deinit {
        if captureSession.isRunning {
            captureSession.stopRunning()
        }
    }
}
