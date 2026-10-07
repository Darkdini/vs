package ru.tmrs.war;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import java.util.HashSet;
import android.view.Window;
import android.webkit.ServiceWorkerClient;
import android.webkit.ServiceWorkerController;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

// «Средневековье» для Android: игра открывается во весь экран во встроенном браузере (WebView).
// Адрес сервера — строка game_url в res/values/strings.xml (подставляет tools/build-apk.sh).
// Без лямбд и новых возможностей Java: код собирается старым dx (см. build-apk.sh).
public class MainActivity extends Activity {
    private static final int PICK_FILE = 1;
    private WebView web;
    private ValueCallback<Uri[]> fileCb;
    private String home;
    // графика игры, вшитая в приложение (assets/pk/<id>.bin, кладёт tools/build-apk.sh): имя файла — отпечаток содержимого,
    // поэтому файл из приложения всегда совпадает с серверным; картинки, которых нет в приложении (новые), идут с сервера
    private final HashSet<String> pk = new HashSet<String>();

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        // без FLAG_FULLSCREEN: в полноэкранном режиме Android не поднимает страницу над клавиатурой (adjustResize не работает)
        home = getString(R.string.game_url);

        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(27, 22, 16));
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);        // «Запомнить меня» хранит сессию в localStorage
        s.setDatabaseEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        // фоновая музыка без касания (API 17+, вызываем через reflection — android.jar сборки старее)
        try { WebSettings.class.getMethod("setMediaPlaybackRequiresUserGesture", boolean.class).invoke(s, false); } catch (Exception e) { /* старый Android */ }
        s.setUserAgentString(s.getUserAgentString() + " WarKingsApp/1");
        // защита: странице не нужны файлы телефона по адресам file:// (выбор картинки для аватара работает через окно выбора — оно не затронуто)
        s.setAllowFileAccess(false);
        s.setAllowFileAccessFromFileURLs(false);
        s.setAllowUniversalAccessFromFileURLs(false);
        try { WebSettings.class.getMethod("setMixedContentMode", int.class).invoke(s, 1); } catch (Exception e) { /* MIXED_CONTENT_NEVER_ALLOW, API 21+ */ }

        try { String[] l = getAssets().list("pk"); if (l != null) for (String n : l) pk.add(n); } catch (Exception e) { /* нет вшитой графики */ }
        // запросы помощника кэша (sw.js) за графикой — из приложения, без сети
        try {
            ServiceWorkerController.getInstance().setServiceWorkerClient(new ServiceWorkerClient() {
                @Override
                public WebResourceResponse shouldInterceptRequest(WebResourceRequest r) { return local(String.valueOf(r.getUrl())); }
            });
        } catch (Throwable e) { /* старый Android — всё с сервера */ }

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, String url) {
                // свои страницы — внутри приложения, чужие ссылки — во внешнем браузере
                if (url.equals(home) || url.startsWith(home + "/")) return false; // не startsWith(home): «home.чужой-сайт.ru» не наш
                try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); } catch (Exception e) { /* нет браузера */ }
                return true;
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, String url) { return local(url); }

            @Override
            public void onReceivedError(WebView v, int code, String desc, String url) {
                v.loadDataWithBaseURL(null, offlinePage(), "text/html", "utf-8", null);
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            // выбор картинки для аватара (<input type="file">)
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, WebChromeClient.FileChooserParams p) {
                if (fileCb != null) fileCb.onReceiveValue(null);
                fileCb = cb;
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("image/*");
                try {
                    startActivityForResult(Intent.createChooser(i, "Аватар"), PICK_FILE);
                } catch (Exception e) {
                    fileCb = null;
                    return false;
                }
                return true;
            }
        });

        setContentView(web);
        // историю WebView не сохраняем: игра кладёт каждое окно в history, и большой Bundle ронял приложение при сворачивании.
        // После возврата страница просто открывается заново, вход — по сохранённой сессии «Запомнить меня».
        web.loadUrl(home);
    }

    // свой сервер, /pk/<id>.bin — файл из приложения (как есть, зашифрованный: расшифровывает sw.js); иначе null — запрос идёт в сеть
    private WebResourceResponse local(String url) {
        try {
            if (url == null || !url.startsWith(home + "/pk/")) return null;
            String name = url.substring(home.length() + 4);
            int q = name.indexOf('?'); if (q >= 0) name = name.substring(0, q);
            if (!name.endsWith(".bin") || name.indexOf('/') >= 0 || !pk.contains(name)) return null;
            return new WebResourceResponse("application/octet-stream", null, getAssets().open("pk/" + name));
        } catch (Exception e) { return null; }
    }

    private String offlinePage() {
        return "<html><body style=\"background:#1b1610;color:#e0ad4c;font-family:serif;text-align:center;padding-top:40%\">"
            + "<h2>Нет связи с сервером</h2><p style=\"color:#b3a38a\">Проверьте интернет и попробуйте снова.</p>"
            + "<p><a style=\"color:#fff;background:#8a1a0a;padding:12px 28px;border-radius:8px;text-decoration:none\" href=\"" + home + "\">Повторить</a></p></body></html>";
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        if (req == PICK_FILE && fileCb != null) {
            Uri[] out = null;
            if (res == RESULT_OK && data != null && data.getData() != null) out = new Uri[] { data.getData() };
            fileCb.onReceiveValue(out);
            fileCb = null;
            return;
        }
        super.onActivityResult(req, res, data);
    }

    // «Назад»: сначала закрыть окно в игре (history.back), с главного экрана — свернуть приложение
    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else moveTaskToBack(true);
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        web.resumeTimers();
        // соединение с сервером могло оборваться, пока приложение было свёрнуто, — игра проверит его и переподключится
        web.loadUrl("javascript:window.appResume&&window.appResume()");
    }

    @Override
    protected void onPause() { web.onPause(); super.onPause(); }

}
