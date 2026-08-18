import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;

/** Thin wrapper over Java's HttpClient for POST calls with JSON body. */
final class ApiClient {
    private final String baseUrl;
    private final String authorization;
    private final String language;
    private final HttpClient client = HttpClient.newHttpClient();

    ApiClient(String baseUrl, String authorization, String language) {
        this.baseUrl = baseUrl;
        this.authorization = authorization;
        this.language = language;
    }

    ApiResult post(String path, String jsonBody) throws Exception {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + path))
                .header("Content-Type", "application/json")
                .header("Accept", "application/json")
                .header("Authorization", authorization)
                .header("e-language", language)
                .POST(HttpRequest.BodyPublishers.ofString(jsonBody, StandardCharsets.UTF_8))
                .build();
        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
        return new ApiResult(response.statusCode(), response.body());
    }
}
