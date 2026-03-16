import SwiftUI

/// Find Attendee screen with identity, status block, chips, radar, and signal details
struct FindAttendeeView: View {
    let attendee: EventAttendee

    @ObservedObject private var stateResolver = AttendeeStateResolver.shared
    @ObservedObject private var scanner = BLEScannerService.shared

    @State private var signalAge: TimeInterval = 0
    @State private var showConnectSheet = false
    @State private var hasTriggeredConnect = false
    @State private var connectDismissedAt: Date?
    @State private var signalTimer: Timer?

    @Environment(\.dismiss) private var dismiss

    private var presentation: AttendeePresentation {
        stateResolver.resolve(for: attendee)
    }

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 16) {
                    identitySection
                    statusBlock
                    chipsSection
                    radarView
                    guidanceCard
                    signalDetailsView
                    Spacer(minLength: 24)
                }
                .padding(.top, 16)
            }
            .background(Color.black.ignoresSafeArea())
            .navigationTitle("Find Attendee")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
        .onAppear {
            startSignalTimer()
        }
        .onDisappear {
            stopSignalTimer()
        }
        .onChange(of: signalAge) {
            checkVeryCloseTransition()
        }
        .sheet(isPresented: $showConnectSheet, onDismiss: {
            connectDismissedAt = Date()
        }) {
            ConnectAttendeeView(attendee: attendee)
        }
    }

    // MARK: - Identity Section

    private var identitySection: some View {
        VStack(spacing: 8) {
            AvatarView(
                imageUrl: attendee.avatarUrl,
                name: attendee.name,
                size: 72
            )

            Text(attendee.name)
                .font(.title3)
                .fontWeight(.bold)
                .foregroundColor(.white)

            Text(attendee.detailSubtitleText)
                .font(.subheadline)
                .foregroundColor(.gray)
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .padding(.horizontal, 32)
        }
    }

    // MARK: - Status Block

    private var statusBlock: some View {
        VStack(spacing: 6) {
            connectionLine

            HStack(spacing: 12) {
                Label(identityLabel, systemImage: presentation.relationship.icon)
                    .font(.caption)
                    .foregroundColor(presentation.relationship == .unverified ? .gray : .cyan)

                Label(presentation.proximity.label, systemImage: presentation.proximity.icon)
                    .font(.caption)
                    .foregroundColor(presentation.proximity.color)
            }
        }
        .padding(.vertical, 10)
        .padding(.horizontal, 16)
        .frame(maxWidth: .infinity)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color.white.opacity(0.06))
        )
        .padding(.horizontal, 24)
    }

    private var connectionLine: some View {
        HStack(spacing: 6) {
            Image(systemName: connectionIcon)
                .font(.system(size: 14, weight: .semibold))

            Text(connectionLabel)
                .font(.subheadline)
                .fontWeight(.semibold)
        }
        .foregroundColor(connectionColor)
    }

    private var connectionLabel: String {
        switch presentation.relationship {
        case .connected:
            return "Connected"
        case .pending:
            return "Connection pending"
        case .metPreviously:
            return "Met previously"
        case .verified, .unverified:
            return "Not connected"
        }
    }

    private var connectionIcon: String {
        switch presentation.relationship {
        case .connected:
            return "link"
        case .pending:
            return "clock.arrow.circlepath"
        case .metPreviously:
            return "person.crop.circle.badge.clock"
        case .verified, .unverified:
            return "person.crop.circle.badge.minus"
        }
    }

    private var connectionColor: Color {
        switch presentation.relationship {
        case .connected:
            return Color(red: 1.0, green: 0.84, blue: 0.0)
        case .pending:
            return .orange
        case .metPreviously:
            return .purple
        case .verified, .unverified:
            return .gray
        }
    }

    private var identityLabel: String {
        switch presentation.relationship {
        case .connected, .verified, .metPreviously:
            return "Verified attendee"
        case .pending:
            return "Pending verification"
        case .unverified:
            return "Unverified"
        }
    }

    // MARK: - Chips Section

    private var chipsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let skills = attendee.skills, !skills.isEmpty {
                Text("Skills")
                    .font(.caption2)
                    .foregroundColor(.gray)
                    .textCase(.uppercase)

                WrappingChipsView(tags: skills, color: .blue, maxVisible: 5)
            }

            if let interests = attendee.interests, !interests.isEmpty {
                Text("Interests")
                    .font(.caption2)
                    .foregroundColor(.gray)
                    .textCase(.uppercase)

                WrappingChipsView(tags: interests, color: .green, maxVisible: 5)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 24)
    }

    // MARK: - Radar View

    private var radarView: some View {
        ZStack {
            ForEach([190.0, 140.0, 90.0, 56.0], id: \.self) { size in
                Circle()
                    .stroke(Color.white.opacity(0.08), lineWidth: 1)
                    .frame(width: size, height: size)
            }

            Circle()
                .fill(signalColor.opacity(0.3))
                .frame(width: 18, height: 18)
                .overlay(
                    Circle()
                        .fill(signalColor)
                        .frame(width: 10, height: 10)
                )
                .offset(radarOffset)
                .animation(.easeInOut(duration: 1.0), value: radarOffset)
        }
        .frame(height: 200)
    }

    private var radarOffset: CGSize {
        guard let device = stateResolver.peerDevice(for: attendee) else {
            return CGSize(width: 60, height: -40)
        }

        let rssi = scanner.smoothedRSSI(for: device.id) ?? device.rssi
        let norm = max(0, min(1, Double(rssi + 90) / 50.0))
        let distance = 80.0 * (1.0 - norm)

        return CGSize(width: distance * 0.7, height: -distance * 0.5)
    }

    // MARK: - Guidance Card

    private var guidanceCard: some View {
        VStack(spacing: 8) {
            if let device = stateResolver.peerDevice(for: attendee) {
                let rssi = scanner.smoothedRSSI(for: device.id) ?? device.rssi
                let trend = rssiTrend(for: device.id) ?? 0

                Text(proximityLabel(rssi))
                    .font(.title2)
                    .fontWeight(.bold)
                    .foregroundColor(signalColor)

                HStack(spacing: 6) {
                    Image(systemName: guidanceIcon(for: trend))
                        .font(.system(size: 14, weight: .semibold))

                    Text(guidanceLabel(for: trend))
                        .font(.subheadline)
                        .fontWeight(.medium)
                }
                .foregroundColor(guidanceColor(for: trend))

                Text(movementSuggestion(rssi: rssi, trend: trend))
                    .font(.caption)
                    .foregroundColor(.gray)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 16)
            } else {
                Text("Searching for signal")
                    .font(.title3)
                    .fontWeight(.semibold)
                    .foregroundColor(.gray)

                Text("Move around the room slowly")
                    .font(.caption)
                    .foregroundColor(.gray.opacity(0.7))
            }
        }
        .padding(.vertical, 14)
        .padding(.horizontal, 16)
        .frame(maxWidth: .infinity)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(Color.white.opacity(0.05))
        )
        .padding(.horizontal, 24)
    }

    // MARK: - Guidance Helpers

    private func guidanceLabel(for trend: Int) -> String {
        if trend > 4 { return "Getting much warmer" }
        if trend > 2 { return "Getting warmer" }
        if trend < -4 { return "Getting much colder" }
        if trend < -2 { return "Getting colder" }
        return "Holding steady"
    }

    private func guidanceIcon(for trend: Int) -> String {
        if trend > 2 { return "flame.fill" }
        if trend < -2 { return "snowflake" }
        return "equal.circle.fill"
    }

    private func guidanceColor(for trend: Int) -> Color {
        if trend > 4 { return .green }
        if trend > 2 { return Color(red: 0.4, green: 0.9, blue: 0.5) }
        if trend < -4 { return .red }
        if trend < -2 { return .orange }
        return Color.cyan.opacity(0.7)
    }

    private func movementSuggestion(rssi: Int, trend: Int) -> String {
        if rssi >= -45 {
            return "They're right here — look around you"
        }
        if rssi >= -55, trend > 2 {
            return "Almost there — keep going"
        }
        if trend > 2 {
            return "Good direction — move slightly forward"
        }
        if trend >= -2, trend <= 2 {
            return "Hold position and look around"
        }
        return "Turn back and try another direction"
    }

    // MARK: - Signal Details

    private var signalDetailsView: some View {
        VStack(spacing: 6) {
            if let device = stateResolver.peerDevice(for: attendee) {
                let rssi = scanner.smoothedRSSI(for: device.id) ?? device.rssi

                HStack(spacing: 14) {
                    Label("\(rssi) dBm", systemImage: "antenna.radiowaves.left.and.right")
                        .font(.caption2)
                        .foregroundColor(signalColor.opacity(0.7))

                    Label(trendLabel, systemImage: "arrow.up.arrow.down")
                        .font(.caption2)
                        .foregroundColor(trendColor.opacity(0.7))
                }

                if rssi >= -45 {
                    Button(action: { showConnectSheet = true }) {
                        HStack(spacing: 8) {
                            Image(systemName: "person.crop.circle.badge.plus")
                            Text("Connect with \(attendee.name)")
                                .fontWeight(.semibold)
                        }
                        .font(.subheadline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(Color.green)
                        .foregroundColor(.black)
                        .cornerRadius(10)
                    }
                    .padding(.horizontal, 24)
                    .padding(.top, 6)
                }
            } else {
                Text("No direct BLE signal — using event presence")
                    .font(.caption2)
                    .foregroundColor(.gray.opacity(0.6))
            }
        }
        .padding(.horizontal, 24)
    }

    // MARK: - Helpers

    private var signalColor: Color {
        guard let device = stateResolver.peerDevice(for: attendee) else {
            return .gray
        }

        let rssi = scanner.smoothedRSSI(for: device.id) ?? device.rssi

        switch rssi {
        case -45...0:
            return .green
        case -65 ..< -45:
            return .blue
        case -80 ..< -65:
            return .orange
        default:
            return .red
        }
    }

    private func proximityLabel(_ rssi: Int) -> String {
        switch rssi {
        case -45...0:
            return "Very close"
        case -55 ..< -45:
            return "Close"
        case -65 ..< -55:
            return "Near"
        case -80 ..< -65:
            return "Moderate"
        default:
            return "Far"
        }
    }

    private var trendLabel: String {
        guard let device = stateResolver.peerDevice(for: attendee),
              let trend = rssiTrend(for: device.id) else {
            return "—"
        }

        if trend > 2 { return "Approaching" }
        if trend < -2 { return "Moving away" }
        return "Stable"
    }

    private var trendColor: Color {
        guard let device = stateResolver.peerDevice(for: attendee),
              let trend = rssiTrend(for: device.id) else {
            return .gray
        }

        if trend > 2 { return .green }
        if trend < -2 { return .orange }
        return .gray
    }

    private func rssiTrend(for deviceId: UUID) -> Int? {
        guard let current = scanner.smoothedRSSI(for: deviceId),
              let device = scanner.discoveredDevices[deviceId] else {
            return nil
        }

        return current - device.rssi
    }

    private func startSignalTimer() {
        stopSignalTimer()

        signalTimer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { _ in
            Task { @MainActor in
                signalAge = Date().timeIntervalSinceReferenceDate
            }
        }
    }

    private func stopSignalTimer() {
        signalTimer?.invalidate()
        signalTimer = nil
    }

    /// Auto-opens ConnectAttendeeView once when RSSI reaches Very Close.
    /// Respects cooldown: won't re-trigger within 30s of user dismissing the sheet.
    private func checkVeryCloseTransition() {
        guard !showConnectSheet else { return }

        if let dismissed = connectDismissedAt,
           Date().timeIntervalSince(dismissed) < 30 {
            return
        }

        if hasTriggeredConnect, connectDismissedAt == nil {
            return
        }

        guard let device = stateResolver.peerDevice(for: attendee) else { return }

        let rssi = scanner.smoothedRSSI(for: device.id) ?? device.rssi
        let trend = rssiTrend(for: device.id) ?? 0

        guard rssi >= -45, trend >= -2 else { return }

        hasTriggeredConnect = true
        showConnectSheet = true
        print("[FindAttendee] Auto-opening connect sheet — RSSI \(rssi), trend \(trend)")
    }
}
