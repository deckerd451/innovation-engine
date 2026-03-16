import Foundation
import CoreImage.CIFilterBuiltins
import UIKit

struct QRService {

    /// Generates a QR code for a community profile using the app route format.
    /// Format: beacon://profile/<community-id>
    static func generateQRCode(for communityId: String) -> UIImage {
        let context = CIContext()
        let filter = CIFilter.qrCodeGenerator()

        // Generate app route payload
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

    /// Result of parsing a scanned QR code
    enum QRPayload {
        case profile(communityId: String)
        case event(eventId: String)
    }

    /// Parses a scanned QR string into a typed payload.
    /// Supports:
    ///   beacon://event/<event-id>
    ///   beacon://profile/<community-uuid>
    ///   <raw-uuid>  (legacy profile format)
    static func parse(from qrString: String) -> QRPayload? {
        // Event QR
        if qrString.hasPrefix("beacon://event/") {
            let eventId = qrString.replacingOccurrences(of: "beacon://event/", with: "")
            guard !eventId.isEmpty else { return nil }
            return .event(eventId: eventId)
        }

        // Profile QR (new format)
        if qrString.hasPrefix("beacon://profile/") {
            let communityId = qrString.replacingOccurrences(of: "beacon://profile/", with: "")
            guard UUID(uuidString: communityId) != nil else { return nil }
            return .profile(communityId: communityId)
        }

        // Legacy: raw UUID = profile
        guard UUID(uuidString: qrString) != nil else { return nil }
        return .profile(communityId: qrString)
    }

    /// Legacy convenience — returns community ID string or nil.
    /// Kept for backward compatibility with existing callers.
    static func parseCommunityId(from qrString: String) -> String? {
        guard case .profile(let id) = parse(from: qrString) else { return nil }
        return id
    }
}