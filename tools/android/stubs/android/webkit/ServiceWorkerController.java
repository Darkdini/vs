package android.webkit;

// Заглушка только для компиляции (в APK не попадает): в android.jar сборки (API 16) нет ServiceWorkerController (API 24).
public abstract class ServiceWorkerController {
    public static ServiceWorkerController getInstance() { return null; }
    public abstract void setServiceWorkerClient(ServiceWorkerClient client);
}
