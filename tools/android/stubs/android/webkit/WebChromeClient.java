package android.webkit;

// Заглушка только для компиляции (в APK не попадает): в android.jar сборки (API 16) нет FileChooserParams (API 21).
public class WebChromeClient {
    public abstract static class FileChooserParams {
        public abstract android.content.Intent createIntent();
    }

    public boolean onShowFileChooser(WebView v, ValueCallback<android.net.Uri[]> cb, FileChooserParams p) { return false; }
}
