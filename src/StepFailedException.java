/** Thrown to stop the run at the exact step that failed, with a clear reason. */
final class StepFailedException extends RuntimeException {
    StepFailedException(String step, String reason) {
        super("[" + step + " FAILED] " + reason);
    }
}
