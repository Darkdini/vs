package android.webkit;

// Заглушка только для компиляции (API 24): запросы помощника кэша (sw.js) — сюда, а не в WebViewClient.
public class ServiceWorkerClient {
    public WebResourceResponse shouldInterceptRequest(WebResourceRequest request) { return null; }
}
