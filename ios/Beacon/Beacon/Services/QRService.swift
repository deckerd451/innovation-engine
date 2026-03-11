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

    /// Parses a community ID from a scanned QR code.
    /// Supports both legacy format (raw UUID) and new format (beacon://profile/<uuid>)
    static func parseCommunityId(from qrString: String) -> String? {
        // New format: beacon://profile/<community-id>
        if qrString.hasPrefix("beacon://profile/") {
            let communityId = qrString.replacingOccurrences(of: "beacon://profile/", with: "")
            guard UUID(uuidString: communityId) != nil else { return nil }
            return communityId
        }
        
        // Legacy format: raw UUID (for backward compatibility)
        guard UUID(uuidString: qrString) != nil else { return nil }
        return qrString
    }
}