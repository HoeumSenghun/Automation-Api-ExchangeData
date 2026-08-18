/** Pretty-prints JSON for console output. Leaves non-JSON text as-is. */
final class JsonPretty {
    static String format(String raw) {
        if (raw == null) {
            return "";
        }
        String trimmed = raw.trim();
        if (trimmed.isEmpty()) {
            return "";
        }
        if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
            return raw;
        }

        StringBuilder out = new StringBuilder();
        int indent = 0;
        boolean inString = false;
        boolean escape = false;

        for (int i = 0; i < trimmed.length(); i++) {
            char c = trimmed.charAt(i);
            if (inString) {
                out.append(c);
                if (escape) {
                    escape = false;
                } else if (c == '\\') {
                    escape = true;
                } else if (c == '"') {
                    inString = false;
                }
                continue;
            }

            switch (c) {
                case '"':
                    inString = true;
                    out.append(c);
                    break;
                case '{':
                case '[':
                    out.append(c);
                    indent++;
                    if (nextNonWhitespace(trimmed, i + 1) != matchingClose(c)) {
                        out.append('\n');
                        appendIndent(out, indent);
                    }
                    break;
                case '}':
                case ']':
                    indent--;
                    if (previousNonWhitespace(trimmed, i - 1) != matchingOpen(c)) {
                        out.append('\n');
                        appendIndent(out, indent);
                    }
                    out.append(c);
                    break;
                case ',':
                    out.append(c).append('\n');
                    appendIndent(out, indent);
                    break;
                case ':':
                    out.append(": ");
                    break;
                default:
                    if (!Character.isWhitespace(c)) {
                        out.append(c);
                    }
                    break;
            }
        }
        return out.toString();
    }

    private static void appendIndent(StringBuilder out, int indent) {
        out.append("  ".repeat(Math.max(0, indent)));
    }

    private static char matchingClose(char open) {
        return open == '{' ? '}' : ']';
    }

    private static char matchingOpen(char close) {
        return close == '}' ? '{' : '[';
    }

    private static char nextNonWhitespace(String s, int from) {
        for (int i = from; i < s.length(); i++) {
            if (!Character.isWhitespace(s.charAt(i))) {
                return s.charAt(i);
            }
        }
        return 0;
    }

    private static char previousNonWhitespace(String s, int from) {
        for (int i = from; i >= 0; i--) {
            if (!Character.isWhitespace(s.charAt(i))) {
                return s.charAt(i);
            }
        }
        return 0;
    }
}
