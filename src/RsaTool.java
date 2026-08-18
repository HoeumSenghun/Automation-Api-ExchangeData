import javax.crypto.Cipher;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;

/**
 * Decrypts the init token with the merchant private key, appends PIN,
 * then re-encrypts with the public key for confirm.
 * Keys are Base64 strings from .env.
 */
final class RsaTool {
    static String buildFinalToken(Merchant merchant, String rawToken) throws Exception {
        PrivateKey privateKey = loadPrivateKey(merchant.privateKey);
        PublicKey publicKey = loadPublicKey(merchant.publicKey);

        String plain = decrypt(rawToken, privateKey);
        String combined = plain + "|" + merchant.pin;
        return encrypt(combined, publicKey);
    }

    static PrivateKey loadPrivateKey(String key) throws Exception {
        return KeyFactory.getInstance("RSA")
                .generatePrivate(new PKCS8EncodedKeySpec(decodeKey(key)));
    }

    static PublicKey loadPublicKey(String key) throws Exception {
        return KeyFactory.getInstance("RSA")
                .generatePublic(new X509EncodedKeySpec(decodeKey(key)));
    }

    static byte[] decodeKey(String key) {
        String text = key.trim();
        if (text.startsWith("-----")) {
            text = text.replaceAll("-----BEGIN [A-Z ]+-----", "")
                    .replaceAll("-----END [A-Z ]+-----", "");
        }
        return Base64.getDecoder().decode(text.replaceAll("\\s", ""));
    }

    static String decrypt(String token, PrivateKey key) throws Exception {
        byte[] data = Base64.getDecoder().decode(token);
        Cipher cipher = Cipher.getInstance("RSA/ECB/PKCS1Padding");
        cipher.init(Cipher.DECRYPT_MODE, key);
        return new String(cipher.doFinal(data), StandardCharsets.UTF_8);
    }

    static String encrypt(String text, PublicKey key) throws Exception {
        Cipher cipher = Cipher.getInstance("RSA/ECB/PKCS1Padding");
        cipher.init(Cipher.ENCRYPT_MODE, key);
        byte[] result = cipher.doFinal(text.getBytes(StandardCharsets.UTF_8));
        return Base64.getEncoder().encodeToString(result);
    }
}
