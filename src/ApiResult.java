/** Pairs HTTP status code with response body, so callers can check both. */
final class ApiResult {
    final int httpStatus;
    final String body;

    ApiResult(int httpStatus, String body) {
        this.httpStatus = httpStatus;
        this.body = body;
    }
}
