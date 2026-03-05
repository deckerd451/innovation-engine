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
            
            EventModeView()
                .tabItem {
                    Label("Event Mode", systemImage: "antenna.radiowaves.left.and.right")
                }

            NetworkView()
                .tabItem {
                    Label("Network", systemImage: "circle.hexagongrid")
                }
        }
    }
}
