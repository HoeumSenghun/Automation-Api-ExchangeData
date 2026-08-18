/** Naive JSON field extraction for this test runner. */
final class JsonField {
    static String extract(String json, String field) {
        String quotedKey = "\"" + field + "\":\"";
        int start = json.indexOf(quotedKey);
        if (start != -1) {
            start += quotedKey.length();
            int end = json.indexOf("\"", start);
            if (end == -1) {
                return null;
            }
            return json.substring(start, end);
        }

        String numericKey = "\"" + field + "\":";
        start = json.indexOf(numericKey);
        if (start == -1) {
            return null;
        }
        start += numericKey.length();
        while (start < json.length() && Character.isWhitespace(json.charAt(start))) {
            start++;
        }
        int end = start;
        while (end < json.length() && (Character.isDigit(json.charAt(end)) || json.charAt(end) == '-')) {
            end++;
        }
        if (end == start) {
            return null;
        }
        return json.substring(start, end);
    }
}
