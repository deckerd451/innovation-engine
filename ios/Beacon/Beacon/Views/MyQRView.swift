import SwiftUI

struct MyQRView: View {
    let currentUser: User
    @State private var qrImage: UIImage?
    @State private var showingSignOutConfirmation = false

    var body: some View {
        NavigationView {
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
            .onAppear {
                qrImage = QRService.generateQRCode(for: currentUser.id.uuidString)
            }
        }
    }
}
