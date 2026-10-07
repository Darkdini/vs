package android.webkit;

// Заглушка только для компиляции (в APK не попадает): в android.jar сборки (API 16) нет конструктора с кодом и заголовками (API 21).
public class WebResourceResponse {
    public WebResourceResponse(String mimeType, String encoding, java.io.InputStream data) { }
    public WebResourceResponse(String mimeType, String encoding, int statusCode, String reasonPhrase, java.util.Map<String, String> responseHeaders, java.io.InputStream data) { }
}
