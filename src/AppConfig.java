import java.io.IOException;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Loads shared run settings from config.properties and merchant credentials
 * from a single .env (shared baseUrl plus {merchantCode}.pin/apiKey/keys).
 */
final class AppConfig {
    private static final Pattern ENV_PLACEHOLDER = Pattern.compile("\\$\\{([^}]+)}");
    final String paymentCode;
    final String paidAmount;
    final String currency;
    final String msisdn;
    final String language;
    final Map<String, Merchant> merchants;
    final Merchant merchant;
    final Path projectDir;

    private AppConfig(Properties props, String activeMerchantCode, Path projectDir, Properties dotenv) {
        this.projectDir = projectDir;
        this.language = optional(props, "language", "en");
        this.merchants = loadMerchants(dotenv);
        this.merchant = resolveMerchant(merchants, activeMerchantCode);
        this.paymentCode = firstNonBlank(
                optional(props, "paymentCode", null),
                dotenv.getProperty("paymentCode"),
                firstPaymentCode(dotenv, this.merchant.code));
        if (this.paymentCode == null) {
            throw new IllegalStateException("Missing paymentCode in .env (or config.properties).");
        }
        this.paidAmount = firstNonBlank(
                optional(props, "paidAmount", null),
                dotenv.getProperty("paidAmount"),
                amountForPaymentCode(dotenv, this.merchant.code, this.paymentCode));
        if (this.paidAmount == null) {
            throw new IllegalStateException(
                    "Missing paidAmount in .env (or config.properties), and paymentCode was not in paymentCodes.");
        }
        this.currency = firstNonBlank(
                optional(props, "currency", null),
                dotenv.getProperty("currency"),
                "USD").toUpperCase();
        this.msisdn = firstNonBlank(optional(props, "msisdn", null), dotenv.getProperty("msisdn"));
        if (this.msisdn == null) {
            throw new IllegalStateException("Missing msisdn in .env (or config.properties).");
        }
    }

    static AppConfig load(String[] args) throws IOException {
        Path projectDir = Paths.get("").toAbsolutePath();
        Path envPath = projectDir.resolve(".env");
        Path configPath = projectDir.resolve("config.properties");
        if (!Files.exists(envPath)) {
            throw new IOException("Missing .env.");
        }
        Properties dotenv = loadDotEnv(envPath);
        Properties props = Files.exists(configPath) ? loadProperties(configPath, dotenv) : copyOf(dotenv);
        String merchant = arg(args, 0, firstNonBlank(
                optional(props, "activeMerchant", null),
                dotenv.getProperty("activeMerchant")));
        return new AppConfig(props, merchant, projectDir, dotenv);
    }

    String buildInitBody(String refId) {
        return "{"
                + "\"serviceType\":\"EXCHANGE_DATA\","
                + "\"refId\":\"" + refId + "\","
                + "\"paymentCode\":\"" + paymentCode + "\","
                + "\"paidAmount\":" + paidAmount + ","
                + "\"currency\":\"" + currency + "\","
                + "\"msisdn\":\"" + msisdn + "\""
                + "}";
    }

    private static Merchant resolveMerchant(Map<String, Merchant> merchants, String activeMerchantCode) {
        if (activeMerchantCode != null && merchants.containsKey(activeMerchantCode)) {
            return merchants.get(activeMerchantCode);
        }
        if (activeMerchantCode == null && !merchants.isEmpty()) {
            return merchants.values().iterator().next();
        }
        throw new IllegalStateException(
                "Unknown merchant '" + activeMerchantCode + "'. Add it to .env (merchants=...). Known: "
                        + merchants.keySet());
    }

    private static String firstPaymentCode(Properties dotenv, String merchantCode) {
        String raw = firstNonBlank(
                dotenv.getProperty(merchantCode + ".paymentCodes"),
                dotenv.getProperty("paymentCodes"));
        if (raw == null) {
            return null;
        }
        String first = raw.split(",")[0].trim();
        if (first.isEmpty()) {
            return null;
        }
        return first.split(":")[0].trim();
    }

    private static Properties copyOf(Properties source) {
        Properties copy = new Properties();
        copyNonBlank(source, copy);
        return copy;
    }

    private static String amountForPaymentCode(Properties dotenv, String merchantCode, String paymentCode) {
        String raw = firstNonBlank(
                dotenv.getProperty(merchantCode + ".paymentCodes"),
                dotenv.getProperty("paymentCodes"));
        if (raw == null) {
            return null;
        }
        for (String part : raw.split(",")) {
            String[] bits = part.trim().split(":");
            if (bits.length >= 2 && bits[0].trim().equals(paymentCode)) {
                return bits[1].trim();
            }
        }
        return null;
    }

    private static Map<String, Merchant> loadMerchants(Properties dotenv) {
        List<String> codes = merchantCodes(dotenv);
        if (codes.isEmpty()) {
            throw new IllegalStateException(
                    "No merchants in .env. Set merchants=Code1,Code2 and {code}.pin/apiKey/privateKey/publicKey.");
        }
        Map<String, Merchant> result = new LinkedHashMap<>();
        for (String code : codes) {
            result.put(code, loadMerchant(code, dotenv));
        }
        return result;
    }

