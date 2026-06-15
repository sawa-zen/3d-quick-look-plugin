import Cocoa
import os
import Quartz
import WebKit

/// QL 拡張は console が見えず動作確認が難しいので、ライフサイクルと JS の console を
/// os_log に流す。確認方法:
///   log stream --predicate 'subsystem == "com.vrm.VRMQuickLook"'
private let qlLog = Logger(subsystem: "com.vrm.VRMQuickLook", category: "preview")

private func debugLog(_ message: String) {
    qlLog.log("\(message, privacy: .public)")
}

/// Quick Look で .vrm をプレビューする ViewController。
///
/// 構成:
///   - Resources/renderer/index.html (Vite で単一ファイル化したフロント) を WKWebView に表示
///   - .vrm の中身を Base64 にして window.postMessage で JS に渡す
///   - JS 側 (three-vrm) が WebGL で描画する
final class PreviewViewController: NSViewController, QLPreviewingController {

    private var webView: WKWebView!

    /// JS に渡す VRM の Base64。ページ読み込み完了後に注入する。
    private var pendingBase64: String?

    override func loadView() {
        let config = WKWebViewConfiguration()
        config.suppressesIncrementalRendering = false

        // JS の console を os_log に転送する受け口（デバッグ用）。
        // `log stream --predicate 'subsystem == "com.vrm.VRMQuickLook"'` で確認できる。
        config.userContentController.add(self, name: "log")

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        // 背景は HTML 側 (body の background) で塗るので WKWebView 側の設定は不要。
        self.view = webView
    }

    // MARK: - QLPreviewingController

    func preparePreviewOfFile(
        at url: URL,
        completionHandler handler: @escaping (Error?) -> Void
    ) {
        // サンドボックス下でも preparePreviewOfFile に渡された URL は読める。
        // セキュリティスコープを開いてからファイルを読む。
        let needsStop = url.startAccessingSecurityScopedResource()
        defer { if needsStop { url.stopAccessingSecurityScopedResource() } }

        guard let data = try? Data(contentsOf: url) else {
            handler(NSError(
                domain: "VRMQuickLook",
                code: -1,
                userInfo: [NSLocalizedDescriptionKey: "VRM ファイルを読み込めませんでした"]
            ))
            return
        }
        pendingBase64 = data.base64EncodedString()
        debugLog("prepare: read \(data.count) bytes, base64 \(pendingBase64?.count ?? 0) chars")

        // バンドルした単一 HTML を読み込む。
        // allowingReadAccessTo にはその HTML が置かれたディレクトリを渡す。
        guard let htmlURL = Bundle.main.url(
            forResource: "index",
            withExtension: "html",
            subdirectory: "renderer"
        ) else {
            handler(NSError(
                domain: "VRMQuickLook",
                code: -2,
                userInfo: [NSLocalizedDescriptionKey: "renderer/index.html が見つかりません"]
            ))
            return
        }

        debugLog("prepare: loading html \(htmlURL.path)")
        webView.loadFileURL(
            htmlURL,
            allowingReadAccessTo: htmlURL.deletingLastPathComponent()
        )

        // ページが表示できる状態になったので Quick Look に完了を伝える。
        // 実際のモデル描画はページ読み込み完了後 (didFinish) に非同期で行う。
        handler(nil)
    }
}

// MARK: - WKNavigationDelegate

extension PreviewViewController: WKNavigationDelegate {
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard let base64 = pendingBase64 else { return }
        pendingBase64 = nil
        debugLog("didFinish: injecting VRM (\(base64.count) base64 chars)")

        // Base64 は [A-Za-z0-9+/=] のみなのでシングルクォート内に安全に埋め込める。
        let script = "window.postMessage({ type: 'loadVRM', base64: '\(base64)' }, '*');"
        webView.evaluateJavaScript(script) { _, error in
            if let error { debugLog("inject failed: \(error.localizedDescription)") } else { debugLog("inject ok") }
        }
    }

    func webView(
        _ webView: WKWebView,
        didFail navigation: WKNavigation!,
        withError error: Error
    ) {
        debugLog("navigation failed: \(error.localizedDescription)")
    }
}

// MARK: - WKScriptMessageHandler (JS console → os_log)

extension PreviewViewController: WKScriptMessageHandler {
    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        guard message.name == "log" else { return }
        debugLog("[JS] \(String(describing: message.body))")
    }
}
