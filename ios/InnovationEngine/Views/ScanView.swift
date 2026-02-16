import SwiftUI
import AVFoundation

struct ScanView: View {
    @State private var scannedCode: String?
    @State private var showingResult = false
    @State private var isProcessing = false
    @State private var resultMessage = "Connection Created"

    var body: some View {
        ZStack {
            CameraPreview { code in
                handleScan(code)
            }
            .edgesIgnoringSafeArea(.all)

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

    func makeUIView(context: Context) -> QRCameraView {
        let view = QRCameraView()
        view.delegate = context.coordinator
        return view
    }

    func updateUIView(_ uiView: QRCameraView, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(onCodeScanned: onCodeScanned)
    }

    class Coordinator: NSObject, QRCameraDelegate {
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

class QRCameraView: UIView, AVCaptureMetadataOutputObjectsDelegate {
    weak var delegate: QRCameraDelegate?
    private var captureSession: AVCaptureSession!
    private var previewLayer: AVCaptureVideoPreviewLayer!

    override init(frame: CGRect) {
        super.init(frame: frame)
        setupCamera()
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    private func setupCamera() {
        captureSession = AVCaptureSession()

        guard let device = AVCaptureDevice.default(for: .video),
              let input = try? AVCaptureDeviceInput(device: device) else { return }

        captureSession.addInput(input)

        let output = AVCaptureMetadataOutput()
        captureSession.addOutput(output)

        output.setMetadataObjectsDelegate(self, queue: .main)
        output.metadataObjectTypes = [.qr]

        previewLayer = AVCaptureVideoPreviewLayer(session: captureSession)
        previewLayer.frame = bounds
        previewLayer.videoGravity = .resizeAspectFill
        layer.addSublayer(previewLayer)

        DispatchQueue.global(qos: .background).async {
            self.captureSession.startRunning()
        }
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        previewLayer?.frame = bounds
    }

    func metadataOutput(_ output: AVCaptureMetadataOutput,
                       didOutput metadataObjects: [AVMetadataObject],
                       from connection: AVCaptureConnection) {
        guard let object = metadataObjects.first as? AVMetadataMachineReadableCodeObject,
              let code = object.stringValue else { return }

        delegate?.didScanCode(code)
    }
}
