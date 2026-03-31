import Foundation
import CoreImage.CIFilterBuiltins
import UIKit

struct QRService {

    // MARK: - QR Generation

    /// Generates a QR code for a community profile using the app route format.
    /// Format: beacon://profile/<community-id>
    static func generateQRCode(for communityId: String) -> UIImage {
        let context = CIContext()
        let filter = CIFilter.qrCodeGenerator()

        let payload = "beacon://profile/\(communityId)"
        filter.message = Data(payload.utf8)
        filter.correctionLevel = "M"

        guard let outputImage = filter.outputImage else {
            return UIImage(systemName: "xmark.circle") ?? UIImage()
        }

        let transform = CGAffineTransform(scaleX: 10, y: 10)
        let scaledImage = outputImage.transformed(by: transform)

        guard let cgImage = context.createCGImage(scaledImage, from: scaledImage.extent) else {
            return UIImage(systemName: "xmark.circle") ?? UIImage()
        }

        return UIImage(cgImage: cgImage)
    }

    // MARK: - Parsing

    enum QRPayload: Equatable {
        case profile(communityId: String)
        case event(eventId: String)
    }

    /// Parses a scanned QR string into a typed payload.
    ///
    /// Supported formats:
    /// - beacon://event/<event-id>
    /// - beacon://profile/<community-id>
    /// - https://nearify.org/join/?event=<event-id>&name=<event-name>
    /// - raw UUID (legacy profile format)
    static func parse(from qrString: String) -> QRPayload? {
        let trimmed = qrString.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }

        #if DEBUG
        print("[QRService] Parsing QR: \(trimmed)")
        #endif

        if let payload = parseBeaconRoute(trimmed) {
            return payload
        }

        if let payload = parseNearifyJoinURL(trimmed) {
            return payload
        }

        if UUID(uuidString: trimmed) != nil {
            #if DEBUG
            print("[QRService] ✅ Parsed legacy raw UUID as profile")
            #endif
            return .profile(communityId: trimmed)
        }

        #if DEBUG
        print("[QRService] ❌ Unsupported QR format")
        #endif
        return nil
    }

    /// Legacy convenience — returns community ID string or nil.
    static func parseCommunityId(from qrString: String) -> String? {
        guard case .profile(let id) = parse(from: qrString) else { return nil }
        return id
    }

    // MARK: - Private Helpers

    private static func parseBeaconRoute(_ value: String) -> QRPayload? {
        guard let components = URLComponents(string: value),
              components.scheme?.lowercased() == "beacon" else {
            return nil
        }

        let host = components.host?.lowercased()
        let pathComponents = components.path
            .split(separator: "/")
            .map(String.init)

        if host == "event" {
            let eventId = pathComponents.first ?? ""
            guard UUID(uuidString: eventId) != nil else {
                #if DEBUG
                print("[QRService] ❌ Invalid beacon event UUID")
                #endif
                return nil
            }

            #if DEBUG
            print("[QRService] ✅ Parsed beacon event route")
            #endif
            return .event(eventId: eventId)
        }

        if host == "profile" {
            let communityId = pathComponents.first ?? ""
            guard UUID(uuidString: communityId) != nil else {
                #if DEBUG
                print("[QRService] ❌ Invalid beacon profile UUID")
                #endif
                return nil
            }

            #if DEBUG
            print("[QRService] ✅ Parsed beacon profile route")
            #endif
            return .profile(communityId: communityId)
        }

        return nil
    }

    private static func parseNearifyJoinURL(_ value: String) -> QRPayload? {
        guard let components = URLComponents(string: value),
              let scheme = components.scheme?.lowercased(),
              scheme == "https" || scheme == "http",
              let host = components.host?.lowercased() else {
            return nil
        }

        let allowedHosts = [
            "nearify.org",
            "www.nearify.org"
        ]

        guard allowedHosts.contains(host) else {
            return nil
        }

        let normalizedPath = components.path.lowercased()
        guard normalizedPath == "/join" || normalizedPath == "/join/" else {
            return nil
        }

        guard let eventId = components.queryItems?
            .first(where: { $0.name == "event" })?
            .value?
            .trimmingCharacters(in: .whitespacesAndNewlines),
              UUID(uuidString: eventId) != nil else {
            #if DEBUG
            print("[QRService] ❌ nearify join URL missing valid event param")
            #endif
            return nil
        }

        #if DEBUG
        print("[QRService] ✅ Parsed nearify join URL")
        #endif
        return .event(eventId: eventId)
    }
}
