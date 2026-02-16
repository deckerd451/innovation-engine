import SwiftUI

struct NetworkView: View {
    @State private var nodes: [Node] = []
    @State private var currentUser: User?
    @State private var isLoading = true

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if isLoading {
                ProgressView()
                    .tint(.white)
            } else {
                ConstellationCanvas(nodes: nodes, centerNode: currentUser?.id)
            }
        }
        .task {
            await loadNetwork()
        }
    }

    private func loadNetwork() async {
        isLoading = true

        do {
            let connections = try await ConnectionService.shared.fetchConnections()

            nodes = connections.map { conn in
                Node(
                    id: conn.connectedUserId,
                    name: conn.connectedUserName,
                    position: randomPosition()
                )
            }

            if let user = AuthService.shared.currentUser {
                currentUser = user
                nodes.insert(
                    Node(id: user.id, name: "You", position: CGPoint(x: 0.5, y: 0.5)),
                    at: 0
                )
            }
        } catch {
            print("Error loading network: \(error)")
        }

        isLoading = false
    }

    private func randomPosition() -> CGPoint {
        CGPoint(
            x: CGFloat.random(in: 0.2...0.8),
            y: CGFloat.random(in: 0.2...0.8)
        )
    }
}

struct Node: Identifiable {
    let id: UUID
    let name: String
    var position: CGPoint
}

struct ConstellationCanvas: View {
    let nodes: [Node]
    let centerNode: UUID?

    var body: some View {
        GeometryReader { geo in
            Canvas { context, size in
                if let centerID = centerNode,
                   let center = nodes.first(where: { $0.id == centerID }) {

                    let centerPoint = CGPoint(
                        x: center.position.x * size.width,
                        y: center.position.y * size.height
                    )

                    for node in nodes where node.id != centerID {
                        let point = CGPoint(
                            x: node.position.x * size.width,
                            y: node.position.y * size.height
                        )

                        var path = Path()
                        path.move(to: centerPoint)
                        path.addLine(to: point)

                        context.stroke(
                            path,
                            with: .color(.white.opacity(0.2)),
                            lineWidth: 1
                        )
                    }
                }

                for node in nodes {
                    let point = CGPoint(
                        x: node.position.x * size.width,
                        y: node.position.y * size.height
                    )

                    let isCenter = node.id == centerNode
                    let radius: CGFloat = isCenter ? 12 : 8
                    let color: Color = isCenter ? .blue : .white

                    context.fill(
                        Circle().path(in: CGRect(
                            x: point.x - radius,
                            y: point.y - radius,
                            width: radius * 2,
                            height: radius * 2
                        )),
                        with: .color(color)
                    )

                    if isCenter {
                        context.draw(
                            Text(node.name)
                                .font(.caption)
                                .foregroundColor(.white),
                            at: CGPoint(x: point.x, y: point.y - 20)
                        )
                    }
                }
            }
        }
    }
}
