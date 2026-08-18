/** One merchant's credentials from .env ({code}.pin, {code}.apiKey, ...). */
final class Merchant {
    final String code;
    final String baseUrl;
    final String pin;
    final String apiKey;
    final String privateKey;
    final String publicKey;
    final String initPath;
    final String confirmPath;
    final String checkPath;

    Merchant(String code, String baseUrl, String pin, String apiKey, String privateKey, String publicKey,
             String initPath, String confirmPath, String checkPath) {
        this.code = code;
        this.baseUrl = baseUrl;
        this.pin = pin;
        this.apiKey = apiKey;
        this.privateKey = privateKey;
        this.publicKey = publicKey;
        this.initPath = initPath;
        this.confirmPath = confirmPath;
        this.checkPath = checkPath;
    }

    /** Partner APIs send: Authorization: epa {apiKey} */
    String authorizationHeader() {
        if (apiKey.regionMatches(true, 0, "epa ", 0, 4)) {
            return apiKey;
        }
        return "epa " + apiKey;
    }
}
