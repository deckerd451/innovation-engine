import Foundation
import CoreImage.CIFilterBuiltins
import UIKit

struct QRService {

    static func generateQRCode(for communityId: String) -> UIImage {
        let context = CIContext()
        let filter = CIFilter.qrCodeGenerator()

        filter.message = Data(communityId.utf8)
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

    static func parseCommunityId(from qrString: String) -> String? {
        guard UUID(uuidString: qrString) != nil else { return nil }
        return qrString
    }
}
