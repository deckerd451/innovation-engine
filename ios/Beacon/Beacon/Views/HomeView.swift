import SwiftUI

struct HomeView: View {
    @Binding var selectedTab: AppTab
    @ObservedObject private var presence = EventPresenceService.shared
    @ObservedObject private var attendeesService = EventAttendeesService.shared
    @ObservedObject private var eventJoin = EventJoinService.shared
    @State private var showScanner = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 0) {
                    eventHeader
                        .padding(.horizontal)
                        .padding(.top, 16)
                        .padding(.bottom, 24)

                    if attendeesService.isLoading && attendeesService.attendees.isEmpty && isEventActive {
                        loadingState.padding(.top, 60)
                    } else if !isEventActive {
                        EmptyView()
                    } else if attendeesService.attendees.isEmpty {
                        emptyState.padding(.top, 60)
                    } else {
                        attendeeList
                    }
                }
            }
            .navigationTitle("Home")
            .navigationBarTitleDisplayMode(.large)
            .refreshable { attendeesService.refresh() }
            .onAppear {
                #if DEBUG
                print("[TEST] HomeView appeared")
                #endif
            }
            .fullScreenCover(isPresented: $showScanner) {
                ScanView(selectedTab: $selectedTab)
            }
        }
    }

    // MARK: - Event Header

    private var isEventActive: Bool {
        eventJoin.isEventJoined || presence.currentEvent != nil
    }

    private var eventDisplayName: String {
        eventJoin.currentEventName ?? presence.currentEvent ?? "Event"
    }

    private var eventHeader: some View {
        VStack(spacing: 12) {
            if eventJoin.isEventJoined {
                // Joined state
                joinedCard
            } else if presence.currentEvent != nil {
                // Legacy beacon-only
                legacyCard
            } else {
                // Not joined — scan card
                scanCard
            }
        }
    }

    // MARK: - Scan Card (State A)

    private var scanCard: some View {
        Button(action: { showScanner = true }) {
            VStack(spacing: 16) {
                Image(systemName: "qrcode.viewfinder")
                    .font(.system(size: 40))
                    .foregroundColor(.blue)

                VStack(spacing: 4) {
                    Text("Join an Event")
                        .font(.title3)
                        .fontWeight(.semibold)
                    Text("Scan the event QR code to get started")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
            }
            .padding(24)
            .frame(maxWidth: .infinity)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(Color(.systemGray6))
                    .overlay(
                        RoundedRectangle(cornerRadius: 16)
                            .stroke(Color.blue.opacity(0.3), lineWidth: 1)
                    )
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: - Joined Card (State B)

    private var joinedCard: some View {
        HStack(spacing: 12) {
            Image(systemName: "person.3.fill")
                .foregroundColor(.green)
                .font(.title3)

            VStack(alignment: .leading, spacing: 2) {
                Text(eventDisplayName)
                    .font(.headline)
                Text(joinedSubtitle)
                    .font(.caption)
                    .foregroundColor(.green)
            }

            Spacer()

            if attendeesService.attendeeCount > 0 {
                Text("\(attendeesService.attendeeCount)")
                    .font(.caption)
                    .fontWeight(.semibold)
                    .foregroundColor(.secondary)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Capsule().fill(Color(.systemGray5)))
            }
        }
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(Color.green.opacity(0.08))
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(Color.green.opacity(0.2), lineWidth: 1)
                )
        )
    }

    private var joinedSubtitle: String {
        let count = attendeesService.attendeeCount
        if count > 0 {
            return "Event active · \(count) nearby"
        }
        return "Event active · Proximity enabled"
    }

    // MARK: - Legacy Card

    private var legacyCard: some View {
        HStack(spacing: 10) {
            Image(systemName: "antenna.radiowaves.left.and.right")
                .foregroundColor(.green)
                .font(.title3)
            VStack(alignment: .leading, spacing: 2) {
                Text(eventDisplayName)
                    .font(.headline)
                Text("Event detected")
                    .font(.caption)
                    .foregroundColor(.green)
            }
            Spacer()
        }
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(Color.green.opacity(0.08))
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(Color.green.opacity(0.2), lineWidth: 1)
                )
        )
    }

    // MARK: - Attendee List

    private var attendeeList: some View {
        LazyVStack(spacing: 8) {
            HStack {
                Text("Nearby Attendees")
                    .font(.subheadline)
                    .fontWeight(.semibold)
                    .foregroundColor(.secondary)
                Spacer()
                Text("\(attendeesService.attendeeCount)")
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 2)
                    .background(Capsule().fill(Color(.systemGray5)))
            }
            .padding(.horizontal)
            .padding(.bottom, 4)

            ForEach(attendeesService.attendees) { attendee in
                NavigationLink(value: attendee.id) {
                    AttendeeCardView(attendee: attendee)
                }
                .buttonStyle(.plain)
                .padding(.horizontal)
            }
        }
        .padding(.bottom, 24)
        .navigationDestination(for: UUID.self) { attendeeId in
            if let attendee = attendeesService.attendees.first(where: { $0.id == attendeeId }) {
                PersonDetailView(attendee: attendee)
            }
        }
    }

    // MARK: - Empty / Loading

    private var emptyState: some View {
        VStack(spacing: 16) {
            Image(systemName: "person.3")
                .font(.system(size: 40))
                .foregroundColor(.secondary.opacity(0.5))
            Text("You're the first one here")
                .font(.headline)
                .foregroundColor(.secondary)
            Text("Other attendees will appear\nas they join the event.")
                .font(.subheadline)
                .foregroundColor(.secondary.opacity(0.7))
                .multilineTextAlignment(.center)
        }
    }

    private var loadingState: some View {
        VStack(spacing: 12) {
            ProgressView()
            Text("Loading attendees…")
                .font(.subheadline)
                .foregroundColor(.secondary)
        }
    }
}

#Preview {
    HomeView(selectedTab: .constant(.home))
}
