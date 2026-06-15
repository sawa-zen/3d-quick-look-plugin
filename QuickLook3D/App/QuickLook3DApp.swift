import SwiftUI

/// ホストアプリ本体。
/// Quick Look Extension はアプリに同梱して配布する必要があるため存在するが、
/// アプリ自体の機能は最小限（説明を表示するだけ）。
@main
struct QuickLook3DApp: App {
    var body: some Scene {
        WindowGroup("3D Quick Look") {
            ContentView()
        }
    }
}

struct ContentView: View {
    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "cube.transparent")
                .font(.system(size: 56))
                .foregroundStyle(.tint)

            Text("3D Quick Look")
                .font(.title.bold())

            Text("このアプリを一度起動すると、\n.vrm / .vrma / .glb / .fbx を Finder で選択してスペースキーを押すだけで\n3D プレビューできるようになります。")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(40)
        .frame(width: 460)
    }
}
