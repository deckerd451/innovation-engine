import SwiftUI

struct MainTabView: View {
    let currentUser: User

    var body: some View {
        TabView {
            MyQRView(currentUser: currentUser)
                .tabItem {
                    Label("My QR", systemImage: "qrcode")
                }

            ScanView()
                .tabItem {
                    Label("Scan", systemImage: "camera")
                }

            NetworkView()
                .tabItem {
                    Label("Network", systemImage: "circle.hexagongrid")
                }
        }
    }
}
