import SwiftUI

struct MyQRView: View {
    let currentUser: User
    @State private var qrImage: UIImage?

    var body: some View {
        VStack(spacing: 40) {
            Text("My QR Code")
                .font(.title2)

            if let qrImage {
                Image(uiImage: qrImage)
                    .interpolation(.none)
                    .resizable()
                    .frame(width: 250, height: 250)
            }

            Text(currentUser.name)
                .font(.headline)
        }
        .onAppear {
            qrImage = QRService.generateQRCode(for: currentUser.id.uuidString)
        }
    }
}
