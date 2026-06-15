import SwiftUI

/// ホストアプリ本体。
/// Quick Look Extension はアプリに同梱して配布する必要があるため存在するが、
/// アプリ自体の機能は最小限（説明を表示するだけ）。
@main
struct VRMQuickLookApp: App {
    var body: some Scene {
        WindowGroup("VRM Quick Look") {
            ContentView()
        }
    }
}

struct ContentView: View {
    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "person.crop.square.filled.and.at.rectangle")
                .font(.system(size: 56))
                .foregroundStyle(.tint)

            Text("VRM Quick Look")
                .font(.title.bold())

            Text("このアプリを一度起動すると、\n.vrm ファイルを Finder で選択してスペースキーを押すだけで\n3D プレビューできるようになります。")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(40)
        .frame(width: 420)
    }
}