    private static List<String> merchantCodes(Properties dotenv) {
        String listed = dotenv.getProperty("merchants");
        if (listed != null && !listed.isBlank()) {
            List<String> codes = new ArrayList<>();
            for (String part : listed.split(",")) {
                String code = part.trim();
                if (!code.isEmpty()) {
                    codes.add(code);
                }
            }
            return codes;
        }
        Set<String> codes = new LinkedHashSet<>();
        for (String name : dotenv.stringPropertyNames()) {
            int dot = name.lastIndexOf('.');
            if (dot <= 0) {
                continue;
            }
            String field = name.substring(dot + 1);
            if (field.equals("pin") || field.equals("apiKey")) {
                codes.add(name.substring(0, dot));
            }
        }
        return new ArrayList<>(codes);
    }

    private static Merchant loadMerchant(String code, Properties dotenv) {
        String baseUrl = firstNonBlank(dotenv.getProperty(code + ".baseUrl"), dotenv.getProperty("baseUrl"));
        if (baseUrl == null) {
            throw new IllegalStateException("Missing baseUrl (shared or " + code + ".baseUrl) in .env");
        }
        return new Merchant(
                code,
                baseUrl,
                required(dotenv, code + ".pin"),
                required(dotenv, code + ".apiKey"),
                required(dotenv, code + ".privateKey"),
                required(dotenv, code + ".publicKey"),
                optional(dotenv, code + ".initPath", "/" + code + "/exchangedata/init"),
                optional(dotenv, code + ".confirmPath", "/" + code + "/exchangedata/confirm"),
                optional(dotenv, code + ".checkPath", "/" + code + "/exchangedata/check")
        );
    }

    private static Properties loadDotEnv(Path path) throws IOException {
        if (!Files.exists(path)) {
            throw new IOException("Missing .env.");
        }
        Properties trimmed = new Properties();
        copyNonBlank(parseDotEnv(Files.readAllBytes(path)), trimmed);
        return trimmed;
    }

    /** Line-based .env parser. Java Properties treats ':' as a separator, which breaks paymentCodes. */
    private static Properties parseDotEnv(byte[] raw) {
        String text = decodeEnvBytes(raw);
        Properties out = new Properties();
        for (String line : text.split("\r?\n", -1)) {
            String trimmed = line.trim();
            if (trimmed.startsWith("\uFEFF")) {
                trimmed = trimmed.substring(1).trim();
            }
            if (trimmed.isEmpty() || trimmed.startsWith("#")) {
                continue;
            }
            int eq = trimmed.indexOf('=');
            if (eq <= 0) {
                continue;
            }
            String key = trimmed.substring(0, eq).trim();
            String value = trimmed.substring(eq + 1).trim();
            if (value.length() >= 2
                    && ((value.startsWith("\"") && value.endsWith("\""))
                    || (value.startsWith("'") && value.endsWith("'")))) {
                value = value.substring(1, value.length() - 1);
            }
            if (!value.isEmpty()) {
                out.setProperty(key, value);
            }
        }
        return out;
    }

    private static String decodeEnvBytes(byte[] raw) {
        if (raw.length >= 2 && (raw[0] & 0xff) == 0xff && (raw[1] & 0xff) == 0xfe) {
            return new String(raw, StandardCharsets.UTF_16LE);
        }
        if (raw.length >= 2 && (raw[0] & 0xff) == 0xfe && (raw[1] & 0xff) == 0xff) {
            return new String(raw, Charset.forName("UTF-16BE"));
        }
        String text = new String(raw, StandardCharsets.UTF_8);
        if (text.startsWith("\uFEFF")) {
            return text.substring(1);
        }
        return text;
    }

    private static Properties loadProperties(Path path, Properties dotenv) throws IOException {
        Properties file = parseDotEnv(Files.readAllBytes(path));
        Properties merged = new Properties();
        copyNonBlank(dotenv, merged);
        for (String name : file.stringPropertyNames()) {
            String raw = file.getProperty(name);
            if (raw == null || raw.isBlank()) {
                continue;
            }
            merged.setProperty(name, substitute(raw.trim(), dotenv));
        }
        return merged;
    }

    private static void copyNonBlank(Properties source, Properties target) {
        if (source == null) {
            return;
        }
        for (String name : source.stringPropertyNames()) {
            String value = source.getProperty(name);
            if (value != null && !value.isBlank()) {
                target.setProperty(name, value.trim());
            }
        }
    }

    private static String substitute(String value, Properties dotenv) {
        Matcher matcher = ENV_PLACEHOLDER.matcher(value);
        StringBuffer out = new StringBuffer();
        while (matcher.find()) {
            String key = matcher.group(1).trim();
            String replacement = dotenv != null ? dotenv.getProperty(key) : null;
            if (replacement == null || replacement.isBlank()) {
                throw new IllegalStateException("Missing .env key: " + key);
            }
            matcher.appendReplacement(out, Matcher.quoteReplacement(replacement.trim()));
        }
        matcher.appendTail(out);
        return out.toString();
    }

    private static String arg(String[] args, int index, String fallback) {
        if (args != null && args.length > index && args[index] != null && !args[index].isBlank()) {
            return args[index].trim();
        }
        return fallback;
    }

    private static String required(Properties props, String key) {
        String value = props.getProperty(key);
        if (value == null || value.isBlank()) {
            throw new IllegalStateException("Missing required config key: " + key);
        }
        return value.trim();
    }

    private static String optional(Properties props, String key, String fallback) {
        String value = props.getProperty(key);
        if (value == null || value.isBlank()) {
            return fallback;
        }
        return value.trim();
    }

    private static String firstNonBlank(String... values) {
        if (values == null) {
            return null;
        }
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value.trim();
            }
        }
        return null;
    }
}
