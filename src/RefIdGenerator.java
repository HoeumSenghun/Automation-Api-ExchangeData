import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

/**
 * Unique refId = EXCH + yyMMdd + 4-digit code.
 * Today's used ids are saved in data/ so close/open/run again still knows them.
 */
final class RefIdGenerator {
    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyMMdd");
    private static final String PREFIX = "EXCH";
    private static final int SEQ_WIDTH = 4;

    private final Path sequenceFile;

    static final class Issue {
        final String refId;
        final List<String> alreadyUsedToday;

        Issue(String refId, List<String> alreadyUsedToday) {
            this.refId = refId;
            this.alreadyUsedToday = alreadyUsedToday;
        }
    }

    RefIdGenerator(Path projectDir, String merchantCode) {
        Path dataDir = projectDir.resolve("data");
        this.sequenceFile = dataDir.resolve("refid_" + merchantCode + "_EXCHANGE_DATA.txt");
    }

    Issue next() throws IOException {
        Files.createDirectories(sequenceFile.getParent());
        String today = LocalDate.now().format(DATE_FMT);
        List<String> usedToday = loadUsedToday(today);

        int seq = usedToday.size();
        int maxSeq = (int) Math.pow(10, SEQ_WIDTH) - 1;
        String refId;
        while (true) {
            if (seq > maxSeq) {
                throw new IOException(
                        "Ran out of unique " + PREFIX + " refIds for " + today
                                + " (max sequence " + maxSeq + ").");
            }
            refId = PREFIX + today + String.format("%0" + SEQ_WIDTH + "d", seq);
            if (!usedToday.contains(refId)) {
                break;
            }
            seq++;
        }

        List<String> alreadyUsed = new ArrayList<>(usedToday);
        usedToday.add(refId);
        save(today, usedToday);
        return new Issue(refId, alreadyUsed);
    }

    private List<String> loadUsedToday(String today) throws IOException {
        List<String> used = new ArrayList<>();
        if (!Files.exists(sequenceFile)) {
            return used;
        }
        List<String> lines = Files.readAllLines(sequenceFile, StandardCharsets.UTF_8);
        if (lines.isEmpty()) {
            return used;
        }
        String fileDate = lines.get(0).trim();
        if (!fileDate.equals(today)) {
            return used;
        }
        for (int i = 1; i < lines.size(); i++) {
            String id = lines.get(i).trim();
            if (!id.isEmpty()) {
                used.add(id);
            }
        }
        return used;
    }

    private void save(String today, List<String> usedToday) throws IOException {
        StringBuilder out = new StringBuilder();
        out.append(today).append(System.lineSeparator());
        for (String id : usedToday) {
            out.append(id).append(System.lineSeparator());
        }
        Files.writeString(sequenceFile, out.toString(), StandardCharsets.UTF_8);
    }
}
